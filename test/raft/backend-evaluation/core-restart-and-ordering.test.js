// The highest-risk part of the wrapper: the Ready/persistence ordering, and
// what a restart can reconstruct from durable Raft state alone.
//
// A boundary is a position RELATIVE TO ONE CONFIGURATION ENTRY, identified by
// the index and type the core assigned it. Every boundary must be a DISTINCT
// durable host state, for a follower victim and for the leader victim. The
// restore claim is made with the peer ISOLATED - the harness throws if a
// message crosses the boundary - so cluster convergence cannot satisfy it.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  ISOLATION_BREACH,
  RESTART_BOUNDARY,
  assertMembershipEqual,
  createDeterministicCluster,
  restoreFaultIsArmed,
  setRestoreFaultForNegativeControl,
} from './forked-core-harness.js';
import {
  BATCH,
  INTENTIONALLY_INDISTINGUISHABLE,
  MUTANT_OUTCOME,
  runHostOrderMutants,
  runJointReapplication,
  runLostProposal,
  runLostProposalOneFollower,
  runReadyOrdering,
  runApplyRefusalRegression,
  runAutoLeaveSelfAppendedBoundary,
  runBoundaryMatrix,
  runDeterminismProof,
  runDurableRecordCorruptions,
  boundaryMatrixSpecs,
  runHostOrderControl,
  runReapplicationIdempotence,
  runRestartBoundary,
  runTriggerShifts,
} from './core-scenarios.js';
import {writeLogConformsToContract} from './host-contract.js';
import {
  localRestoreViolations,
  restoreOutcomeFingerprint,
} from './restore-oracle.js';

const NINE_BOUNDARIES = Object.freeze([
  RESTART_BOUNDARY.PROPOSED_NOT_PERSISTED,
  RESTART_BOUNDARY.PERSISTED_NOT_COMMITTED,
  RESTART_BOUNDARY.COMMITTED_NOT_APPLIED,
  RESTART_BOUNDARY.CONF_APPLIED_NOT_RECORDED,
  RESTART_BOUNDARY.CONF_STATE_RECORDED_NOT_ADVANCED,
  RESTART_BOUNDARY.READY_ADVANCED,
  RESTART_BOUNDARY.JOINT_ENTERED,
  RESTART_BOUNDARY.JOINT_COMMITTED,
  RESTART_BOUNDARY.JOINT_LEFT,
]);

const REQUIRED_FACTS = Object.freeze([
  'confIndex', 'durableLastIndex', 'durableHardState', 'durableApplied',
  'durableConfStateFull', 'inMemoryConfStateFull', 'readyPhaseReached',
  'applyConfChangeHasRun', 'appendAdvancementHasRun', 'applyAdvancementHasRun',
]);

// Where the configuration entry is durably committed and not durably
// applied, the isolated peer must re-apply it FROM ITS OWN LOG.
function assertOneBoundaryRow(record, boundary, role) {
  assert.equal(record.driven, true,
    `${boundary}/${role} was not driven: ${record.reason}`);
  assert.equal(record.witness.refusals, 0,
    `${record.id}: no membership value may bypass a core read`);
  assertBoundaryFacts(record);

  // The boundary is relative to the configuration entry the core named.
  assert.ok(record.facts.durableConfEntryShape ||
      Number(record.facts.durableLastIndex) <
        Number(record.facts.confIndex),
  `${record.id}: the boundary must be anchored to a configuration ` +
      'entry the core assigned');

  // CLAIM 1 - local restore. Every LOCAL check lives in restore-oracle.js,
  // so the receipt and the corruption table cannot disagree about what
  // "caught locally" means, and the ConfState expectation never goes
  // through `create_node`: it is the survivors' core reads where the entry
  // is re-applied, and the durable ConfState AND the victim's own pre-crash
  // core read where it is not. Round 2 showed the old
  // `restored == entitledByDurableState` comparison could not see a binding
  // that dropped the learners set or a cache that injected one.
  const local = record.localRestoreCorrectness;
  const violations = localRestoreViolations(record);
  assert.deepEqual(violations.map((entry) => entry.message), [],
    `${record.id}: the local restore checks failed`);

  // The window must have carried traffic at the victim, and the direction
  // that proves it depends on whether the survivors still address it.
  assert.ok(local.windowHadTraffic.victimSpoke,
    `${record.id}: the victim must have tried to reach the others`);
  if (record.victimStillAddressedBySurvivors) {
    assert.ok(local.messagesBlockedInbound > 0,
      `${record.id}: the survivors still address this peer, so messages ` +
        'must have been attempted at it and blocked');
  } else {
    assert.ok(local.messagesBlockedOutbound > 0,
      `${record.id}: the survivors no longer address this peer, so the ` +
        'window is proved by what the victim itself tried to send');
  }
  // The replay entitlement is still RECORDED, and still agrees - but it is
  // no longer the oracle, because it shares a construction call with the
  // thing it judges.
  assertMembershipEqual(local.restoredConfState.voters,
    local.entitledByDurableState.voters,
    `${record.id}: the replay entitlement disagrees with the restore`);
  assert.ok(['old', 'new'].includes(local.classification),
    `${record.id}: the restored configuration must be classified`);
  const durablyCommittedEntry = Number(record.facts.durableCommit) >=
      Number(record.facts.confIndex);
  if (!durablyCommittedEntry) {
    assert.equal(local.classification, record.facts.durableConfState,
      `${record.id}: with nothing durably committed above the applied ` +
        'index the peer may not move past its durable configuration');
  }

  // CLAIM 2 - convergence, separately, only after the network returns.
  const converged = record.eventualClusterConvergence;
  assert.equal(converged.converged, true,
    `${record.id}: every live peer must report one configuration once ` +
      `the network is restored (saw ${converged.distinctConfigurations})`);
}

