import {basename} from 'node:path';

const TOPOLOGY_FAILURE_GATE_TYPEOF_STRING = 'string';
const TOPOLOGY_FAILURE_GATE_TEXT_EMPTY = '';
const TOPOLOGY_FAILURE_GATE_FIELD_SEPARATOR = '|';
const TOPOLOGY_FAILURE_GATE_ZERO = 0;
const TOPOLOGY_FAILURE_GATE_EMPTY_LIST = Object.freeze([]);

const TOPOLOGY_FAILURE_GATE_CONFIG = Object.freeze({
  LOCAL: 'local.json',
  LOCAL_THREE_NODE: 'local-three-node.json',
  LOCAL_BENCHMARK_7NODE: 'local-benchmark-7node.json',
});

const TOPOLOGY_FAILURE_GATE_SCENARIO = Object.freeze({
  NODE_JOIN_UNDER_LOAD: 'node-join-under-load',
  ROLLING_RESTART: 'rolling-restart',
  SEED_RESTART_UNDER_LOAD: 'seed-restart-under-load',
  SEVEN_NODE_LOAD_DURING_PARTITIONING:
    'seven-node-load-during-partitioning',
  SEVEN_NODE_READ_WRITE_LOAD_TRANSACTION_RECOVERY:
    'seven-node-read-write-load-transaction-recovery',
  WRITE_ACK_VISIBILITY: 'write-ack-visibility',
});

const TOPOLOGY_FAILURE_GATE_DIMENSION = Object.freeze({
  FAILURE_DETECTION: 'failure_detection',
  JOIN: 'join',
  REBALANCE_DISRUPTION: 'rebalance_disruption',
  REJOIN: 'rejoin',
  REMOTE_HANDOFF: 'remote_handoff',
  STALE_PUBLICATION: 'stale_publication',
});

const REQUIRED_TOPOLOGY_FAILURE_GATE_DIMENSIONS = Object.freeze([
  TOPOLOGY_FAILURE_GATE_DIMENSION.FAILURE_DETECTION,
  TOPOLOGY_FAILURE_GATE_DIMENSION.JOIN,
  TOPOLOGY_FAILURE_GATE_DIMENSION.REJOIN,
  TOPOLOGY_FAILURE_GATE_DIMENSION.REMOTE_HANDOFF,
  TOPOLOGY_FAILURE_GATE_DIMENSION.STALE_PUBLICATION,
  TOPOLOGY_FAILURE_GATE_DIMENSION.REBALANCE_DISRUPTION,
]);

const TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM = Object.freeze({
  ADVANCE: 'advance',
  BOUNDED_PROGRESS: 'bounded progress',
  DELIVERY: 'delivery',
  DISPATCH: 'dispatch',
  DRAIN: 'drain',
  RECONCILE: 'reconcile',
  RETRY: 'retry',
  TIMEOUT: 'timeout',
  TIMER: 'timer',
  WAKE: 'wake',
});

const TOPOLOGY_FAILURE_GATE_BOUNDED_PROGRESS_MECHANISMS = Object.freeze([
  TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.WAKE,
  TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.RETRY,
  TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.TIMEOUT,
  TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.RECONCILE,
  TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.DRAIN,
  TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.DISPATCH,
  TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.DELIVERY,
  TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.TIMER,
  TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.ADVANCE,
  TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.BOUNDED_PROGRESS,
]);

const TOPOLOGY_FAILURE_GATE_BOUNDED_PROGRESS_MECHANISM_SET =
  Object.freeze(new Set(TOPOLOGY_FAILURE_GATE_BOUNDED_PROGRESS_MECHANISMS));

const TOPOLOGY_FAILURE_GATE_OWNER = Object.freeze({
  OPERATION_WORKFLOW_OWNER: 'operation_workflow_owner',
  TOPOLOGY_CONTROL_PLANE: 'topology_control_plane',
  TOPOLOGY_JOIN_OWNER: 'topology_join_owner',
  TOPOLOGY_PUBLICATION_OWNER: 'topology_publication_owner',
  TOPOLOGY_REBALANCE_OWNER: 'topology_rebalance_owner',
  TOPOLOGY_REJOIN_OWNER: 'topology_rejoin_owner',
});

