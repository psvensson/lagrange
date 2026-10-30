const arrayPush = Function.call.bind(Array.prototype.push);
const arraySort = Function.call.bind(Array.prototype.sort);

function computePercentile(sortedNums, p) {
  if (!sortedNums || sortedNums.length === 0) return 0;
  const rank = p > 1 ? p / 100 : p;
  const index = Math.min(
    sortedNums.length - 1,
    Math.max(0, Math.floor(rank * sortedNums.length)),
  );
  return sortedNums[index];
}

export const SCENARIO_B_MOVEMENT_PHASE = Object.freeze({
  PRE_MOVE_STEADY: 'pre-move-steady',
  DURING_MOVE: 'during-move',
  POST_MOVE_CONVERGED: 'post-move-converged',
});

const DEFAULT_MOVEMENT_PLAN_OPTIONS = Object.freeze({
  partitionKey: 'partition-risk-07',
  sourceNodeId: 'node-1',
  sourceGroup: 'island-a',
  targetNodeId: 'node-3',
  targetGroup: 'island-b',
  replicaBytesToMove: 4194304,
  preMoveRequests: 24,
  duringMoveRequests: 24,
  postMoveRequests: 24,
  serviceIdentity: 'svc://risk-decision/partition-risk-07',
});

function resolveMovementPlanOptions(options = {}) {
  return {
    ...DEFAULT_MOVEMENT_PLAN_OPTIONS,
    ...options,
  };
}

function validateMovementPlanOptions(plan) {
  if (plan.sourceNodeId === plan.targetNodeId) {
    throw new RangeError(`sourceNodeId and targetNodeId must differ: got "${plan.sourceNodeId}"`);
  }
  if (typeof plan.replicaBytesToMove !== 'number' || plan.replicaBytesToMove <= 0) {
    throw new RangeError(
      `replicaBytesToMove must be a positive number: got ${plan.replicaBytesToMove}`,
    );
  }
}

function appendPhaseSamples(samples, count, phase, partitionKey, serviceIdentity) {
  for (let i = 0; i < count; i += 1) {
    arrayPush(samples, Object.freeze({
      requestIndex: samples.length,
      phase,
      partitionKey,
      expectedServiceIdentity: serviceIdentity,
    }));
  }
}

function buildMovementPlanSamples(plan) {
  const samples = [];
  appendPhaseSamples(
    samples,
    plan.preMoveRequests,
    SCENARIO_B_MOVEMENT_PHASE.PRE_MOVE_STEADY,
    plan.partitionKey,
    plan.serviceIdentity,
  );
  appendPhaseSamples(
    samples,
    plan.duringMoveRequests,
    SCENARIO_B_MOVEMENT_PHASE.DURING_MOVE,
    plan.partitionKey,
    plan.serviceIdentity,
  );
  appendPhaseSamples(
    samples,
    plan.postMoveRequests,
    SCENARIO_B_MOVEMENT_PHASE.POST_MOVE_CONVERGED,
    plan.partitionKey,
    plan.serviceIdentity,
  );
  return Object.freeze(samples);
}

export function createScenarioBMovementPlan(options = {}) {
  const plan = resolveMovementPlanOptions(options);
  validateMovementPlanOptions(plan);
  const samples = buildMovementPlanSamples(plan);

  return Object.freeze({
    partitionKey: plan.partitionKey,
    sourceNodeId: plan.sourceNodeId,
    sourceGroup: plan.sourceGroup,
    targetNodeId: plan.targetNodeId,
    targetGroup: plan.targetGroup,
    crossIslandMove: plan.sourceGroup !== plan.targetGroup,
    replicaBytesToMove: plan.replicaBytesToMove,
    serviceIdentity: plan.serviceIdentity,
    preMoveRequests: plan.preMoveRequests,
    duringMoveRequests: plan.duringMoveRequests,
    postMoveRequests: plan.postMoveRequests,
    totalRequests: plan.preMoveRequests + plan.duringMoveRequests + plan.postMoveRequests,
    samples,
  });
}