// Round 1's restore oracle was another create_node on the same record, so it
// proved only that create_node returns what it is handed. This is the
// non-circular form: corrupt the durable record, restart isolated, and see
// which local oracle rejects it. 'Caught only by convergence' cannot happen
// here - convergence is never driven - so a corruption nothing sees is
// recorded as undetectable from durable state alone, with the obligation
// that follows for the host. A faked detection would be worse than the gap.
function assertTheCorruptionTableIsHonest() {
  const table = runDurableRecordCorruptions();
  assert.equal(table.driven, true, 'the corruption table must be driven');
  assert.ok(table.rows.length >= 9 * 20,
    `only ${table.rows.length} corruption rows were driven`);
  // The counts must come from the RECEIPT's own local checks, not from a
  // second set of oracles the receipt does not apply. Round 2 found the
  // artifact claiming 18 of 24 where the receipt caught 4.
  assert.match(table.judgedBy, /localRestoreViolations/u,
    'the corruption table must be judged by the receipt\'s own checks');
  for (const row of table.rows) {
    assert.ok(['caught', 'inert', 'missed'].includes(row.outcome),
      `${row.corruption} at ${row.at} has no outcome`);
  }

  for (const summary of table.summaries) {
    assert.ok(summary.rowsDriven > 0,
      `${summary.corruption} was not driven anywhere`);
    if (summary.notCaughtAt.length === 0) {
      continue;
    }
    // Every miss must be explained: either the row is one where a
    // consistently rewritten record cannot be contradicted, or the restored
    // configuration is still the correct one.
    assert.equal(summary.everyMissIsAnUndetectableRow, true,
      `${summary.corruption} was missed at rows that are neither ` +
      `undetectable nor harmless: ${JSON.stringify(summary.notCaughtAt)}`);
    assert.equal(summary.missesExplained.length, summary.notCaughtAt.length,
      `${summary.corruption} must explain every miss`);
    assert.ok(summary.hostObligation && summary.hostObligation.length > 80,
      `${summary.corruption} is not caught at [${summary.notCaughtAt}] and ` +
      'states no host obligation');
  }

  // At least one oracle that does NOT go through create_node/replay must
  // actually have caught something, or the table is circular again.
  const byCheck = new Set(table.summaries
    .flatMap((summary) => Object.keys(summary.caughtBy)));
  assert.ok(byCheck.has('term-and-vote-survived-the-restart'),
    'the victim\'s own pre-crash core read must have caught something');
  assert.ok(byCheck.has('restored-conf-state-matches-an-independent-oracle'),
    'the independent ConfState oracle must have caught something');
  for (const id of ['vote-dropped', 'term-zero']) {
    const summary = table.summaries
      .find((entry) => entry.corruption === id);
    assert.deepEqual(summary.notCaughtAt, [],
      `${id} must be caught at every row: this is the defect part A charges ` +
      'liferaft with');
  }
  // The ConfState rewrites must now be caught wherever they apply - round 2
  // measured 4 of 24 through the receipt while the table claimed 18.
  for (const id of ['add-a-voter', 'drop-a-voter']) {
    const summary = table.summaries
      .find((entry) => entry.corruption === id);
    assert.deepEqual(summary.notCaughtAt, [],
      `${id} must be caught locally at every row it applies to`);
  }
}

// The verifier moved each trigger one Ready earlier and one later - 36 cases
// in round 1, 180 in round 2 - and none survives. This is the permanent form
// of that attack: a shifted trigger must NOT produce a row that satisfies
// the boundary it claims to be.
function assertEveryTriggerShiftGoesRed() {
  const shifts = runTriggerShifts();
  assert.ok(shifts.total >= 36,
    `only ${shifts.total} trigger shifts were driven; the attack is every ` +
    'boundary, both roles, one earlier and one later');
  assert.deepEqual(shifts.survived, [],
    'a shifted trigger still satisfied the boundary it claims to be, so ' +
    `that boundary is vacuous: ${JSON.stringify(shifts.survived)}`);
  assert.equal(shifts.allShiftsRed, true,
    `${shifts.red} of ${shifts.total} shifts went red`);
  const contradicted = shifts.rows
    .filter((row) => row.outcome === 'facts-do-not-hold').length;
  assert.ok(contradicted > shifts.total / 2,
    `only ${contradicted} of ${shifts.total} shifts were driven and ` +
    'contradicted; the rest could not be driven at all');
}

