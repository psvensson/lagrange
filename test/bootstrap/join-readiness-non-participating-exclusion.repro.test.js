/**
 * Bug Condition Repro — Non-Participating In-Flight Operation Exclusion
 *
 * Deterministic unit repro for the rolling-restart N=8 gate failure run6
 * (stat-gate-20260627T163326Z): a HEALTHY joining node (8be8d30f) is held
 * out of published membership for ~5.5 minutes because the join-readiness
 * gate blocks promotion on the GLOBAL in-flight replica-op count
 * (`ready = missingCount === 0 && inFlightReplicaOperations === 0`,
 * src/bootstrap/join-readiness-snapshot-methods.js:424). The two ops that
 * block it are REPLACEs on `node_endpoints-p1` / `mg-*` whose source and
 * target are OTHER nodes (7493b0ab -> 35a891b8) — the joiner neither
 * sources nor targets them, yet they survive every existing exclusion
 * filter (join-readiness-replica-operation-methods.js:76-120: self-target,
 * warming-target, non-discovery, priority-control-plane) because they are
 * on a discovery-critical partition and not a priority-control-plane table.
 *
 * THE INVARIANT (what a functioning system must honor): an in-flight
 * replica operation in which the joining node is neither the source nor
 * the target must not, by itself, block that node's promotion.
 *
 * On UNFIXED code this test MUST FAIL — the bystander op is counted in
 * `inFlightOperations`, confirming the bug. It becomes the red-on-revert
 * regression guard once the participation-aware exclusion lands.
 *
 * SAFETY BOUNDARY (for the fix, not this repro): the sibling test
 * join-readiness-non-self-targeted-preservation.property.test.js requires
 * that ops where the joining node IS the source/target keep counting. The
 * fix must exclude ONLY pure bystander ops (neither source nor target),
 * and must be reconciled with whether the joiner depends on the
 * discovery-critical partition for its own routing before promotion.
 *
 * This repro is BIASING-FREE and clock-free: it constructs the structural
 * precondition directly and reads a synchronous gate output (DT1-class).
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  COLUMN,
  NODE_STATE,
  TABLES,
} from '../../src/constants/index.js';
import {
  JoinReadinessEvaluator,
} from '../../src/bootstrap/join-readiness-evaluator.js';

// The bystander joiner being held out of membership (8be8d30f analog).
const JOINING_NODE_ID = 'joining-bystander-8be8d30f';
// The two OTHER nodes that source/target the blocking REPLACE
// (7493b0ab -> 35a891b8 analog). The joiner is neither.
const SOURCE_NODE_ID = 'source-node-7493b0ab';
const TARGET_NODE_ID = 'target-node-35a891b8';
// A discovery-critical partition (node_endpoints-p1) — exactly the class
// that survives the existing non-discovery / priority-control-plane filters.
const DISCOVERY_PARTITION_ID = `${TABLES.NODE_ENDPOINTS}-p1`;

function buildBystanderReplicaOperationRow() {
  return {
    operation_id: 'op-bystander-47455d92',
    type: 'REPLACE',
    status: 'pending',
    workflow_step: 'PENDING',
    partition_id: DISCOVERY_PARTITION_ID,
    replica_id: 'replica-bystander',
    source_node_id: SOURCE_NODE_ID,
    target_node_id: TARGET_NODE_ID,
    created_at: 1000,
    updated_at: 1000,
    completed_at: null,
  };
}

function buildNodeRow(nodeId, status) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: status,
  };
}

function createSystemTableCacheMock(replicaOperationRows, nodeRows) {
  return {
    getAll(tableName) {
      if (tableName === TABLES.REPLICA_OPERATIONS) {
        return replicaOperationRows;
      }
      if (tableName === TABLES.NODES) {
        return nodeRows;
      }
      return [];
    },
    filter(_tableName, _predicate) {
      return [];
    },
  };
}

function createEvaluator(nodeId, activeNodeIds) {
  const emptyMissing = {
    missingPartitionLeaders: [],
    missingMessageGroupLeaders: [],
    missingPartitionLeaderNodes: [],
    missingMessageGroupLeaderNodes: [],
    missingPartitionLeaderAddresses: [],
    missingMessageGroupLeaderAddresses: [],
  };
  return new JoinReadinessEvaluator({
    nodeId,
    now: () => 1000,
    sleep: () => Promise.resolve(),
    delegates: {
      getMissingSystemServiceLeaders: () => emptyMissing,
      getBlockingSystemServiceLeaders: () => emptyMissing,
      resolveControlPlaneTargetAddress: () => null,
      backfillPropagatedCacheTables: () => {},
      getMessageRouter: () => null,
      getBootstrapResponse: () => null,
      getSystemCacheHydrated: () => false,
      getJoinReadinessSnapshotProvider: () => null,
      getCdcIntegrationService: () => null,
      getControlPlaneReadinessService: () => ({
        getStartupAuthoritySnapshotSync: () => ({
          authorityAvailable: activeNodeIds.length > 0,
          canonicalStartupNodeIds: activeNodeIds,
        }),
      }),
      getLogger: () => console,
      getConfig: () => ({}),
    },
  });
}

test('run6 repro: an in-flight op the joining node neither sources nor ' +
  'targets must not block its promotion (currently RED — bug present)',
async (t) => {
  const bystanderOp = buildBystanderReplicaOperationRow();
  const nodeRows = [
    buildNodeRow(JOINING_NODE_ID, NODE_STATE.JOINING),
    buildNodeRow(SOURCE_NODE_ID, NODE_STATE.ACTIVE),
    buildNodeRow(TARGET_NODE_ID, NODE_STATE.ACTIVE),
  ];
  const cache = createSystemTableCacheMock([bystanderOp], nodeRows);
  const evaluator = createEvaluator(JOINING_NODE_ID, [
    SOURCE_NODE_ID,
    TARGET_NODE_ID,
  ]);

  const result =
    evaluator.collectCanonicalInFlightReplicaOperationDetails(cache);
  const inFlightOperations = result.inFlightOperations;

  // Sanity: the op genuinely does not involve the joining node.
  t.equal(
    bystanderOp.source_node_id === JOINING_NODE_ID ||
      bystanderOp.target_node_id === JOINING_NODE_ID,
    false,
    'precondition: the joining node is neither source nor target',
  );

  // THE BUG: on unfixed code the bystander op is counted, which drives
  // `ready = inFlightReplicaOperations === 0` false and strands the
  // healthy joiner out of membership. This assertion is RED until the
  // participation-aware exclusion lands.
  t.equal(
    inFlightOperations.length,
    0,
    'a pure-bystander in-flight op (neither source nor target is the ' +
    'joining node) must be excluded from the join-readiness in-flight ' +
    `count, but ${inFlightOperations.length} were counted`,
  );

  t.end();
});
