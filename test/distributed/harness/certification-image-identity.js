/**
 * The commit identity of a certification run, OBSERVED, never inferred
 * (owner ruling: certification independently observes every required fact
 * in that run). Owned here, decided by scenario-certification.js:
 *
 *   checkout   HEAD is the requested 40-hex sha; `git status --porcelain`
 *              is empty, and so is `git status --porcelain --ignored` over
 *              the build-context roots (docker-build-context.js parses
 *              them from the Dockerfile), so an untracked or ignored file
 *              the image build would tar cannot hide;
 *   build      a FRESH build on every selected docker host (no label
 *              reuse), labelled with the full sha, an explicit clean flag,
 *              the SHA-256 of every file the build context sends, the src
 *              fingerprint the node computes at boot, and a per-run build
 *              id; a checkout that is not clean builds nothing;
 *   readback   the labels read BACK from the image on each host
 *              (DockerProvider.inspectImage), then the context re-observed
 *              after the build (unchanged digest, still clean);
 *   nodes      every placed node's container runs an image whose labels
 *              carry this run's build id, sha and digest (docker inspect of
 *              the container's image through the node's provider), and
 *              every node's full log carries its boot provenance line with
 *              the booted src fingerprint equal to the certified one.
 *
 * Limit (STOPPED, needs src/): the node's boot provenance line
 * (src/entrypoint-runtime-provenance.js) fingerprints /app/src only; vendor/,
 * package*.json and the Dockerfile are attested by the per-node image labels
 * of the container, not by the node itself.
 */

import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {
  computeFileSetFingerprint,
} from '../../../src/diagnostics/source-fingerprint.js';
import {
  buildImageContext,
  dockerfileContextRoots,
} from './docker-build-context.js';

// Module-load captures (the harness tree's ambient-intrinsics rule).
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);
const regExpExec = Function.call.bind(RegExp.prototype.exec);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);
const objectEntries = Object.entries;

const ZERO = 0;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const GIT = 'git';
const LINE_SEPARATOR = '\n';
const DEFAULT_DOCKERFILE = 'Dockerfile';
const GIT_HEAD_ARGS = Object.freeze(['rev-parse', 'HEAD']);
const GIT_STATUS_ARGS = Object.freeze(['status', '--porcelain']);
const GIT_CONTEXT_STATUS_ARGS = Object.freeze(['status', '--porcelain',
  '--ignored', '--untracked-files=all', '--']);
const DIRTY_PATHS_REPORTED = 20;
const CLEAN_LABEL_VALUE = 'true';
// `FROM [--flag ...] image [AS stage]`: the image, and the stage name.
const FROM_LINE = /^\s*from\s+(?:--\S+\s+)*(\S+)(?:\s+as\s+(\S+))?/iu;

const CERTIFICATION_IMAGE_LABEL = Object.freeze({
  BUILD_ID: 'ddb.certify.build-id',
  CLEAN: 'ddb.certify.clean',
  CONTEXT_DIGEST: 'ddb.certify.context-digest',
  SHA: 'ddb.certify.sha',
  SRC_FINGERPRINT: 'ddb.certify.src-fingerprint',
});

function defaultGit(args, cwd) {
  return execFileSync(GIT, args, {cwd, encoding: 'utf8'});
}

function outputLines(text) {
  return arrayFilter(stringSplit(String(text), LINE_SEPARATOR),
    (line) => stringTrim(line).length > ZERO);
}

/**
 * Observe the controller checkout the images are built from.
 * @param {{requestedSha: string, cwd?: string, git?: Function,
 *   dockerfile?: string}} input
 * @return {Object} {requestedSha, headSha, dirty, dirtyPaths,
 *   dirtyPathCount, contextRoots, contextDirtyPaths, contextDirtyPathCount,
 *   error}
 */