// With the automatic transition the core appends the leave entry itself and
// surfaces nothing until a tick. A restart from the durable record alone
// must not invent it.
function assertTheAutoLeaveBoundary() {
  const record = runAutoLeaveSelfAppendedBoundary();
  assert.equal(record.driven, true, 'the auto-leave boundary must be driven');
  assert.equal(record.beforeTick.hasReadyAnywhere, false,
    'no peer may have a Ready pending at this boundary: a purely ' +
    'message-driven pump stalls here, which is the behavioural property a ' +
    'Multi-Raft host must know');
  assert.equal(record.stillJointBeforeTick, true,
    'before the tick the group must still be in the joint configuration');
  assert.equal(record.leaderAheadOfEveryFollowerBeforeTick, true,
    'the leader must hold the entry it appended to itself while no ' +
    `follower does (${JSON.stringify(record.beforeTick)})`);
  assert.equal(record.entryDurableButNotCommittedBeforeTick, true,
    'the self-appended entry must be durable on the leader and uncommitted');
  assert.ok(Number.isInteger(record.ticksNeededBeforeTheCoreSurfacedIt),
    'how many ticks the core needs before it surfaces its own entry must ' +
    `be MEASURED: ${record.ticksNeededBeforeTheCoreSurfacedIt}`);
  assert.equal(record.tickCommittedTheSelfAppendedEntry, true,
    'the tick must commit the entry the core appended to itself');
  assert.equal(record.everyPeerHoldsItAfterTheTick, true,
    'every peer must hold the entry after the tick');
  assert.equal(record.leftTheJointConfigurationOnlyAfterTheTick, true,
    'the joint configuration must be left only after the tick');
  assert.equal(record.restoredDidNotInventTheEntry, true,
    'a restart may not reconstruct an entry the durable record never held');
  assert.equal(record.restoredMatchesTheDurableConfiguration, true,
    'the restart must reconstruct exactly the durable configuration');
}

// `deterministic-drives` is sealed, and round 1 did not meet it. Proved
// rather than claimed, in-process.
function assertEveryRunIsIdentical() {
  const proof = runDeterminismProof();
  assert.equal(proof.runsPerScenario, 200,
    'the determinism proof must run each scenario 200 times');
  assert.ok(proof.totalRuns >= 200 * 2,
    'the proof must cover the lost-proposal case and the leader-victim ' +
    `boundaries, not ${proof.totalRuns} runs of one thing`);
  for (const scenario of proof.scenarios) {
    assert.equal(scenario.identical, true,
      `${scenario.scenario} produced different records across ` +
      `${scenario.runs} runs (first difference ${scenario.firstDifference}, ` +
      `runs ${scenario.differingRuns})`);
  }
  assert.equal(proof.allIdentical, true, 'every run must be identical');
}

function assertBoundaryFacts(record) {
  for (const field of REQUIRED_FACTS) {
    assert.ok(record.facts[field] !== undefined,
      `${record.id}: the boundary must record ${field}`);
  }
  for (const field of ['term', 'vote', 'commit']) {
    assert.equal(typeof record.facts.durableHardState[field], 'string',
      `${record.id}: the durable hard state must record ${field}`);
  }
  // Membership is never reduced to "current voters".
  for (const shape of [record.facts.durableConfStateFull,
    record.facts.inMemoryConfStateFull]) {
    for (const field of ['voters', 'votersOutgoing', 'learners',
      'learnersNext']) {
      assert.ok(Array.isArray(shape[field]),
        `${record.id}: the complete ConfState must record ${field}`);
    }
    assert.equal(typeof shape.autoLeave, 'boolean',
      `${record.id}: the complete ConfState must record autoLeave`);
  }
}

