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
 *
 * The campaign header pins each target's product identity (stream A's header
 * `products`) from the first deployment of that target the deployer
 * described (its running containers, inspected). Run records are held, in
 * order, until every target is pinned, then the header and the held records
 * are appended; a target that could not be pinned is named in the header's
 * `unpinnedTargets` with its failure. A campaign that pinned no target writes
 * nothing and fails (`campaign_products_unpinned`).
 *
 * A deployment whose readiness was exhausted and that the deployer described
 * (error.deployment) is recorded as the complete setup-failed product failure
 * it is: the canonical workload records every planned request unissued under
 * the deployer's setup failure. An exhaustion the deployer could not describe
 * is a failed run.
 */
import {resolveRunExitCode} from './scenario-outcome.js';
import {canonicalJson} from './comparative-benchmark-campaign-manifest.js';
import {
  arrayEvery,
  arrayFilter,
  arrayFlatMap,
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
import {pinProductIdentity} from './comparative-benchmark-product-pins.js';
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
const PRODUCTS_UNPINNED = 'campaign_products_unpinned';
// The deployer's readiness exhaustion as the run's setup failure: the product
// never answered its readiness contract, so the failure is the product's.
const READINESS_SETUP_FAILURE_CLASS = 'product_error';
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

function stateOfFailure(failure, attempt) {
  if (stringStartsWith(String(failure.code), REFUSAL_PREFIX)) return RUN_STATE.BLOCKED;
  // A product failure names the product that failed: only a complete record.
  if (arrayIncludes(PRODUCT_FAILURE_CODES, failure.code)) {
    return attempt?.workload ? RUN_STATE.PRODUCT_FAILURE : RUN_STATE.FAILED;
  }
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
    removed: closure.removed, unclosed: closure.unclosed, error: closure.error ?? null};
}

// The hosts the deployment's roles and the load generator ran on.
function deploymentHosts(header, deployment, workload) {
  const hostIps = new Set(arrayMap(deployment.roles, (role) => role.host));
  if (workload) hostIps.add(workload.loadGenerator.host);
  return arrayFilter(header.physicalHosts, (host) => hostIps.has(host.ip));
}

// The client endpoint: the deployer's binding with the endpoint the workload
// reports it used; an unopened run used none (an exhausted deployment may
// name none).
function recordedEndpoint(deployment, workload) {
  return workload?.endpoint ? {...deployment.endpoint, ...workload.endpoint} :
    deployment.endpoint;
}

// The workload's fields of the deployment record; an attempt that never
// reached the workload has none.
function workloadDeploymentFields(deployment, workload) {
  if (!workload) {
    return {dataset: null, placement: deployment.placement, loadGenerator: null};
  }
  return {dataset: workload.dataset,
    // Placement observed after the window, or the deployer's at readiness.
    placement: workload.placement === null ? deployment.placement : workload.placement,
    loadGenerator: workload.loadGenerator};
}

