/**
 * Host facts and preparation for a comparative-benchmark campaign: the
 * machine identity of every host (hostname, boot incarnation, cores, memory,
 * primary interface), distinct machines enforced; the images each host role
 * runs present on that host (placed beforehand by a provisioning step, never
 * pulled or streamed by a run - the running containers' image ids are the
 * identity, D18); and the machine identity of the load generator's host.
 */
import {SUBSTRATE_KIND, buildSubstrateDescriptor} from './raw-observation-research-fields.js';
import {SCENARIO_REFUSAL} from './scenario-host-topology.js';
import {
  arrayFilter,
  arrayEvery,
  arrayIsArray,
  jsonParse,
  arrayIncludes,
  arrayMap,
  arrayPush,
  stringSplit,
  stringTrim,
} from './real-product-captured-intrinsics.js';
import {
  DEPLOYMENT_FAILURE,
  deploymentFailure,
} from './real-product-deployment-contract.js';
import {contentIdentityOf, imageStoreOf} from './real-product-identity.js';
import {
  COMPARATIVE_TARGET,
  PD_IMAGE_DEFAULT,
  POSTGRES_IMAGE_DEFAULT,
  TIDB_IMAGE_DEFAULT,
  TIKV_IMAGE_DEFAULT,
} from './real-product-cluster-deployers.js';
import {SQL_CLIENT_IMAGE, TIDB_SQL_CLIENT_IMAGE} from './real-product-deployment-contract.js';
import {execWithStatus, shellWord} from './real-product-remote-shell.js';

const FIELD_SEPARATOR = '|';
const HOST_FACTS_COMMAND = 'echo "$(hostname)|$(cat /proc/sys/kernel/random/boot_id)|' +
  // A decimal point on every host: the ssh runner runs each command in the C
  // locale (fixedLocaleCommand), where gawk under a decimal-comma LC_NUMERIC
  // (sv_SE on adam-laptop, adams-gamla) would print `15,5`.
  '$(nproc)|$(awk \'/MemTotal/ {printf "%.1f", $2/1048576}\' /proc/meminfo)|' +
  '$(ip route get 1.1.1.1 | awk \'{for(i=1;i<=NF;i++) if($i=="dev") print $(i+1); exit}\')"';

const HOST_FACTS_UNREADABLE = 'host_facts_unreadable';

// A host fact that is not a plain decimal number is a typed failure, never NaN.
function numericFact(host, name, text) {
  const value = Number(text);
  if (!/^\d+(\.\d+)?$/u.test(String(text)) || !Number.isFinite(value)) {
    throw deploymentFailure(HOST_FACTS_UNREADABLE,
      `host ${host.name || host.ip} answered ${name} ${JSON.stringify(text)}, not a number`,
      {host: host.ip, fact: name, answer: text});
  }
  return value;
}

/**
 * @param {{hosts: Array<{ip: string, name?: string}>, sshRun: Function,
 *   opts: Object, substrate?: string}} input; the first-look substrate
 *   (lab-single-host) is the one case that accepts the same machine more than once
 * @return {Promise<Array<Object>>} one entry per host, in order
 */
async function collectHostFacts({hosts, sshRun, opts, substrate = null}) {
  const facts = [];
  for (const host of hosts) {
    const [hostname, bootId, cpus, memGb, primaryIface] = stringSplit(
      stringTrim(String(await sshRun(host.ip, opts, HOST_FACTS_COMMAND))), FIELD_SEPARATOR);
    facts.push({hostId: host.name || host.ip, ip: host.ip, hostname, bootId,
      cpus: numericFact(host, 'cpus', cpus), memGb: numericFact(host, 'memGb', memGb),
      primaryIface: primaryIface || null});
  }
  const machines = new Set(arrayMap(facts, (fact) => fact.bootId)).size;
  // The first look runs every node and the load generator on one machine.
  if (substrate === SUBSTRATE_KIND.SINGLE_HOST) {
    if (machines !== 1) {
      throw deploymentFailure(SCENARIO_REFUSAL.INSUFFICIENT_HOST_TOPOLOGY,
        'the single-host substrate names more than one machine', {facts});
    }
    return facts;
  }
  if (machines !== facts.length) {
    throw deploymentFailure(SCENARIO_REFUSAL.INSUFFICIENT_HOST_TOPOLOGY,
      'two campaign hosts are the same machine (equal boot ids)', {facts});
  }
  return facts;
}

const LINK_TYPE = Object.freeze({WIFI: 'wifi', WIRED: 'wired', UNKNOWN: 'unknown'});

/**
 * The observed link type of each host's primary interface (wifi when the
 * interface has a wireless directory), for the substrate descriptor.
 * @param {{facts: Array<Object>, sshRun: Function, opts: Object}} input
 * @return {Promise<Array<string>>} one link type per fact, in order
 */
