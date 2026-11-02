// One Scenario A run (one system, one offered rate, one repetition) of the
// canonical OLTP workload through the shared owners: canonical dataset and
// plan, the system's native adapter beneath the wire-attempt capture, the
// open-loop step owner (v2) with the paired retry owner, a run watchdog
// derived from the product timing ladder, and product-content dataset
// verification and final-state reconciliation on a separate connection.
import {createPgWireClient} from '../reference-client/pg-wire-client.js';
import {
  QUERY_DEFAULTS,
} from '../../../src/query/query-constants.js';
import {
  UNKNOWN_OUTCOME_REDELIVERY_MAX_DELAY_MS,
} from '../../../src/query/query-executor-unknown-outcome.js';
import {
  createLagrangeOltpAdapter,
} from '../reference-client/lagrange-oltp-adapter.js';
import {
  observeLagrangeOltpStateSnapshot,
} from '../reference-client/lagrange-oltp-state-snapshot.js';
import {
  createPostgreSqlOltpAdapter,
} from '../reference-client/postgresql-oltp-adapter.js';
import {
  createTiDbOltpAdapter,
} from '../reference-client/tidb-oltp-adapter.js';
import {
  observeTiDbOltpStateSnapshot,
} from '../reference-client/tidb-oltp-state-snapshot.js';
import {
  createBenchmarkConnectionRegistry,
  createBenchmarkOutcomeAdapter,
  createTrackedMysqlConnectionFactory,
  createTrackedPgClientFactory,
} from './benchmark-oltp-attempt-capture.js';
import {
  benchmarkCanonicalDigest,
  classifyBenchmarkAttemptFailure,
  computeExecutedOperationsDigest,
  describePlannedOperationSlice,
} from './benchmark-operation-outcome.js';
import {
  OLTP_RECONCILIATION_STATUS,
  observeOltpStateSnapshot,
  reconcileOltpFinalState,
  verifyOltpLoadedDataset,
} from './benchmark-oltp-state-reconciliation.js';
import {
  BENCHMARK_PROFILE_CLASS,
} from './benchmark-workload-dispatch.js';
import {
  buildOltpBaselineDataset,
  hashOltpBaselineDataset,
} from './oltp-baseline-dataset.js';
import {
  buildOltpBaselinePlan,
  hashOltpBaselineMeasurementPlan,
} from './oltp-baseline-workload.js';
import {
  OLTP_OPEN_LOOP_PROFILE,
  buildUnissuedOpenLoopRecords,
  interleaveOltpWorkerPhase,
  runOpenLoopOltpStep,
} from './oltp-open-loop-step-owner.js';
import {
  OLTP_PAIRED_RETRY_POLICY,
  resolvePairedOltpRetryDelayMs,
} from './oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_SYSTEM,
} from './oltp-scenario-a-comparison-systems.js';
import {
  prepareLagrangeScenarioAPublicPgContext,
} from './oltp-scenario-a-lagrange-public-pg-context.js';
import {
  OLTP_SCENARIO_A_SEMANTIC_PROFILE,
  hashScenarioASemanticProfile,
} from './oltp-scenario-a-semantic-profile.js';

const arrayEvery = Function.call.bind(Array.prototype.every);

const THOUSAND = 1000;
// A request awaits at most one blocked body statement and its COMMIT, each
// bounded by the engine query timeout (unknown-outcome redelivery runs
// inside that budget, plus at most one maximum redelivery delay).
const STATEMENTS_AWAITED_PER_ATTEMPT = 2;

const RUN_STATUS = Object.freeze({
  COMPLETED: 'completed',
  WATCHDOG_STOPPED: 'watchdog-stopped',
  SETUP_FAILED: 'setup-failed',
  WARMUP_FAILED: 'warmup-failed',
});

const DATASET_RESET_METHOD = Object.freeze({
  FRESH_FORMATION: 'fresh-formation',
  TRUNCATE_AND_RELOAD: 'truncate-and-reload',
  NONE: 'none',
});

