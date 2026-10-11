import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {TRANSPORT_DEFAULT} from '../../../../src/constants/transport.js';
import {COMMITTED_MEMBERSHIP_MAX_PEERS} from
  '../../../../src/raft/raft-committed-membership-constants.js';

const questRoot = new URL('../', import.meta.url);
const outputPath = fileURLToPath(new URL(
  './begin-round13-router-native-feasibility.json', import.meta.url));
const subjectPath = fileURLToPath(new URL(
  './design-query-begin-uncertain-insert-resolution-2026-10-11.md',
  questRoot));
const predecessorPath = fileURLToPath(new URL(
  './evidence/design-query-begin-uncertain-insert-resolution-round12-e7a1a4cf.md',
  questRoot));
const round12Path = fileURLToPath(new URL(
  './begin-round12-capability-schema-feasibility.json', import.meta.url));
const inboundPath = fileURLToPath(new URL(
  '../../../../src/transport/message-router-inbound-dispatch.js',
  import.meta.url));
const deliveryPath = fileURLToPath(new URL(
  '../../../../src/transport/message-router-delivery-behaviors.js',
  import.meta.url));
const wsServerPath = fileURLToPath(new URL(
  '../../../../node_modules/ws/lib/websocket-server.js', import.meta.url));
const reviewPath = '/mnt/data/peter/projects/.worktrees/' +
  'rs-raft-candidate-20261011/test-output/continuation-20261011/' +
  'review-begin-uncertain-design-round12-independent.md';
const adversePath = '/mnt/data/peter/projects/.worktrees/' +
  'rs-raft-candidate-20261011/test-output/continuation-20261011/' +
  'begin-design-round12-independent/independent-adverse-schedules.json';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fileSha256(path) {
  return sha256(readFileSync(path));
}

function checkedAdd(...values) {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 ||
        !Number.isSafeInteger(total + value)) {
      throw new RangeError('physical resource equation overflow');
    }
    total += value;
  }
  return total;
}

function checkedMultiply(left, right) {
  const result = left * right;
  if (!Number.isSafeInteger(left) || left < 0 ||
      !Number.isSafeInteger(right) || right < 0 ||
      !Number.isSafeInteger(result)) {
    throw new RangeError('physical resource equation overflow');
  }
  return result;
}

const subject = readFileSync(subjectPath);
const predecessor = readFileSync(predecessorPath);
assert.deepEqual(subject.subarray(0, predecessor.length), predecessor);
assert.equal(fileSha256(predecessorPath),
  'e7a1a4cf6618f316bdc19337ae8f3d9e88c0f305767cffff25db21c79286af98');
assert.equal(fileSha256(reviewPath),
  '0a0bfe8195cc47d931f25aa0c94fca74dfce1c2ba3716ce8a3b0577828833c7d');

const round12 = JSON.parse(readFileSync(round12Path, 'utf8'));
assert.equal(round12.provenance.subjectSha256,
  'e7a1a4cf6618f316bdc19337ae8f3d9e88c0f305767cffff25db21c79286af98');
const endpointSlotCount = round12.capacity.equation.endpointSlotCount;
assert.equal(endpointSlotCount, 4);
assert.equal(round12.capacity.equation.reconciliationReservedSlots, 1);

const wsServerSource = readFileSync(wsServerPath, 'utf8');
assert.match(wsServerSource, /maxPayload:\s*100\s*\*\s*1024\s*\*\s*1024/);
const primaryFrameBytes = 100 * 1024 * 1024;
const peers = COMMITTED_MEMBERSHIP_MAX_PEERS;
const identifiedGenerationsPerPeer = 3;
const unidentifiedConnectionSlots = peers;
const selfConnectionSlots = 1;
const identifiedConnectionSlots = checkedMultiply(
  peers, identifiedGenerationsPerPeer);
const connectionSlots = checkedAdd(
  identifiedConnectionSlots,
  unidentifiedConnectionSlots,
  selfConnectionSlots,
);
const semanticSendSlotsPerTarget = checkedAdd(
  TRANSPORT_DEFAULT.OUTBOUND_QUEUE_CONCURRENCY,
  TRANSPORT_DEFAULT.OUTBOUND_QUEUE_MAX_PENDING,
);
const queuedSendGenerations = identifiedGenerationsPerPeer;
const queuedSendSlots = checkedMultiply(
  checkedMultiply(queuedSendGenerations, peers),
  semanticSendSlotsPerTarget,
);
const directSendSlots = checkedAdd(
  checkedMultiply(2, connectionSlots), endpointSlotCount);