function resolveEffectiveSamples(options) {
  const movementPlan = options.movementPlan;
  if (!movementPlan || typeof movementPlan !== 'object') {
    throw new TypeError('movementPlan must be an object');
  }

  const effectiveSamples = options.samples !== undefined ? options.samples : movementPlan.samples;
  if (!Array.isArray(effectiveSamples) || effectiveSamples.length === 0) {
    throw new RangeError('samples must be a non-empty array');
  }
  return effectiveSamples;
}

function recordSamplePhaseLatency(latencies, s) {
  const latency = typeof s.latencyMs === 'number' ? s.latencyMs : Number(s.latencyMs ?? 0);
  if (s.phase === SCENARIO_B_MOVEMENT_PHASE.PRE_MOVE_STEADY) {
    arrayPush(latencies.preMove, latency);
  } else if (s.phase === SCENARIO_B_MOVEMENT_PHASE.DURING_MOVE) {
    arrayPush(latencies.duringMove, latency);
  } else if (s.phase === SCENARIO_B_MOVEMENT_PHASE.POST_MOVE_CONVERGED) {
    arrayPush(latencies.postMove, latency);
  }
}

function processSamples(samples) {
  const latencies = {preMove: [], duringMove: [], postMove: []};
  let failedRequestCount = 0;
  let staleRouteRedirectCount = 0;
  let oracleMismatchCount = 0;
  let serviceIdentityBreakCount = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    recordSamplePhaseLatency(latencies, s);
    if ((s.ok ?? true) !== true) failedRequestCount += 1;
    staleRouteRedirectCount += Number(s.staleRouteRedirectCount ?? 0);
    if ((s.oracleMatch ?? true) !== true) oracleMismatchCount += 1;
    if ((s.serviceIdentityPreserved ?? true) !== true) serviceIdentityBreakCount += 1;
  }

  return {
    latencies,
    failedRequestCount,
    staleRouteRedirectCount,
    oracleMismatchCount,
    serviceIdentityBreakCount,
  };
}

function computePhasePercentiles(latencies) {
  arraySort(latencies.preMove, (a, b) => a - b);
  arraySort(latencies.duringMove, (a, b) => a - b);
  arraySort(latencies.postMove, (a, b) => a - b);

  const preMoveP99Ms = computePercentile(latencies.preMove, 99);
  const duringMoveP99Ms = computePercentile(latencies.duringMove, 99);
  const postMoveP99Ms = computePercentile(latencies.postMove, 99);
  const p99SpikeRatio = preMoveP99Ms > 0 ? duringMoveP99Ms / preMoveP99Ms : 1;
  const p99SpikeDeltaMs = Math.max(0, duringMoveP99Ms - preMoveP99Ms);

  return {
    preMoveP99Ms,
    duringMoveP99Ms,
    postMoveP99Ms,
    p99SpikeRatio,
    p99SpikeDeltaMs,
  };
}

function resolveComparability(timingSource, oracleAndIdentityPreserved) {
  const comparable = timingSource === 'observed' && oracleAndIdentityPreserved;
  if (comparable) {
    return {comparable: true, nonComparableReason: ''};
  }
  const nonComparableReason = timingSource !== 'observed' ?
    'non-live movement subphase contract model' :
    'oracle or service identity violation during movement';
  return {comparable: false, nonComparableReason};
}