const ENDPOINT_DISCOVERY = Object.freeze({
  CALLER: 'caller-endpoint',
  PUBLIC_PG_CONTEXT: 'public-pg-context',
});

const ADAPTER_ID = Object.freeze({
  [OLTP_SCENARIO_A_SYSTEM.LAGRANGE]: 'lagrange-public-pgwire-oltp-adapter',
  [OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV]: 'tidb-mysql2-oltp-adapter',
  [OLTP_SCENARIO_A_SYSTEM.POSTGRESQL]: 'postgresql-pgwire-native-for-update',
});

// The run-level bound and its derivation from the product timing ladder.
function deriveRunWatchdog(scheduledMs) {
  const perAttemptMs = STATEMENTS_AWAITED_PER_ATTEMPT * QUERY_DEFAULTS.QUERY_TIMEOUT_MS +
    UNKNOWN_OUTCOME_REDELIVERY_MAX_DELAY_MS;
  const attempts = OLTP_PAIRED_RETRY_POLICY.maxRetries + 1;
  let retryBackoffMs = 0;
  for (let retry = 1; retry <= OLTP_PAIRED_RETRY_POLICY.maxRetries; retry += 1) {
    retryBackoffMs += resolvePairedOltpRetryDelayMs(retry);
  }
  const ladderMs = attempts * perAttemptMs + retryBackoffMs;
  return Object.freeze({
    boundMs: scheduledMs + ladderMs,
    derivation: Object.freeze({
      scheduledMs,
      engineQueryTimeoutMs: QUERY_DEFAULTS.QUERY_TIMEOUT_MS,
      unknownOutcomeRedeliveryMaxDelayMs: UNKNOWN_OUTCOME_REDELIVERY_MAX_DELAY_MS,
      statementsAwaitedPerAttempt: STATEMENTS_AWAITED_PER_ATTEMPT,
      attemptsPerRequest: attempts,
      retryBackoffMs,
      ladderMsAfterLastIntendedIssue: ladderMs,
      rule: 'bound = scheduledMs + attempts * (2 * queryTimeout + maxRedeliveryDelay) + ' +
        'sum(retry backoff)',
    }),
  });
}

