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
 * the workload owner's (stream B1); the record shape, its validator and digest
 * and admission are stream A's (deps.recordOwner, see
 * comparative-benchmark-record-owner.js). A completed run whose record A's
 * validator rejects is recorded as failed (`record_rejected`). Runs that did
 * not complete are appended too, with `execution` naming why; A's admission
 * reads them as non-valid.
 */
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
import {composeRunHarnessIdentity} from './comparative-benchmark-harness-identity.js';
import {
  IDENTITY_EVENT_KIND,
  compareProductIdentity,
} from './real-product-identity.js';
import {errorText} from './real-product-remote-shell.js';

const RECORD_SCHEMA = 'lagrange-raw-observation-v2';
const RECORD_TYPE = Object.freeze({HEADER: 'campaign-header', RUN: 'run'});
const RUN_STATE = Object.freeze({COMPLETED: 'completed', FAILED: 'failed',
  INTERRUPTED: 'interrupted', BLOCKED: 'blocked', PRODUCT_FAILURE: 'product-failure'});
// Run states whose record is complete and goes through A's validator.
const RECORDED_STATES = Object.freeze([RUN_STATE.COMPLETED, RUN_STATE.PRODUCT_FAILURE]);
// Harness events outside A's deployment-event vocabulary, kept apart from
// deployment.events so the record stays in A's shape.
const EVENT = Object.freeze({WATCHDOG_STOP: 'watchdog-stop', ROLE_CHANGED: 'role-changed',
  ROLE_OBSERVATION_FAILED: 'role-observation-failed',
  SEMANTIC_GATE_UNAVAILABLE: 'semantic-gate-unavailable'});
const CLOSURE_STATUS = Object.freeze({COMPLETE: 'complete', INCOMPLETE: 'incomplete'});
const RECORD_REJECTED = 'record_rejected';
const DEPLOYMENT_EVENT_KINDS = Object.freeze([IDENTITY_EVENT_KIND.RESTART,
  IDENTITY_EVENT_KIND.IMAGE_CHANGE]);
const REFUSAL_PREFIX = 'refused_';
const UNCLASSIFIED = 'unclassified_failure';

function iso(ms) {
  return new Date(ms).toISOString();
}

function failureOf(error) {
  return {code: error?.code || UNCLASSIFIED, message: errorText(error),
    diagnostic: error?.diagnostic ?? null};
}

// A product that never reached its own readiness contract (a typed
// readiness_exhausted with its denial codes) is a product failure of that arm:
// recorded, never skipped and never measured.
const PRODUCT_FAILURE_CODES = Object.freeze([DEPLOYMENT_FAILURE.READINESS_EXHAUSTED]);