async function observeLinkTypes({facts, sshRun, opts}) {
  const types = [];
  for (const fact of facts) {
    if (!fact.primaryIface) {
      arrayPush(types, LINK_TYPE.UNKNOWN);
      continue;
    }
    const probe = `[ -e /sys/class/net/${fact.primaryIface}/wireless ] && ` +
      `echo ${LINK_TYPE.WIFI} || echo ${LINK_TYPE.WIRED}`;
    arrayPush(types, stringTrim(String(await sshRun(fact.ip, opts, probe))));
  }
  return types;
}

/**
 * The images each host role must hold: the one requirement both the campaign's
 * check (ensureProductImages) and GCP provisioning
 * (comparative-benchmark-provisioning.js) read. Data hosts run the product
 * containers, the TiDB readiness client (a lifecycle tool started on the TiDB
 * SQL host) and PostgreSQL (also the throwaway container that prepares a
 * Lagrange node's --storage-root directory); the load generator runs the psql
 * client the Lagrange deployer reads through (real-product-sql-clients.js
 * psqlText, from the client host).
 * @param {{targets: Array<string>, lagrangeImage: string}} input
 * @return {{data: Array<string>, client: Array<string>}}
 */
function campaignImagesByRole({targets, lagrangeImage}) {
  const data = new Set([POSTGRES_IMAGE_DEFAULT]);
  const client = [];
  if (arrayIncludes(targets, COMPARATIVE_TARGET.LAGRANGE)) {
    data.add(lagrangeImage);
    client.push(SQL_CLIENT_IMAGE);
  }
  if (arrayIncludes(targets, COMPARATIVE_TARGET.TIDB_TIKV)) {
    for (const image of [PD_IMAGE_DEFAULT, TIKV_IMAGE_DEFAULT, TIDB_IMAGE_DEFAULT]) {
      data.add(image);
    }
    data.add(TIDB_SQL_CLIENT_IMAGE);
  }
  return {data: [...data], client};
}

/**
 * Every image of `role` present on every host of that role, by reference. An
 * absent image refuses the campaign naming host, role and image. Placing an
 * image is a separate provisioning step, never something a run does: on GCP
 * `provision-gcp.sh --place` runs the runner's `--provision`
 * (comparative-benchmark-provisioning.js), which pulls each image by the very
 * reference checked here (the Lagrange image by its @sha256 digest) and then
 * runs this check; on the lab the operator loads them (docker save/load), as
 * no repository code places images on lab hosts.
 */
async function ensureProductImages({hosts, role, images, sshRun, opts}) {
  const present = [];
  for (const host of hosts) {
    for (const image of images) {
      const local = await execWithStatus(sshRun, host.ip, opts,
        `docker image inspect --format '{{.Id}}' ${shellWord(image)} 2>&1`);
      if (local.exitCode !== 0) {
        throw deploymentFailure(DEPLOYMENT_FAILURE.IMAGE_UNAVAILABLE,
          `image ${image} is not on ${host.ip} (${role} host); place it before the campaign ` +
          '(it is never pulled)', {host: host.ip, role, image, reason: 'absent',
            inspect: local.stdout});
      }
      present.push({host: host.ip, role, image, imageId: stringTrim(local.stdout)});
    }
  }
  return present;
}

const IMAGE_DIGEST = /^sha256:[0-9a-f]{64}$/u;
const CONFIG_BLOB = /^(?:blobs\/sha256\/([0-9a-f]{64})|([0-9a-f]{64})\.json)$/u;
const IMAGE_FIELDS = 'docker image inspect --format ' +
  '\'{{.Id}}|{{json .RepoDigests}}|{{json .RootFS.Layers}}\'';

function refuseImage(host, reason, detail) {
  throw deploymentFailure(DEPLOYMENT_FAILURE.IMAGE_UNAVAILABLE,
    `pinned image on ${host}: ${reason}`, {host, reason, ...detail});
}

function parseImage(line, host) {
  try {
    const fields = stringSplit(line, '|');
    if (fields.length !== 3) throw new TypeError('unexpected image fields');
    const [id, digests, diffIds] = fields;
    const layers = jsonParse(diffIds);
    const repoDigests = jsonParse(digests) ?? [];
    if (IMAGE_DIGEST.test(id) && arrayIsArray(repoDigests) &&
        arrayEvery(repoDigests, (value) => typeof value === 'string') &&
        arrayIsArray(layers) && layers.length &&
        arrayEvery(layers, (value) => IMAGE_DIGEST.test(value))) {
      return {id, repoDigests, contentIdentity: contentIdentityOf(layers)};
    }
  } catch (error) {
    refuseImage(host, 'invalid_inspect', {detail: error.message});
  }
  refuseImage(host, 'invalid_inspect', {});
}

async function inspectLocalImage(ctx, ref) {
  const result = await execWithStatus(ctx.sshRun, ctx.host, ctx.opts,
    `${IMAGE_FIELDS} ${shellWord(ref)} 2>&1`);
  if (result.exitCode === 0) return parseImage(stringTrim(result.stdout), ctx.host);
  if (/^(?:Error(?: response from daemon)?: )?No such (?:image|object):/iu.test(stringTrim(result.stdout))) {
    return null;
  }
  refuseImage(ctx.host, 'inspect_failed', {ref, output: result.stdout});
}