function recordedDeployment({attempt, header, events, closure}) {
  const deployment = attempt?.deployment;
  if (!deployment) return null;
  const workload = attempt.workload;
  return {targetId: deployment.targetId, topology: deployment.topology,
    hosts: deploymentHosts(header, deployment, workload),
    roles: deployment.roles, storage: deployment.storage, runClass: deployment.runClass,
    readiness: deployment.readiness, ...workloadDeploymentFields(deployment, workload),
    endpoint: recordedEndpoint(deployment, workload),
    accessEvidence: Object.hasOwn(deployment, 'accessEvidence') ?
      deployment.accessEvidence : null,
    events: arrayFilter(events, (event) => arrayIncludes(DEPLOYMENT_EVENT_KINDS, event.kind)),
    closure: closureOf(closure), roleObservations: attempt.roleObservations};
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

// A failure past deployment keeps the attempt (and its deployment) in the record.
async function withAttempt(attempt, step) {
  try {
    return await step();
  } catch (error) {
    throw Object.assign(error, {attempt});
  }
}

async function measureRun({run, manifest, deps, events, signal}) {
  const attempt = {deployment: await deps.deployRun(run), workload: null,
    productsAfter: null, roleObservations: null};
  // The deployment stays in the record (and pins its identity) when refused.
  await withAttempt(attempt, () => assertEndpointBound(attempt.deployment));
  const staged = await semanticGateStage({run, manifest, deps,
    deployment: attempt.deployment, events});
  attempt.deployment = staged.deployment;
  const deployment = attempt.deployment;
  assertEndpointBound(deployment);
  const rolesBefore = await observeRolesSafely(deployment, events, deps.now);
  attempt.workload = await deps.executeWorkloadRun({run, manifest, deployment, signal,
    semanticGate: staged.gate});
  events.push(...(attempt.workload.events || []));
  attempt.productsAfter = await withAttempt(attempt, () => deps.inspectProducts(deployment));
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

// The frozen manifest's preregistered plan (warm-up spec included), then the
// plan identity the workload executed, as stream A composes them.
function recordedPlan(run, manifest, workload) {
  return {...manifest.plan, manifestDigest: manifest.manifestDigest,
    offeredRatePerSec: run.offeredRatePerSec, repetition: run.repetition,
    orderIndex: run.orderIndex, ...(workload?.plan || {})};
}

function recordedIdentity(run, header, attempt) {
  return {harness: composeRunHarnessIdentity({header: header.harness, system: run.system,
    reported: attempt?.workload ? attempt.workload.harness : null}),
  products: attempt?.deployment ? attempt.deployment.identity.products : null,
  productsAfterWindow: attempt?.productsAfter ?? null, publication: null};
}

// Only a run that reached the workload has a complete record to validate; a
// complete record A's validator rejects is a failed run.
function validatedRecord(record, recordOwner, attempt) {
  if (!arrayIncludes(RECORDED_STATES, record.execution.state) || !attempt?.workload) {
    return record;
  }
  try {
    recordOwner.validateRunRecord(record);
  } catch (error) {
    record.execution = {...record.execution, state: RUN_STATE.FAILED,
      failure: {code: RECORD_REJECTED, message: errorText(error),
        diagnostic: {rejection: error?.code ?? null}}};
  }
  return record;
}

function runRecord({run, manifest, header, state, failure, attempt, events, closure,
  startedAt, endedAt, recordOwner}) {
  const workload = attempt?.workload ?? null;
  const record = {recordType: RECORD_TYPE.RUN, schemaVersion: RECORD_SCHEMA,
    campaignId: manifest.campaignId, runId: run.runId, claimKey: run.claimKey,
    targetId: run.targetId, scenario: run.scenario, subkind: run.subkind,
    executionTarget: header.executionTarget,
    execution: {state, failure, startedAt, endedAt},
    identity: recordedIdentity(run, header, attempt),
    plan: recordedPlan(run, manifest, workload),
    deployment: recordedDeployment({attempt, header, events, closure}),
    observations: workload ? workload.observations : null,
    correctness: workload ? workload.correctness : null,
    harnessEvents: arrayFilter(events,
      (event) => !arrayIncludes(DEPLOYMENT_EVENT_KINDS, event.kind))};
  record.rawObservationsDigest = recordOwner.computeRunObservationsDigest(record);
  return validatedRecord(record, recordOwner, attempt);
}

function watchdogFor(deps) {
  const controller = new AbortController();
  if (!Number.isFinite(deps.deadlineAt)) return {controller, clear: () => {}};
  const timer = setTimeout(() => controller.abort(),
    Math.max(0, deps.deadlineAt - deps.now()));
  timer.unref?.();
  return {controller, clear: () => clearTimeout(timer)};
}

// A deployment whose readiness was exhausted, as the deployer described it:
// the canonical workload records the run unopened (every planned request
// unissued) under the deployer's setup failure, and the containers are
// inspected again like after any window.
async function unmeasuredAttempt({run, manifest, deps, events, error}) {
  const deployment = error.deployment;
  const attempt = {deployment, workload: null, productsAfter: null, roleObservations: null};
  attempt.workload = await deps.executeWorkloadRun({run, manifest, deployment,
    signal: null, semanticGate: null,
    setupFailure: {failureClass: READINESS_SETUP_FAILURE_CLASS, sqlState: null,
      code: error.code, message: errorText(error)}});
  events.push(...(attempt.workload.events || []));
  attempt.productsAfter = await deps.inspectProducts(deployment);
  events.push(...compareProductIdentity(deployment.identity.products, attempt.productsAfter,
    iso(deps.now())));
  return attempt;
}

function isDescribedExhaustion(error) {
  return error?.code === DEPLOYMENT_FAILURE.READINESS_EXHAUSTED && Boolean(error.deployment);
}

// Measure the run, or record the deployer's described readiness exhaustion;
// any failure keeps the attempt it reached.
async function settleAttempt({run, manifest, deps, events, signal}) {
  try {
    return {attempt: await measureRun({run, manifest, deps, events, signal}), failure: null};
  } catch (error) {
    const failure = failureOf(error);
    if (!isDescribedExhaustion(error)) return {attempt: error?.attempt ?? null, failure};
    try {
      return {attempt: await unmeasuredAttempt({run, manifest, deps, events, error}), failure};
    } catch (unrecorded) {
      return {attempt: unrecorded?.attempt ?? {deployment: error.deployment, workload: null,
        productsAfter: null, roleObservations: null}, failure};
    }
  }
}

function outcomeOfAttempt(attempt, failure) {
  if (failure) return {state: stateOfFailure(failure, attempt), failure};
  const productFailure = attempt.workload.productFailure;
  if (!productFailure) return {state: RUN_STATE.COMPLETED, failure: null};
  return {state: RUN_STATE.PRODUCT_FAILURE, failure: {code: 'product_failure',
    message: `product ${productFailure.runStatus}`, diagnostic: productFailure}};
}

function deadlinePassed(deps, watchdog) {
  return watchdog.controller.signal.aborted ||
    (Number.isFinite(deps.deadlineAt) && deps.now() >= deps.deadlineAt);
}

async function attemptRun({run, manifest, header, deps, watchdog}) {
  const events = [];
  const startedAt = iso(deps.now());
  if (deadlinePassed(deps, watchdog)) {
    watchdog.controller.abort();
    events.push({kind: EVENT.WATCHDOG_STOP, observedAt: startedAt});
    return {attempt: null, record: runRecord({run, manifest, header,
      recordOwner: deps.recordOwner, state: RUN_STATE.INTERRUPTED,
      failure: {code: DEPLOYMENT_FAILURE.WATCHDOG_STOPPED,
        message: 'campaign deadline passed before the run was issued', diagnostic: null},
      attempt: null, events, closure: null, startedAt, endedAt: startedAt})};
  }
  const {attempt, failure} = await settleAttempt({run, manifest, deps, events,
    signal: watchdog.controller.signal});
  const closure = await teardownSafely(deps, run, attempt?.deployment ?? null);
  const outcome = outcomeOfAttempt(attempt, failure);
  return {attempt, record: runRecord({run, manifest, header, events, closure, attempt,
    ...outcome, recordOwner: deps.recordOwner, startedAt, endedAt: iso(deps.now())})};
}

/**
 * The campaign's append-only log: run records are held until every target's
 * product identity is pinned from its first described deployment, then the
 * header and the held records are appended in order.
 */
function createCampaignLog({manifest, header, deps}) {
  const pins = new Map();
  const unpinned = new Map();
  const held = [];
  const headerRecord = {recordType: RECORD_TYPE.HEADER, schemaVersion: RECORD_SCHEMA,
    campaignId: manifest.campaignId, startedAt: iso(deps.now()),
    manifestDigest: manifest.manifestDigest, comparable: manifest.comparable, manifest,
    harness: header.harness, executionTarget: header.executionTarget,
    physicalHosts: header.physicalHosts, products: null, unpinnedTargets: null};
  let written = false;

  function pin(run, deployment) {
    if (pins.has(run.targetId) || !deployment) return;
    try {
      pins.set(run.targetId, pinProductIdentity({targetId: run.targetId, product: run.system,
        products: deployment.identity.products}));
      unpinned.delete(run.targetId);
    } catch (error) {
      unpinned.set(run.targetId, failureOf(error));
    }
  }

  async function writeHeader() {
    if (pins.size === 0) {
      // Nothing is written, so each attempted run's own outcome travels in
      // the refusal: the operator's only evidence of what happened.
      throw deploymentFailure(PRODUCTS_UNPINNED,
        'no target of the campaign could pin its product identity',
        {unpinned: Object.fromEntries(unpinned), runs: arrayMap(held, (record) => ({
          runId: record.runId, targetId: record.targetId, state: record.execution.state,
          failure: record.execution.failure}))});
    }
    headerRecord.products = arrayFlatMap(arrayFilter(manifest.targets,
      (targetId) => pins.has(targetId)), (targetId) => pins.get(targetId));
    headerRecord.unpinnedTargets = arrayMap(arrayFilter(manifest.targets,
      (targetId) => !pins.has(targetId)), (targetId) => ({targetId,
      failure: unpinned.get(targetId) ?? {code: 'not_deployed',
        message: 'no deployment of the target was described', diagnostic: null}}));
    deps.recordOwner.validateCampaignHeader(headerRecord);
    await deps.appendRecords([headerRecord, ...held]);
    written = true;
  }

  return {
    header: headerRecord,
    async append(run, attempt, record) {
      pin(run, attempt?.deployment);
      if (written) return deps.appendRecords([record]);
      held.push(record);
      if (arrayEvery(manifest.targets, (targetId) => pins.has(targetId))) await writeHeader();
      return undefined;
    },
    async close() {
      if (!written) await writeHeader();
    },
  };
}

/**
 * @param {{manifest: Object, header: Object, deps: Object}} input deps:
 *   deployRun, executeWorkloadRun, inspectProducts, teardownRun,
 *   appendRecords, now, deadlineAt
 * @return {Promise<Object>} the campaign summary (every attempted run)
 */
async function runComparativeCampaign({manifest, header, deps}) {
  const log = createCampaignLog({manifest, header, deps});
  const records = [];
  const watchdog = watchdogFor(deps);
  const attempted = [];
  try {
    for (const run of manifest.runs) {
      const {attempt, record} = await attemptRun({run, manifest, header, deps, watchdog});
      // Appended as soon as the header is pinned: an interrupted campaign keeps its runs.
      await log.append(run, attempt, record);
      records.push(record);
      attempted.push({runId: run.runId, claimKey: run.claimKey, targetId: run.targetId,
        state: record.execution.state, failureCode: record.execution.failure?.code ?? null,
        closureComplete: record.deployment?.closure?.status === CLOSURE_STATUS.COMPLETE});
    }
  } finally {
    watchdog.clear();
  }
  await log.close();
  const states = arrayMap(attempted, (entry) => entry.state);
  return {campaignId: manifest.campaignId, manifestDigest: manifest.manifestDigest,
    header: log.header, records, attempted,
    exitCode: resolveRunExitCode({
      hasFailures: arraySome(states, (state) => state === RUN_STATE.FAILED ||
        state === RUN_STATE.INTERRUPTED || state === RUN_STATE.PRODUCT_FAILURE),
      hasRefusals: arrayIncludes(states, RUN_STATE.BLOCKED)})};
}

export {
  runComparativeCampaign,
};
