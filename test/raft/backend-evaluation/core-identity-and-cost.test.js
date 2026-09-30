// Peer identity across the JavaScript boundary, and what Multi-Raft hosting
// costs in the shape production would actually use.
//
// The identity mapping is a CONTRACT STATEMENT and a test double. No
// production mapper is written by this quest; what is established is which
// properties a mapper must have, and that the binding carries the resulting
// sixty-four-bit values without the loss an ordinary JavaScript number
// inflicts on them.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  runIngressValidation,
  runMultiRaftCost,
  runPanicIsolation,
  runPeerIdentity,
  runRuntimeTrapRecovery,
} from './core-scenarios.js';

const COST_LIMITS = Object.freeze({
  // Not a budget: a sanity bound that would catch an accidental layout in
  // which each group brought its own runtime. One WASM runtime is about a
  // megabyte, so a per-group bound anywhere near that means a thousand of
  // them were created.
  RUNAWAY_BYTES_PER_GROUP: 1024 * 1024,
});

test('peer identity is stable, never reused, and safe across the JavaScript ' +
  'boundary', () => {
  const record = runPeerIdentity();

  assert.equal(record.mapping.stableAcrossRestart, true,
    'the id must reconstruct deterministically from the identity alone');
  assert.equal(record.mapping.stableAcrossAddressChange, true,
    'moving a replica to another address must not change its peer id');
  assert.equal(record.mapping.distinctOnOneNode, true,
    'distinct replicas on one physical node must get distinct ids');
  assert.equal(record.mapping.neverReserved, true,
    'no replica may be given the id raft-rs reserves for "no peer"');
  assert.equal(record.mapping.deterministic, true,
    'the mapping must be a function of the identity');
  assert.ok(record.reuseRefusal.refused,
    'a retired id offered to another logical replica must be refused, not ' +
    'resolved');
  // Round 1's retired set was an in-memory Map, so "never reassigned after
  // deletion" was a property of the process staying alive. It is now a
  // durable store double, and the refusal must survive the owner dying.
  assert.ok(record.durableRetiredSet.retiredRows > 0,
    'the retirement must have been written to the durable store');
  assert.ok(record.reuseRefusalAfterOwnerRestart.refused,
    'the refusal must survive a restart of the mapping owner, which is ' +
    'rebuilt from its durable rows alone: ' +
    JSON.stringify(record.reuseRefusalAfterOwnerRestart));
  // The address is an INPUT the mapping ignores, compared at two different
  // values - round 1 wrote these two properties as the same expression.
  assert.equal(record.mapping.addressesCompared.length, 2,
    'two different addresses must have been compared');
  assert.notEqual(record.mapping.addressesCompared[0],
    record.mapping.addressesCompared[1],
    'the two addresses must actually differ');

  // The boundary itself.
  assert.equal(record.boundary.numberWouldLose, true,
    'the ids driven must be beyond what a JavaScript number can hold');
  assert.ok(record.boundary.outboundCount > 0,
    'the campaign must have produced messages to the other peers');
  assert.equal(record.boundary.fromExact, true,
    'every sender id must cross the boundary exactly');
  assert.equal(record.boundary.toExact, true,
    'every recipient id must cross the boundary exactly');
  assert.equal(record.boundary.voteExact, true,
    'the vote the core recorded must be the exact sixty-four-bit id');
  assert.equal(record.boundary.confStateExact, true,
    'the configuration the core reports must carry the exact ids');
  assert.ok(record.boundary.numericIdAccepted.refused,
    'a JavaScript number as an id must be refused rather than silently ' +
    'rounded');
});

test('Multi-Raft cost separates the runtime from the RawNode in the ' +
  'intended hosting shape', () => {
  const record = runMultiRaftCost();

  // The numbers are preliminary and must say so.
  assert.equal(record.preliminary, true,
    'the Multi-Raft numbers must be labelled preliminary');
  assert.match(record.scope, /do NOT extrapolate/u,
    'the record must state what these numbers do not cover');

  // The intended shape, asserted rather than assumed.
  assert.equal(record.oneRuntime, true,
    'the binding must resolve to one runtime shared by every handle');
  assert.ok(record.runtimeBytesAtStart > 0,
    'the one-time runtime cost must be recorded separately');

  assert.equal(record.perGroup.length, 3,
    'the cost must be measured at N = 1, 100 and 1000');
  for (const entry of record.perGroup) {
    assert.ok(entry.handlesLive >= entry.groups,
      `${entry.groups} groups must all have been live in the one runtime`);
    assert.ok(Number.isFinite(entry.idleTickNanosPerGroup),
      `an idle tick cost must be measured at N=${entry.groups}`);
    assert.ok(Number.isFinite(entry.hasReadyScanNanosPerGroup),
      `a has_ready scan cost must be measured at N=${entry.groups}`);
    assert.ok(Number.isFinite(entry.readyCycleNanosPerGroup),
      `a Ready-processing cost must be measured at N=${entry.groups}`);
    assert.ok(entry.incrementalBytesBound >= 0,
      'incremental memory is a bound and cannot be negative');
  }

  // The thousand-group case must not have been a thousand runtimes.
  const largest = record.perGroup[record.perGroup.length - 1];
  assert.ok(largest.bytesPerGroupBound < COST_LIMITS.RUNAWAY_BYTES_PER_GROUP,
    'the per-group memory bound indicates one runtime per group: ' +
    `${largest.bytesPerGroupBound} bytes per group at N=${largest.groups}`);
  assert.ok(Number.isFinite(record.confChangeNanos) &&
    record.confChangeNanos > 0,
  'the cost of one committed configuration change must be measured');

  // The hosting shape only stands if the runtime is GENUINELY usable after
  // a raft-rs fatal, not merely if a few calls return.
  const isolation = runPanicIsolation();
  assert.ok(isolation.fatal.trapped,
    'the fatal must actually have trapped');
  assert.equal(isolation.bystanderUsable, true,
    'another group in the same runtime must run a FULL scenario after the ' +
    `fatal: ${JSON.stringify(isolation.bystanderFullScenario)}`);
  assert.equal(isolation.bystanderFullScenario.allAgree, true,
    'that scenario must end with every peer agreeing');
  assert.equal(isolation.deadGroupRecoverable, true,
    'the group that died must be rebuilt from its durable record in the ' +
    `same runtime: ${JSON.stringify(isolation.rebuiltFromDurableRecord)}`);
  assert.equal(isolation.leak.runtimeStillUsableAfterRepeatedFatals, true,
    'repeated fatals must not degrade the runtime');
  assert.ok(Number.isFinite(isolation.leak.growthBytes),
    'what the trap leaks must be measured, not assumed');
  assert.match(isolation.hostingShapeConclusion, /^one runtime holding many/u,
    'the hosting-shape conclusion must follow from the proof');
});

