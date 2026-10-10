// Certification pre-flight (`lab harness run SCENARIO --certify SHA
// --dry-run`): every precondition a certification formation needs that can
// be checked WITHOUT holding a machine, building an image or starting a
// container. Each item prints one PASS/FAIL line; a failed item fails the
// dry run. It only reads: git, the census file, the environment, and one
// read-only ssh command per host (boot id, clock, docker version, storage
// driver, free disk under the docker root, the base images' ids and
// RepoDigests).
//
// Also the owner-decided retention step (2026-10-05, option 1):
// `lab harness keep-evidence RUN_DIR [--to DIR] [--quest ID]` prints the
// run's `solve note` record line (for ANY run directory, an interrupted one
// included: the line a SIGKILLed run never printed), then copies its verdict
// files into the committed evidence tree and prints where the node logs are
// and their digests.

import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {capture} from './process.js';
import {
  baseImageContentDigests,
  commitIdentityProblem,
  dockerfileBaseImages,
  observeCommitIdentity,
} from '../../test/distributed/harness/certification-image-identity.js';
import {readSpentWaitCensus} from '../../test/distributed/harness/scenario-certification.js';
import {
  keepCertificationVerdict,
  printCertificationRecord,
} from '../../test/distributed/harness/certification-evidence-archive.js';

const TEXT_ENCODING = 'utf8';
const DOCKERFILE = 'Dockerfile';
const SSH = 'ssh';
const SSH_OPTION = '-o';
const SSH_BATCH_MODE = 'BatchMode=yes';
const HOST_DEADLINE_MS = 20000;
// The stated bounds of the pre-flight.
const CERTIFICATION_PREFLIGHT_BOUND = Object.freeze({
  // Free space under the docker root on every host: a certification build
  // leaves a fresh image per host per run.
  MIN_FREE_DISK_KIB: 10 * 1024 * 1024,
  // Controller-to-host clock skew: the host's clock must lie within this of
  // the controller's over the ssh round trip.
  MAX_CLOCK_SKEW_MS: 2000,
});
// Where the committed verdict copies live (owner decision, option 1):
// the epic's evidence tree, the precedent being
// solve/epics/formation-seed-decoupling/evidence/ (a quest's evidence
// directory holds receipt.json only).
const COMMITTED_CERTIFICATION_EVIDENCE =
  'solve/epics/raft-rs-full-cutover/evidence/certification';
const LOG_ENV = Object.freeze(['LAGRANGE_LOG_FILE']);
const PRETTY_ENV = Object.freeze(['LOG_PRETTY_PRINT', 'LAGRANGE_LOG_PRETTY_PRINT']);
const CONFIG_LOG_MARKERS = Object.freeze([...LOG_ENV, ...PRETTY_ENV, 'prettyPrint']);
const MARK = Object.freeze({BOOT: 'BOOT', CLOCK: 'CLOCK', DOCKER: 'DOCKER',
  DRIVER: 'DRIVER', DISK: 'DISK', BASE: 'BASE'});
const MISSING = 'missing';
const UNREACHABLE = 'unreachable';
const WORD = /\s+/u;
const MS_PER_SECOND = 1000;
const TEXT = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  SPACE: ' ',
  LIST: ', ',
  CLAUSE: '; ',
  LINE: '\n',
  DISK_TAIL: '2>/dev/null || echo /)" | awk \'NR==2{print $4}\')',
  NO_CLOCK: 'no clock read',
  BASES_EQUAL: 'base image registry digests equal on every host',
  NO_REGISTRY_DIGEST: 'no registry digest (RepoDigests) for: ',
  LOG_CAPTURE: 'log capture streamed (LAGRANGE_LOG_FILE unset, pretty print off)',
  UNSET: 'unset',
  TRUE: 'true',
  NO_RUN_DIR: 'keep-evidence needs the run directory it keeps',
  NO_LOGS: 'no node logs listed (no manifest: an interrupted run)\n',
  LOGS_TAIL: 'retained log store); bound by the manifest digests:\n',
  CLEAN: 'clean checkout at the sha (context roots too)',
  CENSUS: 'bounded-wait census present',
});

function item(name, ok, detail) {
  return {detail, item: name, ok};
}

// One read-only command; every answer is one marked line. A base image
// answers `BASE <ref> <Id> <RepoDigests as JSON>` (quoted: the JSON is not
// globbed), or `BASE <ref> missing`.
function hostScript(baseImages) {
  const bases = baseImages.map((ref) =>
    `echo ${MARK.BASE} ${ref} "$(docker image inspect --format ` +
    `'{{.Id}} {{json .RepoDigests}}' ${ref} 2>/dev/null || echo ${MISSING})"`)
    .join(TEXT.CLAUSE);
  return [
    `echo ${MARK.BOOT} $(cat /proc/sys/kernel/random/boot_id)`,
    // Seconds with a fraction: `%3N` is not portable (uutils date, as on
    // carinas-windows, prints more digits for it).
    `echo ${MARK.CLOCK} $(date +%s.%N)`,
    `echo ${MARK.DOCKER} $(docker info --format '{{.ServerVersion}}' 2>/dev/null ` +
      `|| echo ${UNREACHABLE})`,
    `echo ${MARK.DRIVER} $(docker info --format '{{.Driver}}' 2>/dev/null ` +
      `|| echo ${UNREACHABLE})`,
    `echo ${MARK.DISK} $(df -Pk "$(docker info --format '{{.DockerRootDir}}' ` +
      TEXT.DISK_TAIL,
    bases,
  ].filter(Boolean).join(TEXT.CLAUSE);
}