export function evaluateScenarioBMovementSubphase(options = {}) {
  const {
    system,
    movementPlan,
    dataPlacementBytesMoved,
    routingConvergenceMs,
    automaticServiceColocationConverged,
    externalCoordinatorReconfigRequired,
    timingSource = 'deterministic-contract-model',
  } = options;

  const effectiveSamples = resolveEffectiveSamples(options);
  const {
    latencies,
    failedRequestCount,
    staleRouteRedirectCount,
    oracleMismatchCount,
    serviceIdentityBreakCount,
  } = processSamples(effectiveSamples);

  const {
    preMoveP99Ms,
    duringMoveP99Ms,
    postMoveP99Ms,
    p99SpikeRatio,
    p99SpikeDeltaMs,
  } = computePhasePercentiles(latencies);

  const oracleAndIdentityPreserved =
    failedRequestCount === 0 && oracleMismatchCount === 0 && serviceIdentityBreakCount === 0;

  const {comparable, nonComparableReason} = resolveComparability(
    timingSource,
    oracleAndIdentityPreserved,
  );

  return Object.freeze({
    system,
    timingSource,
    comparable,
    nonComparableReason,
    partitionKey: movementPlan.partitionKey,
    preMoveP99Ms,
    duringMoveP99Ms,
    postMoveP99Ms,
    p99SpikeRatio,
    p99SpikeDeltaMs,
    failedRequestCount,
    staleRouteRedirectCount,
    routingConvergenceMs: Number(routingConvergenceMs ?? 0),
    dataPlacementBytesMoved: Number(dataPlacementBytesMoved ?? movementPlan.replicaBytesToMove),
    automaticServiceColocationConverged: Boolean(automaticServiceColocationConverged),
    externalCoordinatorReconfigRequired: Boolean(externalCoordinatorReconfigRequired),
    oracleMismatchCount,
    serviceIdentityBreakCount,
    oracleAndIdentityPreserved,
  });
}

function validateComparisonReports(lagrangeReport, tidbReport) {
  if (!lagrangeReport || typeof lagrangeReport !== 'object') {
    throw new TypeError('lagrangeReport must be an object');
  }
  if (!tidbReport || typeof tidbReport !== 'object') {
    throw new TypeError('tidbReport must be an object');
  }
}

function evaluateComparisonComparability(lagrangeReport, tidbReport) {
  const bothPreservedOracleAndIdentity = Boolean(
    lagrangeReport.oracleAndIdentityPreserved && tidbReport.oracleAndIdentityPreserved,
  );
  const comparable = Boolean(
    lagrangeReport.comparable && tidbReport.comparable && bothPreservedOracleAndIdentity,
  );
  const nonComparableReason = comparable ?
    '' :
    (lagrangeReport.nonComparableReason ||
       tidbReport.nonComparableReason ||
       'movement subphase not comparable');

  return {bothPreservedOracleAndIdentity, comparable, nonComparableReason};
}

function computeResilienceRatios(lagrangeReport, tidbReport) {
  const duringMoveP99ReductionRatio =
    lagrangeReport.duringMoveP99Ms > 0 ?
      tidbReport.duringMoveP99Ms / lagrangeReport.duringMoveP99Ms :
      0;

  const convergenceTimeSpeedupRatio =
    lagrangeReport.routingConvergenceMs > 0 ?
      tidbReport.routingConvergenceMs / lagrangeReport.routingConvergenceMs :
      0;

  return {duringMoveP99ReductionRatio, convergenceTimeSpeedupRatio};
}

export function compareScenarioBMovementResilience(options = {}) {
  const {lagrangeReport, tidbReport} = options;
  validateComparisonReports(lagrangeReport, tidbReport);

  const {
    bothPreservedOracleAndIdentity,
    comparable,
    nonComparableReason,
  } = evaluateComparisonComparability(lagrangeReport, tidbReport);

  const {
    duringMoveP99ReductionRatio,
    convergenceTimeSpeedupRatio,
  } = computeResilienceRatios(lagrangeReport, tidbReport);

  const staleRedirectDelta =
    tidbReport.staleRouteRedirectCount - lagrangeReport.staleRouteRedirectCount;

  const colocationAdvantage =
    lagrangeReport.automaticServiceColocationConverged === true &&
    tidbReport.externalCoordinatorReconfigRequired === true;

  return Object.freeze({
    comparable,
    nonComparableReason,
    bothPreservedOracleAndIdentity,
    duringMoveP99ReductionRatio,
    convergenceTimeSpeedupRatio,
    staleRedirectDelta,
    colocationAdvantage,
    lagrange: lagrangeReport,
    tidb: tidbReport,
  });
}
