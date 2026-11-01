/**
 * Product identity and storage placement of a comparative-benchmark
 * deployment, read from the RUNNING containers (`docker inspect` of the
 * container id the deployer started, never of an image tag: one tag resolved
 * to four different images across the 2026-11-01 fleet, D18) plus the
 * product's own version report. Product identity is recorded apart from the
 * harness identity; the tag is informational.
 */
import {
  arrayEvery,
  arrayFilter,
  arrayFind,
  arrayIncludes,
  arrayMap,
  arraySome,
  stringLastIndexOf,
  stringReplace,
  stringStartsWith,
} from './real-product-captured-intrinsics.js';
import {
  DEPLOYMENT_FAILURE,
  RUN_CLASS,
  STORAGE_KIND,
  deploymentFailure,
} from './real-product-deployment-contract.js';
import {
  errorText,
  inspectContainerCommand,
  shellWord,
} from './real-product-remote-shell.js';

const PERSISTENT_MOUNT_TYPES = Object.freeze(['bind', 'volume']);
const IMAGE_ID_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const EVENT_KIND = Object.freeze({
  CONTAINER_ABSENT: 'container-absent',
  CONTAINER_RESTARTED: 'container-restarted',
  IMAGE_CHANGED: 'image-changed',
});

function imageRepository(imageRef) {
  const text = String(imageRef || '');
  const at = stringLastIndexOf(text, ':');
  return at > stringLastIndexOf(text, '/') ? text.slice(0, at) : text;
}

async function readRepoDigest({sshRun, opts, host, imageId, imageRef}) {
  const raw = await sshRun(host, opts,
    `docker image inspect --format '{{json .RepoDigests}}' ${shellWord(imageId)}`);
  const digests = JSON.parse(String(raw || 'null')) || [];
  const repository = imageRepository(imageRef);
  return arrayFind(digests, (digest) => stringStartsWith(digest, `${repository}@`)) ||
    digests[0] || null;
}

function mountsOf(inspect) {
  return arrayMap(Array.isArray(inspect?.Mounts) ? inspect.Mounts : [], (mount) => ({
    type: mount.Type ?? null, source: mount.Source ?? null,
    destination: mount.Destination ?? null}));
}

/**
 * Inspect one running product container. Absent or stopped is
 * identity_unverified: dead-process evidence is never identity (D15).
 */
async function inspectRunningContainer({sshRun, opts, host, containerId, role}) {
  let inspect;
  try {
    inspect = JSON.parse(await sshRun(host, opts, inspectContainerCommand(containerId)));
  } catch (error) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
      `${role} container ${containerId} on ${host} could not be inspected: ` +
      errorText(error), {role, host, containerId});
  }
  if (inspect?.State?.Running !== true) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
      `${role} container ${containerId} on ${host} is not running`,
      {role, host, containerId, state: inspect?.State ?? null});
  }
  const imageRef = inspect.Config?.Image ?? null;
  const imageId = inspect.Image ?? null;
  return {
    role, host, containerId: inspect.Id || containerId,
    name: stringReplace(String(inspect.Name || ''), /^\//u, '') || null,
    imageRef, imageId,
    repoDigest: imageId ? await readRepoDigest({sshRun, opts, host, imageId, imageRef}) : null,
    entrypoint: inspect.Config?.Entrypoint ?? null,
    cmd: inspect.Config?.Cmd ?? null,
    startedAt: inspect.State?.StartedAt ?? null,
    mounts: mountsOf(inspect),
    reportedVersion: null,
  };
}

/** Inspect every role's container, in role order. */
async function inspectProducts({sshRun, opts, roles}) {
  const products = [];
  for (const role of roles) {
    products.push(await inspectRunningContainer({sshRun, opts, host: role.host,
      containerId: role.containerId, role: role.role}));
  }
  return products;
}

/**
 * Inspect the products again after the measured window. A container that is
 * gone or stopped is simply missing from the answer: compareProductIdentity
 * turns that into a container-absent event.
 */