const TOPOLOGY_FAILURE_GATE_BOUNDARY = Object.freeze({
  FAILURE_DETECTION_REPAIR_INTENT: 'failure_detection_repair_intent',
  JOIN_ADMISSION_REBALANCE: 'join_admission_rebalance',
  POST_RESTORE_RECONCILIATION: 'post_restore_reconciliation',
  PUBLICATION_TRUTH_AHEAD_OF_PROJECTION:
    'publication_truth_ahead_of_projection',
  REMOTE_HANDOFF_ACK_CLOSURE: 'remote_handoff_ack_closure',
  REPLICA_OPERATION_COORDINATOR_HANDOFF:
    'replica_operation_coordinator_handoff',
  SPLIT_REBALANCE_DURING_RECOVERY: 'split_rebalance_during_recovery',
});

const TOPOLOGY_FAILURE_GATE_EPOCH_FENCE = Object.freeze({
  DESCRIPTOR_EPOCH_REQUIRED: 'descriptor_epoch_required',
  MEMBERSHIP_EPOCH_REQUIRED: 'membership_epoch_required',
  OPERATION_EPOCH_REQUIRED: 'operation_epoch_required',
  PUBLICATION_EPOCH_REQUIRED: 'publication_epoch_required',
});

const TOPOLOGY_FAILURE_GATE_OUTCOME = Object.freeze({
  DURABLE_ACKED_WRITE_TRUTH_OUTRANKS_STALE_PUBLICATION_PROJECTION:
    'durable_acked_write_truth_outranks_stale_publication_projection',
  IN_FLIGHT_COORDINATOR_HANDOFF_REACHES_TERMINAL_WORKFLOW_STATUS:
    'in_flight_coordinator_handoff_reaches_terminal_workflow_status',
  JOINING_MEMBER_ADMITTED_OR_FENCED_DURABLY:
    'joining_member_admitted_or_fenced_durably',
  MISSED_HANDOFF_ACK_RETRIED_BEFORE_PUBLICATION_CLOSES:
    'missed_handoff_ack_retried_before_publication_closes',
  NODE_LIFECYCLE_REPAIR_INTENT_RECONCILED:
    'node_lifecycle_repair_intent_reconciled',
  REJOINED_MEMBER_VALIDATED_AGAINST_DURABLE_TOPOLOGY:
    'rejoined_member_validated_against_durable_topology',
  SPLIT_REBALANCE_DRAINS_AND_CONVERGES_DURABLE_PLACEMENT:
    'split_rebalance_drains_and_converges_durable_placement',
});

const TOPOLOGY_FAILURE_GATE_REASON = Object.freeze({
  ACK_EXPECTED: 'ack_expected',
  ACTIVE_ADMISSION_FENCED: 'active_admission_fenced',
  ACTIVE_MEMBERSHIP_RECONCILED: 'active_membership_reconciled',
  ADMISSION_FENCED_BY_EPOCH: 'admission_fenced_by_epoch',
  DELIVERY_RETRIED: 'delivery_retried',
  DURABLE_REPAIR_INTENT_RECORDED: 'durable_repair_intent_recorded',
  DURABLE_WRITE_ACKED: 'durable_write_acked',
  HANDOFF_REPLAY_DURABLE: 'handoff_replay_durable',
  JOIN_INTENT_DURABLE: 'join_intent_durable',
  LOCAL_SERVICES_RECONCILED: 'local_services_reconciled',
  NODE_FAILURE_DETECTED: 'node_failure_detected',
  PLACEMENT_EPOCH_FENCED: 'placement_epoch_fenced',
  PROJECTION_RECONCILED: 'projection_reconciled',
  PUBLICATION_CLOSURE_FENCED: 'publication_closure_fenced',
  REBALANCE_DRAIN_CLOSED: 'rebalance_drain_closed',
  REBALANCE_RECONCILED: 'rebalance_reconciled',
  REMOTE_COORDINATOR_LOST: 'remote_coordinator_lost',
  RESTORED_MEMBER_REDISCOVERED: 'restored_member_rediscovered',
  SPLIT_INTENT_DURABLE: 'split_intent_durable',
  STALE_PROJECTION_DETECTED: 'stale_projection_detected',
  WORKFLOW_TERMINAL_STATE: 'workflow_terminal_state',
});

