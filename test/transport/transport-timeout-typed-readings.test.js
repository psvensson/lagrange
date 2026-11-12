/**
 * Review finding F1/F2: every consumer that decides on a spent delivery
 * reads the transport owner's typed outcome (its code, its reason, or a
 * forwarding hop's forwardedReasonCode), never the 'Message timeout' /
 * 'Pending response timeout' text. A failure that carries only the text is
 * no timeout fact; a typed timeout without the text still is one.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  TRANSPORT_ACKNOWLEDGEMENT as ACK,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE as REASON,
  buildDeliveryEnvelope,
  deliveryReadingOf,
  forwardedDeliveryAnswer,
  isDeliveryTimeoutReading,
} from '../../src/transport/transport-semantic-outcome.js';
import {ROUTER_MESSAGE_TIMEOUT_ERROR_CODE} from
  '../../src/transport/transport-error-codes.js';
import {QueryExecutorWriteRetryRouting} from
  '../../src/query/query-executor-write-retry-routing.js';
import {ReplicaOperationRepository} from
  '../../src/rebalancer/replica-operation-repository.js';
import {MessageGroupForwardingOwner} from
  '../../src/message-group/message-group-forwarding-owner.js';
import {CDCRoutedMutationReadiness} from '../../src/cdc/cdc-routed-mutation-readiness.js';
import {NodeStatePublicationOwner} from
  '../../src/bootstrap/shared/node-state-publication-owner.js';
import {shouldDeferWriteError} from '../../src/logging/logs-table-service-flush-helpers.js';
import {AdminWebSocketLoadLaneAdmission} from
  '../../src/admin/admin-websocket-load-lane-admission.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../../src/partition/partition-write-kernel.js';

const TIMEOUT_TEXT = 'Message timeout';
const PENDING_TEXT = 'Pending response timeout';

function spentDelivery(acknowledgement) {
  return buildDeliveryEnvelope({acknowledged: false, error: TIMEOUT_TEXT,
    errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE, deferRetry: true, acknowledgement});
}

function timeoutError(text = TIMEOUT_TEXT) {
  return Object.assign(new Error(text), {code: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE});
}

test('the owner reads a spent delivery from the outcome or a forwarded answer only',
  async (t) => {
    for (const acknowledgement of [ACK.UNACKNOWLEDGED, ACK.ACKNOWLEDGED, ACK.UNESTABLISHED]) {
      const delivery = spentDelivery(acknowledgement);
      t.equal(isDeliveryTimeoutReading(deliveryReadingOf(delivery)), true,
        `${acknowledgement}: the transport outcome is a timeout reading`);
      t.equal(isDeliveryTimeoutReading(forwardedDeliveryAnswer(delivery)), true,
        `${acknowledgement}: a forwarding hop's answer states its onward timeout`);
    }
    t.equal(isDeliveryTimeoutReading({success: false, error: TIMEOUT_TEXT,
      reasonCode: REASON.ANSWER_TIMEOUT}), false,
    'an answer\'s own text or reasonCode field is not the transport\'s');
  });

test('query write routing: leader unavailability is typed, never the timeout text',
  async (t) => {
    // The transport's delivery-failure decision plus the write's one fact:
    // an ambiguous (timed-out) delivery is re-routed only under its entryId.
    const isLeaderUnavailable = (message, failure, identityKeyed) =>
      QueryExecutorWriteRetryRouting.prototype.isLeaderUnavailable.call(
        null, message, failure, identityKeyed);
    t.equal(Boolean(isLeaderUnavailable(TIMEOUT_TEXT, {success: false,
      error: TIMEOUT_TEXT}, true)), false, 'an answer that only says "Message timeout"');
    const spent = deliveryReadingOf(spentDelivery(ACK.ACKNOWLEDGED));
    t.equal(isLeaderUnavailable('', spent, true), true,
      'an answer timeout re-routes under the same entryId');
    t.equal(isLeaderUnavailable('', spent, false), false,
      'an answer timeout without an entry identity is never re-routed');
    t.equal(isLeaderUnavailable('',
      forwardedDeliveryAnswer(spentDelivery(ACK.UNACKNOWLEDGED)), true), true,
    'a follower\'s forwarded ACK timeout re-routes');
    t.equal(isLeaderUnavailable('', timeoutError(), true), true,
      'a thrown router timeout re-routes');
  });

test('operation mutation gateway: route repair reads the timeout code', async (t) => {
  const repository = Object.create(ReplicaOperationRepository.prototype);
  for (const text of [TIMEOUT_TEXT, PENDING_TEXT]) {
    t.equal(repository.hasOperationMutationRouteRepairSignature({success: false, error: text}),
      false, `"${text}" text alone is no timeout fact`);
  }
  t.equal(repository.hasOperationMutationRouteRepairSignature({success: false,
    error: 'write failed', errorCode: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE}), true,
  'a result carrying the transport timeout code repairs its route');
});

test('message-group forwarding: only an ACK timeout suppresses the target', async (t) => {
  const owner = Object.create(MessageGroupForwardingOwner.prototype);
  owner.service = {
    shouldRepairForwardTopology: () => false,
    isForwardTargetBackpressured: () => false,
  };
  const suppressed = (acknowledgement) => owner.shouldSuppressForwardTarget(
    deliveryReadingOf(spentDelivery(acknowledgement)), TIMEOUT_TEXT);
  t.equal(suppressed(ACK.UNACKNOWLEDGED), true, 'an unacknowledged forward accuses the target');
  t.equal(suppressed(ACK.ACKNOWLEDGED), false,
    'an answer timeout: the leader accepted the forward and is alive');
  t.equal(suppressed(ACK.UNESTABLISHED), false, 'an unestablished timeout accuses no target');
  t.equal(owner.shouldSuppressForwardTarget({success: false, error: TIMEOUT_TEXT},
    TIMEOUT_TEXT), false, 'the timeout text alone suppresses nothing');
  t.equal(owner.isRetryableForwardDeliveryFailure({success: false, error: TIMEOUT_TEXT},
    TIMEOUT_TEXT), false, 'the timeout text alone is not a retryable network failure');
  t.equal(owner.isRetryableForwardDeliveryFailure(
    forwardedDeliveryAnswer(spentDelivery(ACK.ACKNOWLEDGED)), null), true,
  'a relayed onward timeout is retryable by its typed reason');
});

test('CDC routed mutation: transience reads the timeout code', async (t) => {
  const isTransient = (value) =>
    CDCRoutedMutationReadiness.prototype.isTransientCdcError.call({}, value);
  t.equal(isTransient({success: false, error: `write: ${TIMEOUT_TEXT}`}), false,
    'the timeout text alone is not transient');
  t.equal(isTransient(timeoutError('owner write spent')), true,
    'the transport timeout code is transient');
});

test('node-state publication: a spent delivery retries by its typed reading',
  async (t) => {
    const shouldRetry = (error) =>
      NodeStatePublicationOwner.prototype.shouldRetryControlPlaneNodeStateUpdate.call(
        {}, error, null);
    t.equal(shouldRetry(new Error(TIMEOUT_TEXT)), false, 'the text alone is not retried');
    t.equal(shouldRetry(timeoutError('publication spent')), true,
      'the transport timeout is retried');
  });

test('logs table writes defer a spent delivery by its code', async (t) => {
  t.equal(shouldDeferWriteError(new Error(TIMEOUT_TEXT)), false,
    'the text alone does not defer');
  t.equal(shouldDeferWriteError(timeoutError('logs write spent')), true,
    'the transport timeout code defers');
});

test('the load lane never asks a client to re-issue a write of unknown outcome',
  async (t) => {
    const retryable = (value) =>
      AdminWebSocketLoadLaneAdmission.prototype.isRetryableLoadLaneExecutionFailure.call(
        {}, value);
    const unknown = PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN;
    t.equal(retryable({success: false, deferRetry: true, failureCode: unknown,
      entryId: 'e-1'}), false, 'a deferred delivery that became an unknown outcome');
    t.equal(retryable({success: false, deferRetry: true,
      participantFailures: [{failureCode: unknown, entryId: 'e-2'}]}), false,
    'a participant whose write outcome is unknown');
    t.equal(retryable({success: false, deferRetry: true}), true,
      'a plain deferral stays bounded retry pressure');
  });