function observeCommitIdentity({requestedSha, cwd = process.cwd(),
  git = defaultGit, dockerfile = DEFAULT_DOCKERFILE}) {
  try {
    const headSha = stringTrim(String(git([...GIT_HEAD_ARGS], cwd)));
    const dirtyPaths = outputLines(git([...GIT_STATUS_ARGS], cwd));
    const contextRoots = dockerfileContextRoots(cwd, dockerfile);
    const contextDirtyPaths = outputLines(git([...GIT_CONTEXT_STATUS_ARGS,
      ...contextRoots], cwd));
    return {contextDirtyPathCount: contextDirtyPaths.length,
      contextDirtyPaths: contextDirtyPaths.slice(ZERO, DIRTY_PATHS_REPORTED),
      contextRoots,
      dirty: dirtyPaths.length > ZERO || contextDirtyPaths.length > ZERO,
      dirtyPathCount: dirtyPaths.length,
      dirtyPaths: dirtyPaths.slice(ZERO, DIRTY_PATHS_REPORTED), error: null,
      headSha, requestedSha: requestedSha ?? null};
  } catch (error) {
    return {contextDirtyPathCount: null, contextDirtyPaths: [],
      contextRoots: [], dirty: null, dirtyPathCount: null, dirtyPaths: [],
      error: String(error?.message || error), headSha: null,
      requestedSha: requestedSha ?? null};
  }
}

/**
 * Why a commit identity cannot certify, or null.
 * @param {Object|null} identity From observeCommitIdentity.
 * @return {string|null}
 */
function commitIdentityProblem(identity) {
  if (!identity || identity.error) {
    return 'commit identity not observed' +
      (identity?.error ? ': ' + identity.error : '');
  }
  if (!SHA_PATTERN.test(String(identity.requestedSha || ''))) {
    return 'requested sha is not a full 40-hex commit: ' +
      JSON.stringify(identity.requestedSha);
  }
  if (identity.dirty !== false) {
    return `checkout is dirty (${identity.dirtyPathCount} path(s); ` +
      `${identity.contextDirtyPathCount} untracked, ignored or modified ` +
      'path(s) inside the build context)';
  }
  if (identity.headSha !== identity.requestedSha) {
    return `checkout HEAD ${identity.headSha} is not the requested ` +
      identity.requestedSha;
  }
  return null;
}

/**
 * The SHA-256 of every file the image build context sends (the builder's
 * own list, docker-build-context.js), in source-fingerprint framing.
 * @param {{cwd?: string, dockerfile?: string}} input
 * @return {Promise<{digest, fileCount, error}>}
 */
async function observeBuildContext({cwd = process.cwd(),
  dockerfile = DEFAULT_DOCKERFILE} = {}) {
  try {
    const files = buildImageContext(cwd, dockerfile).src;
    return {digest: await computeFileSetFingerprint(cwd, files), error: null,
      fileCount: files.length};
  } catch (error) {
    return {digest: null, error: String(error?.message || error),
      fileCount: null};
  }
}

/**
 * The base images a Dockerfile builds FROM (an earlier stage's name is not
 * a base image). Pure.
 * @param {string} text
 * @return {Array<string>}
 */
function dockerfileBaseImages(text) {
  const stages = new Set();
  const seen = new Set();
  const refs = [];
  for (const line of stringSplit(String(text), LINE_SEPARATOR)) {
    const match = regExpExec(FROM_LINE, line);
    if (match === null) {
      continue;
    }
    if (!stages.has(stringToLowerCase(match[1])) && !seen.has(match[1])) {
      seen.add(match[1]);
      refs.push(match[1]);
    }
    if (match[2]) {
      stages.add(stringToLowerCase(match[2]));
    }
  }
  return refs;
}

function readBaseImageRefs(cwd, dockerfile) {
  try {
    return dockerfileBaseImages(readFileSync(join(cwd, dockerfile), 'utf8'));
  } catch (_error) {
    return [];
  }
}

/**
 * The certification request of a `--certify SHA` run, observed BEFORE the
 * image build: the checkout, the build context, and the labels the fresh
 * build writes. `build.refusal` names why nothing may be built.
 * @param {{requestedSha: string, srcFingerprint: ?string, cwd?: string,
 *   dockerfile?: string, git?: Function, buildId?: string}} input
 * @return {Promise<Object>}
 */
