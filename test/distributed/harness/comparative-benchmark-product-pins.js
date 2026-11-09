/**
 * The product identity a comparative-benchmark campaign pins in its header
 * (stream A's campaign header `products`): one pin per target and role,
 * read from the identity inspection of the target's RUNNING containers (the
 * deployer's deployment.identity.products, real-product-identity.js).
 *
 * A role is pinned by its image CONTENT identity (the digest of the ordered
 * RootFS diff_ids) and its reported version, the same on every container of
 * the role. The image id, repo digest, image store and provenance of each
 * host's copy differ legitimately across Docker image stores (a containerd
 * store's id is the manifest digest, an overlay2 store's the config digest; a
 * docker-loaded copy has no repo digest): they are recorded in `images`,
 * never compared (coordinator decision 1, 2026-11-02). A role whose product
 * answered its version on no container (a readiness-exhausted arm) pins the
 * version null with the reason (decision 2). Admission compares every run's
 * inspected products with these pins and refuses content pinned for two
 * product families.
 */
import {
  arrayEvery,
  arrayFilter,
  arrayMap,
  arraySome,
} from './real-product-captured-intrinsics.js';
import {
  DEPLOYMENT_FAILURE,
  deploymentFailure,
} from './real-product-deployment-contract.js';
import {isContentIdentity} from './raw-observation-record.js';


function isText(value) {
  return typeof value === 'string' && value !== '';
}

// The role's version: every container answered the same text, or none did
// and each says why.
function versionProblems(role, containers) {
  const first = containers[0];
  if (arrayEvery(containers, (one) => one.reportedVersion === null &&
      isText(one.reportedVersionError))) return [];
  const problems = [];
  if (!isText(first.reportedVersion)) problems.push(`${role}: no reportedVersion`);
  if (arraySome(containers, (other) => other.reportedVersion !== first.reportedVersion)) {
    problems.push(`${role}: containers differ in reportedVersion`);
  }
  return problems;
}

function bootProvenanceProblems(role, containers) {
  if (arrayEvery(containers, (one) => one.bootProvenance === undefined)) return [];
  if (arrayEvery(containers, (one) => one.reportedVersion === null &&
      Boolean(one.bootProvenance?.unavailable))) return [];
  const firstFingerprint = containers[0].bootProvenance?.bootedSrcFingerprint ?? null;
  const problems = [];
  if (!isText(firstFingerprint)) {
    problems.push(`${role}: no bootedSrcFingerprint in bootProvenance`);
  }
  if (arraySome(containers,
    (other) => (other.bootProvenance?.bootedSrcFingerprint ?? null) !== firstFingerprint)) {
    problems.push(`${role}: containers differ in bootedSrcFingerprint`);
  }
  return problems;
}

function pinOfRole(targetId, product, role, containers) {
  const first = containers[0];
  const problems = [];
  if (!isContentIdentity(first.contentIdentity)) {
    problems.push(`${role}: no contentIdentity`);
  }
  if (arraySome(containers, (other) => other.contentIdentity !== first.contentIdentity)) {
    problems.push(`${role}: containers differ in contentIdentity`);
  }
  problems.push(...versionProblems(role, containers));
  problems.push(...bootProvenanceProblems(role, containers));
  if (problems.length > 0) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
      `product identity of ${targetId} cannot be pinned: ${problems[0]}`, {targetId, problems});
  }
  return Object.freeze({targetId, product, role, contentIdentity: first.contentIdentity,
    reportedVersion: first.reportedVersion,
    ...(first.reportedVersion === null ?
      {reportedVersionError: first.reportedVersionError} : {}),
    ...(first.bootProvenance !== undefined ? {bootProvenance: first.bootProvenance} : {}),
    images: arrayMap(containers, (one) => ({host: one.host, imageId: one.imageId,
      repoDigest: one.repoDigest ?? null, imageStore: one.imageStore ?? null,
      provenance: one.provenance ?? null}))});
}

/**
 * @param {{targetId: string, product: string, products: Array<Object>}} input
 *   product: the product family (the run's system); products: the inspected
 *   running containers of one deployment of the target
 * @return {Array<Object>} one pin per role
 */
function pinProductIdentity({targetId, product, products}) {
  if (!Array.isArray(products) || products.length === 0) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
      `product identity of ${targetId} cannot be pinned: no inspected container`, {targetId});
  }
  const roles = [...new Set(arrayMap(products, (one) => one.role))];
  return arrayMap(roles, (role) => pinOfRole(targetId, product, role,
    arrayFilter(products, (one) => one.role === role)));
}

export {pinProductIdentity};