const TOPOLOGY_FAILURE_GATE_MATRIX = Object.freeze([
  Object.freeze({
    gateId: 'failure-detection-rolling-restart',
    dimension: TOPOLOGY_FAILURE_GATE_DIMENSION.FAILURE_DETECTION,
    config: TOPOLOGY_FAILURE_GATE_CONFIG.LOCAL_THREE_NODE,
    scenario: TOPOLOGY_FAILURE_GATE_SCENARIO.ROLLING_RESTART,
    owner: TOPOLOGY_FAILURE_GATE_OWNER.TOPOLOGY_CONTROL_PLANE,
    boundary: TOPOLOGY_FAILURE_GATE_BOUNDARY.FAILURE_DETECTION_REPAIR_INTENT,
    expectedDurableOutcome:
      TOPOLOGY_FAILURE_GATE_OUTCOME.NODE_LIFECYCLE_REPAIR_INTENT_RECONCILED,
    expectedOwnerReasons: Object.freeze([
      TOPOLOGY_FAILURE_GATE_REASON.NODE_FAILURE_DETECTED,
      TOPOLOGY_FAILURE_GATE_REASON.DURABLE_REPAIR_INTENT_RECORDED,
      TOPOLOGY_FAILURE_GATE_REASON.ACTIVE_MEMBERSHIP_RECONCILED,
    ]),
    boundedProgressMechanisms: Object.freeze([
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.WAKE,
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.TIMEOUT,
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.RECONCILE,
    ]),
    fencingRequirement:
      TOPOLOGY_FAILURE_GATE_EPOCH_FENCE.MEMBERSHIP_EPOCH_REQUIRED,
  }),
  Object.freeze({
    gateId: 'join-killed-node-under-load',
    dimension: TOPOLOGY_FAILURE_GATE_DIMENSION.JOIN,
    config: TOPOLOGY_FAILURE_GATE_CONFIG.LOCAL,
    scenario: TOPOLOGY_FAILURE_GATE_SCENARIO.NODE_JOIN_UNDER_LOAD,
    owner: TOPOLOGY_FAILURE_GATE_OWNER.TOPOLOGY_JOIN_OWNER,
    boundary: TOPOLOGY_FAILURE_GATE_BOUNDARY.JOIN_ADMISSION_REBALANCE,
    expectedDurableOutcome:
      TOPOLOGY_FAILURE_GATE_OUTCOME.JOINING_MEMBER_ADMITTED_OR_FENCED_DURABLY,
    expectedOwnerReasons: Object.freeze([
      TOPOLOGY_FAILURE_GATE_REASON.JOIN_INTENT_DURABLE,
      TOPOLOGY_FAILURE_GATE_REASON.ADMISSION_FENCED_BY_EPOCH,
      TOPOLOGY_FAILURE_GATE_REASON.REBALANCE_RECONCILED,
    ]),
    boundedProgressMechanisms: Object.freeze([
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.RETRY,
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.DISPATCH,
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.RECONCILE,
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.TIMEOUT,
    ]),
    fencingRequirement:
      TOPOLOGY_FAILURE_GATE_EPOCH_FENCE.MEMBERSHIP_EPOCH_REQUIRED,
  }),
  Object.freeze({
    gateId: 'rejoin-killed-seed-under-load',
    dimension: TOPOLOGY_FAILURE_GATE_DIMENSION.REJOIN,
    config: TOPOLOGY_FAILURE_GATE_CONFIG.LOCAL,
    scenario: TOPOLOGY_FAILURE_GATE_SCENARIO.SEED_RESTART_UNDER_LOAD,
    owner: TOPOLOGY_FAILURE_GATE_OWNER.TOPOLOGY_REJOIN_OWNER,
    boundary: TOPOLOGY_FAILURE_GATE_BOUNDARY.POST_RESTORE_RECONCILIATION,
    expectedDurableOutcome:
      TOPOLOGY_FAILURE_GATE_OUTCOME
        .REJOINED_MEMBER_VALIDATED_AGAINST_DURABLE_TOPOLOGY,
    expectedOwnerReasons: Object.freeze([
      TOPOLOGY_FAILURE_GATE_REASON.RESTORED_MEMBER_REDISCOVERED,
      TOPOLOGY_FAILURE_GATE_REASON.LOCAL_SERVICES_RECONCILED,
      TOPOLOGY_FAILURE_GATE_REASON.ACTIVE_ADMISSION_FENCED,
    ]),
    boundedProgressMechanisms: Object.freeze([
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.WAKE,
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.RETRY,
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.RECONCILE,
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.TIMEOUT,
    ]),
    fencingRequirement:
      TOPOLOGY_FAILURE_GATE_EPOCH_FENCE.MEMBERSHIP_EPOCH_REQUIRED,
  }),
  Object.freeze({
    gateId: 'remote-handoff-replica-operation-coordinator',
    dimension: TOPOLOGY_FAILURE_GATE_DIMENSION.REMOTE_HANDOFF,
    config: TOPOLOGY_FAILURE_GATE_CONFIG.LOCAL_BENCHMARK_7NODE,
    scenario:
      TOPOLOGY_FAILURE_GATE_SCENARIO
        .SEVEN_NODE_READ_WRITE_LOAD_TRANSACTION_RECOVERY,
    owner: TOPOLOGY_FAILURE_GATE_OWNER.OPERATION_WORKFLOW_OWNER,
    boundary:
      TOPOLOGY_FAILURE_GATE_BOUNDARY.REPLICA_OPERATION_COORDINATOR_HANDOFF,
    expectedDurableOutcome:
      TOPOLOGY_FAILURE_GATE_OUTCOME
        .IN_FLIGHT_COORDINATOR_HANDOFF_REACHES_TERMINAL_WORKFLOW_STATUS,
    expectedOwnerReasons: Object.freeze([
      TOPOLOGY_FAILURE_GATE_REASON.REMOTE_COORDINATOR_LOST,
      TOPOLOGY_FAILURE_GATE_REASON.HANDOFF_REPLAY_DURABLE,
      TOPOLOGY_FAILURE_GATE_REASON.WORKFLOW_TERMINAL_STATE,
    ]),
    boundedProgressMechanisms: Object.freeze([
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.DRAIN,
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.DISPATCH,
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.DELIVERY,
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.TIMEOUT,
    ]),
    fencingRequirement:
      TOPOLOGY_FAILURE_GATE_EPOCH_FENCE.OPERATION_EPOCH_REQUIRED,
  }),
  Object.freeze({
    gateId: 'remote-handoff-missed-ack',
    dimension: TOPOLOGY_FAILURE_GATE_DIMENSION.REMOTE_HANDOFF,
    config: TOPOLOGY_FAILURE_GATE_CONFIG.LOCAL_THREE_NODE,
    scenario: TOPOLOGY_FAILURE_GATE_SCENARIO.WRITE_ACK_VISIBILITY,
    owner: TOPOLOGY_FAILURE_GATE_OWNER.TOPOLOGY_PUBLICATION_OWNER,
    boundary: TOPOLOGY_FAILURE_GATE_BOUNDARY.REMOTE_HANDOFF_ACK_CLOSURE,
    expectedDurableOutcome:
      TOPOLOGY_FAILURE_GATE_OUTCOME
        .MISSED_HANDOFF_ACK_RETRIED_BEFORE_PUBLICATION_CLOSES,
    expectedOwnerReasons: Object.freeze([
      TOPOLOGY_FAILURE_GATE_REASON.ACK_EXPECTED,
      TOPOLOGY_FAILURE_GATE_REASON.DELIVERY_RETRIED,
      TOPOLOGY_FAILURE_GATE_REASON.PUBLICATION_CLOSURE_FENCED,
    ]),
    boundedProgressMechanisms: Object.freeze([
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.RETRY,
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.DELIVERY,
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.TIMER,
    ]),
    fencingRequirement:
      TOPOLOGY_FAILURE_GATE_EPOCH_FENCE.PUBLICATION_EPOCH_REQUIRED,
  }),
  Object.freeze({
    gateId: 'stale-publication-durable-truth-ahead',
    dimension: TOPOLOGY_FAILURE_GATE_DIMENSION.STALE_PUBLICATION,
    config: TOPOLOGY_FAILURE_GATE_CONFIG.LOCAL_THREE_NODE,
    scenario: TOPOLOGY_FAILURE_GATE_SCENARIO.WRITE_ACK_VISIBILITY,
    owner: TOPOLOGY_FAILURE_GATE_OWNER.TOPOLOGY_PUBLICATION_OWNER,
    boundary:
      TOPOLOGY_FAILURE_GATE_BOUNDARY.PUBLICATION_TRUTH_AHEAD_OF_PROJECTION,
    expectedDurableOutcome:
      TOPOLOGY_FAILURE_GATE_OUTCOME
        .DURABLE_ACKED_WRITE_TRUTH_OUTRANKS_STALE_PUBLICATION_PROJECTION,
    expectedOwnerReasons: Object.freeze([
      TOPOLOGY_FAILURE_GATE_REASON.DURABLE_WRITE_ACKED,
      TOPOLOGY_FAILURE_GATE_REASON.STALE_PROJECTION_DETECTED,
      TOPOLOGY_FAILURE_GATE_REASON.PROJECTION_RECONCILED,
    ]),
    boundedProgressMechanisms: Object.freeze([
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.ADVANCE,
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.RECONCILE,
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.TIMEOUT,
    ]),
    fencingRequirement:
      TOPOLOGY_FAILURE_GATE_EPOCH_FENCE.PUBLICATION_EPOCH_REQUIRED,
  }),
  Object.freeze({
    gateId: 'rebalance-disruption-split-during-recovery',
    dimension: TOPOLOGY_FAILURE_GATE_DIMENSION.REBALANCE_DISRUPTION,
    config: TOPOLOGY_FAILURE_GATE_CONFIG.LOCAL_BENCHMARK_7NODE,
    scenario:
      TOPOLOGY_FAILURE_GATE_SCENARIO.SEVEN_NODE_LOAD_DURING_PARTITIONING,
    owner: TOPOLOGY_FAILURE_GATE_OWNER.TOPOLOGY_REBALANCE_OWNER,
    boundary: TOPOLOGY_FAILURE_GATE_BOUNDARY.SPLIT_REBALANCE_DURING_RECOVERY,
    expectedDurableOutcome:
      TOPOLOGY_FAILURE_GATE_OUTCOME
        .SPLIT_REBALANCE_DRAINS_AND_CONVERGES_DURABLE_PLACEMENT,
    expectedOwnerReasons: Object.freeze([
      TOPOLOGY_FAILURE_GATE_REASON.SPLIT_INTENT_DURABLE,
      TOPOLOGY_FAILURE_GATE_REASON.PLACEMENT_EPOCH_FENCED,
      TOPOLOGY_FAILURE_GATE_REASON.REBALANCE_DRAIN_CLOSED,
    ]),
    boundedProgressMechanisms: Object.freeze([
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.DRAIN,
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.DISPATCH,
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.RECONCILE,
      TOPOLOGY_FAILURE_GATE_PROGRESS_MECHANISM.BOUNDED_PROGRESS,
    ]),
    fencingRequirement:
      TOPOLOGY_FAILURE_GATE_EPOCH_FENCE.DESCRIPTOR_EPOCH_REQUIRED,
  }),
]);

