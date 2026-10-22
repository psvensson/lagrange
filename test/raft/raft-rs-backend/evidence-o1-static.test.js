// Static evidence for the committed-read boundary (verification protocol v2
// phases 5 and 6):
//   - every finite universe the boundary decides over is imported from its
//     owner and classified here member by member, so an enumeration that
//     gains a member no case names turns this red;
//   - the timing relationships the design relies on (challenger B, section
//     B, I1-I9) are written as inequalities over production constants and
//     the production tuning derivation, never as literals.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {bindingWireNumbers} from './committed-membership-oracles.js';
import {
  BOOTSTRAP_MEMBERSHIP_SOURCE,
  COMMITTED_MEMBERSHIP_ANSWER_FIELD,
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
  COMMITTED_MEMBERSHIP_REFUSAL,
  COMMITTED_MEMBERSHIP_STAMP_DEFECT,
  COMMITTED_MEMBERSHIP_STAMP_KIND,
  PARTICIPATION_GATE,
} from '../../../src/raft/raft-committed-membership-constants.js';
import {
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {
  RAFT_RS_CONF_CHANGE_TYPE,
  RAFT_RS_ENTRY_TYPE,
} from '../../../src/raft/raft-rs-ready-loop-constants.js';
import {
  PERSISTENCE_ADMISSION_WAIT,
  INBOUND_DRAIN_DELAY_MS,
  RUNTIME_PHASE,
  RUNTIME_REASON,
} from '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {
  RAFT_RS_RECORD_COMPATIBILITY,
} from '../../../src/raft/raft-rs-durable-store-constants.js';
import {
  RAFT_RS_GROUP_TUNING,
  RAFT_RS_READY_DRAIN_MAX_CYCLES,
} from '../../../src/raft/raft-rs-group-constants.js';
import {
  recoveryRetryWindowMsOf,
  tuningOf,
} from '../../../src/raft/raft-rs-runtime-tuning.js';
import {RAFT_ELECTION_TIMING} from '../../../src/raft/constants.js';
import {computeReplicaElectionTimeouts} from
  '../../../src/raft/replica-election-timeouts.js';
import {DEFAULT_CONFIG} from '../../../src/config/config-definitions.js';
import {REBALANCER_DEFAULT} from
  '../../../src/rebalancer/rebalancer-constants.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from
  '../../../src/rebalancer/operation-workflow-owner-shared.js';
import {REPLACE_COMPLETION_VERDICT} from
  '../../../src/rebalancer/operation-workflow-replace-owner.js';
import {TIME_MS} from '../../../src/constants/time.js';

// --- Phase 5: enumerations, classified member by member -------------------

// Each classification names every KEY of its enumeration exactly once; a
// key the table does not name (a new member) fails the test.
function assertClassifies(name, enumeration, classes) {
  const named = Object.values(classes).flat();
  assert.deepEqual([...named].sort(), Object.keys(enumeration).sort(),
    `${name}: every member is classified exactly once`);
  assert.equal(new Set(named).size, named.length,
    `${name}: no member is classified twice`);
}

test('enumerations: the stamp kinds and bootstrap sources are the two ' +
  'stamp origins plus the record', () => {
  assertClassifies('STAMP_KIND', COMMITTED_MEMBERSHIP_STAMP_KIND, {
    join: ['COMMITTED'],
    found: ['GENESIS'],
  });
  assertClassifies('BOOTSTRAP_SOURCE', BOOTSTRAP_MEMBERSHIP_SOURCE, {
    stamp: Object.keys(COMMITTED_MEMBERSHIP_STAMP_KIND),
    restoreOnly: ['DURABLE_RECORD'],
  });
  assertClassifies('ANSWER_KIND', COMMITTED_MEMBERSHIP_ANSWER_KIND, {
    answered: ['COMMITTED'], refused: ['REFUSED'],
  });
  assertClassifies('READ_PURPOSE', COMMITTED_MEMBERSHIP_READ_PURPOSE, {
    leaderOnly: ['BOOTSTRAP'], anyReplica: ['WITNESS'],
  });
  assertClassifies('ANSWER_FIELD', COMMITTED_MEMBERSHIP_ANSWER_FIELD, {
    configuration: ['VOTERS', 'VOTERS_OUTGOING', 'LEARNERS', 'IDENTITIES'],
    label: ['APPLIED_INDEX', 'COMMIT_INDEX', 'TERM', 'LEADER_ID'],
    gate: ['GATE_OPEN'],
    kind: ['KIND'],
  });
});

