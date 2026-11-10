import {createHash} from 'node:crypto';

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
  stringIncludes,
  stringIndexOf,
  stringLastIndexOf,
  stringReplace,
  stringSplit,
  stringStartsWith,
  stringTrim,
} from './real-product-captured-intrinsics.js';
import {
  DEPLOYMENT_FAILURE,
  RUN_CLASS,
  STORAGE_KIND,
  deploymentFailure,
  isImageId,
} from './real-product-deployment-contract.js';
import {
  errorText,
  inspectContainerCommand,
  shellWord,
} from './real-product-remote-shell.js';

// Persistent storage is an explicit host directory the deployer mounted (a
// bind mount under --storage-root). An anonymous volume an image declares
// (postgres: VOLUME /var/lib/postgresql/data) lives and dies with its
// container: it is not the explicit storage a publishable run needs (D21, D34).
const PERSISTENT_MOUNT_TYPES = Object.freeze(['bind']);
const IMAGE_STORE = Object.freeze({CONTAINERD: 'containerd', OVERLAY2: 'overlay2',
  UNKNOWN: 'unknown'});
const REPO_DIGEST_NONE = 'none: the image carries no repo digest (loaded, not pulled)';
// Deployment event kinds spelled as stream A's record owner spells them
// (raw-observation-record.js DEPLOYMENT_EVENT_KIND); an absent container is
// carried by productsAfterWindow, which admission compares with products.
const EVENT_KIND = Object.freeze({
  RESTART: 'restart',
  IMAGE_CHANGE: 'image-change',
  CONTAINER_ABSENT: 'container-absent',
});

function imageRepository(imageRef) {
  const text = String(imageRef || '');
  const digestAt = stringIndexOf(text, '@');
  const name = digestAt === -1 ? text : text.slice(0, digestAt);
  const tagAt = stringLastIndexOf(name, ':');
  return tagAt > stringLastIndexOf(name, '/') ? name.slice(0, tagAt) : name;
}

// A field `docker inspect` always returns, read by its path: a missing field
// is an unreadable inspection (identity_unverified naming the field), never a
// default. Its value may be null where Docker answers null (Entrypoint, Labels).
function inspectedField(inspection, path, subject) {
  let value = inspection;
  for (const key of path) {
    if (value === null || typeof value !== 'object' || !(key in value)) {
      throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
        `${subject}: docker inspect answered without ${path.join('.')}`, {path});
    }
    value = value[key];
  }
  return value;
}

// Docker's own answer that the object does not exist.
const NO_SUCH_OBJECT = /\bNo such (?:container|object)\b/u;

async function inspectJson({sshRun, opts, host, command, subject}) {
  try {
    return JSON.parse(String(await sshRun(host, opts, command)));
  } catch (error) {
    const text = errorText(error);
    if (NO_SUCH_OBJECT.test(text)) {
      throw deploymentFailure(DEPLOYMENT_FAILURE.CONTAINER_ABSENT,
        `${subject}: docker answered ${text}`, {host});
    }
    throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
      `${subject} could not be inspected: ${text}`, {host});
  }
}

/**
 * An image's content identity: sha256 over the canonical JSON of its ordered
 * RootFS diff_ids. Identical across Docker's containerd store (.Id is the
 * manifest digest) and the overlay2 store (.Id is the config digest), so it
 * is the identity compared across hosts; .Id never is.
 * @param {Array<string>} layers
 * @return {string|null}
 */
function contentIdentityOf(layers) {
  if (!Array.isArray(layers) || layers.length === 0) return null;
  return `sha256:${createHash('sha256').update(JSON.stringify(layers)).digest('hex')}`;
}

// Which image store a host's daemon uses, from its own report.
function imageStoreOf(info) {
  const [driver, status] = stringSplit(String(info ?? ''), '|');
  if (stringIncludes(String(status), 'containerd.snapshotter')) return IMAGE_STORE.CONTAINERD;
  return stringTrim(String(driver)) === IMAGE_STORE.OVERLAY2 ? IMAGE_STORE.OVERLAY2 :
    IMAGE_STORE.UNKNOWN;
}

async function readImageStore({sshRun, opts, host}) {
  return imageStoreOf(await sshRun(host, opts,
    'docker info --format \'{{.Driver}}|{{json .DriverStatus}}\''));
}

// Labels are optional image metadata: an image that declares none (a
// containerd store then omits Config.Labels) is recorded as null, never
// given substitute labels.
function declaredLabels(config, subject) {
  if (config === null || typeof config !== 'object') {
    throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
      `${subject}: docker inspect answered without Config`, {path: ['Config']});
  }
  return 'Labels' in config ? config.Labels : null;
}

