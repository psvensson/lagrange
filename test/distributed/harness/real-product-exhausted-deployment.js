/**
 * A deployment whose product never reached its readiness contract, described
 * from its RUNNING containers so the campaign records the complete
 * product failure it is (stream A: a readiness-exhausted, setup-failed run
 * with every planned request unissued) instead of a run without a product.
 *
 * The deployer hands over the roles it started and, when the product had
 * already named it, its client endpoint; the containers are inspected like a
 * ready deployment's (image id, repo digest, storage) and the product's own
 * version report is read where the product answers it. A version the product
 * did not answer is null with its reason (reportedVersionError), never a
 * substitute. A description that cannot be made (a container gone) leaves
 * the exhaustion undescribed: `deploymentUnobservable` names why.
 */
import {arrayMap} from './real-product-captured-intrinsics.js';
import {
  DEPLOYMENT_FAILURE,
  READINESS_STATE,
} from './real-product-deployment-contract.js';
import {
  classifyStorage,
  inspectProducts,
  runClassOf,
} from './real-product-identity.js';
import {errorText} from './real-product-remote-shell.js';

async function readVersionsOrRecord(products, readVersions) {
  try {
    await readVersions(products);
  } catch (error) {
    for (const product of products) {
      product.reportedVersion = null;
      product.reportedVersionError = errorText(error);
    }
  }
  return products;
}

/**
 * @param {{targetId: string, topology: Object, sshRun: Function, opts: Object,
 *   roles: Array<Object>, endpoint: Object|null, dataDir: string,
 *   readVersions: Function, failure: Error}} input roles: the product
 *   containers started so far; readVersions(products) sets reportedVersion
 * @return {Promise<Object>} the deployment fields of the record
 */
async function describeExhaustedDeployment({targetId, topology, sshRun, opts, roles, endpoint,
  dataDir, readVersions, failure}) {
  const products = await readVersionsOrRecord(await inspectProducts({sshRun, opts, roles}),
    readVersions);
  const storage = arrayMap(products, (product) => classifyStorage(product, dataDir));
  return {targetId, topology, roles: [...roles], storage, runClass: runClassOf(storage),
    readiness: {state: READINESS_STATE.EXHAUSTED, observedAt: new Date().toISOString(),
      evidence: {failure: failure.message, diagnostic: failure.diagnostic}},
    identity: {products}, placement: null, endpoint};
}

/**
 * Run a deployment; a readiness exhaustion leaves with the deployment
 * described (error.deployment) or the reason it could not be
 * (error.deploymentUnobservable). Every other failure passes unchanged.
 * @param {Function} deploy () => Promise<deployment>
 * @param {Function} describe (failure) => Promise<deployment description>
 * @return {Promise<Object>}
 */
async function describingReadinessExhaustion(deploy, describe) {
  try {
    return await deploy();
  } catch (error) {
    if (error?.code !== DEPLOYMENT_FAILURE.READINESS_EXHAUSTED) throw error;
    try {
      error.deployment = await describe(error);
    } catch (unobservable) {
      error.deploymentUnobservable = errorText(unobservable);
    }
    throw error;
  }
}

export {describeExhaustedDeployment, describingReadinessExhaustion};