test('enumerations: every refusal of the boundary is decided at one named ' +
  'place, and every stamp defect and gate name is classified', () => {
  assertClassifies('REFUSAL', COMMITTED_MEMBERSHIP_REFUSAL, {
    // Answered by the read (the port, from its recorded observation).
    portRead: ['NOT_LEADER', 'JOINT', 'IDENTITY_UNRESOLVED', 'HELD',
      'NOT_HOSTED'],
    // Thrown by the creation owner before anything is persisted.
    creationOwner: ['MEMBERSHIP_UNREADABLE'],
    // Thrown by the target's handler on arrival.
    targetValidation: ['STAMP_INVALID', 'GENESIS_REFUSED_GROUP_EXISTS'],
    // Refused by the port's opening (O4 / A3).
    portOpening: ['DURABLE_RECORD_MISSING'],
    // Held by the runtime ingress: a peer proved the replica's own history
    // lost while it ran (O4 detected at runtime, local-log guard).
    ingressHold: ['RESEED_REQUIRED'],
  });
  assertClassifies('STAMP_DEFECT', COMMITTED_MEMBERSHIP_STAMP_DEFECT, {
    shape: ['MISSING', 'UNKNOWN_KIND', 'MALFORMED'],
    committed: ['NO_BOOTSTRAP_INDEX', 'JOINT', 'NO_VOTERS',
      'IDENTITY_MISMATCH', 'IDENTITY_UNRESOLVED'],
    genesis: ['NO_FOUNDERS'],
  });
  assertClassifies('PARTICIPATION_GATE', PARTICIPATION_GATE, {
    refusal: ['GATE_CLOSED'], event: ['GATE_OPENED'],
  });
});