async function observeProductsAfterWindow({sshRun, opts, products}) {
  const observed = [];
  for (const product of products) {
    try {
      const now = await inspectRunningContainer({sshRun, opts, host: product.host,
        containerId: product.containerId, role: product.role});
      observed.push({...now, reportedVersion: product.reportedVersion});
    } catch {
      // absent: reported by compareProductIdentity as container-absent
    }
  }
  return observed;
}

function identityProblems(product, expectation) {
  const problems = [];
  if (!expectation) return [`${product.role}: no identity expectation`];
  if (product.imageRef !== expectation.imageRef) {
    problems.push(`${product.role}: runs ${product.imageRef}, expected ${expectation.imageRef}`);
  }
  if (!IMAGE_ID_PATTERN.test(String(product.imageId || ''))) {
    problems.push(`${product.role}: no image id`);
  }
  if (!expectation.versionPattern.test(String(product.reportedVersion || ''))) {
    problems.push(`${product.role}: reported version ${JSON.stringify(product.reportedVersion)}` +
      ` does not match ${expectation.versionPattern}`);
  }
  return problems;
}

/**
 * Fail closed unless every product runs the expected image, reports the
 * expected product version, and every container of one image reference runs
 * the SAME image id.
 */
function verifyProductIdentity(products, expectations) {
  const problems = [];
  for (const product of products) {
    problems.push(...identityProblems(product, expectations[product.role]));
    const sameRef = arrayFilter(products, (other) => other.imageRef === product.imageRef);
    if (arraySome(sameRef, (other) => other.imageId !== product.imageId)) {
      problems.push(`${product.role}: ${product.imageRef} resolves to different image ids`);
    }
  }
  if (products.length === 0) problems.push('no product container inspected');
  if (problems.length > 0) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
      `product identity unverified: ${problems[0]}`, {problems});
  }
  return products;
}

/** Where a product keeps its data: a persistent host mount or the writable layer. */
function classifyStorage(product, dataDir) {
  const mount = arrayFind(product.mounts, (one) => one.destination === dataDir &&
    arrayIncludes(PERSISTENT_MOUNT_TYPES, one.type));
  return {role: product.role, host: product.host, containerId: product.containerId,
    mount: dataDir, kind: mount ? STORAGE_KIND.HOST_VOLUME : STORAGE_KIND.CONTAINER_LAYER,
    source: mount?.source ?? null};
}

/** Publishable needs explicit host volumes for every data directory. */
function runClassOf(storage) {
  return storage.length > 0 && arrayEvery(storage,
    (entry) => entry.kind === STORAGE_KIND.HOST_VOLUME) ?
    RUN_CLASS.PUBLISHABLE : RUN_CLASS.SMOKE;
}

/**
 * Compare product identity at readiness with identity after the measured
 * window: an absent container, a restart (StartedAt moved) or a different
 * image is an event that makes the run not valid-observed.
 */
function compareProductIdentity(before, after, observedAt) {
  const events = [];
  for (const product of before) {
    const now = arrayFind(after, (one) => one.containerId === product.containerId);
    if (!now) {
      events.push({kind: EVENT_KIND.CONTAINER_ABSENT, role: product.role, host: product.host,
        containerId: product.containerId, observedAt});
      continue;
    }
    if (now.startedAt !== product.startedAt) {
      events.push({kind: EVENT_KIND.CONTAINER_RESTARTED, role: product.role,
        containerId: product.containerId, before: product.startedAt, after: now.startedAt,
        observedAt});
    }
    if (now.imageId !== product.imageId) {
      events.push({kind: EVENT_KIND.IMAGE_CHANGED, role: product.role,
        containerId: product.containerId, before: product.imageId, after: now.imageId,
        observedAt});
    }
  }
  return events;
}

export {
  EVENT_KIND as IDENTITY_EVENT_KIND,
  classifyStorage,
  compareProductIdentity,
  inspectProducts,
  inspectRunningContainer,
  observeProductsAfterWindow,
  runClassOf,
  verifyProductIdentity,
};