function stateOfFailure(failure) {
  if (stringStartsWith(String(failure.code), REFUSAL_PREFIX)) return RUN_STATE.BLOCKED;
  if (arrayIncludes(PRODUCT_FAILURE_CODES, failure.code)) return RUN_STATE.PRODUCT_FAILURE;
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

function closureOf(closure) {
  if (!closure) return null;
  return {status: closure.complete ? CLOSURE_STATUS.COMPLETE : CLOSURE_STATUS.INCOMPLETE,
    removed: closure.removed ?? [], unclosed: closure.unclosed ?? [],
    error: closure.error ?? null};
}

function recordedDeployment({attempt, header, events, closure}) {
  const deployment = attempt?.deployment;
  if (!deployment) return null;
  const workload = attempt.workload;
  const hostIps = new Set(arrayMap(deployment.roles || [], (role) => role.host));
  if (workload?.loadGenerator?.host) hostIps.add(workload.loadGenerator.host);
  return {targetId: deployment.targetId, topology: deployment.topology ?? null,
    hosts: arrayFilter(header.physicalHosts || [], (host) => hostIps.has(host.ip)),
    roles: deployment.roles, storage: deployment.storage, runClass: deployment.runClass,
    readiness: deployment.readiness, dataset: workload?.dataset ?? null,
    placement: workload?.placement ?? deployment.placement ?? null,
    // The deployer's binding (containerId, protocol) with the endpoint the
    // workload reports it used.
    endpoint: {...deployment.endpoint, ...(workload?.endpoint || {})},
    accessEvidence: deployment.accessEvidence ?? null,
    loadGenerator: workload?.loadGenerator ?? null,
    events: arrayFilter(events, (event) => arrayIncludes(DEPLOYMENT_EVENT_KINDS, event.kind)),
    closure: closureOf(closure), roleObservations: attempt.roleObservations ?? null};
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

// The semantic gate before the window; without a gate stage the run says so.
async function semanticGateStage({run, manifest, deps, deployment, events}) {
  if (!deps.runSemanticGate) {
    events.push({kind: EVENT.SEMANTIC_GATE_UNAVAILABLE, at: iso(deps.now())});
    return {gate: null, deployment};
  }
  const staged = await deps.runSemanticGate({run, manifest, deployment});
  events.push(...(staged.events || []));
  return staged;
}

async function measureRun({run, manifest, deps, events, signal}) {
  const attempt = {deployment: await deps.deployRun(run), workload: null,
    productsAfter: null};
  assertEndpointBound(attempt.deployment);
  const staged = await semanticGateStage({run, manifest, deps,
    deployment: attempt.deployment, events});
  attempt.deployment = staged.deployment;
  const deployment = attempt.deployment;
  assertEndpointBound(deployment);
  const rolesBefore = await observeRolesSafely(deployment, events, deps.now);
  attempt.workload = await deps.executeWorkloadRun({run, manifest, deployment, signal,
    semanticGate: staged.gate});
  events.push(...(attempt.workload.events || []));
  attempt.productsAfter = await deps.inspectProducts(deployment);
  const identityEvents = compareProductIdentity(deployment.identity.products,
    attempt.productsAfter, iso(deps.now()));
  events.push(...identityEvents);
  const rolesAfter = await observeRolesSafely(deployment, events, deps.now);
  attempt.roleObservations = {before: rolesBefore, after: rolesAfter};
  if (rolesBefore && rolesAfter && canonicalJson(rolesBefore) !== canonicalJson(rolesAfter)) {
    events.push({kind: EVENT.ROLE_CHANGED, before: rolesBefore, after: rolesAfter,
      observedAt: iso(deps.now())});
  }
  if (identityEvents.length > 0) {
    throw Object.assign(deploymentFailure(DEPLOYMENT_FAILURE.PRODUCT_CHANGED,
      'product containers changed across the measured window', {events: identityEvents}),
    {attempt});
  }
  const workloadFailure = attempt.workload.failure;
  if (workloadFailure) {
    throw Object.assign(deploymentFailure(workloadFailure.code, workloadFailure.message,
      workloadFailure.diagnostic ?? null), {attempt});
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
  startedAt, endedAt, recordOwner}) {
  // The frozen manifest's preregistered plan (warm-up spec included), then the
  // plan identity the workload executed, as stream A composes them.
  const plan = {...manifest.plan, manifestDigest: manifest.manifestDigest,
    offeredRatePerSec: run.offeredRatePerSec, repetition: run.repetition,
    orderIndex: run.orderIndex, ...(attempt?.workload?.plan || {})};
  const record = {recordType: RECORD_TYPE.RUN, schemaVersion: RECORD_SCHEMA,
    campaignId: manifest.campaignId, runId: run.runId, claimKey: run.claimKey,
    targetId: run.targetId, scenario: run.scenario, subkind: run.subkind,
    executionTarget: header.executionTarget,
    execution: {state, failure, startedAt, endedAt},
    identity: {harness: composeRunHarnessIdentity({header: header.harness, system: run.system,
      reported: attempt?.workload?.harness ?? null}),
    products: attempt?.deployment?.identity?.products ?? null,
    productsAfterWindow: attempt?.productsAfter ?? null, publication: null},
    plan, deployment: recordedDeployment({attempt, header, events, closure}),
    observations: attempt?.workload?.observations ?? null,
    correctness: attempt?.workload?.correctness ?? null,
    harnessEvents: arrayFilter(events,
      (event) => !arrayIncludes(DEPLOYMENT_EVENT_KINDS, event.kind))};
  record.rawObservationsDigest = recordOwner.computeRunObservationsDigest(record);
  // Only a run that reached the workload has a complete record to validate.
  if (!arrayIncludes(RECORDED_STATES, state) || !attempt?.workload) return record;
  try {
    recordOwner.validateRunRecord(record);
  } catch (error) {
    record.execution = {...record.execution, state: RUN_STATE.FAILED,
      failure: {code: RECORD_REJECTED, message: errorText(error),
        diagnostic: {rejection: error?.code ?? null}}};
  }
  return record;
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
    return runRecord({run, manifest, header, recordOwner: deps.recordOwner,
      state: RUN_STATE.INTERRUPTED,
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
  const productFailure = failure ? null : attempt?.workload?.productFailure ?? null;
  return runRecord({run, manifest, header, events, closure, attempt,
    failure: failure ?? (productFailure ? {code: 'product_failure',
      message: `product ${productFailure.runStatus}`, diagnostic: productFailure} : null),
    recordOwner: deps.recordOwner,
    state: failure ? stateOfFailure(failure) :
      (productFailure ? RUN_STATE.PRODUCT_FAILURE : RUN_STATE.COMPLETED),
    startedAt, endedAt: iso(deps.now())});
}

/**
 * @param {{manifest: Object, header: Object, deps: Object}} input deps:
 *   deployRun, executeWorkloadRun, inspectProducts, teardownRun,
 *   appendRecords, now, deadlineAt
 * @return {Promise<Object>} the campaign summary (every attempted run)
 */
async function runComparativeCampaign({manifest, header, deps}) {
  const headerRecord = {recordType: RECORD_TYPE.HEADER, schemaVersion: RECORD_SCHEMA,
    campaignId: manifest.campaignId, startedAt: iso(deps.now()),
    manifestDigest: manifest.manifestDigest, comparable: manifest.comparable, manifest,
    harness: header.harness,
    executionTarget: header.executionTarget, physicalHosts: header.physicalHosts};
  // A header A's owner rejects stops the campaign before any run.
  deps.recordOwner.validateCampaignHeader(headerRecord);
  await deps.appendRecords([headerRecord]);
  const records = [];
  const watchdog = watchdogFor(deps);
  const attempted = [];
  try {
    for (const run of manifest.runs) {
      const record = await attemptRun({run, manifest, header, deps, watchdog});
      // Appended as soon as the run ends: an interrupted campaign keeps its runs.
      await deps.appendRecords([record]);
      records.push(record);
      attempted.push({runId: run.runId, claimKey: run.claimKey, targetId: run.targetId,
        state: record.execution.state, failureCode: record.execution.failure?.code ?? null,
        closureComplete: record.closure?.complete ?? null});
    }
  } finally {
    watchdog.clear();
  }
  const states = arrayMap(attempted, (entry) => entry.state);
  return {campaignId: manifest.campaignId, manifestDigest: manifest.manifestDigest,
    header: headerRecord, records, attempted,
    exitCode: resolveRunExitCode({
      hasFailures: arraySome(states, (state) => state === RUN_STATE.FAILED ||
        state === RUN_STATE.INTERRUPTED || state === RUN_STATE.PRODUCT_FAILURE),
      hasRefusals: arrayIncludes(states, RUN_STATE.BLOCKED)})};
}

export {
  RECORD_SCHEMA as RAW_OBSERVATION_RECORD_SCHEMA,
  RUN_STATE as CAMPAIGN_RUN_STATE,
  runComparativeCampaign,
};
