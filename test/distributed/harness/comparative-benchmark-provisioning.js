/**
 * Explicit provisioning for a comparative-benchmark campaign on hosts the
 * operator created (GCP): the one step that uses the network on purpose
 * (owner decisions D1/D2, 2026-11-14). It places on each host exactly what the
 * campaign later checks for and never obtains itself, taken from the
 * campaign's own requirement definitions:
 * - every image the host's role runs (`campaignImagesByRole`), pulled by the
 *   exact reference the campaign inspects (the Lagrange image by its
 *   @sha256 digest, which a GCP campaign requires);
 * - the harness commit in the load generator's checkout (pushed from the
 *   controller, then checked out), with that checkout's dependencies installed;
 * - every tarball of the reference-client lockfile in the load generator's npm
 *   cache.
 * Each placement is verified with the campaign's own check (ensureProductImages,
 * resolvePinnedImage, the harness-commit probe, the offline reference-client
 * install). A failure is a typed provisioning failure naming host, role and
 * the missing item; the campaign never papers over it.
 */
import {GIT_OUTPUT_BOUND, execGit} from '../../../scripts/checks/git-invocation.js';
import {
  campaignImagesByRole,
  ensureProductImages,
  resolvePinnedImage,
} from './comparative-benchmark-host-preparation.js';
import {
  DRIVER_INSTALL,
  REFERENCE_CLIENT_PREFIX,
  installReferenceClient,
  npmPathPrefix,
  requireHarnessCommit,
} from './comparative-benchmark-workload-call-site.js';
import {
  arrayFilter,
  arrayMap,
  objectKeys,
  stringReplace,
  stringTrim,
} from './real-product-captured-intrinsics.js';
import {deploymentFailure} from './real-product-deployment-contract.js';
import {errorText, execWithStatus, shellQuote, shellWord} from './real-product-remote-shell.js';

const PROVISIONING_FAILURE = Object.freeze({
  DOCKER_UNREACHABLE: 'provisioning_docker_unreachable',
  IMAGE_NOT_PLACED: 'provisioning_image_not_placed',
  COMMIT_NOT_PLACED: 'provisioning_commit_not_placed',
  DEPENDENCIES_NOT_INSTALLED: 'provisioning_dependencies_not_installed',
  CACHE_NOT_SEEDED: 'provisioning_cache_not_seeded',
});
const ROLE = Object.freeze({DATA: 'data', CLIENT: 'client'});
const IMAGE_PULL_TIMEOUT_MS = 20 * 60 * 1000;
const NPM_TIMEOUT_MS = 30 * 60 * 1000;
const OUTPUT_TAIL_CHARS = 4000;
const LOCKFILE = 'package-lock.json';

function tail(text) {
  return String(text).slice(-OUTPUT_TAIL_CHARS);
}

/**
 * The reference client's lockfile at a commit of the checkout at `root`: the
 * harness commit, whose lockfile the campaign's worktree installs from (the
 * working tree may differ from it).
 */
function readReferenceClientLock(root, commit) {
  return JSON.parse(String(execGit(['show', `${commit}:${REFERENCE_CLIENT_PREFIX}/${LOCKFILE}`],
    {cwd: root, encoding: 'utf8', bound: GIT_OUTPUT_BOUND.COMMAND})));
}

/**
 * Every tarball the offline reference-client install needs: one per locked
 * package (the lockfile's root entry is the client itself).
 * @return {Array<{name: string, version: string, resolved: string, integrity: string}>}
 */
