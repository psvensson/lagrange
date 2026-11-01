/**
 * The product identity a comparative-benchmark campaign pins in its header
 * (stream A's campaign header `products`): one pin per target and role,
 * {targetId, product, role, imageId, repoDigest, reportedVersion}, read from
 * the identity inspection of the target's RUNNING containers (the deployer's
 * deployment.identity.products, real-product-identity.js). Admission compares
 * every run's inspected products with these pins and refuses an image pinned
 * for two product families.
 */
import {
  arrayFilter,
  arrayMap,
  arraySome,
} from './real-product-captured-intrinsics.js';
import {
  DEPLOYMENT_FAILURE,
  deploymentFailure,
} from './real-product-deployment-contract.js';

const PIN_FIELDS = Object.freeze(['imageId', 'repoDigest', 'reportedVersion']);

function pinOfRole(targetId, product, role, containers) {
  const first = containers[0];
  const problems = [];
  for (const field of PIN_FIELDS) {
    if (typeof first[field] !== 'string' || first[field] === '') {
      problems.push(`${role}: no ${field}`);
    }
    if (arraySome(containers, (other) => other[field] !== first[field])) {
      problems.push(`${role}: containers differ in ${field}`);
    }
  }
  if (problems.length > 0) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.IDENTITY_UNVERIFIED,
      `product identity of ${targetId} cannot be pinned: ${problems[0]}`, {targetId, problems});
  }
  return Object.freeze({targetId, product, role, imageId: first.imageId,
    repoDigest: first.repoDigest, reportedVersion: first.reportedVersion});
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
