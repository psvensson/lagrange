// Complete native vectors for the proposed ordering contract, not an F1
// supersession. The original F1 and W07 tests remain immutable.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RAFT_OPERATION_OUTCOME} from '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_MESSAGE_TYPE} from '../../../src/raft/raft-rs-ingress-constants.js';
import {RAFT_RS_CORE_REFUSAL_TEXT} from '../../../src/raft/raft-rs-core-constants.js';
import {RUNTIME_PHASE, RUNTIME_REASON} from
  '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {encodeProposal} from '../../../src/raft/raft-rs-proposal-codec.js';
import {hash} from './runtime-captured-inbound-companion-fixture.js';
import {ORDER, PHASE, orderingCells, runOrdering} from
  './runtime-ordering-native-companion-fixture.js';

function measuredEvents(result, kind) {
  return result.events.filter((event) =>
    event.phase === PHASE.MEASURED && event.kind === kind);
}

function outboundPackets(result) {
  return measuredEvents(result, 'native-send')
    .map(({from, address, packet}) => ({from, address, packet}));
}

function nativeSteps(result) {
  return measuredEvents(result, 'native-call').filter((event) =>
    event.operation === 'step');
}

function voteStep(result) {
  const matches = nativeSteps(result).filter((event) =>
    hash(event.args[0]) === hash(result.vote.message));
  assert.equal(matches.length, 1, 'the exact supplied vote enters native step once');
  return matches[0];
}

function selectedEntries(result, cell) {
  if (cell.decision === 'D3') {
    const hex = Buffer.from(encodeProposal({decision: 'propose', at: cell.requester}))
      .toString('hex');
    return measuredEvents(result, 'native-call').filter((event) =>
      event.operation === 'propose' && event.proposalHex === hex);
  }
  return nativeSteps(result).filter((event) =>
    event.args[0].msgType === RAFT_RS_MESSAGE_TYPE.TRANSFER_LEADER);
}

function assertCustody(result, cell) {
  assert.deepEqual(result.observationErrors, [], 'passive observations succeeded');
  assert.equal(result.failure, null);
  assert.equal(result.measured.rejected, false, 'the actual selected invocation fulfilled');
  assert.equal(result.deliveries.length, result.prefix.length + 1);
  const accepted = measuredEvents(result, 'inbound-stage').filter((event) =>
    event.stage === 'accepted' && event.replicaIdentity === cell.requester);
  assert.equal(accepted.length, result.prefix.length + 1);
  for (const event of measuredEvents(result, 'delivery-answer')) {
    assert.deepEqual(event.result, {outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
      reason: RUNTIME_REASON.INBOUND_ENQUEUED});
    assert.equal(event.unchanged, true, 'transport acceptance preserved input bytes');
  }
  const envelopeHashes = result.prefix.map(hash);
  const producer = result.events.filter((event) => event.phase === PHASE.SETUP &&
    event.kind === 'native-send' && envelopeHashes.includes(event.packetHash));
  assert.deepEqual(producer.map((event) => event.packetHash), envelopeHashes,
    'the prefix is the exact ordered output of actual native sends during setup');
  const prefixHashes = result.prefix.map((packet) => hash(packet.message));
  const prefix = nativeSteps(result).filter((event) =>
    prefixHashes.includes(hash(event.args[0])));
  assert.deepEqual(prefix.map((event) => hash(event.args[0])), prefixHashes,
    'all preaccepted response occurrences enter the native core in their exact order');
  assert.equal(result.measured.state.clockNow, result.initial.clockNow);
  assert.equal(measuredEvents(result, 'owned-clock-dispatch').length, 1);
  assert.ok(result.measured.completions.every((receipt) => receipt.settled),
    'all observed sends and the selected invocation settled before post-observation drivers');
  assert.ok(result.measured.completions.every((receipt) => !receipt.rejected));
  assert.equal(measuredEvents(result, 'native-call').filter((event) =>
    event.operation === 'tick').length, 0, 'the measured clock dispatch is not a Raft tick');
  return {prefix, vote: voteStep(result)};
}

