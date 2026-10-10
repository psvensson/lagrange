/** OperationWorkflowOwner's transport capability for the existing recorder.
 * The route is a hint. Only the selected recipient's native answer supplies
 * membership; the repository validates the original action and writes its CAS.
 * This does not issue a permit, advance ordinary workflow, or admit CREATE.
 */
import {SERVICE_TYPE} from '../constants/service.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {COMMITTED_LEARNER_ACTION_KIND as KIND,
  COMMITTED_LEARNER_ACTION_REASON as REASON} from '../raft/raft-committed-membership-constants.js';
import {ReplicaOperationField as FIELD, ReplicaOperationMessageType as TYPE,
  ReplicaOperationResponseStatus as STATUS} from './replica-operation-constants.js';
import {MEMBERSHIP_AUTHORIZATION_OUTCOME as OUTCOME} from
  './replica-operation-message-group-membership-permit.js';
import {MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS as ADDRESS} from
  '../node/message-group-service-handler-constants.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {classifyTransportDeliveryOutcome, isDeliveredTransportDeliveryOutcome} from
  '../transport/transport-semantic-outcome.js';

const {OPERATION_WORKFLOW_OWNER_LITERAL} = OPERATION_WORKFLOW_OWNER_SHARED;
const unavailable = () => Object.freeze({kind: KIND.REFUSED, reason: REASON.UNAVAILABLE});
const invalid = () => Object.freeze({kind: KIND.REFUSED, reason: REASON.INVALID});
const nonempty = (value) => typeof value === 'string' && value.length > 0;

async function readAtRecipient(owner, recipient, query, isCurrent) {
  if (!isCurrent()) return unavailable();
  const address = `${recipient.nodeId}/${ADDRESS.SERVICE_SEGMENT}/${ADDRESS.HANDLER_ID}`;
  try {
    const result = classifyTransportDeliveryOutcome(await owner.messageRouter.deliver(address, {
      [FIELD.TYPE]: TYPE.READ_COMMITTED_MEMBERSHIP,
      [FIELD.ENTITY_TYPE]: SERVICE_TYPE.MESSAGE_GROUP, [FIELD.ENTITY_ID]: query.groupId,
      [FIELD.REPLICA_ID]: recipient.replicaId, [FIELD.MEMBERSHIP_QUERY]: query,
    }, {targetNodeId: recipient.nodeId, deliveryPriority: OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL,
      timeoutMs: owner.replicaOperationDispatchTimeoutMs}));
    if (!isCurrent() || !isDeliveredTransportDeliveryOutcome(result) ||
      result.noHandler === true) return unavailable();
    if (result.status !== STATUS.COMPLETED || result.nodeId !== recipient.nodeId) return invalid();
    return result[FIELD.MEMBERSHIP];
  } catch {
    return unavailable();
  }
}
function recordingRequestSnapshot(request) {
  const snapshot = copyStrictOwnDataRecord(request);
  const keys = ['operationId', 'identity', 'permit', 'executionClaim'];
  if (!snapshot || !keys.every((key) => nonempty(snapshot[key]))) return null;
  // All retained inputs are immutable encoded records. Do not retain an object
  // that a caller can replace while the owner waits for its existing lane.
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, snapshot[key]])));
}
const invalidAnswer = () => Object.freeze({outcome: OUTCOME.INVALID, operation: null});
const refusedAnswer = () => Object.freeze({outcome: OUTCOME.UNAVAILABLE, operation: null});
function selectRecordingRecipient(owner, operationId, route) {
  const recipient = copyStrictOwnDataRecord(route);
  if (!nonempty(operationId) || !nonempty(recipient?.nodeId) || !nonempty(recipient?.replicaId)) {
    return null;
  }
  const selected = Object.freeze({nodeId: recipient.nodeId, replicaId: recipient.replicaId});
  const epoch = owner.getOperationOwnershipFenceEpoch();
  const isCurrent = () => !owner.isShuttingDown &&
    epoch === owner.getOperationOwnershipFenceEpoch();
  return {selected, isCurrent};
}
// One recording turn inside an already-held operation lane.
function recordingTurn(owner, turn, record) {
  if (!turn.isCurrent()) return Promise.resolve(refusedAnswer());
  return Promise.resolve(record((query) =>
    readAtRecipient(owner, turn.selected, query, turn.isCurrent), turn.isCurrent))
    .then((answer) => answer?.outcome ? answer : refusedAnswer());
}
function withRecordingRecipient(owner, operationId, route, record) {
  const turn = selectRecordingRecipient(owner, operationId, route);
  if (!turn) return Promise.resolve(invalidAnswer());
  if (!turn.isCurrent()) return Promise.resolve(refusedAnswer());
  // Both explicit replay and restart reconstruction enter this same owned lane.
  // An internal driver already holding it must use the inline entry below,
  // never recursively invoke this retained-lane entry point.
  return owner.runRetainedOperationOwnerAction(operationId,
    () => recordingTurn(owner, turn, record))
    .then((answer) => answer?.outcome ? answer : refusedAnswer());
}
function recordMessageGroupLearnerFromRecipient(owner, request, route) {
  const input = recordingRequestSnapshot(request);
  if (!input) return Promise.resolve(Object.freeze({outcome: OUTCOME.INVALID, operation: null}));
  return withRecordingRecipient(owner, input.operationId, route, (read, isCurrent) =>
    owner.repository.recordMessageGroupLearnerOutcome(input, read, isCurrent));
}
function recoverMessageGroupLearnerFromRecipient(owner, operationId, route) {
  return withRecordingRecipient(owner, operationId, route, (read, isCurrent) =>
    owner.repository.recoverMessageGroupLearnerOutcome(operationId, read, isCurrent));
}
/** Inline recovery for a reconcile turn that ALREADY holds this operation's
 * lane (restart scan, periodic sweep, CDC wake). It never acquires the lane.
 * The caller passes the lane turn the operation lane handed its factory; a
 * turn for another key, no turn, or a lane nobody holds is refused as INVALID
 * instead of deadlocking or borrowing someone else's turn.
 */
function recoverMessageGroupLearnerInline(owner, operationId, route, laneTurn) {
  const turn = selectRecordingRecipient(owner, operationId, route);
  if (!turn || owner.isOperationOwnerLaneHeld(operationId) !== true ||
    laneTurn?.ownerKey !== owner.getOperationOwnerSingleFlightKey(operationId)) {
    return Promise.resolve(invalidAnswer());
  }
  return recordingTurn(owner, turn, (read, isCurrent) =>
    owner.repository.recoverMessageGroupLearnerOutcome(operationId, read, isCurrent));
}
export {recordMessageGroupLearnerFromRecipient, recoverMessageGroupLearnerFromRecipient,
  recoverMessageGroupLearnerInline};
