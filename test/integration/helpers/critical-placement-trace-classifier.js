// Stage classifier for the S6a critical-placement causal trace
// (quest critical-placement-causal-trace). PURE: it reads a recorded sample
// sequence and answers which stages of the placement-convergence chain were
// reached and which transition is the FIRST that never occurred. The live
// trace is timing-dependent; this classifier is not, and its witness pins
// that on replayed fixtures.
//
// A stage is REACHED when its predicate holds in any sample. 'Slow' is not a
// missing transition: a stage reached late is recorded with its first-reached
// timestamp. Only a stage that never holds inside the trace budget is
// missing, and the first such stage - given its predecessor was reached - is
// the deliverable.

const TRACE_STAGE = Object.freeze({
  AUTHORITY_KNOWN: 'authority_known',
  DEFICIT_MEASURED: 'deficit_measured',
  OPERATION_RECORDED: 'operation_recorded',
  OPERATION_PROGRESSED: 'operation_progressed',
  REPLICA_APPEARED: 'replica_appeared',
  VOTER_ON_NEW_NODE: 'voter_on_new_node',
  HOLDERS_ADVANCED: 'holders_advanced',
  CONVERGED: 'converged',
  STABILIZED: 'stabilized',
});

const TRACE_STAGE_ORDER = Object.freeze([
  TRACE_STAGE.AUTHORITY_KNOWN,
  TRACE_STAGE.DEFICIT_MEASURED,
  TRACE_STAGE.OPERATION_RECORDED,
  TRACE_STAGE.OPERATION_PROGRESSED,
  TRACE_STAGE.REPLICA_APPEARED,
  TRACE_STAGE.VOTER_ON_NEW_NODE,
  TRACE_STAGE.HOLDERS_ADVANCED,
  TRACE_STAGE.CONVERGED,
  TRACE_STAGE.STABILIZED,
]);

// The owner of the TRANSITION INTO each stage: where the repair conversation
// starts when the arrow into that stage is the missing one. Modules, not
// people; the interaction boundaries follow the epic owner map.
const TRACE_STAGE_OWNER = Object.freeze({
  [TRACE_STAGE.AUTHORITY_KNOWN]:
    'src/bootstrap/replication-target-authority.js',
  [TRACE_STAGE.DEFICIT_MEASURED]:
    'src/bootstrap/critical-placement-convergence.js',
  [TRACE_STAGE.OPERATION_RECORDED]:
    'src/rebalancer/unified-rebalancer-rebalance-loop.js -> ' +
    'src/rebalancer/rebalance-coordinator.js (planning/admission boundary)',
  [TRACE_STAGE.OPERATION_PROGRESSED]:
    'src/rebalancer/operation-workflow-dispatch-response-reconcile.js',
  [TRACE_STAGE.REPLICA_APPEARED]:
    'src/node/replica-lifecycle-manager.js',
  [TRACE_STAGE.VOTER_ON_NEW_NODE]:
    'src/partition/partition-service-learner-promotion-methods.js',
  [TRACE_STAGE.HOLDERS_ADVANCED]:
    'src/node/replica-handler-lifecycle-methods.js (holder metadata commit)',
  [TRACE_STAGE.CONVERGED]:
    'src/bootstrap/critical-placement-convergence.js',
  [TRACE_STAGE.STABILIZED]:
    'src/bootstrap/critical-placement-convergence.js (across samples)',
});

const EVIDENCE_STATE = Object.freeze({
  KNOWN_CONVERGED: 'known_converged',
  KNOWN_NOT_CONVERGED: 'known_not_converged',
});
const PARTITION_ROW_SOURCE = 'partition_row_replica_count';
const ADD_LIKE_TYPES = Object.freeze(['ADD', 'REPLACE']);
const STABLE_TAIL_SAMPLES = 3;

function isAddLikeOperationRow(row) {
  return ADD_LIKE_TYPES.includes(String(row?.type || '').toUpperCase());
}

function stagePredicates(baseline) {
  // The baseline IS a sample: holder facts live under .placement exactly as
  // in every later sample, so the predicates read one shape, not two.
  const baselineHolderSet = new Set(
    baseline.placement?.distinctNodeIds || []);
  const baselineReplicaIds = new Set(
    (baseline.serviceRows || []).map((row) => row.replica_id),
  );
  const baselineOperationIds = new Set(
    (baseline.operations || []).map((row) => row.operation_id),
  );
  const operationShape = new Map();
  return {
    [TRACE_STAGE.AUTHORITY_KNOWN]: (sample) =>
      sample.placement?.requiredReplicaCountSource === PARTITION_ROW_SOURCE,
    [TRACE_STAGE.DEFICIT_MEASURED]: (sample) =>
      sample.placement?.evidenceState === EVIDENCE_STATE.KNOWN_NOT_CONVERGED,
    [TRACE_STAGE.OPERATION_RECORDED]: (sample) =>
      (sample.operations || []).some((row) =>
        isAddLikeOperationRow(row) &&
        !baselineOperationIds.has(row.operation_id)),
    [TRACE_STAGE.OPERATION_PROGRESSED]: (sample) =>
      (sample.operations || []).some((row) => {
        if (!isAddLikeOperationRow(row) ||
            baselineOperationIds.has(row.operation_id)) {
          return false;
        }
        const shape = `${row.status}|${row.workflow_step}`;
        const seen = operationShape.get(row.operation_id);
        operationShape.set(row.operation_id, shape);
        return (seen !== undefined && seen !== shape) ||
          row.completed_at != null;
      }),
    [TRACE_STAGE.REPLICA_APPEARED]: (sample) =>
      (sample.serviceRows || []).some((row) =>
        !baselineReplicaIds.has(row.replica_id)),
    [TRACE_STAGE.VOTER_ON_NEW_NODE]: (sample) =>
      (sample.placement?.distinctNodeIds || []).some((nodeId) =>
        !baselineHolderSet.has(nodeId)),
    [TRACE_STAGE.HOLDERS_ADVANCED]: (sample) =>
      (sample.placement?.distinctNodeCount || 0) >
        (baseline.placement?.distinctNodeCount || 0),
    [TRACE_STAGE.CONVERGED]: (sample) =>
      sample.placement?.evidenceState === EVIDENCE_STATE.KNOWN_CONVERGED,
    [TRACE_STAGE.STABILIZED]: null, // computed over the tail, below
  };
}

