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
  arrayFilter,
  arrayFind,
  arrayIncludes,
  arrayMap,
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
import {TIDB_SQL_CLIENT_IMAGE} from './real-product-deployment-contract.js';
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

/**
 * The images each host role must hold. Data hosts run the product containers;
 * the load generator runs only the containers it starts itself (the TiDB
 * arm's SQL client, started at the client's address), never a product image.
 * @param {{targets: Array<string>, lagrangeImage: string}} input
 * @return {{data: Array<string>, client: Array<string>}}
 */
function campaignImagesByRole({targets, lagrangeImage}) {
  const data = new Set([POSTGRES_IMAGE_DEFAULT]);
  const client = [];
  if (arrayIncludes(targets, COMPARATIVE_TARGET.LAGRANGE)) data.add(lagrangeImage);
  if (arrayIncludes(targets, COMPARATIVE_TARGET.TIDB_TIKV)) {
    for (const image of [PD_IMAGE_DEFAULT, TIKV_IMAGE_DEFAULT, TIDB_IMAGE_DEFAULT]) {
      data.add(image);
    }
    client.push(TIDB_SQL_CLIENT_IMAGE);
  }
  return {data: [...data], client};
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
 * The campaign's content-pinned image on every host, found by CONTENT
 * identity (the digest of its ordered RootFS diff_ids; real-product-identity.js),
 * never by .Id, which is the manifest digest on a containerd store and the
 * config digest on overlay2. A host whose image carries the registry digest
 * runs it by that digest; a host where the same content was `docker load`ed
 * (no RepoDigest) runs it by its local .Id and says so (`loaded:<id>`). A host
 * without the content is image_unavailable: no pull is attempted - placing
 * the image is an operator step (cloud-reproduction-guide.md).
 * @param {{hosts: Array<{ip: string}>, contentIdentity: string,
 *   registryRef: string, sshRun: Function, opts: Object}} input
 * @return {Promise<Object<string, Object>>} by host ip
 */
async function resolvePinnedImage({hosts, contentIdentity, registryRef, sshRun, opts}) {
  const resolved = {};
  for (const host of hosts) {
    const imageStore = imageStoreOf(await sshRun(host.ip, opts,
      'docker info --format \'{{.Driver}}|{{json .DriverStatus}}\''));
    const listing = await execWithStatus(sshRun, host.ip, opts,
      'docker image inspect --format \'{{.Id}}|{{json .RepoDigests}}|' +
      '{{json .RootFS.Layers}}\' $(docker image ls -aq --no-trunc | sort -u) 2>/dev/null');
    const images = arrayMap(arrayFilter(stringSplit(listing.stdout, '\n'), Boolean),
      (line) => {
        const [id, digests, layers] = stringSplit(line, '|');
        return {id, digests: JSON.parse(digests || 'null') || [],
          contentIdentity: contentIdentityOf(JSON.parse(layers || 'null'))};
      });
    const match = arrayFind(images, (image) => image.contentIdentity === contentIdentity);
    if (!match) {
      throw deploymentFailure(DEPLOYMENT_FAILURE.IMAGE_UNAVAILABLE,
        `pinned image content ${contentIdentity} is not on ${host.ip}`,
        {host: host.ip, contentIdentity, reason: 'absent', imageStore});
    }
    const viaRegistry = arrayIncludes(match.digests, registryRef);
    resolved[host.ip] = {runRef: viaRegistry ? registryRef : match.id, imageId: match.id,
      imageStore, contentIdentity, repoDigests: match.digests,
      provenance: viaRegistry ? `registry:${registryRef}` : `loaded:${match.id}`};
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
  campaignImagesByRole,
  collectHostFacts,
  describeLoadGenerator,
  ensureProductImages,
  resolvePinnedImage,
};