test('a restart at each of the nine boundaries reconstructs membership from ' +
  'durable raft state alone', () => {
  // The nine the owner named, plus the four verification round 1 found
  // missing: the LEAVE entry durable but not applied; a RETAINED follower as
  // the victim while joint; an apply reached in the LightReady phase; and
  // the auto-leave entry the core appends to itself before any tick, which
  // is driven separately below because no stop can reach it.
  const records = runBoundaryMatrix();
  for (const record of records) {
    assertOneBoundaryRow(record, record.boundary, record.role);
  }
  for (const boundary of NINE_BOUNDARIES) {
    assert.ok(records.some((record) => record.boundary === boundary),
      `${boundary} must still be in the matrix`);
  }
  for (const added of [RESTART_BOUNDARY.JOINT_LEAVE_DURABLE_NOT_APPLIED,
    RESTART_BOUNDARY.LIGHT_READY_APPLY]) {
    assert.ok(records.some((record) => record.boundary === added),
      `${added} was named as missing by verification round 1 and must be ` +
      'driven');
  }
  assert.ok(records.some((record) =>
    record.victimChoice === 'retained-follower'),
  'a follower the group KEEPS must be the victim while joint, not only ' +
  'the peer being removed');
  assert.ok(records.some((record) =>
    record.facts.readyPhaseReached === 'lightReady'),
  'a configuration entry applied in the LightReady phase must be driven');

  // Each boundary asserts its OWN defining facts, not merely that the
  // signatures differ.
  for (const record of records) {
    assert.equal(record.definingFacts.hold, true,
      `${record.id} does not show the facts that define its boundary: ` +
      JSON.stringify(record.definingFacts.mismatches));
    assert.ok(record.definingFacts.checked.length >= 5,
      `${record.id} is defined by only ${record.definingFacts.checked.length}` +
      ' facts, which is not enough to tell it from its neighbours');
  }
  assertEveryTriggerShiftGoesRed();
  assertTheAutoLeaveBoundary();
  assertEveryRunIsIdentical();

  // Distinctness is reported TWO ways. Over the whole host state (durable
  // plus in-memory plus the entry the core stored) every boundary is its
  // own. Over DURABLE state alone - which is what the rule is about - some
  // boundaries collide, and every collision must be an explicitly claimed
  // exemption whose members restore identically.
  const claims = new Map(INTENTIONALLY_INDISTINGUISHABLE
    .map((claim) => [[...claim.boundaries].sort().join('|'), claim]));
  const keyOf = (record) =>
    `${record.role}/${record.batch}/${record.victimChoice}/${record.shape}`;
  const groups = new Set(records.map(keyOf));
  for (const role of groups) {
    const forRole = records.filter((record) => keyOf(record) === role);
    const hostSignatures = forRole.map((record) => record.signature);
    assert.equal(new Set(hostSignatures).size, hostSignatures.length,
      `two boundaries serialize to the same HOST state for a ${role} ` +
      'victim, so one of them is vacuous');

    // Judged over FULL durable state - the five fields plus what the
    // durable log holds - and only for the mixed batch, which is the drive
    // that can tell the boundaries apart at all.
    const byDurable = new Map();
    for (const record of forRole) {
      byDurable.set(record.fullDurableSignature,
        [...(byDurable.get(record.fullDurableSignature) || []), record]);
    }
    for (const members of byDurable.values()) {
      if (members.length === 1) {
        continue;
      }
      // A collision only the conf-entry-alone shape produces is a property
      // of that shape; those rows are not counted toward distinctness. The
      // CLAIMED exemption is still asserted the strong way in every shape.
      const claimedHere = claims.has(
        members.map((record) => record.boundary).sort().join('|'));
      if (!claimedHere && members[0].batch !== BATCH.MIXED) {
        continue;
      }
      const key = members.map((record) => record.boundary).sort().join('|');
      const claim = claims.get(key);
      assert.ok(claim,
        `${role}: [${key}] share one durable state with no claimed ` +
        'exemption, so one of them is vacuous');
      assert.ok(claim.raftRsCitations.length > 0,
        `the exemption for [${key}] must cite the raft-rs contract`);

      // The check the exemption buys: identical durable state must mean an
      // identical restore, or something non-durable fed the restore.
      const images = members.map((record) =>
        JSON.stringify(record.localRestoreCorrectness.restoredImage));
      assert.equal(new Set(images).size, 1,
        `${role}: [${key}] share one durable state but restore ` +
        'differently, so something non-durable leaked into the restore: ' +
        `${images.join(' vs ')}`);
      // The strong form: identical durable state must also mean identical
      // RE-APPLY behaviour.
      const reapplies = members.map((record) => JSON.stringify({
        calls: record.localRestoreCorrectness.applyConfChangeCalls,
        fromOwnLog: record.localRestoreCorrectness.recoveredFromOwnLogAlone,
      }));
      assert.equal(new Set(reapplies).size, 1,
        `${role}: [${key}] share one durable state but re-apply ` +
        `differently: ${reapplies.join(' vs ')}`);
    }
  }

  // The restore check is not circular: each of nine corruptions of the
  // durable record is driven at every boundary for both roles, and what
  // catches it is named - locally, inside the isolated window.
  assertTheCorruptionTableIsHonest();

  // A joint restart must have carried the joint configuration itself.
  const jointRow = records.find((record) =>
    record.localRestoreCorrectness.restoredConfState.votersOutgoing
      .length > 0);
  assert.ok(jointRow,
    'a restart must have reconstructed a joint configuration from durable ' +
    'state, outgoing set included');
});