// Image facts of the running container's image id: its repo digests (empty
// for an image that was `docker load`ed, which is recorded as such, never
// filled in), its build labels and creation time.
async function readImageFacts({sshRun, opts, host, imageId, imageRef}) {
  const subject = `image ${imageId} of a running container on ${host}`;
  const image = await inspectJson({sshRun, opts, host, subject,
    command: `docker image inspect --format '{{json .}}' ${shellWord(imageId)}`});
  const field = (path) => inspectedField(image, path, subject);
  const repoDigests = field(['RepoDigests']);
  const repository = imageRepository(imageRef);
  // Only a digest of the pinned reference's repository identifies the pulled
  // content; a digest of another repository the same image also carries is
  // recorded in repoDigests and never stands in for it.
  const pinned = arrayFilter(repoDigests, (digest) => stringStartsWith(digest,
    `${repository}@`));
  const repoDigest = pinned.length > 0 ? pinned[0] : null;
  // Provenance is a typed identity fact: pulled from the registry (a repo
  // digest of the pinned repository), or loaded content known only by its
  // image id.
  return {repoDigests, repoDigest,
    repoDigestStatus: repoDigest ? 'recorded' : REPO_DIGEST_NONE,
    contentIdentity: contentIdentityOf(field(['RootFS', 'Layers'])),
    provenance: repoDigest ? `registry:${repoDigest}` : `loaded:${imageId}`,
    imageLabels: declaredLabels(field(['Config']), subject), imageCreated: field(['Created'])};
}

function mountsOf(mounts, subject) {
  return arrayMap(mounts, (mount) => ({
    type: inspectedField(mount, ['Type'], subject),
    source: inspectedField(mount, ['Source'], subject),
    destination: inspectedField(mount, ['Destination'], subject)}));
}

/**
 * Inspect one running product container. Absent or stopped is
 * identity_unverified: dead-process evidence is never identity (D15).
 */
async function inspectRunningContainer({sshRun, opts, host, containerId, role}) {
  const subject = `${role} container ${containerId} on ${host}`;
  const inspect = await inspectJson({sshRun, opts, host, subject,
    command: inspectContainerCommand(containerId)});
  const field = (path) => inspectedField(inspect, path, subject);
  if (field(['State', 'Running']) !== true) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
      `${subject} is not running`, {role, host, containerId, state: field(['State'])});
  }
  const imageRef = field(['Config', 'Image']);
  const imageId = field(['Image']);
  return {
    role, host, containerId: field(['Id']),
    name: stringReplace(String(field(['Name'])), /^\//u, ''),
    imageRef, imageId,
    ...await readImageFacts({sshRun, opts, host, imageId, imageRef}),
    entrypoint: field(['Config', 'Entrypoint']),
    cmd: field(['Config', 'Cmd']),
    startedAt: field(['State', 'StartedAt']),
    mounts: mountsOf(field(['Mounts']), subject),
    reportedVersion: null,
  };
}

// At identity time a container docker says does not exist is an unverified
// identity of the deployment (dead-process evidence is never identity, D15).
async function inspectedAtIdentityTime({sshRun, opts, role}) {
  try {
    return await inspectRunningContainer({sshRun, opts, host: role.host,
      containerId: role.containerId, role: role.role});
  } catch (error) {
    if (error?.code !== DEPLOYMENT_FAILURE.CONTAINER_ABSENT) throw error;
    throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED, error.message,
      error.diagnostic);
  }
}

/** Inspect every role's container, in role order. */
async function inspectProducts({sshRun, opts, roles}) {
  const products = [];
  const stores = new Map();
  for (const role of roles) {
    if (!stores.has(role.host)) {
      stores.set(role.host, await readImageStore({sshRun, opts, host: role.host}));
    }
    products.push({...await inspectedAtIdentityTime({sshRun, opts, role}),
      imageStore: stores.get(role.host)});
  }
  return products;
}

/**
 * Inspect the products again after the measured window. A container docker
 * answers does not exist ("No such container") is missing from the answer:
 * compareProductIdentity turns that into a container-absent event. Any other
 * failure (ssh, an unreadable inspection, a stopped container) is the
 * harness's identity_unverified and propagates: it is never read as absence.
 */
async function observeProductsAfterWindow({sshRun, opts, products}) {
  const observed = [];
  for (const product of products) {
    try {
      const now = await inspectRunningContainer({sshRun, opts, host: product.host,
        containerId: product.containerId, role: product.role});
      // The window does not change what the product answered: its version and,
      // where it answered none, the reason travel together (D33).
      observed.push({...now, reportedVersion: product.reportedVersion,
        ...(product.reportedVersion === null ?
          {reportedVersionError: product.reportedVersionError ?? null} : {}),
        ...(product.bootProvenance !== undefined ?
          {bootProvenance: product.bootProvenance} : {})});
    } catch (error) {
      if (error?.code !== DEPLOYMENT_FAILURE.CONTAINER_ABSENT) throw error;
    }
  }
  return observed;
}