function assertLateOrder(result, cell) {
  const {prefix, vote} = assertCustody(result, cell);
  const selected = selectedEntries(result, cell);
  assert.equal(selected.length, 1, 'exactly one selected operation enters native');
  assert.ok(prefix.every((event) => event.order < selected[0].order));
  assert.ok(selected[0].order < vote.order, 'native O precedes native V');
  const acceptedVote = measuredEvents(result, 'delivery-answer')
    .find((event) => event.label === 'vote');
  const settled = measuredEvents(result, 'promise-observed-fulfilled')
    .find((event) => event.label === 'selected-operation');
  if (result.order === ORDER.LATE) {
    const held = measuredEvents(result, 'held-send-cut')[0];
    const release = measuredEvents(result, 'release-held-sends')[0];
    assert.ok(held.order < acceptedVote.order && acceptedVote.order < release.order,
      'the late branch accepts V while the real Ready send is held');
    assert.ok(acceptedVote.order < selected[0].order);
  } else {
    assert.ok(settled.order < acceptedVote.order,
      'independent reference withholds V until the actual selected Promise observer');
  }
  assert.deepEqual(result.returned.answer, {outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
    reason: cell.decision === 'D3' ? RUNTIME_REASON.DRAINED :
      RUNTIME_REASON.TRANSFER_REQUESTED});
}

function assertBeforeOrder(result, cell) {
  const {prefix, vote} = assertCustody(result, cell);
  assert.ok(prefix.every((event) => event.order < vote.order));
  const acceptedVote = measuredEvents(result, 'delivery-answer')
    .find((event) => event.label === 'vote');
  const call = measuredEvents(result, 'selected-operation-call')[0];
  assert.ok(acceptedVote.order < call.order, 'V is accepted before the selected turn begins');
  const selected = selectedEntries(result, cell);
  if (cell.decision === 'D3') {
    assert.equal(selected.length, 1, 'the pre-capture proposal reaches its native refusal');
    assert.ok(vote.order < selected[0].order, 'V enters native before the proposal');
  } else {
    assert.deepEqual(selected, [], 'refused transfers never invoke a native transfer step');
  }
  const reasons = {D1: RUNTIME_REASON.NO_KNOWN_LEADER,
    D2: RUNTIME_REASON.NOT_LEADER,
    D3: `propose: ${RAFT_RS_CORE_REFUSAL_TEXT.PROPOSAL_DROPPED}`};
  assert.deepEqual(result.returned.answer, {outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
    reason: reasons[cell.decision],
    phase: cell.decision === 'D3' ? 'propose' : RUNTIME_PHASE.LEADERSHIP_TRANSFER,
    retryable: cell.decision === 'D1', recoveryRequired: false});
}

function assertAnchors(result) {
  for (const {record} of result.initial.exactDurable) {
    assert.equal(typeof record.hardState.vote, 'string',
      'the owner read preserves the exact persisted vote identity as a decimal string');
    assert.ok(record.confState.voters.includes(record.hardState.vote),
      'the initial recorded vote exactly matches a native voter identity');
  }
  assert.deepEqual(result.returned.afterTurn, [], 'post-interval projection agrees with core');
  assert.deepEqual(result.returned.atExact, [], 'post-convergence projection agrees with core');
  assert.deepEqual(result.returned.recovered.after, result.returned.recovered.before,
    'existing post-convergence restart preserves observed term and ConfState');
  assert.deepEqual(result.returned.recoveredExact.after, result.returned.recoveredExact.before,
    'post-convergence restart preserves the complete exact durable owner record');
}

for (const cell of orderingCells) {
  test(`${cell.id}: actual runtime ordering and complete native observations`, async (t) => {
    // Run all three independent constructions before any semantic comparison.
    // Each run emits full retained vectors, including failures, before cleanup.
    const late = await runOrdering(t, cell, ORDER.LATE);
    const after = await runOrdering(t, cell, ORDER.AFTER);
    const before = await runOrdering(t, cell, ORDER.BEFORE);
    t.diagnostic(JSON.stringify({orderingComparison: cell.id,
      late: late.returned, independentlyAfter: after.returned,
      preCapture: before.returned}));
    for (const result of [after, before]) {
      assert.deepEqual(result.initial, late.initial, 'identical complete initial native state');
      assert.deepEqual(result.prefix, late.prefix, 'identical initial AppendResponse bytes');
      assert.deepEqual(result.vote, late.vote, 'identical complete crafted vote bytes');
    }
    assertLateOrder(late, cell);
    assertLateOrder(after, cell);
    assertBeforeOrder(before, cell);
    for (const result of [late, after, before]) assertAnchors(result);
    // No normalization of terms, configuration, positions or effects. Event
    // ordinals/generation are retained in each raw trace;
    // independent runtime lifetimes do not share those observation identities.
    assert.deepEqual(outboundPackets(late), outboundPackets(after),
      'independent O-before-V execution produces identical complete outbound packets');
    assert.deepEqual(late.measured.state, after.measured.state,
      'passive end-of-interval durable, application, event and transport states agree');
    assert.deepEqual(late.returned, after.returned,
      'late capture has the complete outcome/effects of independently ordered O-before-V');
  });
}