test('a configuration change lost with its leader leaves no trace anywhere',
  () => {
    const record = runLostProposal();
    assert.equal(record.driven, true,
      `the lost-proposal case was not driven: ${record.reason}`);
    assert.equal(record.witness.refusals, 0,
      'no membership value may have bypassed a core read');

    // The proposal really was lost: nothing of that Ready left the leader
    // and nothing of it reached the leader's own durable log.
    assert.ok(record.leaderOutboundBlockedForThatCycle > 0,
      'the leader\'s outbound messages for that cycle must have been ' +
      'withheld, or the proposal was not lost');
    assert.ok(Number(record.leaderDurableLastIndex) <
      Number(record.confIndex),
    'the leader must have died before its own log held the entry');
    assert.equal(record.noSurvivorKnewTheEntry, true,
      'no survivor may hold the configuration entry: ' +
      JSON.stringify(record.survivorsBefore));

    // The safety property: the restored peer is exactly what its durable
    // state entitles it to, and no peer ever reports a configuration no
    // durable log justifies.
    assert.equal(record.restoredMatchesEntitlement, true,
      'the restarted old leader must restore exactly its durable ' +
      'configuration');
    assert.equal(record.changeTookEffect, false,
      'a change no durable log records may never take effect');
    assert.equal(record.allPeersAgreeAtTheEnd, true,
      'every peer must agree on one configuration at the end');

    // Internal consistency of what was observed afterwards.
    assert.ok(record.newLeaderAfterCrash,
      'the survivors must have elected a leader');
    assert.equal(typeof record.newLeaderPendingConfIndex, 'number',
      'the new leader\'s pending configuration index must be recorded');
    assert.ok(record.followOnChange,
      'a follow-on configuration change must have been attempted');
    assert.equal(record.followOnChange.committed, true,
      'a new configuration change must still be possible afterwards');

    // The verifier's variant: ONE follower held the entry. The change may
    // legitimately commit, so only the safety property is asserted.
    const variant = runLostProposalOneFollower();
    assert.equal(variant.driven, true,
      `the one-follower variant was not driven: ${variant.reason}`);
    assert.equal(typeof variant.atLeastOneSurvivorHeldTheEntry, 'boolean',
      'whether a survivor held the entry must be recorded');
    assert.equal(variant.allPeersAgreeAtTheEnd, true,
      'every peer must end on one configuration: ' +
      JSON.stringify(variant.finalConfStateByPeer));
    if (variant.changeTookEffect) {
      assert.equal(variant.atLeastOneSurvivorHeldTheEntry, true,
        'a change may take effect only if some durable log held it');
    }
  });

// The verifier disabled isolation entirely and leaked a message into the
// window, and the nine-boundary receipt stayed green both times - because
// there was no traffic in the window to block. The window here is driven
// with real traffic first, so the counters are shown to move, and only then
// is a message leaked into it.
const HEARTBEAT = Object.freeze({
  MSG_HEARTBEAT: 8, TICKS: 5, SETTLE: 400,
  MESSAGE: Object.freeze({from: '1', to: '2', msgType: 8, term: '1',
    logTerm: '0', index: '0', commit: '0', entries: [], reject: false,
    rejectHint: '0'}),
});

function deltaOf(after, before) {
  return {
    delivered: after.delivered - before.delivered,
    blockedInbound: after.blockedInbound - before.blockedInbound,
    blockedOutbound: after.blockedOutbound - before.blockedOutbound,
  };
}

test('the isolated restore window refuses any message that crosses it', () => {
  // (1) The window really carries traffic, and the per-victim counters see
  //     it blocked rather than delivered.
  const live = createDeterministicCluster({voters: ['1', '2', '3']});
  try {
    live.core.campaign(live.handleOf('1'));
    live.settle(HEARTBEAT.SETTLE);
    live.setIsolated('2', true);
    const before = live.isolationCountersOf('2');
    live.tick(HEARTBEAT.TICKS);
    live.settle(HEARTBEAT.SETTLE);
    const isolated = deltaOf(live.isolationCountersOf('2'), before);
    assert.ok(isolated.blockedInbound > 0,
      'the window must have had messages attempted at the victim, or it ' +
      `measures nothing (${JSON.stringify(isolated)})`);
    assert.equal(isolated.delivered, 0,
      'nothing may reach an isolated peer');

    // (2) The same window with isolation OFF delivers - so the counter is a
    //     measurement, not a constant zero.
    live.setIsolated('2', false);
    const open = live.isolationCountersOf('2');
    live.tick(HEARTBEAT.TICKS);
    live.settle(HEARTBEAT.SETTLE);
    assert.ok(deltaOf(live.isolationCountersOf('2'), open).delivered > 0,
      'with isolation off the same traffic must be delivered, or the ' +
      'counter cannot tell the two windows apart');
  } finally {
    live.free();
  }

  // (3) A message leaked INTO a window that has traffic must throw.
  const leaked = createDeterministicCluster({voters: ['1', '2', '3']});
  try {
    leaked.core.campaign(leaked.handleOf('1'));
    leaked.settle(HEARTBEAT.SETTLE);
    leaked.setIsolated('2', true);
    leaked.tick(HEARTBEAT.TICKS);
    leaked.settle(HEARTBEAT.SETTLE);
    // Bypass routing to prove the guard, not the routing.
    leaked.injectForTest('2', {...HEARTBEAT.MESSAGE});
    assert.throws(() => leaked.settle(HEARTBEAT.SETTLE),
      new RegExp(ISOLATION_BREACH.trim(), 'u'),
      'a message reaching an isolated peer must throw, so an isolated ' +
      'restore claim can never rest on the network');
  } finally {
    leaked.free();
  }
});