function referenceClientTarballs(lock) {
  return arrayMap(arrayFilter(objectKeys(lock.packages), (key) => key !== ''), (key) => {
    const entry = lock.packages[key];
    return {name: stringReplace(key, /^.*node_modules\//u, ''), version: entry.version,
      resolved: entry.resolved, integrity: entry.integrity};
  });
}

/** What provisioning places, from the campaign's own requirement definitions. */
function comparativeProvisioningPlan({targets, lagrangeImage, harnessCommit,
  referenceClientLock}) {
  return {images: campaignImagesByRole({targets, lagrangeImage}), harnessCommit,
    tarballs: referenceClientTarballs(referenceClientLock)};
}

async function requireDocker({sshRun, opts, host}) {
  const probe = await execWithStatus(sshRun, host.ip, opts,
    'docker info --format \'{{.ServerVersion}}\' 2>&1');
  if (probe.exitCode === 0) return;
  throw deploymentFailure(PROVISIONING_FAILURE.DOCKER_UNREACHABLE, 'docker is not reachable for the ' +
    `ssh user on ${host.ip} (${host.role} host): ${stringTrim(probe.stdout)}`,
  {host: host.ip, role: host.role, output: tail(probe.stdout)});
}

// Pull every image of the host's role, then verify with the campaign's check.
async function placeImages({sshRun, opts, host, images}) {
  for (const image of images) {
    const pulled = await execWithStatus(sshRun, host.ip, opts,
      `docker pull --quiet ${shellWord(image)} 2>&1`, IMAGE_PULL_TIMEOUT_MS);
    if (pulled.exitCode !== 0) {
      throw deploymentFailure(PROVISIONING_FAILURE.IMAGE_NOT_PLACED, `could not pull ${image} on ` +
        `${host.ip} (${host.role} host): ${stringTrim(pulled.stdout)}`,
      {host: host.ip, role: host.role, image, output: tail(pulled.stdout)});
    }
  }
  return ensureProductImages({hosts: [host], role: host.role, images, sshRun, opts});
}

async function remoteStep({sshRun, opts, host, step, command, harnessCommit}) {
  const result = await execWithStatus(sshRun, host.ip, opts, `${command} 2>&1`);
  if (result.exitCode === 0) return result.stdout;
  throw deploymentFailure(PROVISIONING_FAILURE.COMMIT_NOT_PLACED, `could not ${step} the harness ` +
    `commit ${harnessCommit} in ${host.repoPath} on ${host.ip}: ${stringTrim(result.stdout)}`,
  {host: host.ip, step, harnessCommit, repoPath: host.repoPath, output: tail(result.stdout)});
}

// The harness commit into the load generator's checkout: the checkout is made
// a repository when it is not one, the commit is pushed from the controller and
// checked out, then verified with the campaign's own probe and HEAD.
async function placeHarnessCommit({sshRun, opts, host, harnessCommit, pushHarnessCommit}) {
  const repo = shellQuote(host.repoPath);
  await remoteStep({sshRun, opts, host, harnessCommit, step: 'init',
    command: `mkdir -p ${repo} && cd ${repo} && { [ -d .git ] || git init --quiet; }`});
  try {
    await pushHarnessCommit({host, repoPath: host.repoPath, harnessCommit});
  } catch (error) {
    throw deploymentFailure(PROVISIONING_FAILURE.COMMIT_NOT_PLACED, 'could not push the harness commit ' +
      `${harnessCommit} to ${host.repoPath} on ${host.ip}: ${errorText(error)}`,
    {host: host.ip, step: 'push', harnessCommit, repoPath: host.repoPath});
  }
  await remoteStep({sshRun, opts, host, harnessCommit, step: 'check out',
    command: `cd ${repo} && git checkout --detach --quiet ${shellQuote(harnessCommit)}`});
  await requireHarnessCommit({sshRun, opts, host, harnessCommit});
  const head = stringTrim(await remoteStep({sshRun, opts, host, harnessCommit, step: 'verify',
    command: `cd ${repo} && git rev-parse HEAD`}));
  if (head !== harnessCommit) {
    throw deploymentFailure(PROVISIONING_FAILURE.COMMIT_NOT_PLACED, `checkout ${host.repoPath} on ` +
      `${host.ip} is at ${head}, not the harness commit ${harnessCommit}`,
    {host: host.ip, step: 'verify', harnessCommit, head, repoPath: host.repoPath});
  }
  return head;
}

async function installDependencies({sshRun, opts, host}) {
  const result = await execWithStatus(sshRun, host.ip, opts, `cd ${shellQuote(host.repoPath)} ` +
    `&& ${npmPathPrefix(host.nodePath)}npm ci 2>&1`, NPM_TIMEOUT_MS);
  if (result.exitCode === 0) return;
  throw deploymentFailure(PROVISIONING_FAILURE.DEPENDENCIES_NOT_INSTALLED, 'npm ci failed in ' +
    `${host.repoPath} on ${host.ip}`, {host: host.ip, output: tail(result.stdout)});
}

// Every lockfile tarball into the npm cache, then the campaign's own offline
// install from the checkout proves the cache serves it.
async function seedReferenceClientCache({sshRun, opts, host, tarballs}) {
  for (const tarball of tarballs) {
    const added = await execWithStatus(sshRun, host.ip, opts, `${npmPathPrefix(host.nodePath)}` +
      `npm cache add ${shellQuote(tarball.resolved)} 2>&1`, NPM_TIMEOUT_MS);
    if (added.exitCode !== 0) {
      throw deploymentFailure(PROVISIONING_FAILURE.CACHE_NOT_SEEDED, `could not add ${tarball.resolved} ` +
        `to the npm cache on ${host.ip}`, {host: host.ip, missing: [tarball.resolved],
        output: tail(added.stdout)});
    }
  }
  const install = await installReferenceClient({sshRun, opts, host, worktree: host.repoPath});
  if (install.status === DRIVER_INSTALL.INSTALLED) return install;
  throw deploymentFailure(PROVISIONING_FAILURE.CACHE_NOT_SEEDED, `the npm cache on ${host.ip} does not ` +
    `serve the offline reference-client install (npm ci exit ${install.exitCode})`,
  {host: host.ip, missing: install.missing, output: install.output});
}

/**
 * Provision the campaign's hosts. Docker is checked on every host before
 * anything is placed. `pushHarnessCommit({host, repoPath, harnessCommit})`
 * sends the commit from the controller. With opts.lagrangeImageContent the
 * data hosts are verified by content as the campaign resolves them.
 * @return {Promise<{data: Array, client: Object}>} what was placed and verified
 */
async function provisionComparativeHosts({hosts, plan, sshRun, opts, pushHarnessCommit}) {
  for (const host of hosts) await requireDocker({sshRun, opts, host});
  const dataHosts = arrayFilter(hosts, (host) => host.role === ROLE.DATA);
  const data = [];
  for (const host of dataHosts) {
    data.push({host: host.ip,
      images: await placeImages({sshRun, opts, host, images: plan.images.data})});
  }
  const pinned = opts.lagrangeImageContent ? await resolvePinnedImage({hosts: dataHosts,
    contentIdentity: opts.lagrangeImageContent, registryRef: opts.lagrangeImage, sshRun,
    opts}) : null;
  const [client] = arrayFilter(hosts, (host) => host.role === ROLE.CLIENT);
  const images = await placeImages({sshRun, opts, host: client, images: plan.images.client});
  const head = await placeHarnessCommit({sshRun, opts, host: client,
    harnessCommit: plan.harnessCommit, pushHarnessCommit});
  await installDependencies({sshRun, opts, host: client});
  const driverInstall = await seedReferenceClientCache({sshRun, opts, host: client,
    tarballs: plan.tarballs});
  return {data, pinned, client: {host: client.ip, images, repoPath: client.repoPath, head,
    tarballs: arrayMap(plan.tarballs, (tarball) => tarball.resolved),
    driverInstall: driverInstall.status}};
}

export {
  comparativeProvisioningPlan,
  provisionComparativeHosts,
  readReferenceClientLock,
  referenceClientTarballs,
};
