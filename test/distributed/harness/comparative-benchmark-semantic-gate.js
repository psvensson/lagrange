/**
 * The Scenario A semantic-gate stage of a campaign run, before the measured
 * window: B1's PG-wire proof journey
 * (test/distributed/scenarios/scenario-a-semantic-proof-journey.js) runs
 * against the deployed arm, bound to the container that owns its endpoint,
 * with the two hooks only this layer can supply:
 * - beforeCase: Lagrange cannot drop tables in place, so every proof case
 *   after the first runs on a fresh formation of the arm (teardown of the
 *   campaign's containers, redeploy, readiness, identity, endpoint binding);
 *   PostgreSQL resets through the adapter's own drop-and-reload;
 * - restartProduct: `docker restart` of exactly the endpoint container, its
 *   readiness contract again, identity re-inspected (new StartedAt).
 * Every re-formation and restart is a harness event. A Lagrange arm is
 * re-formed once more after the gate so the measured window starts on a
 * fresh formation. TiDB keeps its own live proof harness: no gate here, said
 * so as an event.
 */
import {
  arrayFind,
  arrayMap,
} from './real-product-captured-intrinsics.js';
import {RUN_CLASS} from './real-product-deployment-contract.js';
import {inspectProducts, runClassOf} from './real-product-identity.js';
import {shellWord} from './real-product-remote-shell.js';

const SYSTEM = Object.freeze({LAGRANGE: 'lagrange', POSTGRESQL: 'postgresql'});
const EVENT = Object.freeze({
  NOT_RUN: 'semantic-gate-not-run',
  RE_FORMATION: 're-formation',
  DATASET_RESET: 'dataset-reset',
  PRODUCT_RESTART: 'product-restart',
});
const RESTART_GRACE_SECONDS = 1;
const BEFORE_MEASUREMENT = 'before-measurement';

function connectionOf(deployment) {
  return {endpoint: {host: deployment.endpoint.host, port: deployment.endpoint.port},
    credentials: deployment.access?.connection ?? null};
}

function bindingOf(manifest, deployment) {
  const endpoint = deployment.endpoint;
  const product = arrayFind(deployment.identity?.products || [],
    (one) => one.containerId === endpoint.containerId);
  return {campaignId: manifest.campaignId, containerId: endpoint.containerId,
    imageId: product?.imageId ?? null, endpoint: `${endpoint.host}:${endpoint.port}`};
}

/**
 * @param {{journey: Function, redeploy: Function, sshRun: Function,
 *   opts: Object, evidenceDirOf: Function, now?: Function}} input
 *   redeploy(run) tears the arm down and deploys it fresh, returning the new
 *   deployment; evidenceDirOf(run) names a directory unique to the campaign
 *   and run
 * @return {Function} ({run, manifest, deployment}) => {gate, deployment, events}
 */
// Durability is provable only where every data directory survives its
// container: the storage the identity owner classes as publishable.
function hasPersistentStorage(deployment) {
  return runClassOf(Array.isArray(deployment.storage) ? deployment.storage : []) ===
    RUN_CLASS.PUBLISHABLE;
}

function createSemanticGateStage({journey, redeploy, sshRun, opts, evidenceDirOf,
  now = Date.now}) {
  return async ({run, manifest, deployment}) => {
    const evidenceDir = evidenceDirOf(run);
    const at = () => new Date(now()).toISOString();
    if (run.system !== SYSTEM.LAGRANGE && run.system !== SYSTEM.POSTGRESQL) {
      return {gate: null, deployment, events: [{kind: EVENT.NOT_RUN, at: at(),
        missingClient: run.system,
        reason: `the chain has no semantic-gate client for ${run.system}`}]};
    }
    const events = [];
    let current = deployment;
    let casesStarted = 0;
    const reform = async (caseId) => {
      current = await redeploy(run);
      events.push({kind: EVENT.RE_FORMATION, at: at(), caseId,
        endpoint: current.endpoint, containerIds: arrayMap(current.roles, (r) => r.containerId)});
    };
    const beforeCase = async ({caseId}) => {
      casesStarted += 1;
      if (casesStarted === 1) return null;
      if (run.system === SYSTEM.LAGRANGE) {
        await reform(caseId);
      } else {
        events.push({kind: EVENT.DATASET_RESET, at: at(), caseId,
          method: 'adapter drop-and-reload'});
      }
      return {connection: connectionOf(current), binding: bindingOf(manifest, current)};
    };
    const restartProduct = async () => {
      const {host, containerId} = current.endpoint;
      const before = arrayFind(current.identity.products,
        (one) => one.containerId === containerId)?.startedAt ?? null;
      const restartedAt = at();
      await sshRun(host, opts,
        `docker restart -t ${RESTART_GRACE_SECONDS} ${shellWord(containerId)}`);
      const readiness = await current.operations.awaitReady();
      const reported = new Map(arrayMap(current.identity.products, (one) =>
        [one.containerId, one]));
      current.identity.products = arrayMap(await inspectProducts({sshRun, opts,
        roles: current.identity.products}), (one) => ({...one,
        reportedVersion: reported.get(one.containerId)?.reportedVersion ?? null,
        bootProvenance: reported.get(one.containerId)?.bootProvenance ?? null}));
      const after = arrayFind(current.identity.products,
        (one) => one.containerId === containerId)?.startedAt ?? null;
      events.push({kind: EVENT.PRODUCT_RESTART, at: restartedAt, containerId, host,
        startedAtBefore: before, startedAtAfter: after});
      return {containerId, restartedAt, readyAt: at(), startedAtBefore: before,
        startedAtAfter: after, readiness};
    };
    const gate = await journey({system: run.system, connection: connectionOf(current),
      binding: bindingOf(manifest, current), evidenceDir, beforeCase, restartProduct,
      persistentStorage: hasPersistentStorage(current)});
    if (run.system === SYSTEM.LAGRANGE) await reform(BEFORE_MEASUREMENT);
    return {gate, deployment: current, events};
  };
}

export {createSemanticGateStage};