test('ready and persistence ordering holds and the returned ConfState is ' +
  'the durable one', () => {
  const record = runReadyOrdering();
  assert.equal(record.witness.refusals, 0,
    'no membership value may have bypassed a core read');

  for (const [peerId, peer] of Object.entries(record.perPeer)) {
    // The adapter's own write log must follow the contract derived from the
    // raft-rs source, cycle by cycle.
    const conformance = writeLogConformsToContract(
      peer.kinds.map((kind) => ({write: kind})));
    assert.equal(conformance.conforms, true,
      `${peerId}: the durable write order violates the contract derived ` +
      `from raft-rs: ${JSON.stringify(conformance.violations)}`);

    assert.ok(peer.firstAdvanceAppendAt > 0,
      `${peerId}: a Ready must have been advanced at least once`);
    assert.ok(peer.wroteBeforeFirstAdvance.includes('hardState') ||
      peer.wroteBeforeFirstAdvance.includes('entries'),
    `${peerId}: the hard state or the entries must be written before the ` +
      'first advance');
    assert.ok(peer.confStateWriteAt >= 0,
      `${peerId}: the configuration change must have been recorded`);
    assert.ok(peer.advanceApplyAfterConfAt > peer.confStateWriteAt,
      `${peerId}: the returned ConfState must be recorded before the apply ` +
      'index advances past the configuration entry');
    assertMembershipEqual(peer.durableConfState.voters,
      peer.reportedConfState,
      `${peerId}: the durable ConfState must be the one the core reports`);
  }
  assert.ok(record.appliedConf.length > 0,
    'a configuration entry must have been applied');
});

// THE NEGATIVE CONTROL for the classifier. Verification round 2 found that
// `runHostOrderMutants` could not fail: the correct host itself scored
// `unsafe-recorded` at conf-applied-conf-state-not-recorded (with a finding
// that was FALSE at that stop - the durable configuration there is old), so
// `survivors: []` and the decisive `mutantsKilled` input were true by
// construction. A mutant matrix with no honest control proves nothing.
test('the host-order classifier can fail: the correct host and an inert ' +
  'switch are classified safe at every stop', () => {
  const control = runHostOrderControl();
  assert.equal(control.controls.length, 2,
    'the control must run BOTH the correct host and an inert switch');
  for (const entry of control.controls) {
    assert.ok(entry.attempts.length >= 3,
      `${entry.control}: the control must use the same stops as the mutants`);
    assert.deepEqual(entry.unsafeAt, [],
      `${entry.control} was classified unsafe by the same classifier that ` +
      'judges the mutants, so the classifier cannot fail: ' +
      JSON.stringify(entry.unsafeAt));
    assert.equal(entry.safeAtEveryStop, true,
      `${entry.control} must be classified safe at every stop`);
  }
  assert.equal(control.everyControlSafe, true,
    'a mutant matrix whose honest control is not safe proves nothing');
});

test('every adversarial host persistence order is refused, breaks restart ' +
  'equivalence, or is recorded unsafe', () => {
  const record = runHostOrderMutants();
  assert.equal(record.total, 11, 'all eleven host-order mutants must be run');
  // The matrix means nothing without the control beside it.
  assert.equal(record.classifierCanFail, true,
    'the honest control was not classified safe, so `survivors: []` is true ' +
    'by construction: ' + JSON.stringify(record.control.controls
      .flatMap((entry) => entry.unsafeAt)));
  // Every finding must be TRUE at the stop it is reported at.
  for (const mutant of record.mutants) {
    for (const attempt of mutant.attempts) {
      if (attempt.outcome === MUTANT_OUTCOME.PASSED_SILENTLY) {
        continue;
      }
      assert.ok(attempt.message === null ||
        typeof attempt.message === 'string',
      `${mutant.mutant}/${attempt.stopAt}: a finding must be recorded`);
    }
    assert.ok(mutant.attempts.some((attempt) =>
      attempt.outcome !== MUTANT_OUTCOME.PASSED_SILENTLY),
    `${mutant.mutant} was not caught at any stop`);
  }

  // The order this evaluation used before verification round 1 must be
  // refused by the core, with the message raft-rs gives.
  const order = record.mutants
    .find((mutant) => mutant.mutant === 'apply-before-persisting-commit');
  assert.ok(order, 'the pre-repair order must be kept as a mutant');
  assert.equal(order.outcome, MUTANT_OUTCOME.REFUSED,
    'applying before persisting the commit index must be refused: ' +
    JSON.stringify(order.attempts));
  assert.match(order.message, /applied\(\d+\) is out of range/u,
    'the refusal must be the raft_log.rs range check');
  for (const mutant of record.mutants) {
    assert.notEqual(mutant.outcome, MUTANT_OUTCOME.PASSED_SILENTLY,
      `${mutant.mutant} completed silently and safely, so the adapter ` +
      'could implement it without anything noticing');
    assert.ok([MUTANT_OUTCOME.REFUSED,
      MUTANT_OUTCOME.RESTART_EQUIVALENCE_FAILED,
      MUTANT_OUTCOME.UNSAFE_RECORDED].includes(mutant.outcome),
    `${mutant.mutant} must record one of the three outcomes`);
    if (mutant.outcome !== MUTANT_OUTCOME.RESTART_EQUIVALENCE_FAILED) {
      assert.ok(mutant.message,
        `${mutant.mutant} must record why it was caught`);
    }
  }
  assert.deepEqual(record.survivors, [],
    'no host-order mutant may survive');
});