function parseRepoDigests(text) {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (_error) {
    return [];
  }
}

function parseBaseAnswer(id, digestsJson) {
  if (!id || id === MISSING) return {imageId: MISSING, repoDigests: []};
  return {imageId: id, repoDigests: parseRepoDigests(digestsJson)};
}

export function parseHostAnswer(text) {
  const answer = {baseImages: {}, bootId: null, clockMs: null, docker: null,
    freeKib: null, storageDriver: null};
  for (const line of String(text).split(TEXT.LINE)) {
    const [mark, first, second, third] = line.trim().split(WORD);
    if (mark === MARK.BOOT) answer.bootId = first || null;
    if (mark === MARK.CLOCK) answer.clockMs = Math.round(Number(first) * MS_PER_SECOND);
    if (mark === MARK.DOCKER) answer.docker = first || null;
    if (mark === MARK.DRIVER) answer.storageDriver = first || null;
    if (mark === MARK.DISK) answer.freeKib = Number(first);
    if (mark === MARK.BASE && first) answer.baseImages[first] = parseBaseAnswer(second, third);
  }
  return answer;
}

async function observeHostOverSsh(node, baseImages) {
  const startedMs = Date.now();
  const text = await capture(SSH, [SSH_OPTION, SSH_BATCH_MODE, node.ssh,
    hostScript(baseImages)], {timeoutMs: HOST_DEADLINE_MS});
  return {...parseHostAnswer(text), sentMs: startedMs, receivedMs: Date.now()};
}

function clockItem(name, answer) {
  const bound = CERTIFICATION_PREFLIGHT_BOUND.MAX_CLOCK_SKEW_MS;
  if (!Number.isFinite(answer.clockMs)) return item(name, false, TEXT.NO_CLOCK);
  // The host read its clock between send and receive: it is more than
  // `bound` off only if it lies outside [sent - bound, received + bound].
  const ok = answer.clockMs >= answer.sentMs - bound &&
    answer.clockMs <= answer.receivedMs + bound;
  return item(name, ok, `host clock ${answer.clockMs - answer.receivedMs}..` +
    `${answer.clockMs - answer.sentMs} ms from the controller (bound ${bound} ms)`);
}

function baseImageOf(answer, ref) {
  const base = answer.baseImages?.[ref];
  return base && base.imageId && base.imageId !== MISSING ? base : null;
}

function describeBase(ref, base) {
  return `${ref}=${base.imageId} ${JSON.stringify(base.repoDigests)}`;
}

function hostItems(node, answer, baseImages) {
  const prefix = `host ${node.name}`;
  if (answer.error) return [item(`${prefix} reachable`, false, answer.error)];
  const minKib = CERTIFICATION_PREFLIGHT_BOUND.MIN_FREE_DISK_KIB;
  const missing = baseImages.filter((ref) => baseImageOf(answer, ref) === null);
  const undigested = baseImages.filter((ref) => baseImageOf(answer, ref) !== null &&
    baseImageContentDigests(ref, baseImageOf(answer, ref).repoDigests).length === 0);
  return [
    item(`${prefix} docker`, Boolean(answer.docker) && answer.docker !== UNREACHABLE,
      `docker ${answer.docker ?? UNREACHABLE} (storage driver ` +
        `${answer.storageDriver ?? UNREACHABLE})`),
    item(`${prefix} free disk`, Number.isFinite(answer.freeKib) && answer.freeKib >= minKib,
      `${answer.freeKib} KiB free under the docker root (minimum ${minKib} KiB)`),
    clockItem(`${prefix} clock skew`, answer),
    item(`${prefix} base images present`, missing.length === 0 && undigested.length === 0,
      missing.length > 0 ? `missing: ${missing.join(TEXT.LIST)}` :
        undigested.length > 0 ? TEXT.NO_REGISTRY_DIGEST +
          undigested.map((ref) => describeBase(ref, baseImageOf(answer, ref)))
            .join(TEXT.LIST) :
          baseImages.map((ref) => describeBase(ref, baseImageOf(answer, ref)))
            .join(TEXT.SPACE)),
  ];
}

// Equal registry content, by RepoDigests: the image Id differs between the
// classic and the containerd image store for the same pulled content.
function contentOf(answer, ref) {
  const base = baseImageOf(answer, ref);
  return base === null ? MISSING :
    baseImageContentDigests(ref, base.repoDigests).join(TEXT.LIST) || MISSING;
}