/**
 * Classify one partition's recorded sample sequence into the stage table.
 *
 * @param {Object} options
 * @param {Object} options.baseline first sample (defines holder/replica base)
 * @param {Object[]} options.samples ordered samples including the baseline
 * @return {Object} {stages: [{stage, reached, firstReachedAtMs, owner}],
 *   firstMissingStage|null, firstMissingOwner|null, note}
 */
function walkFirstReachedStages(samples, predicates) {
  const firstReached = new Map();
  for (const sample of samples) {
    for (const stage of TRACE_STAGE_ORDER) {
      const predicate = predicates[stage];
      if (predicate === null || firstReached.has(stage)) {
        continue;
      }
      if (predicate(sample)) {
        firstReached.set(stage, sample.atMs);
      }
    }
  }
  // STABILIZED: the final STABLE_TAIL_SAMPLES samples all converged.
  const tail = samples.slice(-STABLE_TAIL_SAMPLES);
  if (tail.length === STABLE_TAIL_SAMPLES && tail.every((sample) =>
    sample.placement?.evidenceState === EVIDENCE_STATE.KNOWN_CONVERGED)) {
    firstReached.set(TRACE_STAGE.STABILIZED, tail[0].atMs);
  }
  return firstReached;
}

// A partition that reached CONVERGED needed no particular pre-convergence
// arrow: the only stage that can still be missing is STABILIZED (a flapping
// tail). A partition that never converged names the FIRST unreached stage in
// chain order - every stage before it was reached by construction of the
// walk, so that unreached stage IS the first missing arrow.
function resolveFirstMissingStage(firstReached, stages) {
  if (firstReached.has(TRACE_STAGE.CONVERGED)) {
    return firstReached.has(TRACE_STAGE.STABILIZED) ?
      null :
      TRACE_STAGE.STABILIZED;
  }
  const unreached = stages.find((entry) => !entry.reached);
  return unreached ? unreached.stage : null;
}

function classifyPlacementTrace(options) {
  const baseline = options.baseline;
  const samples = options.samples || [];
  const firstReached = walkFirstReachedStages(
    samples, stagePredicates(baseline));
  const stages = TRACE_STAGE_ORDER.map((stage) => ({
    stage,
    reached: firstReached.has(stage),
    firstReachedAtMs: firstReached.get(stage) ?? null,
    owner: TRACE_STAGE_OWNER[stage],
  }));
  const firstMissingStage = resolveFirstMissingStage(firstReached, stages);
  return Object.freeze({
    stages: Object.freeze(stages),
    firstMissingStage,
    firstMissingOwner: firstMissingStage ?
      TRACE_STAGE_OWNER[firstMissingStage] :
      null,
    note: firstMissingStage === null ?
      'every transition occurred inside the trace budget' :
      `first missing transition enters ${firstMissingStage}`,
  });
}

/**
 * The A/B comparison the epic asks for: where each lane stopped, and which
 * of the three diagnostic shapes the pair matches.
 *
 * @param {Object} criticalResult classifyPlacementTrace for the critical lane
 * @param {Object} ordinaryResult classifyPlacementTrace for the control lane
 * @return {Object} frozen {shape, detail}
 */
function comparePlacementTraces(criticalResult, ordinaryResult) {
  const criticalMissing = criticalResult.firstMissingStage;
  const ordinaryMissing = ordinaryResult.firstMissingStage;
  if (criticalMissing === null && ordinaryMissing === null) {
    return Object.freeze({
      shape: 'both_complete',
      detail: 'both lanes completed every transition',
    });
  }
  if (criticalMissing !== null && ordinaryMissing !== null &&
      criticalMissing === ordinaryMissing) {
    return Object.freeze({
      shape: 'common_stage_stall',
      detail: `both lanes stop entering ${criticalMissing}: a common ` +
        'placement/move lifecycle problem, not critical classification',
    });
  }
  if (criticalMissing !== null && ordinaryMissing === null) {
    return Object.freeze({
      shape: 'critical_stops_earlier',
      detail: 'ordinary completes while critical stops entering ' +
        `${criticalMissing}: a critical classification/eligibility/boundary ` +
        'problem, or scheduler starvation if the critical move exists',
    });
  }
  if (criticalMissing === null && ordinaryMissing !== null) {
    return Object.freeze({
      shape: 'ordinary_stops_critical_completes',
      detail: 'critical completes while ordinary stops entering ' +
        `${ordinaryMissing}`,
    });
  }
  return Object.freeze({
    shape: 'different_stages',
    detail: `critical stops entering ${criticalMissing}, ordinary stops ` +
      `entering ${ordinaryMissing}`,
  });
}

export {
  TRACE_STAGE,
  TRACE_STAGE_ORDER,
  TRACE_STAGE_OWNER,
  classifyPlacementTrace,
  comparePlacementTraces,
};
