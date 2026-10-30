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

export function createScenarioBMovementPlan(options = {}) {
  const {
    partitionKey = 'partition-risk-07',
    sourceNodeId = 'node-1',
    sourceGroup = 'island-a',
    targetNodeId = 'node-3',
    targetGroup = 'island-b',
    replicaBytesToMove = 4194304,
    preMoveRequests = 24,
    duringMoveRequests = 24,
    postMoveRequests = 24,
    serviceIdentity = 'svc://risk-decision/partition-risk-07',
  } = options;

  if (sourceNodeId === targetNodeId) {
    throw new RangeError(`sourceNodeId and targetNodeId must differ: got "${sourceNodeId}"`);
  }
  if (typeof replicaBytesToMove !== 'number' || replicaBytesToMove <= 0) {
    throw new RangeError(`replicaBytesToMove must be a positive number: got ${replicaBytesToMove}`);
  }

  const samples = [];
  const addPhaseSamples = (count, phase) => {
    for (let i = 0; i < count; i += 1) {
      arrayPush(samples, Object.freeze({
        requestIndex: samples.length,
        phase,
        partitionKey,
        expectedServiceIdentity: serviceIdentity,
      }));
    }
  };

  addPhaseSamples(preMoveRequests, SCENARIO_B_MOVEMENT_PHASE.PRE_MOVE_STEADY);
  addPhaseSamples(duringMoveRequests, SCENARIO_B_MOVEMENT_PHASE.DURING_MOVE);
  addPhaseSamples(postMoveRequests, SCENARIO_B_MOVEMENT_PHASE.POST_MOVE_CONVERGED);

  return Object.freeze({
    partitionKey,
    sourceNodeId,
    sourceGroup,
    targetNodeId,
    targetGroup,
    crossIslandMove: sourceGroup !== targetGroup,
    replicaBytesToMove,
    serviceIdentity,
    preMoveRequests,
    duringMoveRequests,
    postMoveRequests,
    totalRequests: preMoveRequests + duringMoveRequests + postMoveRequests,
    samples: Object.freeze(samples),
  });
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

  if (!movementPlan || typeof movementPlan !== 'object') {
    throw new TypeError('movementPlan must be an object');
  }

  const effectiveSamples = options.samples !== undefined ? options.samples : movementPlan.samples;
  if (!Array.isArray(effectiveSamples) || effectiveSamples.length === 0) {
    throw new RangeError('samples must be a non-empty array');
  }

  const preMoveLatencies = [];
  const duringMoveLatencies = [];
  const postMoveLatencies = [];
  let failedRequestCount = 0;
  let staleRouteRedirectCount = 0;
  let oracleMismatchCount = 0;
  let serviceIdentityBreakCount = 0;

  for (let i = 0; i < effectiveSamples.length; i += 1) {
    const s = effectiveSamples[i];
    const latency = typeof s.latencyMs === 'number' ? s.latencyMs : Number(s.latencyMs ?? 0);
    const ok = s.ok ?? true;
    const sampleRedirects = Number(s.staleRouteRedirectCount ?? 0);
    const oracleMatch = s.oracleMatch ?? true;
    const serviceIdentityPreserved = s.serviceIdentityPreserved ?? true;

    if (s.phase === SCENARIO_B_MOVEMENT_PHASE.PRE_MOVE_STEADY) {
      arrayPush(preMoveLatencies, latency);
    } else if (s.phase === SCENARIO_B_MOVEMENT_PHASE.DURING_MOVE) {
      arrayPush(duringMoveLatencies, latency);
    } else if (s.phase === SCENARIO_B_MOVEMENT_PHASE.POST_MOVE_CONVERGED) {
      arrayPush(postMoveLatencies, latency);
    }

    if (ok !== true) failedRequestCount += 1;
    staleRouteRedirectCount += sampleRedirects;
    if (oracleMatch !== true) oracleMismatchCount += 1;
    if (serviceIdentityPreserved !== true) serviceIdentityBreakCount += 1;
  }

  arraySort(preMoveLatencies, (a, b) => a - b);
  arraySort(duringMoveLatencies, (a, b) => a - b);
  arraySort(postMoveLatencies, (a, b) => a - b);

  const preMoveP99Ms = computePercentile(preMoveLatencies, 99);
  const duringMoveP99Ms = computePercentile(duringMoveLatencies, 99);
  const postMoveP99Ms = computePercentile(postMoveLatencies, 99);
  const p99SpikeRatio = preMoveP99Ms > 0 ? duringMoveP99Ms / preMoveP99Ms : 1;
  const p99SpikeDeltaMs = Math.max(0, duringMoveP99Ms - preMoveP99Ms);

  const oracleAndIdentityPreserved =
    failedRequestCount === 0 && oracleMismatchCount === 0 && serviceIdentityBreakCount === 0;

  const comparable = timingSource === 'observed' && oracleAndIdentityPreserved;
  const nonComparableReason = comparable ?
    '' :
    (timingSource !== 'observed' ?
      'non-live movement subphase contract model' :
      'oracle or service identity violation during movement');

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

export function compareScenarioBMovementResilience(options = {}) {
  const {lagrangeReport, tidbReport} = options;
  if (!lagrangeReport || typeof lagrangeReport !== 'object') {
    throw new TypeError('lagrangeReport must be an object');
  }
  if (!tidbReport || typeof tidbReport !== 'object') {
    throw new TypeError('tidbReport must be an object');
  }

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

  const duringMoveP99ReductionRatio =
    lagrangeReport.duringMoveP99Ms > 0 ?
      tidbReport.duringMoveP99Ms / lagrangeReport.duringMoveP99Ms :
      0;

  const convergenceTimeSpeedupRatio =
    lagrangeReport.routingConvergenceMs > 0 ?
      tidbReport.routingConvergenceMs / lagrangeReport.routingConvergenceMs :
      0;

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