test('enumerations: the runtime reasons the gate and the record add sit ' +
  'beside every other runtime reason, each classified', () => {
  assertClassifies('RUNTIME_REASON', RUNTIME_REASON, {
    opening: ['RESTORED', 'CREATED', 'RUNTIME_RECONSTRUCTED',
      'GROUP_RECONSTRUCTED'],
    // O4 / O3: a replica that cannot prove its role from its record.
    recordRefusal: ['DURABLE_RECORD_MISSING', 'DURABLE_RECORD_INCOMPATIBLE'],
    // O4 at runtime: the local-log guard's durable hold.
    historyLoss: ['RESEED_REQUIRED'],
    // The core's own eligibility, decided after the gate.
    eligibility: ['NOT_ACTIVE_VOTER'],
    hostAndLifecycle: ['CORE_REFUSED', 'GENERATION_CHANGED',
      'RECOVERY_DEFERRED', 'EXECUTION_USABLE', 'ENTRIES_APPLIED',
      'READY_DRAIN_BOUND_EXCEEDED', 'DRAINED', 'UNKNOWN', 'UNKNOWN_OPERATION',
      'INBOUND_ENQUEUED', 'INBOUND_DRAINED', 'DELIVERY_FAILED',
      'CLOSED_WITHOUT_CORE_ENTRY', 'CLOSED', 'USER_TRANSACTION_OPEN',
      'READY_DEFERRED'],
    // V2: a conf-change proposal the core would drop is deferred typed.
    confChangeAdmission: ['CONF_CHANGE_PENDING'],
    progressProbe: ['PROGRESS_OBSERVED', 'PROGRESS_PROBE_SENT', 'NOT_A_PEER',
      'NOT_LEADER'],
    leadershipTransfer: ['TRANSFER_REQUESTED', 'TRANSFER_FORWARDED',
      'ALREADY_LEADER', 'NO_KNOWN_LEADER', 'TARGET_NOT_VOTER',
      'TARGET_UNRESERVED', 'NO_ELIGIBLE_SUCCESSOR', 'UNKNOWN_SUCCESSOR',
      'WITHOUT_REPLICA_IDENTITY', 'TRANSFER_IN_PROGRESS'],
  });
  assert.equal(RUNTIME_REASON.DURABLE_RECORD_MISSING,
    COMMITTED_MEMBERSHIP_REFUSAL.DURABLE_RECORD_MISSING,
    'one value for the missing record, owned by the boundary');
  // Round 2 (verifier V6): the phases a refusal names, the boundary's own
  // ones first - the stamp validator at the port (V1a), the record read
  // (O4 / O3), the admission of a conf-change proposal (V2).
  assertClassifies('RUNTIME_PHASE', RUNTIME_PHASE, {
    boundaryOpening: ['STAMP_VALIDATION', 'DURABLE_RECORD_READ',
      'BOOTSTRAP_PERSISTENCE'],
    confChangeAdmission: ['ADMISSION'],
    participation: ['CAMPAIGN_ELIGIBILITY', 'LEADERSHIP_TRANSFER',
      'PROGRESS_PROBE'],
    hostAndLifecycle: ['GENERATION_CHANGED', 'ADDRESS_RESOLUTION', 'SEND',
      'SEND_NO_HANDLER', 'APPLICATION', 'READY_DRAIN', 'READY_PERSISTENCE',
      'DISPATCH', 'UNEXPECTED_THROW'],
    // A delivered envelope refused before step (local-log guard).
    ingressGuard: ['LOCAL_LOG_GUARD'],
  });
  assertClassifies('RECORD_COMPATIBILITY', RAFT_RS_RECORD_COMPATIBILITY, {
    restores: ['COMPATIBLE'],
    refusedIncompatible: ['PRE_GATE'],
    unreadableRetryable: ['TABLE_MISSING'],
  });
  assertClassifies('OPERATION_OUTCOME', RAFT_OPERATION_OUTCOME, {
    ok: ['CORE_OK'], typedRefusal: ['CORE_REFUSED'],
    fatal: ['CORE_FATAL'], host: ['HOST_FAILURE'],
  });
});

test('enumerations: admission outcomes and R-1a verdicts', () => {
  assertClassifies('ADMISSION_OUTCOME', RAFT_MEMBERSHIP_ADMISSION_OUTCOME, {
    inFlightUntilMembershipChanges: ['PROPOSED', 'QUEUED', 'IN_FLIGHT'],
    settledNoOp: ['NOT_LEADER', 'ALREADY_MEMBER'],
    failed: ['REFUSED', 'DEFERRED'],
  });
  assertClassifies('REPLACE_COMPLETION_VERDICT', REPLACE_COMPLETION_VERDICT, {
    retires: ['SOURCE_RETIRED'],
    waits: ['STILL_VOTER', 'UNAVAILABLE', 'WITNESS_BELOW_GATE'],
  });
});

