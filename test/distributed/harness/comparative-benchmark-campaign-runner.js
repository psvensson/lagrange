/**
 * The comparative-benchmark campaign owner: runs a frozen manifest run by run
 * and appends one v2 raw-observation record per ATTEMPTED run after a
 * campaign header (append-only; earlier campaigns are never rewritten).
 *
 * Per run: deploy a fresh arm (typed failure -> recorded, never measured),
 * refuse an endpoint whose container is not a recorded role, hand the
 * deployment to the canonical workload call site, then re-inspect the
 * product containers - an absent, restarted or re-imaged container is an
 * event and fails the run - and tear down failure-safe, recording what could
 * not be closed. A campaign watchdog stops issuing at the deadline and
 * records the remaining runs as interrupted. Observations and correctness are
 * the workload owner's (stream B1); admission is stream A's.
 */
import {createHash} from 'node:crypto';

import {resolveRunExitCode} from './scenario-outcome.js';
import {canonicalJson} from './comparative-benchmark-campaign-manifest.js';
import {
  arrayFilter,
  arrayIncludes,
  arrayMap,
  arraySome,
  stringStartsWith,
} from './real-product-captured-intrinsics.js';
import {
  DEPLOYMENT_FAILURE,
  deploymentFailure,
} from './real-product-deployment-contract.js';
import {compareProductIdentity} from './real-product-identity.js';
import {errorText} from './real-product-remote-shell.js';

const RECORD_SCHEMA = 'lagrange-raw-observation-v2';
const RECORD_TYPE = Object.freeze({HEADER: 'campaign-header', RUN: 'run'});
const RUN_STATE = Object.freeze({COMPLETED: 'completed', FAILED: 'failed',
  INTERRUPTED: 'interrupted', BLOCKED: 'blocked'});
const EVENT = Object.freeze({WATCHDOG_STOP: 'watchdog-stop', ROLE_CHANGED: 'role-changed',
  ROLE_OBSERVATION_FAILED: 'role-observation-failed'});
const REFUSAL_PREFIX = 'refused_';
const UNCLASSIFIED = 'unclassified_failure';

function sha256Of(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function failureOf(error) {
  return {code: error?.code || UNCLASSIFIED, message: errorText(error),
    diagnostic: error?.diagnostic ?? null};
}

function stateOfFailure(failure) {
  if (stringStartsWith(String(failure.code), REFUSAL_PREFIX)) return RUN_STATE.BLOCKED;
  return failure.code === DEPLOYMENT_FAILURE.WATCHDOG_STOPPED ? RUN_STATE.INTERRUPTED :
    RUN_STATE.FAILED;
}

function assertEndpointBound(deployment) {
  const containerId = deployment?.endpoint?.containerId;
  const bound = arraySome(deployment?.roles || [], (role) => role.containerId === containerId &&
    role.host === deployment.endpoint.host);
  if (!containerId || !bound) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.ENDPOINT_UNBOUND,
      'the client endpoint is not owned by a recorded role container',
      {endpoint: deployment?.endpoint ?? null});
  }
}

function recordedDeployment(deployment, workload, header) {
  if (!deployment) return null;
  const hostNames = new Set(arrayMap(deployment.roles || [], (role) => role.host));
  return {targetId: deployment.targetId, topology: deployment.topology ?? null,
    hosts: arrayFilter(header.physicalHosts || [], (host) => hostNames.has(host.ip)),
    roles: deployment.roles, storage: deployment.storage, runClass: deployment.runClass,
    readiness: deployment.readiness, dataset: workload?.dataset ?? null,
    placement: workload?.placement ?? deployment.placement ?? null,
    endpoint: deployment.endpoint, accessEvidence: deployment.accessEvidence ?? null};
}

async function observeRolesSafely(deployment, events, now) {
  try {
    return await deployment.operations?.observeRoles?.() ?? null;
  } catch (error) {
    events.push({kind: EVENT.ROLE_OBSERVATION_FAILED, error: errorText(error),
      observedAt: iso(now())});
    return null;
  }
}

async function measureRun({run, manifest, deps, events, signal}) {
  const deployment = await deps.deployRun(run);
  const attempt = {deployment, workload: null, productsAfter: null};
  assertEndpointBound(deployment);
  const rolesBefore = await observeRolesSafely(deployment, events, deps.now);
  attempt.workload = await deps.executeWorkloadRun({run, manifest, deployment, signal});
  attempt.productsAfter = await deps.inspectProducts(deployment);
  const identityEvents = compareProductIdentity(deployment.identity.products,
    attempt.productsAfter, iso(deps.now()));
  events.push(...identityEvents);
  const rolesAfter = await observeRolesSafely(deployment, events, deps.now);
  if (rolesBefore && rolesAfter && canonicalJson(rolesBefore) !== canonicalJson(rolesAfter)) {
    events.push({kind: EVENT.ROLE_CHANGED, before: rolesBefore, after: rolesAfter,
      observedAt: iso(deps.now())});
  }
  if (identityEvents.length > 0) {
    throw Object.assign(deploymentFailure(DEPLOYMENT_FAILURE.PRODUCT_CHANGED,
      'product containers changed across the measured window', {events: identityEvents}),
    {attempt});
  }
  if (signal.aborted) {
    throw Object.assign(deploymentFailure(DEPLOYMENT_FAILURE.WATCHDOG_STOPPED,
      'campaign watchdog stopped issuing during the run'), {attempt});
  }
  return attempt;
}