function equalBaseImagesItem(nodes, answers, baseImages) {
  const differing = baseImages.filter((ref) => new Set(answers.map((answer) =>
    contentOf(answer, ref))).size !== 1 ||
    answers.some((answer) => contentOf(answer, ref) === MISSING));
  return item(TEXT.BASES_EQUAL, differing.length === 0 &&
    baseImages.length > 0, differing.length === 0 ?
    `${baseImages.length} base image(s) the same registry content on ` +
      `${nodes.length} host(s)` :
    differing.map((ref) => `${ref}: ${nodes.map((node, index) =>
      `${node.name}=${contentOf(answers[index], ref)}`).join(TEXT.SPACE)}`)
      .join(TEXT.CLAUSE));
}

function distinctBootItem(nodes, answers, required) {
  const ids = answers.map((answer) => answer.bootId).filter(Boolean);
  const distinct = new Set(ids).size;
  return item(`${required} distinct boot ids`, distinct === required &&
    ids.length === nodes.length, `${distinct} distinct of ${nodes.length} host(s): ` +
    nodes.map((node, index) => `${node.name}=${answers[index].bootId}`).join(TEXT.SPACE));
}

function logCaptureItem(environment, baseConfigText) {
  const set = [...LOG_ENV.filter((name) => environment[name]),
    ...PRETTY_ENV.filter((name) => String(environment[name]) === TEXT.TRUE),
    ...CONFIG_LOG_MARKERS.filter((marker) => baseConfigText.includes(marker))
      .map((marker) => `base config names ${marker}`)];
  return item(TEXT.LOG_CAPTURE, set.length === 0,
    set.length === 0 ? TEXT.UNSET : set.join(TEXT.LIST));
}

/**
 * Every certification pre-flight item, observed, never acting.
 * @param {Object} input {nodes, certify, baseConfig, environment,
 *   readCommitIdentity?, observeHost?, readCensus?, requiredHosts}
 * @return {Promise<Array<{item, ok, detail}>>}
 */
export async function runCertificationPreflight({nodes, certify, baseConfig,
  environment = process.env, readCommitIdentity = observeCommitIdentity,
  observeHost = observeHostOverSsh, readCensus = readSpentWaitCensus,
  requiredHosts = nodes.length}) {
  const identity = readCommitIdentity({requestedSha: certify});
  const problem = commitIdentityProblem(identity);
  const census = readCensus();
  const baseImages = dockerfileBaseImages(readFileSync(DOCKERFILE, TEXT_ENCODING));
  const items = [
    item(TEXT.CLEAN, problem === null,
      problem ?? `HEAD ${identity.headSha} clean`),
    item(TEXT.CENSUS, census.error === null,
      census.error ?? `${census.knownFindings.length} known finding row(s) in ${census.path}`),
    logCaptureItem(environment, readFileSync(resolve(baseConfig), TEXT_ENCODING)),
  ];
  const answers = [];
  for (const node of nodes) {
    const answer = await observeHost(node, baseImages)
      .catch((error) => ({baseImages: {}, error: String(error?.message || error)}));
    answers.push(answer);
    items.push(...hostItems(node, answer, baseImages));
  }
  items.push(equalBaseImagesItem(nodes, answers, baseImages),
    distinctBootItem(nodes, answers, requiredHosts));
  return items;
}

/**
 * One line per item, then the verdict line.
 * @param {Array<{item, ok, detail}>} items
 * @return {string}
 */
export function formatCertificationPreflight(items) {
  const failed = items.filter((entry) => !entry.ok).length;
  return items.map((entry) => `${entry.ok ? TEXT.PASS : TEXT.FAIL} ${entry.item}: ` +
    `${entry.detail}\n`).join('') +
    `certification preflight: ${failed === 0 ? TEXT.PASS :
      `${TEXT.FAIL} (${failed} item(s))`}\n`;
}

/**
 * `lab harness keep-evidence RUN_DIR [--to DIR] [--quest ID]`: print the
 * run's record line first (whatever the directory holds), then copy the
 * run's verdict files to the committed evidence tree; print where they
 * went, and where the node logs are kept with their manifest digests.
 * @param {{runDir: string, to?: string, quest?: ?string, write?: Function}} input
 * @return {Promise<Object>}
 */
export async function keepCertificationEvidence({runDir, to = COMMITTED_CERTIFICATION_EVIDENCE,
  quest = null, write = (text) => process.stdout.write(text)}) {
  if (!runDir) throw new Error(TEXT.NO_RUN_DIR);
  printCertificationRecord(resolve(runDir), {questId: quest, write});
  const kept = await keepCertificationVerdict({destRoot: resolve(to),
    runDir: resolve(runDir)});
  write(`kept ${kept.copied.join(TEXT.LIST)} -> ${kept.dest} (commit these)\n`);
  write(kept.logs.length === 0 ? TEXT.NO_LOGS :
    `node logs stay OUTSIDE git, under ${kept.logsDir} (copy them to the ` +
      TEXT.LOGS_TAIL +
      kept.logs.map((log) => `  ${log.sha256}  ${log.path} (${log.bytes} bytes)\n`).join(''));
  return kept;
}