function normalizeTopologyFailureGateConfigName(configPathOrName) {
  if (typeof configPathOrName !== TOPOLOGY_FAILURE_GATE_TYPEOF_STRING) {
    return null;
  }
  const normalized = basename(configPathOrName).trim();
  return normalized.length > TOPOLOGY_FAILURE_GATE_ZERO ?
    normalized :
    null;
}

function listTopologyFailureGateEntries(configPathOrName = null) {
  const configName = normalizeTopologyFailureGateConfigName(configPathOrName);
  return configName ?
    TOPOLOGY_FAILURE_GATE_MATRIX.filter((entry) => entry.config === configName) :
    [...TOPOLOGY_FAILURE_GATE_MATRIX];
}

function listRequiredTopologyFailureGateDimensions() {
  return [...REQUIRED_TOPOLOGY_FAILURE_GATE_DIMENSIONS];
}

function hasTopologyFailureGateBoundedProgressMechanism(entry) {
  const mechanisms = Array.isArray(entry?.boundedProgressMechanisms) ?
    entry.boundedProgressMechanisms :
    TOPOLOGY_FAILURE_GATE_EMPTY_LIST;
  return mechanisms.some((mechanism) =>
    TOPOLOGY_FAILURE_GATE_BOUNDED_PROGRESS_MECHANISM_SET.has(mechanism));
}