async function teardownSafely(deps, run, deployment) {
  try {
    return await deps.teardownRun(run, deployment);
  } catch (error) {
    return {complete: false, removed: [], unclosed: [], error: errorText(error)};
  }
}

function runRecord({run, manifest, header, state, failure, attempt, events, closure,
  startedAt, endedAt}) {
  const plan = {...manifest.plan, manifestDigest: manifest.manifestDigest,
    offeredRatePerSec: run.offeredRatePerSec, repetition: run.repetition,
    orderIndex: run.orderIndex};
  const identity = {harness: header.harness,
    products: attempt?.deployment?.identity?.products ?? null,
    productsAfterWindow: attempt?.productsAfter ?? null, publication: null};
  const deployment = recordedDeployment(attempt?.deployment, attempt?.workload, header);
  const observations = attempt?.workload?.observations ?? null;
  const correctness = attempt?.workload?.correctness ?? null;
  return {recordType: RECORD_TYPE.RUN, schemaVersion: RECORD_SCHEMA,
    campaignId: manifest.campaignId, runId: run.runId, claimKey: run.claimKey,
    targetId: run.targetId, scenario: run.scenario, subkind: run.subkind,
    executionTarget: header.executionTarget,
    execution: {state, failure, startedAt, endedAt},
    identity, plan, deployment,
    loadGenerator: attempt?.workload?.loadGenerator ?? null,
    observations, correctness, events, closure,
    rawObservationsDigest: sha256Of({observations, correctness, deployment, identity, plan})};
}

function watchdogFor(deps) {
  const controller = new AbortController();
  if (!Number.isFinite(deps.deadlineAt)) return {controller, clear: () => {}};
  const timer = setTimeout(() => controller.abort(),
    Math.max(0, deps.deadlineAt - deps.now()));
  timer.unref?.();
  return {controller, clear: () => clearTimeout(timer)};
}

async function attemptRun({run, manifest, header, deps, watchdog}) {
  const events = [];
  const startedAt = iso(deps.now());
  if (watchdog.controller.signal.aborted ||
      (Number.isFinite(deps.deadlineAt) && deps.now() >= deps.deadlineAt)) {
    watchdog.controller.abort();
    events.push({kind: EVENT.WATCHDOG_STOP, observedAt: startedAt});
    return runRecord({run, manifest, header, state: RUN_STATE.INTERRUPTED,
      failure: {code: DEPLOYMENT_FAILURE.WATCHDOG_STOPPED,
        message: 'campaign deadline passed before the run was issued', diagnostic: null},
      attempt: null, events, closure: null, startedAt, endedAt: startedAt});
  }
  let attempt = null;
  let failure = null;
  try {
    attempt = await measureRun({run, manifest, deps, events,
      signal: watchdog.controller.signal});
  } catch (error) {
    attempt = error?.attempt ?? null;
    failure = failureOf(error);
  }
  const closure = await teardownSafely(deps, run, attempt?.deployment ?? null);
  return runRecord({run, manifest, header, events, closure, attempt, failure,
    state: failure ? stateOfFailure(failure) : RUN_STATE.COMPLETED,
    startedAt, endedAt: iso(deps.now())});
}

/**
 * @param {{manifest: Object, header: Object, deps: Object}} input deps:
 *   deployRun, executeWorkloadRun, inspectProducts, teardownRun,
 *   appendRecords, now, deadlineAt
 * @return {Promise<Object>} the campaign summary (every attempted run)
 */
async function runComparativeCampaign({manifest, header, deps}) {
  await deps.appendRecords([{recordType: RECORD_TYPE.HEADER, schemaVersion: RECORD_SCHEMA,
    campaignId: manifest.campaignId, startedAt: iso(deps.now()),
    manifestDigest: manifest.manifestDigest, manifest, harness: header.harness,
    executionTarget: header.executionTarget, physicalHosts: header.physicalHosts}]);
  const watchdog = watchdogFor(deps);
  const attempted = [];
  try {
    for (const run of manifest.runs) {
      const record = await attemptRun({run, manifest, header, deps, watchdog});
      // Appended as soon as the run ends: an interrupted campaign keeps its runs.
      await deps.appendRecords([record]);
      attempted.push({runId: run.runId, claimKey: run.claimKey, targetId: run.targetId,
        state: record.execution.state, failureCode: record.execution.failure?.code ?? null,
        closureComplete: record.closure?.complete ?? null});
    }
  } finally {
    watchdog.clear();
  }
  const states = arrayMap(attempted, (entry) => entry.state);
  return {campaignId: manifest.campaignId, manifestDigest: manifest.manifestDigest,
    attempted,
    exitCode: resolveRunExitCode({
      hasFailures: arraySome(states, (state) => state === RUN_STATE.FAILED ||
        state === RUN_STATE.INTERRUPTED),
      hasRefusals: arrayIncludes(states, RUN_STATE.BLOCKED)})};
}

export {
  RECORD_SCHEMA as RAW_OBSERVATION_RECORD_SCHEMA,
  RUN_STATE as CAMPAIGN_RUN_STATE,
  runComparativeCampaign,
};