function requireEndpoint(value, label) {
  const host = typeof value?.host === 'string' ? value.host : '';
  const port = value?.port;
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label} requires endpoint {host, port}`);
  }
  return Object.freeze({host, port});
}

async function resolveLagrangeConnection(connection) {
  if (connection?.cluster) {
    const context = await prepareLagrangeScenarioAPublicPgContext({
      cluster: connection.cluster,
      admission: connection.admission,
    });
    return {endpoint: context.endpoint, credentials: context.connection,
      discovery: ENDPOINT_DISCOVERY.PUBLIC_PG_CONTEXT, serviceEndpoint: context.serviceEndpoint};
  }
  return {
    endpoint: requireEndpoint(connection?.endpoint, 'Lagrange public PG wire'),
    credentials: connection?.credentials,
    discovery: ENDPOINT_DISCOVERY.CALLER,
    serviceEndpoint: null,
  };
}

// How the system's dataset is made fresh. Lagrange cannot DROP TABLE: the
// dataset is fresh only on a fresh formation.
function resetMethodOf(system) {
  return system === OLTP_SCENARIO_A_SYSTEM.LAGRANGE ?
    DATASET_RESET_METHOD.FRESH_FORMATION : DATASET_RESET_METHOD.TRUNCATE_AND_RELOAD;
}

// The system's native adapter beneath the wire capture, its separate
// snapshot reader and its dataset reset method.
async function openSystem(system, connection, workload, registry, drivers) {
  if (system === OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV) {
    const endpoint = requireEndpoint(connection?.endpoint, 'TiDB');
    const baseConnect = drivers.createMysqlConnection || defaultMysqlConnection;
    const adapterOptions = {endpoint, databaseName: connection.databaseName, workload,
      createConnection: createTrackedMysqlConnectionFactory(baseConnect, registry)};
    return {
      endpoint,
      discovery: ENDPOINT_DISCOVERY.CALLER,
      resetMethod: resetMethodOf(system),
      open: () => createTiDbOltpAdapter(adapterOptions),
      snapshot: (adapter) => observeTiDbOltpStateSnapshot({endpoint,
        databaseName: adapter.databaseName, createConnection: baseConnect}),
    };
  }
  const resolved = system === OLTP_SCENARIO_A_SYSTEM.LAGRANGE ?
    await resolveLagrangeConnection(connection) :
    {endpoint: requireEndpoint(connection?.endpoint, 'PostgreSQL'),
      credentials: connection?.credentials, discovery: ENDPOINT_DISCOVERY.CALLER};
  const baseClient = drivers.createPgClient || defaultPgClient;
  const createAdapter = system === OLTP_SCENARIO_A_SYSTEM.LAGRANGE ?
    createLagrangeOltpAdapter : createPostgreSqlOltpAdapter;
  const adapterOptions = {endpoint: resolved.endpoint, connection: resolved.credentials, workload,
    createClient: createTrackedPgClientFactory(baseClient, registry)};
  return {
    endpoint: resolved.endpoint,
    discovery: resolved.discovery,
    resetMethod: resetMethodOf(system),
    open: () => createAdapter(adapterOptions),
    snapshot: () => observeLagrangeOltpStateSnapshot({endpoint: resolved.endpoint,
      connection: resolved.credentials, createClient: baseClient}),
  };
}

// The native client libraries from the load generator's checkout (never from
// a product image). pg-wire clients come from their one owner; the TiDB
// driver is loaded on first use, and only by a TiDB run.
let mysqlModule = null;
function defaultPgClient(options) {
  return createPgWireClient(options);
}

function defaultMysqlConnection(options) {
  return mysqlModule.createConnection(options);
}

async function loadDefaultDrivers(drivers, system) {
  if (system === OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV && !drivers.createMysqlConnection &&
      !mysqlModule) {
    const loaded = await import('mysql2/promise');
    mysqlModule = loaded.default || loaded;
  }
  return drivers;
}

function stepOptions(offeredRatePerSec, operations, runtime, evidence) {
  const scheduledMs = (operations.length * THOUSAND) / offeredRatePerSec;
  return {
    offeredRatePerSec,
    watchdog: deriveRunWatchdog(scheduledMs),
    evidence,
    ...runtime,
  };
}

// The canonical identity of a workload: what the dataset, the plan and the
// measured slice digest to. The run records it and admission recomputes it
// from the recorded workload; there is no second derivation.
function describeWorkloadIdentity(workload) {
  const workloadPlan = buildOltpBaselinePlan(workload);
  const slice = describePlannedOperationSlice(
    interleaveOltpWorkerPhase(workloadPlan.workers, 'measurement'));
  // The preregistered warm-up (plan.warmup): its operation count and the
  // digest of the planned warm-up slice; an executed warm-up must equal it.
  const warmupOperations = interleaveOltpWorkerPhase(workloadPlan.workers, 'warmup');
  const warmup = warmupOperations.length === 0 ? {operations: 0, digest: null} :
    {operations: warmupOperations.length,
      digest: describePlannedOperationSlice(warmupOperations).operationSliceDigest};
  return Object.freeze({
    datasetDigest: hashOltpBaselineDataset(buildOltpBaselineDataset(workload)),
    workloadPlanDigest: benchmarkCanonicalDigest(workloadPlan),
    measurementPlanDigest: hashOltpBaselineMeasurementPlan(workloadPlan),
    operationSliceDigest: slice.operationSliceDigest,
    plannedOperationCounts: slice.plannedOperationCounts,
    warmup: Object.freeze(warmup),
  });
}

function planIdentity(profile, plan, workload, offeredRatePerSec) {
  const identity = describeWorkloadIdentity(workload);
  return Object.freeze({
    workloadProfileId: profile.id,
    publication: profile.publication,
    profileClass: profile.profileClass,
    workload,
    operationSliceDigest: identity.operationSliceDigest,
    plannedOperationCounts: identity.plannedOperationCounts,
    warmup: identity.warmup,
    semanticProfileId: OLTP_SCENARIO_A_SEMANTIC_PROFILE.id,
    semanticProfileDigest: hashScenarioASemanticProfile(),
    retryPolicyId: OLTP_PAIRED_RETRY_POLICY.id,
    openLoopProfileId: OLTP_OPEN_LOOP_PROFILE.id,
    datasetDigest: identity.datasetDigest,
    workloadPlanDigest: identity.workloadPlanDigest,
    measurementPlanDigest: identity.measurementPlanDigest,
    offeredRatePerSec,
    repetition: plan.repetition ?? null,
    orderIndex: plan.orderIndex ?? null,
    sweepPlanDigest: plan.sweepPlanSha256 ?? null,
  });
}

function resolveWorkload(profile, plan) {
  if (profile.ownsWorkload) {
    if (plan.workload !== undefined) {
      throw new Error(`workload profile ${profile.id} owns its workload`);
    }
    return profile.workload;
  }
  if (!plan.workload || typeof plan.workload !== 'object') {
    throw new Error(`workload profile ${profile.id} requires plan.workload`);
  }
  return plan.workload;
}

function requireRate(plan) {
  const rate = plan?.offeredRatePerSec;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new Error('benchmark run requires plan.offeredRatePerSec > 0');
  }
  return rate;
}

// Schema provisioning observations: the adapter's on success, the ones the
// failed preparation carried otherwise; TiDB has no provisioning contract.
const PROVISIONING_NOT_APPLICABLE = Object.freeze({status: 'not-applicable'});

function provisioningEvidenceOf(systemId, adapter, error) {
  if (systemId === OLTP_SCENARIO_A_SYSTEM.TIDB_TIKV) return PROVISIONING_NOT_APPLICABLE;
  if (adapter) return adapter.schemaProvisioning;
  for (const candidate of [error, ...(error?.errors ?? [])]) {
    if (candidate?.schemaProvisioning) return candidate.schemaProvisioning;
  }
  return Object.freeze({status: 'not-reached', reason: String(error?.message || error)});
}

function setupFailure(error) {
  const classified = classifyBenchmarkAttemptFailure(error, {});
  return Object.freeze({
    failureClass: classified.failureClass,
    sqlState: classified.sqlState,
    code: classified.code,
    message: classified.message,
  });
}

async function closeAdapter(adapter) {
  if (!adapter) return Object.freeze({status: 'not-opened'});
  try {
    const closed = await adapter.close();
    return Object.freeze({status: 'closed', ...closed});
  } catch (error) {
    return Object.freeze({status: 'close-failed', error: String(error?.message || error)});
  }
}

function warmupSummary(step) {
  return Object.freeze({
    accounting: step.accounting,
    executedOperationsDigest: step.executedOperationsDigest,
    watchdog: step.watchdog,
    records: step.records,
  });
}

// A measurement that never started: every planned request offered and
// unissued, over its scheduled window, with no capacity metric.
function unissuedMeasurement(workloadPlan, rate, startedAtIso) {
  const operations = interleaveOltpWorkerPhase(workloadPlan.workers, 'measurement');
  const unissued = buildUnissuedOpenLoopRecords(operations, rate);
  const scheduledMs = (operations.length * THOUSAND) / rate;
  return {
    ...unissued,
    window: Object.freeze({scheduledMs, drainMs: 0, drainOverrunMs: 0,
      accountingWindowMs: scheduledMs, startedAt: startedAtIso,
      endedAt: new Date().toISOString()}),
  };
}

async function measure(context) {
  const {adapter, outcomeAdapter, system, workloadPlan, rate, runtime, evidence} = context;
  const warmupOps = interleaveOltpWorkerPhase(workloadPlan.workers, 'warmup');
  let warmup = null;
  if (warmupOps.length > 0) {
    warmup = await runOpenLoopOltpStep(outcomeAdapter, warmupOps,
      stepOptions(rate, warmupOps, runtime, evidence));
    if (warmup.watchdog.fired) outcomeAdapter.abortInFlight();
    if (warmup.accounting.committed !== warmup.accounting.offered) {
      return {status: RUN_STATUS.WARMUP_FAILED, warmup: warmupSummary(warmup), step: null,
        unissued: unissuedMeasurement(workloadPlan, rate, context.startedAtIso)};
    }
  }
  const before = await observeOltpStateSnapshot(() => system.snapshot(adapter));
  const operations = interleaveOltpWorkerPhase(workloadPlan.workers, 'measurement');
  const step = await runOpenLoopOltpStep(outcomeAdapter, operations,
    stepOptions(rate, operations, runtime, evidence));
  const abortedInFlight = step.watchdog.fired ? outcomeAdapter.abortInFlight() : 0;
  const after = await observeOltpStateSnapshot(() => system.snapshot(adapter));
  return {
    status: step.watchdog.fired ? RUN_STATUS.WATCHDOG_STOPPED : RUN_STATUS.COMPLETED,
    warmup: warmup ? warmupSummary(warmup) : null,
    step,
    plannedOffered: operations.length,
    abortedInFlight,
    reconciliation: reconcileOltpFinalState(step.records, before, after,
      workloadPlan.config.scale),
  };
}

function finalStateObservationOf(measured) {
  if (!measured.reconciliation) {
    return Object.freeze({status: OLTP_RECONCILIATION_STATUS.UNOBSERVED,
      reason: measured.status});
  }
  return measured.reconciliation.status === OLTP_RECONCILIATION_STATUS.UNOBSERVED ?
    measured.reconciliation : null;
}

function observationsOf(measured, registry, profileClass) {
  const {step} = measured;
  if (!step) {
    return Object.freeze({
      runStatus: measured.status,
      setup: measured.setup ?? null,
      warmup: measured.warmup ?? null,
      plannedOffered: measured.unissued.records.length,
      offered: measured.unissued.accounting.offered,
      requests: measured.unissued.records,
      accounting: measured.unissued.accounting,
      window: measured.unissued.window,
      executedOperationsDigest: computeExecutedOperationsDigest(measured.unissued.records),
      errorRate: null,
    });
  }
  return Object.freeze({
    runStatus: measured.status,
    setup: null,
    warmup: measured.warmup,
    openLoopProfileId: step.profileId,
    clock: step.clock,
    plannedOffered: measured.plannedOffered,
    offered: step.accounting.offered,
    requests: step.records,
    accounting: step.accounting,
    window: step.window,
    watchdog: step.watchdog,
    // A smoke run never carries a capacity metric.
    ...(profileClass === BENCHMARK_PROFILE_CLASS.SMOKE ? {} :
      {completedPerSec: step.completedPerSec}),
    quantileMethod: step.quantileMethod,
    latency: step.latency,
    attemptLatency: step.attemptLatency,
    unresolvedExcludedFromAttemptLatency: step.unresolvedExcludedFromAttemptLatency,
    maxLatencyMs: step.maxLatencyMs,
    errorRate: step.errorRate,
    executedOperationsDigest: step.executedOperationsDigest,
    lateCompletions: Object.freeze([...step.lateCompletions]),
    connections: Object.freeze({
      destroyedAfterUnresolvedOrTransportFailure: registry.destroyed,
      destroyFailures: Object.freeze([...registry.destroyFailures]),
      abortedInFlightAtWatchdog: measured.abortedInFlight,
    }),
  });
}

const SETUP_FAILURE_TEXT_FIELDS = Object.freeze(['failureClass', 'code', 'message']);

// The deployer's setup failure of a run that is never opened: typed like the
// run owner's own setupFailure (failureClass, sqlState, code, message).
function requireSetupFailure(value) {
  const typed = value && typeof value === 'object' &&
    arrayEvery(SETUP_FAILURE_TEXT_FIELDS, (field) => typeof value[field] === 'string' &&
      value[field] !== '') &&
    (value.sqlState === null || typeof value.sqlState === 'string');
  if (!typed) {
    throw new Error('an unopened benchmark run requires setupFailure ' +
      '{failureClass, sqlState, code, message}');
  }
  return Object.freeze({failureClass: value.failureClass, sqlState: value.sqlState,
    code: value.code, message: value.message});
}

// Open the system and measure, or record the setup failure the product
// answered with; an unopened run (options.setupFailure: the deployment never
// became ready) never connects.
async function openAndMeasure(options, context) {
  const {dispatch, workload, workloadPlan, rate, startedAtIso, registry} = context;
  if (Object.hasOwn(options, 'setupFailure')) {
    const setup = requireSetupFailure(options.setupFailure);
    return {system: {endpoint: null, discovery: null, resetMethod: resetMethodOf(dispatch.system)},
      adapter: null, setupError: null, loaded: {snapshot: null, error: 'run never opened'},
      measured: {status: RUN_STATUS.SETUP_FAILED, setup, step: null,
        unissued: unissuedMeasurement(workloadPlan, rate, startedAtIso)},
      provisioning: Object.freeze({status: 'not-reached', reason: setup.message})};
  }
  const drivers = await loadDefaultDrivers(options.drivers || {}, dispatch.system);
  const system = await openSystem(dispatch.system, options.connection, workload, registry,
    drivers);
  let adapter;
  try {
    adapter = await system.open();
  } catch (error) {
    return {system, adapter: null, loaded: {snapshot: null, error: 'dataset not loaded'},
      measured: {status: RUN_STATUS.SETUP_FAILED, setup: setupFailure(error), step: null,
        unissued: unissuedMeasurement(workloadPlan, rate, startedAtIso)},
      provisioning: provisioningEvidenceOf(dispatch.system, null, error)};
  }
  const loaded = await observeOltpStateSnapshot(() => system.snapshot(adapter));
  const measured = await measure({adapter, startedAtIso,
    outcomeAdapter: createBenchmarkOutcomeAdapter(adapter, registry), system, workloadPlan,
    rate, runtime: options.runtime || {}, evidence: {evidenceDir: options.evidenceDir}});
  return {system, adapter, loaded, measured,
    provisioning: provisioningEvidenceOf(dispatch.system, adapter, null)};
}

async function executeScenarioARun(options) {
  const {dispatch, plan} = options;
  const profile = dispatch.profile;
  const workload = resolveWorkload(profile, plan);
  const rate = requireRate(plan);
  const workloadPlan = buildOltpBaselinePlan(workload);
  const dataset = buildOltpBaselineDataset(workload);
  const registry = createBenchmarkConnectionRegistry();
  const identity = planIdentity(profile, plan, workload, rate);
  const {system, adapter, loaded, measured, provisioning} = await openAndMeasure(options,
    {dispatch, workload, workloadPlan, rate, registry,
      startedAtIso: new Date().toISOString()});
  const cleanup = await closeAdapter(adapter);
  return Object.freeze({
    adapterId: ADAPTER_ID[dispatch.system],
    plan: identity,
    deployment: Object.freeze({
      endpoint: system.endpoint,
      endpointDiscovery: system.discovery,
      dataset: Object.freeze({
        resetMethod: system.resetMethod,
        provisioning,
        verification: await verifyOltpLoadedDataset(dataset, loaded, measured.setup ?? null),
      }),
    }),
    observations: observationsOf(measured, registry, profile.profileClass),
    correctness: Object.freeze({
      semanticGate: null,
      // An unobserved snapshot leaves no final state; the reason is kept.
      finalState: measured.reconciliation?.status === OLTP_RECONCILIATION_STATUS.UNOBSERVED ?
        null : (measured.reconciliation ?? null),
      finalStateObservation: finalStateObservationOf(measured),
    }),
    cleanup,
  });
}

export {
  ADAPTER_ID as BENCHMARK_SCENARIO_A_ADAPTER_ID,
  DATASET_RESET_METHOD as BENCHMARK_DATASET_RESET_METHOD,
  RUN_STATUS as BENCHMARK_RUN_STATUS,
  deriveRunWatchdog as deriveBenchmarkRunWatchdog,
  describeWorkloadIdentity as describeBenchmarkWorkloadIdentity,
  executeScenarioARun,
};