test('enumerations: the conf-change and entry types the runtime names are ' +
  'the binding\'s own wire numbers, every binding arm classified', () => {
  const wire = bindingWireNumbers();
  assert.deepEqual(RAFT_RS_CONF_CHANGE_TYPE, {
    ADD_NODE: wire.changeType.AddNode,
    REMOVE_NODE: wire.changeType.RemoveNode,
    ADD_LEARNER_NODE: wire.changeType.AddLearnerNode,
  }, 'every ConfChangeType arm of the binding is a production constant');
  assert.equal(Object.keys(wire.changeType).length,
    Object.keys(RAFT_RS_CONF_CHANGE_TYPE).length);
  assert.deepEqual(RAFT_RS_ENTRY_TYPE, {
    NORMAL: wire.entryType.EntryNormal,
    CONF_CHANGE: wire.entryType.EntryConfChange,
    CONF_CHANGE_V2: wire.entryType.EntryConfChangeV2,
  });
  assert.equal(Object.keys(wire.entryType).length,
    Object.keys(RAFT_RS_ENTRY_TYPE).length);
});

// --- Phase 6: timing arithmetic over production constants -----------------

const RAFT = DEFAULT_CONFIG.raft;
const COORDINATOR = REBALANCER_DEFAULT.COORDINATOR;
const {
  REPLICA_OPERATION_DISPATCH_TIMEOUT_MS,
  PRIORITY_PUBLICATION_LEADER_HANDOFF_EVIDENCE,
} = OPERATION_WORKFLOW_OWNER_SHARED;

function productionTiming(replicaIndex, replicaCount) {
  const replicaIds = Array.from({length: replicaCount}, (_, index) =>
    `r${index}`);
  const {electionMinMs, electionMaxMs} = computeReplicaElectionTimeouts({
    replicaId: replicaIds[replicaIndex],
    replicaIds,
    baseElectionMinMs: RAFT.electionTimeoutMinMs,
    baseElectionMaxMs: RAFT.electionTimeoutMaxMs,
    electionJitterPerReplicaMs: RAFT_ELECTION_TIMING.JITTER_PER_REPLICA_MS,
  });
  return {heartbeatMs: RAFT.heartbeatIntervalMs, electionMinMs,
    electionMaxMs, tickIntervalMs: RAFT.tickIntervalMs};
}

test('timing: the effective heartbeat and election window of the ' +
  'production tuning (HEARTBEAT_TICK x tick; election in ticks)', () => {
  const tuning = tuningOf(productionTiming(0, 3));
  const heartbeatEffectiveMs = tuning.heartbeatTick * RAFT.tickIntervalMs;
  assert.equal(tuning.heartbeatTick, RAFT_RS_GROUP_TUNING.HEARTBEAT_TICK);
  assert.equal(heartbeatEffectiveMs, 60,
    'M3: a leader heartbeats within 60 ms (3 ticks of 20 ms)');
  assert.ok(heartbeatEffectiveMs >= RAFT.heartbeatIntervalMs);
  assert.equal(tuning.electionTick * RAFT.tickIntervalMs,
    RAFT.electionTimeoutMinMs, 'the election window starts at the ' +
      'configured minimum (1.0 s); raft-rs randomizes up to twice it');
  assert.deepEqual(tuningOf({...productionTiming(0, 3),
    electionMaxMs: RAFT.electionTimeoutMaxMs * 2}), tuning,
  'the configured maximum (3.0 s) is not consumed by the tuning');
  assert.equal(tuning.preVote, false);
  assert.equal(tuning.checkQuorum, false);
});