function buildTopologyFailureGateCoverageSnapshot() {
  const gatesByDimension = new Map(
    REQUIRED_TOPOLOGY_FAILURE_GATE_DIMENSIONS.map((dimension) => [
      dimension,
      [],
    ]),
  );
  for (const entry of TOPOLOGY_FAILURE_GATE_MATRIX) {
    const gateIds = gatesByDimension.get(entry.dimension) || [];
    gateIds.push(entry.gateId);
    gatesByDimension.set(entry.dimension, gateIds);
  }
  return Object.freeze({
    gateCount: TOPOLOGY_FAILURE_GATE_MATRIX.length,
    requiredDimensions: listRequiredTopologyFailureGateDimensions(),
    gatesByDimension: Object.freeze(Object.fromEntries(
      [...gatesByDimension.entries()].map(([dimension, gateIds]) => [
        dimension,
        Object.freeze([...gateIds]),
      ]),
    )),
  });
}

function formatTopologyFailureGateMatrixLines() {
  return TOPOLOGY_FAILURE_GATE_MATRIX.map((entry) => [
    entry.config,
    entry.scenario,
    entry.gateId,
    entry.dimension,
    entry.owner,
    entry.boundary,
    entry.expectedDurableOutcome,
  ].join(TOPOLOGY_FAILURE_GATE_FIELD_SEPARATOR));
}

