/**
 * Host facts and preparation for a comparative-benchmark campaign: the
 * machine identity of every host (hostname, boot incarnation, cores, memory,
 * primary interface), distinct machines enforced; product images present on
 * every host by reference (pulled, never streamed from the controller - the
 * running containers' image ids are the identity, D18); and the machine
 * identity of the load generator's host.
 */
import {SCENARIO_REFUSAL} from './scenario-host-topology.js';
import {
  arrayIncludes,
  arrayMap,
  stringSplit,
  stringTrim,
} from './real-product-captured-intrinsics.js';
import {
  DEPLOYMENT_FAILURE,
  deploymentFailure,
} from './real-product-deployment-contract.js';
import {errorText, execWithStatus, shellWord} from './real-product-remote-shell.js';

const FIELD_SEPARATOR = '|';
const HOST_FACTS_COMMAND = 'echo "$(hostname)|$(cat /proc/sys/kernel/random/boot_id)|' +
  '$(nproc)|$(awk \'/MemTotal/ {printf "%.1f", $2/1048576}\' /proc/meminfo)|' +
  '$(ip route get 1.1.1.1 | awk \'{for(i=1;i<=NF;i++) if($i=="dev") print $(i+1); exit}\')"';
const IMAGE_PULL_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * @param {{hosts: Array<{ip: string, name?: string}>, sshRun: Function,
 *   opts: Object}} input
 * @return {Promise<Array<Object>>} one entry per host, in order
 */
async function collectHostFacts({hosts, sshRun, opts}) {
  const facts = [];
  for (const host of hosts) {
    const [hostname, bootId, cpus, memGb, primaryIface] = stringSplit(
      stringTrim(String(await sshRun(host.ip, opts, HOST_FACTS_COMMAND))), FIELD_SEPARATOR);
    facts.push({hostId: host.name || host.ip, ip: host.ip, hostname, bootId,
      cpus: Number(cpus), memGb: Number(memGb), primaryIface: primaryIface || null});
  }
  if (new Set(arrayMap(facts, (fact) => fact.bootId)).size !== facts.length) {
    throw deploymentFailure(SCENARIO_REFUSAL.INSUFFICIENT_HOST_TOPOLOGY,
      'two campaign hosts are the same machine (equal boot ids)', {facts});
  }
  return facts;
}

/** Every image present on every host, by reference; a failed pull is typed. */
async function ensureProductImages({hosts, images, sshRun, opts}) {
  const present = [];
  for (const host of hosts) {
    for (const image of images) {
      // Absent is decided by docker's own exit status, never by any failure:
      // an unreachable host is a typed failure, not a reason to pull.
      const inspect = `docker image inspect --format '{{.Id}}' ${shellWord(image)}`;
      const local = await execWithStatus(sshRun, host.ip, opts, `${inspect} 2>&1`);
      let pulled = false;
      if (local.exitCode !== 0) {
        try {
          await sshRun(host.ip, opts, `docker pull -q ${shellWord(image)}`,
            IMAGE_PULL_TIMEOUT_MS);
          pulled = true;
        } catch (error) {
          throw deploymentFailure(DEPLOYMENT_FAILURE.IMAGE_UNAVAILABLE,
            `image ${image} absent on ${host.ip} and not pullable: ${errorText(error)}`,
            {host: host.ip, image, reason: 'pull_refused', inspect: local.stdout});
        }
      }
      const imageId = pulled ? stringTrim(String(await sshRun(host.ip, opts, inspect))) :
        stringTrim(local.stdout);
      present.push({host: host.ip, image, imageId, pulled});
    }
  }
  return present;
}

/**
 * The campaign's content-pinned image on every host, by image id (the content
 * identity the manifest pins), with the registry digest as provenance. A host
 * whose image came from the registry runs it by that digest; a host where the
 * same content was `docker load`ed (no RepoDigest) runs it by image id and
 * says so (`loaded:<id>`). A host without the content is image_unavailable:
 * no pull is attempted - placing the image is an operator step
 * (cloud-reproduction-guide.md).
 * @param {{hosts: Array<{ip: string}>, imageId: string, registryRef: string,
 *   sshRun: Function, opts: Object}} input
 * @return {Promise<Object<string, {runRef: string, imageId: string,
 *   provenance: string}>>} by host ip
 */
async function resolvePinnedImage({hosts, imageId, registryRef, sshRun, opts}) {
  const resolved = {};
  for (const host of hosts) {
    const inspect = await execWithStatus(sshRun, host.ip, opts,
      `docker image inspect --format '{{json .}}' ${shellWord(imageId)} 2>&1`);
    if (inspect.exitCode !== 0) {
      throw deploymentFailure(DEPLOYMENT_FAILURE.IMAGE_UNAVAILABLE,
        `pinned image ${imageId} is not on ${host.ip}`,
        {host: host.ip, imageId, reason: 'absent', inspect: inspect.stdout});
    }
    const image = JSON.parse(inspect.stdout);
    const digests = Array.isArray(image.RepoDigests) ? image.RepoDigests : [];
    resolved[host.ip] = arrayIncludes(digests, registryRef) ?
      {runRef: registryRef, imageId, provenance: `registry:${registryRef}`} :
      {runRef: imageId, imageId, provenance: `loaded:${imageId}`};
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

export {collectHostFacts, describeLoadGenerator, ensureProductImages, resolvePinnedImage};