test('re-applying an already-applied configuration entry is measured, not ' +
  'assumed', () => {
  const simple = runReapplicationIdempotence();
  assert.equal(simple.witness.refusals, 0,
    'no membership value may have bypassed a core read');
  assert.ok(simple.confEntryIndex,
    'a committed configuration entry must have been durable to re-apply');
  assert.ok(simple.reapply, 'the re-application must have been recorded');
  if (simple.reapply.ok) {
    assertMembershipEqual(simple.votersAfterReapply,
      simple.reapply.returnedVoters,
      'the configuration after re-application must be the one returned');
  } else {
    assert.ok(simple.reapply.threw,
      'a re-application that did not succeed must record why');
  }

  // The joint case, which is NOT the same question.
  const joint = runJointReapplication();
  assert.ok(joint.enterEntryIndex,
    'a durable enter-joint entry must have been available');
  assert.ok(joint.reapply, 'the joint re-application must be recorded');
  assert.ok(joint.reapply.ok || joint.reapply.threw,
    'the core either accepted or refused it, and which is the finding');
  if (joint.reapply.threw) {
    assertMembershipEqual(joint.afterReapply.votersOutgoing,
      joint.restoredJoint.votersOutgoing,
      'a refused re-application must not have changed the configuration');
  }
});

// B2, named: the two refusals verification round 1 found the host swallowing
// must not occur under the corrected, atomic host - and the control shows
// the message is reachable, so the absence means something.
test('the core refusals round 1 swallowed do not occur under the corrected ' +
  'atomic host', () => {
  const record = runApplyRefusalRegression();
  assert.ok(record.rowsChecked > 30,
    `only ${record.rowsChecked} rows were checked for swallowed refusals`);
  assert.deepEqual(record.offendingRefusals, [],
    'the corrected host produced a refusal it must not: ' +
    JSON.stringify(record.offendingRefusals));
  assert.equal(record.noneUnderTheCorrectedHost, true,
    `neither of [${record.mustNotHappen}] may occur`);

  // The control: an assertion of absence proves nothing unless the thing can
  // be produced. Re-delivering a committed enter-joint entry to a peer that
  // is already joint produces one of the two messages, and the harness
  // surfaces it instead of advancing past it.
  assert.equal(record.control.messageIsReachable, true,
    'the control must actually produce one of the refusals, or the ' +
    `regression test above is vacuous (saw ${record.control.refusal})`);
  assert.match(String(record.control.refusal), /config is already joint/u,
    'the control refusal must be the one the verifier saw');

  // The non-atomic host - the shape that produced them in round 1 - is
  // recorded as unsafe rather than passing silently.
  assert.notEqual(record.nonAtomicHost.outcome, 'passed-silently',
    'writing the ConfState and the applied index separately must not pass ' +
    'silently');
  assert.ok(record.nonAtomicHost.unsafeFlags.length > 0,
    'the non-atomic host must be recorded unsafe');
});

// ===========================================================================
// NEGATIVE CONTROLS for the restore oracle (verification round 2, B3).
//
// Round 2 defeated the restore receipt three ways, and each is a permanent
// test here. The ones that matter most are the two the owner named: a
// service-row cache repairing the restore, and a binding restore bug. Each
// is patched into the REAL receipt path - between the crash and the restart
// of an ordinary matrix row - and the receipt's own local checks must go red
// INSIDE the isolated window, before any convergence.
// ===========================================================================

// The only rows where a consistently rewritten durable record is
// unfalsifiable: the configuration entry is durable and NOT applied, so the
// durable ConfState is the only statement of the configuration, and the
// single-voter shape has no survivor to disagree with.
const UNDETECTABLE_ROWS =
  /^(joint-entered|joint-leave-entry-durable-not-applied|lightready-phase-apply)/u;

const SERVICE_ROW_CACHE_ENV = 'LAGRANGE_RAFT_EVAL_SERVICE_ROW_LEARNER';

// (a) The owner's attack, verbatim: a service-row cache injects a learner
//     into every restored ConfState. Round 2 ran it through an env var and
//     all fifteen core tests stayed green.
function serviceRowCacheFault() {
  process.env[SERVICE_ROW_CACHE_ENV] = '9';
  const injected = process.env[SERVICE_ROW_CACHE_ENV];
  return {
    why: `a service-row cache injecting learner ${injected} into the restore`,
    mutateRestoredConfState: (state) => ({
      ...state,
      learners: [...(state.learners || []), injected],
    }),
  };
}

// (b) and (c) simulated binding restore bugs.
const RESTORE_BUGS = Object.freeze([
  {
    name: 'the binding drops the learners set on restore',
    fault: {
      why: 'a binding restore bug that drops the learners set',
      mutateRestoredConfState: (state) => ({...state, learners: []}),
    },
  },
  {
    name: 'the binding truncates the outgoing set on restore',
    fault: {
      why: 'a binding restore bug that truncates the outgoing set',
      mutateRestoredConfState: (state) => ({...state, votersOutgoing: []}),
    },
  },
]);