// ===========================================================================
// DEFECT 4 (verification round 2): the panic-isolation conclusion was
// overclaimed. `with_node` does fix the handle-table poisoning, but aborts
// are a FINITE per-instance budget - after about three hundred, every call
// on every group traps - and fatals are remotely triggerable. The claims
// "the blast radius is exactly the group", "found-and-fixed" and "one
// runtime STANDS" are withdrawn, and what replaces them is measured.
// ===========================================================================

test('a fatal is a runtime-health event with a measured budget and a ' +
  'bounded recovery', () => {
  const record = runRuntimeTrapRecovery();
  assert.equal(record.preliminary, true,
    'the recovery figures must be labelled preliminary');

  // The budget is MEASURED, not a constant. Two runs gave 299 and 304.
  assert.ok(record.budget.fatalsBeforeTheRuntimeDied > 0,
    'the fatal budget must be measured');
  assert.equal(record.budget.runtimeDied, true,
    'the runtime must be shown to die, or the budget is not a budget: ' +
    JSON.stringify(record.budget));
  assert.match(String(record.budget.bystanderFailure),
    /memory access out of bounds/u,
    'the measured failure must be the one the verifier saw');
  assert.ok(record.budget.fatalsBeforeTheRuntimeDied <
    record.budget.boundedBy,
  'the storm must end inside its bound, or the budget was not reached');

  // The claims this replaces are named, so nobody can read the artifact and
  // still believe them.
  assert.equal(record.withdrawnClaims.length, 3,
    'the three overclaimed statements must be withdrawn by name');
  assert.match(record.hostingConclusion,
    /viable only if a trap\/fatal is treated as a runtime-health event/u,
    'the hosting conclusion must be the owner\'s wording');

  // Recovery: a fresh instance restores the healthy groups and REPORTS the
  // damaged one rather than retrying it.
  assert.equal(record.recovery.length, 2,
    'recovery must be measured at two group counts');
  for (const entry of record.recovery) {
    assert.ok(entry.groupsRestored >= entry.groups - 1,
      `${entry.groups}: the healthy groups must restore into a fresh ` +
      `instance (${entry.groupsRestored})`);
    assert.ok(entry.damagedGroupReported,
      `${entry.groups}: the damaged group must be REPORTED, not silently ` +
      'dropped');
    assert.equal(entry.damagedGroupRetriedForever, false,
      `${entry.groups}: the damaged group must not be retried forever`);
    assert.ok(Number.isFinite(entry.recoveryNanos) && entry.recoveryNanos > 0,
      `${entry.groups}: recovery time must be measured`);
    assert.ok(Number.isFinite(entry.recoveryMemoryBytes),
      `${entry.groups}: recovery memory must be measured`);
  }
});

test('the host validates the envelope before step, and honest traffic is ' +
  'unaffected', () => {
  const record = runIngressValidation();
  assert.ok(record.shapes.length >= 8,
    'the hostile shapes the verifier found must be driven');

  // Every shape is accounted for: refused by the validator, still reaching a
  // fatal (a named residue), or legitimately passed to the core.
  for (const shape of record.shapes) {
    assert.ok(['refused-by-the-host-validator', 'STILL-REACHES-A-FATAL',
      'passed-to-the-core'].includes(shape.outcome),
    `${shape.shape} has no outcome`);
  }
  assert.ok(record.refusedByTheValidator > 0,
    'the validator must refuse something, or it is decorative');

  // The shapes that reach a fatal through a MISROUTED envelope - another
  // group, another recipient, an unknown sender - must all be refused: that
  // is the Multi-Raft hazard.
  for (const name of ['heartbeat addressed to another peer (misrouted)',
    'heartbeat commit beyond last index, from an unknown peer']) {
    const shape = record.shapes.find((entry) => entry.shape === name);
    assert.equal(shape.outcome, 'refused-by-the-host-validator',
      `${name} must be refused by the envelope validator`);
  }

  // What still reaches a fatal is a NAMED residue, not a silence.
  assert.ok(Array.isArray(record.stillReachAFatal),
    'the residue must be recorded');

  // The control: the validator may not reject anything legitimate.
  assert.equal(record.honestTrafficControl.validatorRejectedNothingHonest,
    true,
    'the validator rejected honest traffic: ' +
    JSON.stringify(record.honestTrafficControl.refusals));
  assert.equal(record.honestTrafficControl.converged, true,
    'a full configuration change must still converge with the validator on');
});
