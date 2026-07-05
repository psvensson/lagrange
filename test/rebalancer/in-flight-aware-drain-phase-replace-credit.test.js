/**
 * Row-op-linked drain-phase REPLACE credit in the single in-flight-aware replica
 * accounting (quest formation-ledger-over-target-accounting-drain-phase-replace-
 * blind-spot).
 *
 * BUG: deficitEffectiveCount = activeCount + inFlightAddCount EXCLUDES a REPLACE's
 * replacement ("a REPLACE is net-neutral, never fills a deficit"). But when a
 * DRAIN-PHASE REPLACE's SOURCE has left activeCount while its REPLACEMENT is still
 * a durable non-voting LEARNER (a materialized syncing row), that replacement is
 * counted nowhere — so the planner reads a false deficit, mints a spurious
 * count-increasing ADD, and the group ends up over target (4 voters / 3 target),
 * concentrated, and stalls (the ledger never de-concentrates → cold formation
 * never settles; live run-4/run-28).
 *
 * FIX (industry pattern: PD "current + in-flight operator influence"; CRDB counts
 * the learner): credit toward the deficit the SPECIFIC drain-phase REPLACE's
 * replacement replica — the non-active occupied row on the op's target node —
 * EXCLUDING replacements already ACTIVE and stale learners not linked to a REPLACE
 * (which is why a raw occupied-count heuristic is wrong and was refuted 3x).
 *
 * The four recorded constraint tuples (active/occupied/inFlightAdd/drainPhaseReplace)
 * are pinned directly on deficitEffectiveCount and are red-on-revert (run-28 +
 * verifier-starvation), with stale-syncing + serialization as anti-regression
 * guards against the refuted occupied-only / all-phase-replace approximations.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  computeInFlightAwareReplicaAccounting,
} from '../../src/rebalancer/in-flight-aware-replica-count.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {REBALANCER_MOVE_TYPE as MoveType} from '../../src/rebalancer/rebalancer-constants.js';

const PARTITION = 'p1';

function replica(nodeId, replicaId, status) {
  return {
    node_id: nodeId,
    replica_id: replicaId,
    partition_id: PARTITION,
    status,
  };
}

// A drain-phase REPLACE: its SOURCE (replica_id) has already left activeCount
// (removed, not present in currentReplicas); the replacement lands on
// target_node_id.
function drainPhaseReplace(sourceReplicaId, targetNodeId) {
  return {
    type: MoveType.REPLACE,
    replica_id: sourceReplicaId,
    partition_id: PARTITION,
    target_node_id: targetNodeId,
    status: ReplicaStatus.SYNCING,
    workflow_step: 'SENDING',
  };
}

test('stale-syncing 1/3/0/0 -> deficit 1 (no REPLACE: stale learners are NOT credited)',
  async (t) => {
    // 1 active + 2 stale syncing learners, no drain-phase REPLACE. A raw
    // occupied-count would wrongly read 3; row-op-linked credits nothing.
    const acc = computeInFlightAwareReplicaAccounting({
      currentReplicas: [
        replica('node-a', 'r-a', ReplicaStatus.ACTIVE),
        replica('node-b', 'r-stale1', ReplicaStatus.SYNCING),
        replica('node-c', 'r-stale2', ReplicaStatus.SYNCING),
      ],
      inFlightOperations: [],
      partitionId: PARTITION,
    });
    t.equal(acc.activeCount, 1, 'activeCount');
    t.equal(acc.deficitEffectiveCount, 1,
      'stale learners unlinked to a REPLACE are not credited -> genuine deficit');
    t.end();
  });

test('serialization 2/2/0/1 -> deficit 2 (drain-phase REPLACE whose replacement has no row yet)',
  async (t) => {
    // Source removed (active 2), replacement not yet materialized on node-c
    // (occupied 2). No replacement row -> no credit -> genuine deficit -> ADD.
    const acc = computeInFlightAwareReplicaAccounting({
      currentReplicas: [
        replica('node-a', 'r-a', ReplicaStatus.ACTIVE),
        replica('node-b', 'r-b', ReplicaStatus.ACTIVE),
      ],
      inFlightOperations: [drainPhaseReplace('r-old-source', 'node-c')],
      partitionId: PARTITION,
    });
    t.equal(acc.activeCount, 2, 'activeCount');
    t.equal(acc.deficitEffectiveCount, 2,
      'a REPLACE whose replacement has no row yet cannot fill the deficit');
    t.end();
  });

test('run-28 2/3/0/1 -> deficit 3 (credit the drain-phase replacement learner: SUPPRESS the spurious ADD)',
  async (t) => {
    // Source removed (active 2); replacement is a syncing learner on node-c
    // (occupied 3). Credit it -> 3 -> no deficit -> the spurious count-increasing
    // ADD is suppressed and the group never reaches 4 voters. RED on revert.
    const acc = computeInFlightAwareReplicaAccounting({
      currentReplicas: [
        replica('node-a', 'r-a', ReplicaStatus.ACTIVE),
        replica('node-b', 'r-b', ReplicaStatus.ACTIVE),
        replica('node-c', 'r-repl', ReplicaStatus.SYNCING),
      ],
      inFlightOperations: [drainPhaseReplace('r-old-source', 'node-c')],
      partitionId: PARTITION,
    });
    t.equal(acc.activeCount, 2, 'activeCount');
    t.equal(acc.deficitEffectiveCount, 3,
      'the drain-phase replacement learner is credited -> at target -> suppress ADD');
    t.end();
  });

test('verifier-starvation 1/3/0/1 -> deficit 2 (credit ONLY the linked replacement, not the unlinked stale learner)',
  async (t) => {
    // active 1, occupied 3 (2 non-active). Exactly one non-active learner is the
    // REPLACE's replacement (node-c); the other (node-d) is an unlinked stale
    // learner. Row-op-linked credits ONLY the linked one -> 1+1=2 < 3 -> ADD.
    // A raw occupied-count would wrongly read 3 and suppress a genuine deficit.
    const acc = computeInFlightAwareReplicaAccounting({
      currentReplicas: [
        replica('node-a', 'r-a', ReplicaStatus.ACTIVE),
        replica('node-c', 'r-repl', ReplicaStatus.SYNCING),
        replica('node-d', 'r-stale', ReplicaStatus.SYNCING),
      ],
      inFlightOperations: [drainPhaseReplace('r-old-source', 'node-c')],
      partitionId: PARTITION,
    });
    t.equal(acc.activeCount, 1, 'activeCount');
    t.equal(acc.deficitEffectiveCount, 2,
      'only the REPLACE-linked replacement is credited; the unlinked learner is not');
    t.end();
  });

test('net-neutral REPLACE (source STILL active) is NOT credited (no double-count)',
  async (t) => {
    // Source r-a is still ACTIVE (net-neutral in-creation REPLACE), replacement
    // syncing on node-c. Crediting here would double-count the source's slot.
    const acc = computeInFlightAwareReplicaAccounting({
      currentReplicas: [
        replica('node-a', 'r-a', ReplicaStatus.ACTIVE),
        replica('node-b', 'r-b', ReplicaStatus.ACTIVE),
        replica('node-c', 'r-repl', ReplicaStatus.SYNCING),
      ],
      inFlightOperations: [
        {
          type: MoveType.REPLACE,
          replica_id: 'r-a',
          partition_id: PARTITION,
          target_node_id: 'node-c',
          status: ReplicaStatus.SYNCING,
          workflow_step: 'SENDING',
        },
      ],
      partitionId: PARTITION,
    });
    t.equal(acc.activeCount, 2, 'activeCount');
    t.equal(acc.deficitEffectiveCount, 2,
      'a REPLACE whose source is still active is net-neutral: replacement not credited');
    t.end();
  });