// (d) the durable-record corruptions, patched into the real receipt path.
const RECORD_CORRUPTIONS = Object.freeze([
  {name: 'add a voter', corruptRecord: (record) => {
    record.confState = {...record.confState,
      voters: [...(record.confState.voters || []), '9']};
  }},
  {name: 'drop a voter', corruptRecord: (record) => {
    record.confState = {...record.confState,
      voters: [...(record.confState.voters || [])].slice(1)};
  }},
  {name: 'learner into voter', corruptRecord: (record) => {
    const learners = [...(record.confState.learners || [])];
    if (learners.length === 0) {
      return;
    }
    record.confState = {...record.confState,
      voters: [...(record.confState.voters || []), learners[0]],
      learners: learners.slice(1)};
  }},
  {name: 'drop the outgoing set', corruptRecord: (record) => {
    record.confState = {...record.confState, votersOutgoing: []};
  }},
  {name: 'term rewound to zero', corruptRecord: (record) => {
    record.hardState = {...(record.hardState || {}), term: '0'};
  }},
  {name: 'vote dropped', corruptRecord: (record) => {
    record.hardState = {...(record.hardState || {}), vote: '0'};
  }},
  {name: 'commit rewound', corruptRecord: (record) => {
    record.hardState = {...(record.hardState || {}), commit: '1'};
  }},
]);

// Run one fault through the REAL receipt path on every mixed-batch row, and
// report where the receipt's own local checks caught it.
//
// A fault that changes NOTHING observable at a row is INERT there, not
// missed: dropping the learners set where the configuration has no learners,
// or promoting learner 4 where the change under test promotes it anyway,
// alters nothing for a receipt to see. Each row is therefore driven honestly
// first and the two outcomes compared - the same `__changed` guard the
// round-2 verifier used, made permanent.
const MIXED_SPECS = boundaryMatrixSpecs()
  .filter((entry) => entry.batch === BATCH.MIXED);

function specTag(spec) {
  return `${spec.boundary}/${spec.role}/${
    spec.options.victimChoice || 'departing'}`;
}

function driveWithFault(fault) {
  const caught = [];
  const missed = [];
  const inert = [];
  for (const spec of MIXED_SPECS) {
    const tag = specTag(spec);
    setRestoreFaultForNegativeControl(null);
    const honest = runRestartBoundary(
      spec.boundary, spec.role, spec.batch, spec.options);
    setRestoreFaultForNegativeControl(fault);
    let row = null;
    try {
      row = runRestartBoundary(
        spec.boundary, spec.role, spec.batch, spec.options);
    } catch (error) {
      caught.push({at: tag, by: 'threw', message: String(error?.message)});
      continue;
    } finally {
      setRestoreFaultForNegativeControl(null);
    }
    const violations = localRestoreViolations(row);
    if (violations.length > 0) {
      caught.push({at: tag, by: violations[0].check});
    } else if (restoreOutcomeFingerprint(row) === restoreOutcomeFingerprint(honest)) {
      inert.push(tag);
    } else {
      missed.push(tag);
    }
  }
  setRestoreFaultForNegativeControl(null);
  return {caught, missed, inert,
    rows: caught.length + missed.length + inert.length};
}

test('a service-row cache or a binding bug cannot repair the restore', () => {
  // The harness must carry no fault of its own.
  assert.equal(restoreFaultIsArmed(), false,
    'a restore fault was left armed outside a negative control');

  const cache = driveWithFault(serviceRowCacheFault());
  assert.ok(cache.rows > 20,
    `only ${cache.rows} rows were driven under the cache attack`);
  assert.deepEqual(cache.missed, [],
    'a service-row cache injected a learner into the restored ConfState and ' +
    `the receipt did not notice at: ${JSON.stringify(cache.missed)}`);

  for (const bug of RESTORE_BUGS) {
    const result = driveWithFault(bug.fault);
    assert.deepEqual(result.missed, [],
      `${bug.name}: the receipt did not notice at ` +
      `${JSON.stringify(result.missed)}`);
  }
  assert.equal(restoreFaultIsArmed(), false,
    'the negative control must disarm its fault');
});

test('durable-record corruptions patched into the real receipt path go red ' +
  'locally', () => {
  const table = [];
  for (const corruption of RECORD_CORRUPTIONS) {
    const result = driveWithFault(
      {why: corruption.name, corruptRecord: corruption.corruptRecord});
    table.push({corruption: corruption.name, ...result});
  }
  for (const entry of table) {
    assert.ok(entry.caught.length > 0,
      `${entry.corruption} was not caught locally anywhere`);
    // Where a corruption is not caught, the row must be one the artifact
    // records as undetectable from durable state alone WITH a host
    // obligation - it may never be silently missed.
    for (const at of entry.missed) {
      assert.ok(UNDETECTABLE_ROWS.test(at),
        `${entry.corruption} was missed at ${at}, which is not a row the ` +
        'evaluation records as undetectable from durable state alone');
    }
  }
});