function normalizeTopologyFailureGateScenarioName(value) {
  return typeof value === TOPOLOGY_FAILURE_GATE_TYPEOF_STRING ?
    value.trim() :
    TOPOLOGY_FAILURE_GATE_TEXT_EMPTY;
}

function listUniqueTopologyFailureGateScenarioNames(entries) {
  const names = [];
  const seen = new Set();
  for (const entry of entries) {
    const scenarioName = normalizeTopologyFailureGateScenarioName(
      entry?.scenario,
    );
    if (
      scenarioName.length === TOPOLOGY_FAILURE_GATE_ZERO ||
      seen.has(scenarioName)
    ) {
      continue;
    }
    seen.add(scenarioName);
    names.push(scenarioName);
  }
  return names;
}

export {
  REQUIRED_TOPOLOGY_FAILURE_GATE_DIMENSIONS,
  TOPOLOGY_FAILURE_GATE_BOUNDED_PROGRESS_MECHANISMS,
  TOPOLOGY_FAILURE_GATE_DIMENSION,
  TOPOLOGY_FAILURE_GATE_MATRIX,
  buildTopologyFailureGateCoverageSnapshot,
  formatTopologyFailureGateMatrixLines,
  hasTopologyFailureGateBoundedProgressMechanism,
  listRequiredTopologyFailureGateDimensions,
  listTopologyFailureGateEntries,
  listUniqueTopologyFailureGateScenarioNames,
  normalizeTopologyFailureGateConfigName,
};