// Overlay2 exposes the config digest as .Id. Containerd may expose a manifest
// or index ID. Its local Docker export names the actual config blob in manifest.json.
async function configOf(ctx, image) {
  if (ctx.imageStore === 'overlay2') return image.id;
  const pipeline = `docker image save ${image.id} | tar -xOf - manifest.json`;
  const result = await execWithStatus(ctx.sshRun, ctx.host, ctx.opts,
    `bash -o pipefail -c ${shellWord(pipeline)}`);
  if (result.exitCode === 0) {
    try {
      const records = jsonParse(result.stdout);
      if (arrayIsArray(records) && records.length === 1) {
        const match = CONFIG_BLOB.exec(records[0]?.Config);
        if (match) return `sha256:${match[1] ?? match[2]}`;
      }
    } catch (error) {
      refuseImage(ctx.host, 'config_unverified', {imageId: image.id, detail: error.message});
    }
  }
  refuseImage(ctx.host, 'config_unverified', {imageId: image.id});
}

async function loadedConfig(ctx, configDigest, contentIdentity) {
  if (ctx.imageStore === 'overlay2') {
    const image = await inspectLocalImage(ctx, configDigest);
    if (image?.id === configDigest && image.contentIdentity === contentIdentity) return image;
  } else {
    const listing = await execWithStatus(ctx.sshRun, ctx.host, ctx.opts, 'docker image ls -aq --no-trunc');
    if (listing.exitCode !== 0) refuseImage(ctx.host, 'inventory_failed', {});
    let match = null;
    for (const id of new Set(arrayFilter(stringSplit(stringTrim(listing.stdout), '\n'), Boolean))) {
      if (!IMAGE_DIGEST.test(id)) refuseImage(ctx.host, 'invalid_inventory', {id});
      const image = await inspectLocalImage(ctx, id);
      if (!image) continue;
      if (image.id !== id) refuseImage(ctx.host, 'invalid_inventory', {id, observed: image.id});
      if (image.contentIdentity !== contentIdentity ||
          await configOf(ctx, image) !== configDigest) continue;
      if (match) refuseImage(ctx.host, 'ambiguous_config', {configDigest});
      match = image;
    }
    if (match) return match;
  }
  refuseImage(ctx.host, 'exact_config_absent', {configDigest, contentIdentity});
}

// First resolve Docker's requested reference wherever present. Only those
// observations can establish the config required on hosts missing the reference.
async function resolvePinnedImage({hosts, contentIdentity, registryRef, sshRun, opts}) {
  let configDigest = null;
  const observations = [];
  for (const {ip: host} of hosts) {
    const imageStore = imageStoreOf(await sshRun(host, opts,
      'docker info --format \'{{.Driver}}|{{json .DriverStatus}}\''));
    if (imageStore === 'unknown') refuseImage(host, 'unknown_store', {});
    const ctx = {host, imageStore, sshRun, opts};
    const exact = await inspectLocalImage(ctx, registryRef);
    if (exact) {
      if (exact.contentIdentity !== contentIdentity) {
        refuseImage(host, 'reference_content_mismatch', {registryRef, contentIdentity});
      }
      const digest = await configOf(ctx, exact);
      if (configDigest !== null && configDigest !== digest) {
        refuseImage(host, 'reference_config_mismatch', {registryRef, configDigest, observed: digest});
      }
      configDigest = digest;
    }
    observations.push({ctx, exact});
  }
  if (!configDigest) refuseImage(hosts[0]?.ip, 'reference_absent', {registryRef, contentIdentity});
  const resolved = {};
  for (const {ctx, exact} of observations) {
    const image = exact ?? await loadedConfig(ctx, configDigest, contentIdentity);
    const viaRegistry = exact && arrayIncludes(image.repoDigests, registryRef);
    resolved[ctx.host] = {runRef: viaRegistry ? registryRef : image.id, imageId: image.id,
      imageStore: ctx.imageStore, contentIdentity, configDigest, repoDigests: image.repoDigests,
      provenance: viaRegistry ? `registry:${registryRef}` : `loaded:${image.id}`};
  }
  return resolved;
}

/**
 * The load generator's machine identity. Its Node version, driver versions
 * and checkout commit are reported by the load-generator CLI itself, from the
 * process that ran the workload.
 */
function describeLoadGenerator({host, hostFacts}) {
  return {host: host.ip, hostname: hostFacts?.hostname ?? null,
    bootId: hostFacts?.bootId ?? null};
}

export {
  buildSubstrateDescriptor,
  campaignImagesByRole,
  collectHostFacts,
  observeLinkTypes,
  describeLoadGenerator,
  ensureProductImages,
  resolvePinnedImage,
};
