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
  arrayMap,
  stringSplit,
  stringTrim,
} from './real-product-captured-intrinsics.js';
import {
  DEPLOYMENT_FAILURE,
  deploymentFailure,
} from './real-product-deployment-contract.js';
import {errorText, shellWord} from './real-product-remote-shell.js';

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
      let imageId;
      try {
        imageId = stringTrim(String(await sshRun(host.ip, opts,
          `docker image inspect --format '{{.Id}}' ${shellWord(image)}`)));
      } catch {
        try {
          await sshRun(host.ip, opts, `docker pull -q ${shellWord(image)}`,
            IMAGE_PULL_TIMEOUT_MS);
          imageId = stringTrim(String(await sshRun(host.ip, opts,
            `docker image inspect --format '{{.Id}}' ${shellWord(image)}`)));
        } catch (error) {
          throw deploymentFailure(DEPLOYMENT_FAILURE.DEPLOYMENT_COMMAND_FAILED,
            `image ${image} unavailable on ${host.ip}: ${errorText(error)}`,
            {host: host.ip, image});
        }
      }
      present.push({host: host.ip, image, imageId});
    }
  }
  return present;
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

export {collectHostFacts, describeLoadGenerator, ensureProductImages};