async function prepareCertificationBuild({requestedSha, srcFingerprint,
  cwd = process.cwd(), dockerfile = DEFAULT_DOCKERFILE, git = defaultGit,
  buildId = randomUUID()}) {
  const commitIdentity = observeCommitIdentity({cwd, dockerfile, git,
    requestedSha});
  const context = await observeBuildContext({cwd, dockerfile});
  const refusal = commitIdentityProblem(commitIdentity) ??
    (context.error ? 'build context unreadable: ' + context.error : null) ??
    (srcFingerprint ? null : 'no src fingerprint for the build');
  const baseImageRefs = readBaseImageRefs(cwd, dockerfile);
  return {
    build: {baseImageRefs, buildId, context, dockerfile, labels: {
      [CERTIFICATION_IMAGE_LABEL.BUILD_ID]: buildId,
      [CERTIFICATION_IMAGE_LABEL.CLEAN]: CLEAN_LABEL_VALUE,
      [CERTIFICATION_IMAGE_LABEL.CONTEXT_DIGEST]: String(context.digest),
      [CERTIFICATION_IMAGE_LABEL.SHA]: String(requestedSha),
      [CERTIFICATION_IMAGE_LABEL.SRC_FINGERPRINT]: String(srcFingerprint),
    }, refusal, srcFingerprint: srcFingerprint ?? null},
    commitIdentity,
    requested: true,
    requestedSha,
  };
}

/**
 * After the build: what each host's image says about itself (read back),
 * and the checkout and context re-observed.
 * @param {Object} certification From prepareCertificationBuild (mutated).
 * @param {Object|null} imageResult From build-image.js buildImage.
 * @param {{cwd?: string, git?: Function}} [options]
 * @return {Promise<Object>} certification.image
 */
async function completeCertificationBuild(certification, imageResult,
  options = {}) {
  const dockerfile = certification.build?.dockerfile ?? DEFAULT_DOCKERFILE;
  certification.image = {
    imageReadback: imageResult?.imageReadback ?? [],
    postBuildContext: await observeBuildContext({cwd: options.cwd,
      dockerfile}),
    postBuildIdentity: observeCommitIdentity({cwd: options.cwd, dockerfile,
      git: options.git, requestedSha: certification.requestedSha}),
    reused: imageResult?.reused ?? null,
  };
  return certification.image;
}

function describeNodeImage(nodeId, imageId, image) {
  return {error: image ? null : `image ${imageId} not inspectable`, imageId,
    labels: image ? image.Config?.Labels ?? null : null, nodeId};
}

async function observeNodeImage(node) {
  const nodeId = node?.id ?? null;
  try {
    const provider = node._dockerProvider;
    const imageId = (await provider.inspectContainer(node.containerId))
      ?.Image ?? null;
    return describeNodeImage(nodeId, imageId,
      imageId ? await provider.inspectImage(imageId) : null);
  } catch (error) {
    return {error: String(error?.message || error), imageId: null,
      labels: null, nodeId};
  }
}

/**
 * The image each placed node's container actually runs, by docker inspect
 * through the node's own provider (before teardown).
 * @param {Array<Object>} nodes NodeHandles (`_dockerProvider`, containerId).
 * @return {Promise<Array<{nodeId, imageId, labels, error}>>}
 */
async function observeNodeImages(nodes) {
  const observed = [];
  for (const node of nodes || []) {
    observed.push(await observeNodeImage(node));
  }
  return observed;
}

function labelProblems(where, labels, expected) {
  const problems = [];
  for (const [key, value] of objectEntries(expected)) {
    const actual = labels?.[key] ?? null;
    if (actual !== value) {
      problems.push(`${where}: label ${key} is ${JSON.stringify(actual)}, ` +
        `expected ${JSON.stringify(value)}`);
    }
  }
  return problems;
}

function freshBuildProblems(image, build) {
  const problems = [];
  if (image.reused !== false) {
    problems.push('image not built fresh by this run (reused: ' +
      JSON.stringify(image.reused ?? null) + ')');
  }
  const readback = image.imageReadback || [];
  if (readback.length === ZERO) {
    problems.push('no image label was read back from any host');
  }
  for (const entry of readback) {
    problems.push(...labelProblems(`image on ${entry.host}`, entry.labels,
      build.labels));
  }
  return problems;
}

function postBuildProblems(image, build) {
  const problems = [];
  const before = build.context?.digest ?? null;
  const after = image.postBuildContext?.digest ?? null;
  if (after !== before) {
    problems.push(`build context changed during the build: ${before} -> ` +
      after);
  }
  const identity = commitIdentityProblem(image.postBuildIdentity ?? null);
  if (identity !== null) {
    problems.push('after the build: ' + identity);
  }
  return problems;
}