test('timing: I3 (re-arm), I8 (first campaign), I4/B13 (transfer abort ' +
  'window against the handoff retry), per replica index', () => {
  const electionMinMs = RAFT.electionTimeoutMinMs;
  // I3: the re-arm happens in the drain that opened the gate; a drain is
  // synchronous and bounded, and delivered inbound is drained without delay.
  assert.equal(INBOUND_DRAIN_DELAY_MS, 0);
  assert.ok(RAFT_RS_READY_DRAIN_MAX_CYCLES > 0);
  assert.ok(INBOUND_DRAIN_DELAY_MS < electionMinMs,
    'I3: re-arm well within the fastest follower election minimum (1.0 s)');
  for (const replicaIndex of [0, 1, 2]) {
    const timing = productionTiming(replicaIndex, 3);
    // I8: the first campaign a scheduled replica could make.
    assert.equal(timing.electionMinMs, electionMinMs +
      replicaIndex * RAFT_ELECTION_TIMING.JITTER_PER_REPLICA_MS,
    `I8: first campaign no earlier than 1.0 s + 2.5 s x ${replicaIndex}`);
    // I4 / B13: raft-rs aborts a transfer after the LEADER's election
    // timeout; the REPLACE owner retries after 5 s.
    const abortWindowMs = recoveryRetryWindowMsOf(timing);
    assert.equal(abortWindowMs, timing.electionMinMs);
    const retryMs = PRIORITY_PUBLICATION_LEADER_HANDOFF_EVIDENCE
      .REQUEST_RETRY_AFTER_MS;
    assert.equal(retryMs, 5000);
    if (replicaIndex <= 1) {
      assert.ok(abortWindowMs < retryMs,
        `B13: a premature transfer from index ${replicaIndex} is aborted ` +
          'before the retry: one refusal, then completion');
    } else {
      assert.ok(abortWindowMs >= retryMs,
        `B13 (recorded): from index ${replicaIndex} the abort window ` +
          '(6.0 s) outlasts the 5 s retry; raft-rs ignores a repeated ' +
          'request to the same transferee, so the retry is harmless');
    }
  }
});

test('timing: I1, I2, I5, I6, I7, I9 - the read bound, the admission ' +
  'wait, the creation budgets and the hint staleness', () => {
  const readBoundMs = REPLICA_OPERATION_DISPATCH_TIMEOUT_MS;
  const admissionBoundMs = PERSISTENCE_ADMISSION_WAIT.BOUND_MS;
  assert.equal(readBoundMs, 5000);
  assert.equal(admissionBoundMs, 120000);
  // I6: a leader inside a user transaction is unreadable by construction.
  assert.ok(admissionBoundMs > 2 * readBoundMs,
    'I6: the admission wait outlasts the hinted read and its one redirect');
  // I7: commit may lead apply by at most the admission bound.
  assert.ok(admissionBoundMs <= COORDINATOR.SYNCING_TIMEOUT_MS,
    'I7 / I1: one admission stall fits the SYNCING budget');
  assert.equal(Math.floor(COORDINATOR.SYNCING_TIMEOUT_MS / admissionBoundMs),
    2, 'I1: at most two full admission stalls fit SYNCING (300 s)');
  // I2: a refused read is re-planned on the priority floor or the periodic
  // cadence.
  assert.ok(2 * readBoundMs + COORDINATOR.TIMEOUT_CHECK_INTERVAL_MS <
    COORDINATOR.CREATING_TIMEOUT_MS,
  'I2: a refusal and a priority re-plan fit the creating budget (60 s)');
  assert.ok(2 * readBoundMs + COORDINATOR.PERIODIC_CHECK_INTERVAL_MS <=
    COORDINATOR.SYNCING_TIMEOUT_MS,
  'I2: a refusal and a periodic re-plan (60 s) fit the syncing budget');
  // I5: the leader hint lags a leader change by the publication cadence
  // plus the lease; the read spends at most two hops.
  const hintStalenessMs = TIME_MS.CONTROL_PLANE_HEARTBEAT_INTERVAL +
    TIME_MS.CONTROL_PLANE_READY_LEASE;
  assert.equal(2 * readBoundMs, 10000,
    'I5: two hops (hint + one redirect) = 10 s; a second leader change ' +
      'inside them is MEMBERSHIP_UNREADABLE');
  assert.ok(2 * readBoundMs < hintStalenessMs,
    'I5: the read finishes before the hint can be corrected (20 s)');
  // I9: the admission re-drive is event-driven; its outer bound is SYNCING.
  assert.ok(COORDINATOR.SYNCING_TIMEOUT_MS > COORDINATOR.CREATING_TIMEOUT_MS);
});