const sendSlots = checkedAdd(queuedSendSlots, directSendSlots);

// The driver deliberately models all variable provider coefficients as one or
// more full-frame roots. Exact coefficients remain a pinned-provider source
// gate; this arithmetic proves that the complete population/count equation is
// finite and checked rather than claiming a JavaScript heap measurement.
const receiveRootCopies = 4;
const sendRootCopies = 3;
const fixedConnectionRootBytes = 4096;
const receiveRootsPerMaxFrame = checkedMultiply(
  primaryFrameBytes, receiveRootCopies);
const sendRootsPerMaxFrame = checkedMultiply(
  primaryFrameBytes, sendRootCopies);
const receiveBytes = checkedMultiply(connectionSlots,
  receiveRootsPerMaxFrame);
const sendBytes = checkedMultiply(sendSlots, sendRootsPerMaxFrame);
const fixedConnectionRoots = checkedMultiply(connectionSlots,
  fixedConnectionRootBytes);
const routerPhysicalBytes = checkedAdd(
  receiveBytes, sendBytes, fixedConnectionRoots);

const population = {
  existingOwnerInputs: {
    committedMembershipMaxPeers: peers,
    outboundQueueMaxConcurrent:
      TRANSPORT_DEFAULT.OUTBOUND_QUEUE_CONCURRENCY,
    outboundQueueMaxPending: TRANSPORT_DEFAULT.OUTBOUND_QUEUE_MAX_PENDING,
    installedPrimaryFrameBytes: primaryFrameBytes,
  },
  connectionPopulation: {
    identifiedGenerationsPerPeer,
    identifiedConnectionSlots,
    unidentifiedConnectionSlots,
    selfConnectionSlots,
    connectionSlots,
    peerIdCardinalityOrLengthCapAdded: false,
  },
  sendPopulation: {
    queuedSendGenerations,
    semanticSendSlotsPerTarget,
    queuedSendSlots,
    directSendSlots,
    fixedPrivateEndpointSlots: endpointSlotCount,
    recoverySendReceiveSubclaims: 1,
    sendSlots,
  },
  conservativeDesignCoefficients: {
    receiveRootCopies,
    sendRootCopies,
    fixedConnectionRootBytes,
    exactProviderMeasurementStillRequired: true,
  },
  checkedEquation: {
    receiveRootsPerMaxFrame,
    sendRootsPerMaxFrame,
    receiveBytes,
    sendBytes,
    fixedConnectionRoots,
    routerPhysicalBytes,
    safeInteger: Number.isSafeInteger(routerPhysicalBytes),
    globalLimitRaised: false,
  },
};

assert.equal(connectionSlots, 4097);
assert.equal(semanticSendSlotsPerTarget, 96);
assert.equal(queuedSendSlots, 294912);
assert.equal(directSendSlots, 8198);
assert.equal(population.checkedEquation.safeInteger, true);

class PhysicalBank {
  constructor(sendTokens) {
    this.sendTokens = sendTokens;
    this.held = new Map();
    this.sequence = 0;
  }

  reserve(kind, generation) {
    if (this.held.size === this.sendTokens) return null;
    const token = `${kind}:${generation}:${this.sequence++}`;
    this.held.set(token, {kind, generation, state: 'PRE_STRINGIFY'});
    return token;
  }

  transferToProvider(token) {
    const entry = this.held.get(token);
    assert(entry);
    assert.equal(entry.state, 'PRE_STRINGIFY');
    entry.state = 'PROVIDER_CALLBACK';
  }

  release(token, generation, cause) {
    const entry = this.held.get(token);
    assert(entry);
    assert.equal(entry.generation, generation);
    assert.match(cause, /^(callback|error|close|inproc-delivered|inproc-cancelled)$/);
    this.held.delete(token);
  }
}