// R1: the base images each host built FROM, read back after the build
// (docker image inspect of every FROM image), must be present and the same
// image id on every host: an unpinned tag cached differently per host is
// different bits under identical labels.
function baseImageProblems(image, build) {
  const refs = build.baseImageRefs || [];
  if (refs.length === ZERO) {
    return ['no base image (FROM) was read from the Dockerfile'];
  }
  const problems = [];
  for (const ref of refs) {
    const ids = new Map();
    for (const entry of image.imageReadback || []) {
      const base = arrayFind(entry.baseImages || [], (item) =>
        item.ref === ref);
      if (!base?.imageId) {
        problems.push(`image on ${entry.host}: base image ${ref} not read ` +
          'back');
        continue;
      }
      ids.set(base.imageId, [...(ids.get(base.imageId) || []), entry.host]);
    }
    if (ids.size > 1) {
      problems.push(`base image ${ref} differs across hosts: ` +
        JSON.stringify(Object.fromEntries(ids)));
    }
  }
  return problems;
}

function buildProblems(certification) {
  const image = certification.image || {};
  return [...freshBuildProblems(image, certification.build),
    ...baseImageProblems(image, certification.build),
    ...postBuildProblems(image, certification.build)];
}

/**
 * Inspect each base image on one docker provider (after the build).
 * @param {Object} provider DockerProvider (inspectImage).
 * @param {Array<string>} refs
 * @return {Promise<Array<{ref, imageId, repoDigests}>>}
 */
async function readBaseImages(provider, refs) {
  const observed = [];
  for (const ref of refs || []) {
    try {
      const inspect = await provider.inspectImage(ref);
      observed.push({imageId: inspect?.Id ?? null, ref,
        repoDigests: inspect?.RepoDigests ?? []});
    } catch (error) {
      observed.push({error: String(error?.message || error), imageId: null,
        ref, repoDigests: []});
    }
  }
  return observed;
}

function nodeProblems(build, nodes, nodeImages, bootProvenance) {
  const problems = [];
  for (const node of nodes) {
    const image = arrayFind(nodeImages || [], (entry) =>
      entry.nodeId === node.id);
    if (!image || image.error !== null) {
      problems.push(`node ${node.id}: the image its container runs was not ` +
        'observed' + (image?.error ? ': ' + image.error : ''));
    } else {
      problems.push(...labelProblems(`node ${node.id} image ${image.imageId}`,
        image.labels, build.labels));
    }
    const boots = bootProvenance?.[node.id] || [];
    if (boots.length === ZERO) {
      problems.push(`node ${node.id}: no boot provenance line in its full log`);
    }
    for (const boot of boots) {
      if (boot.bootedSrcFingerprint !== build.srcFingerprint) {
        problems.push(`node ${node.id}: booted src fingerprint ` +
          `${boot.bootedSrcFingerprint} is not ${build.srcFingerprint}`);
      }
    }
  }
  return problems;
}

/**
 * Every reason the run's commit identity is not exact. Pure.
 * @param {{certification: Object, nodes: Array, nodeImages: Array,
 *   bootProvenance: Object<string, Array>, staleSourceWarning: ?string}}
 *   evidence
 * @return {Array<string>}
 */
function commitIdentityProblems(evidence) {
  const certification = evidence.certification || {};
  const problems = [];
  const checkout = commitIdentityProblem(certification.commitIdentity ?? null);
  if (checkout !== null) {
    problems.push(checkout);
  }
  if (!certification.build) {
    problems.push('no certification build was prepared');
  } else {
    if (certification.build.refusal) {
      problems.push('build refused: ' + certification.build.refusal);
    }
    problems.push(...buildProblems(certification),
      ...nodeProblems(certification.build, evidence.nodes || [],
        evidence.nodeImages, evidence.bootProvenance));
  }
  if (evidence.staleSourceWarning) {
    problems.push(evidence.staleSourceWarning);
  }
  return problems;
}

/**
 * Why a `--certify` argument cannot request certification, or null.
 * @param {string|null} certify The parsed value (null: not given).
 * @return {string|null}
 */
function certifyArgumentProblem(certify) {
  if (certify === null || certify === undefined) {
    return null;
  }
  return SHA_PATTERN.test(String(certify)) ?
    null :
    '--certify needs the full 40-hex commit sha it certifies, got ' +
      JSON.stringify(certify);
}

export {
  CERTIFICATION_IMAGE_LABEL,
  certifyArgumentProblem,
  commitIdentityProblem,
  commitIdentityProblems,
  completeCertificationBuild,
  dockerfileBaseImages,
  observeCommitIdentity,
  observeNodeImages,
  prepareCertificationBuild,
  readBaseImages,
};