/**
 * The product version an image reference pins, as a pattern on the version the
 * product reports. A reference that pins no version (a bare or `latest` tag)
 * has no expectation: identity is unverified, never accepted on any version.
 * @param {string} imageRef
 * @param {RegExp} tagPattern captures the pinned version
 * @param {Function} toPattern (version) => RegExp
 * @return {RegExp}
 */
function pinnedVersionPattern(imageRef, tagPattern, toPattern) {
  const match = tagPattern.exec(String(imageRef));
  if (!match) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
      `image reference ${imageRef} pins no product version to verify against`, {imageRef});
  }
  return toPattern(match[1]);
}

function expectedFingerprintOf(expectation) {
  return expectation.expectedSrcFingerprint || expectation.bootedSrcFingerprint || null;
}

function actualGitCommitOf(product) {
  return product.bootProvenance?.gitCommit ??
    product.imageLabels?.['org.opencontainers.image.revision'] ?? null;
}

function hasBootVersionMismatch(product) {
  const bootVersion = product.bootProvenance?.version;
  return typeof bootVersion === 'string' && typeof product.reportedVersion === 'string' &&
    bootVersion !== product.reportedVersion;
}

function bootProvenanceProblems(product, expectation) {
  const problems = [];
  const expectedFingerprint = expectedFingerprintOf(expectation);
  const actualFingerprint = product.bootProvenance?.bootedSrcFingerprint ?? null;
  if (expectedFingerprint && actualFingerprint !== expectedFingerprint) {
    problems.push(`${product.role}: bootedSrcFingerprint ${JSON.stringify(actualFingerprint)} ` +
      `does not match expected ${expectedFingerprint}`);
  }
  const actualCommit = actualGitCommitOf(product);
  if (expectation.expectedGitCommit && actualCommit !== expectation.expectedGitCommit) {
    problems.push(`${product.role}: gitCommit/revision ${JSON.stringify(actualCommit)} ` +
      `does not match expected ${expectation.expectedGitCommit}`);
  }
  if (hasBootVersionMismatch(product)) {
    problems.push(`${product.role}: bootProvenance version ${product.bootProvenance.version} ` +
      `differs from reportedVersion ${product.reportedVersion}`);
  }
  return problems;
}

function identityProblems(product, expectation) {
  const problems = [];
  if (!expectation) return [`${product.role}: no identity expectation`];
  // A content pin (image id) is the identity; the reference it ran by may be
  // the registry digest or the id itself.
  if (expectation.contentIdentity) {
    if (product.contentIdentity !== expectation.contentIdentity) {
      problems.push(`${product.role}: runs image content ${product.contentIdentity}, the ` +
        `campaign pins ${expectation.contentIdentity}`);
    }
  } else if (product.imageRef !== expectation.imageRef) {
    problems.push(`${product.role}: runs ${product.imageRef}, expected ${expectation.imageRef}`);
  }
  if (!isImageId(product.imageId)) {
    problems.push(`${product.role}: no image id`);
  }
  if (!expectation.versionPattern.test(String(product.reportedVersion || ''))) {
    problems.push(`${product.role}: reported version ${JSON.stringify(product.reportedVersion)}` +
      ` does not match ${expectation.versionPattern}`);
  }
  problems.push(...bootProvenanceProblems(product, expectation));
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
    // One role runs one content on every host (never compared by .Id).
    const sameRole = arrayFilter(products, (other) => other.role === product.role);
    if (!product.contentIdentity ||
        arraySome(sameRole, (other) => other.contentIdentity !== product.contentIdentity)) {
      problems.push(`${product.role}: hosts run different image content`);
    }
    const firstFingerprint = product.bootProvenance?.bootedSrcFingerprint ?? null;
    if (arraySome(sameRole,
      (other) => (other.bootProvenance?.bootedSrcFingerprint ?? null) !== firstFingerprint)) {
      problems.push(`${product.role}: hosts run different bootedSrcFingerprint`);
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
      events.push({kind: EVENT_KIND.CONTAINER_ABSENT, at: observedAt, role: product.role,
        host: product.host, containerId: product.containerId});
      continue;
    }
    if (now.startedAt !== product.startedAt) {
      events.push({kind: EVENT_KIND.RESTART, at: observedAt, role: product.role,
        containerId: product.containerId, before: product.startedAt, after: now.startedAt});
    }
    if (now.imageId !== product.imageId) {
      events.push({kind: EVENT_KIND.IMAGE_CHANGE, at: observedAt, role: product.role,
        containerId: product.containerId, before: product.imageId, after: now.imageId});
    }
  }
  return events;
}

export {
  EVENT_KIND as IDENTITY_EVENT_KIND,
  classifyStorage,
  compareProductIdentity,
  contentIdentityOf,
  imageStoreOf,
  inspectProducts,
  observeProductsAfterWindow,
  pinnedVersionPattern,
  runClassOf,
  verifyProductIdentity,
};