const sendBank = new PhysicalBank(4);
const directKinds = ['ACK', 'NO_HANDLER', 'SERVICE_RESPONSE', 'PRESSURE'];
const directTokens = directKinds.map((kind) => {
  const token = sendBank.reserve(kind, 51);
  assert(token);
  sendBank.transferToProvider(token);
  return token;
});
assert.equal(sendBank.reserve('ACK', 51), null);
assert.equal(sendBank.held.size, 4);
sendBank.release(directTokens[0], 51, 'callback');
const successorToken = sendBank.reserve('ACK', 52);
assert(successorToken);
sendBank.transferToProvider(successorToken);
assert.throws(() => sendBank.release(directTokens[1], 52, 'callback'));
sendBank.release(directTokens[1], 51, 'error');
sendBank.release(directTokens[2], 51, 'close');
sendBank.release(directTokens[3], 51, 'inproc-delivered');
sendBank.release(successorToken, 52, 'inproc-cancelled');
assert.equal(sendBank.held.size, 0);

const inboundSource = readFileSync(inboundPath, 'utf8');
const deliverySource = readFileSync(deliveryPath, 'utf8');
assert.match(inboundSource, /sendRaw\(ws,\s*\{[\s\S]*RouterMessageType\.ACK/);
assert.match(inboundSource, /noHandler:\s*true/);
assert.match(deliverySource, /ws\.send\(JSON\.stringify\(message\)\)/);

const adverse = JSON.parse(readFileSync(adversePath, 'utf8'));
assert.equal(adverse.rawTransport.beforeMicrotask.outboundQueueCount, 0);
assert.equal(adverse.rawTransport.afterMicrotask.received, 256);
assert.equal(adverse.rawTransport.afterMicrotask.ack, 128);
assert.equal(adverse.rawTransport.afterMicrotask.noHandler, 128);
assert.equal(adverse.nativeLane.pressured.recoveryProgress, 0);

function nativeProgressSchedule(rounds) {
  const rows = [];
  let recoveryProgress = 0;
  let foregroundAccepted = 0;
  let foregroundPressured = 0;
  for (let round = 0; round < rounds; round++) {
    const start = 20 + round * 10;
    const turnDeadline = start + 9;
    let lane = 'FOREGROUND_ACTIVE';
    foregroundAccepted++;
    const owed = {
      endpointToken: `recovery:${round}`,
      scan: round,
      transactionId: 'same-id',
      creationKey: 'same-key',
      targetResourceGeneration: 7,
      connectionGeneration: 41,
      recoveryTurnDeadline: turnDeadline,
    };
    lane = 'RECOVERY_OWED';
    // A second foreground grant arrives while the owed field exists.
    foregroundPressured++;
    const releasedAt = start + 3;
    assert(releasedAt < turnDeadline);
    lane = 'RECOVERY_ACTIVE';
    recoveryProgress++;
    lane = 'FREE';
    rows.push({
      round,
      foregroundStartedAt: start,
      recoveryArrivedAt: start + 1,
      foregroundReleasedAt: releasedAt,
      recoveryTurnDeadline: turnDeadline,
      directTransfer: true,
      owed,
      outcome: 'CLASSIFICATION_COMPLETED',
      finalLane: lane,
      retainedTransactionId: 'same-id',
      retainedDecision: 'COMMIT',
    });
  }
  return {
    rounds,
    recoveryProgress,
    foregroundAccepted,
    foregroundPressured,
    originalTransactionDeadline: 5,
    originalDeadlineRenewed: false,
    waiterCount: 0,
    rows,
  };
}

function quietRecoveryControl() {
  return {
    recoveryArrivedAt: 21,
    recoveryTurnDeadline: 29,
    laneAtArrival: 'FREE',
    transition: 'FREE_TO_RECOVERY_ACTIVE',
    outcome: 'CLASSIFICATION_COMPLETED',
    recoveryProgress: 1,
    foregroundAccepted: 0,
    foregroundPressured: 0,
    waiterCount: 0,
    originalTransactionDeadline: 5,
    originalDeadlineRenewed: false,
    retainedTransactionId: 'same-id',
    retainedDecision: 'COMMIT',
  };
}

function expiredOwedControl() {
  const first = {
    foregroundStartedAt: 20,
    recoveryArrivedAt: 21,
    recoveryTurnDeadline: 22,
    foregroundReleasedAt: 23,
    transition: 'RECOVERY_OWED_TO_FREE_EXPIRED',
    sqlExecuted: false,
    recordDebtRetained: true,
  };
  assert(first.recoveryTurnDeadline < first.foregroundReleasedAt);
  const retry = {
    existingSweepAt: 31,
    freshRecoveryTurnDeadline: 39,
    nativeLaneAtArrival: 'FREE',
    outcome: 'CLASSIFICATION_COMPLETED',
    sameTransactionId: true,
    sameDecision: 'COMMIT',
  };
  return {first, retry, waiterCount: 0, deadlineRenewed: false};
}

const nativeLane = {
  correctedPeriodic: nativeProgressSchedule(12),
  quietControl: quietRecoveryControl(),
  expiryThenExistingSweepRetry: expiredOwedControl(),
  stateDomain: [
    'FREE',
    'FOREGROUND_ACTIVE',
    'RECOVERY_OWED',
    'RECOVERY_ACTIVE',
  ],
  authorityCeiling:
    'read/classification and recovery handoff only; no mutation or decision',
};
assert.equal(nativeLane.correctedPeriodic.recoveryProgress, 12);
assert.equal(nativeLane.correctedPeriodic.foregroundAccepted, 12);
assert.equal(nativeLane.correctedPeriodic.foregroundPressured, 12);
assert.equal(nativeLane.correctedPeriodic.waiterCount, 0);
assert.equal(nativeLane.expiryThenExistingSweepRetry.first.sqlExecuted, false);

const ownership = [
  ['socket_accept', 'message_router_unidentified_receive_reservation',
    'identify_transfer_or_provider_close_drain'],
  ['raw_receive', 'exact_connection_receive_token',
    'private_capture_or_handler_completion'],
  ['private_capture', 'receive_token_plus_fixed_endpoint_slot',
    'raw_roots_clear_then_endpoint_owns_tuple'],
  ['ordinary_handler', 'receive_token',
    'handler_promise_and_response_envelope_clear'],
  ['direct_send', 'physical_send_token_before_stringify',
    'provider_callback_error_close_or_inproc_delivery'],
  ['semantic_queue_send', 'queue_entry_plus_physical_send_token',
    'semantic_credit_and_physical_credit_release_separately'],
  ['recovery_native_collision', 'fixed_recovery_endpoint_and_recovery_owed',
    'direct_lane_transfer_or_exact_expiry_cas'],
];

const result = {
  scope: 'Round-thirteen MessageRouter physical-custody and native owed-turn ' +
    'design model; no production transport/native implementation approval.',
  provenance: {
    subjectSha256: sha256(subject),
    predecessorSha256: fileSha256(predecessorPath),
    reviewSha256: fileSha256(reviewPath),
    round12FeasibilitySha256: fileSha256(round12Path),
    round12SchemaOutcomePreserved:
      round12.schema.upgrade.outcome,
    inboundSourceSha256: sha256(inboundSource),
    deliverySourceSha256: sha256(deliverySource),
    installedWsServerSourceSha256: sha256(wsServerSource),
    adverseScheduleSha256: fileSha256(adversePath),
  },
  population,
  currentCounterexample: {
    rawFramesBypassSemanticQueue:
      adverse.rawTransport.afterMicrotask.received,
    rawSerializedBytes:
      adverse.rawTransport.afterMicrotask.serializedBytes,
    ordinaryOutboundQueues:
      adverse.rawTransport.afterMicrotask.outboundQueueCount,
    oldPeriodicRecoveryProgress:
      adverse.nativeLane.pressured.recoveryProgress,
  },
  modeledPhysicalCustody: {
    directKinds,
    preStringifyAdmission: true,
    sendReleaseCauses: [
      'callback', 'error', 'close', 'inproc-delivered', 'inproc-cancelled',
    ],
    semanticAndPhysicalCreditsDistinct: true,
    successorCannotBeReleasedByOldGeneration: true,
    finalHeldTokens: sendBank.held.size,
  },
  nativeLane,
  ownership,
  preserved: {
    logicalParticipantOrPeerIdCapAdded: false,
    transactionDeadlineRenewed: false,
    waiterOrSchedulerAdded: false,
    schemaDesignChanged: false,
    exactSixAndForwardOnlyCommitChanged: false,
  },
  proofCeiling: [
    'Provider copy coefficients are conservative design inputs and require ' +
      'measurement against the exact implementation.',
    'No MessageRouter or native-lane production source was changed.',
    'The round-twelve originated-V2 schema evidence is pinned, not rerun or ' +
      'superseded.',
  ],
};

writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  subjectSha256: result.provenance.subjectSha256,
  routerPhysicalBytes,
  connectionSlots,
  sendSlots,
  recoveryProgress: nativeLane.correctedPeriodic.recoveryProgress,
  schemaOutcome: result.provenance.round12SchemaOutcomePreserved,
}));
