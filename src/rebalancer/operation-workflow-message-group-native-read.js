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
function withRecordingRecipient(owner, operationId, route, record) {
  const recipient = copyStrictOwnDataRecord(route);
  if (!nonempty(operationId) || !nonempty(recipient?.nodeId) || !nonempty(recipient?.replicaId)) {
    return Promise.resolve(Object.freeze({outcome: OUTCOME.INVALID, operation: null}));
  }
  const selected = Object.freeze({nodeId: recipient.nodeId, replicaId: recipient.replicaId});
  const epoch = owner.getOperationOwnershipFenceEpoch();
  const isCurrent = () => !owner.isShuttingDown &&
    epoch === owner.getOperationOwnershipFenceEpoch();
  const refused = () => Object.freeze({outcome: OUTCOME.UNAVAILABLE, operation: null});
  if (!isCurrent()) return Promise.resolve(refused());
  // Both explicit replay and restart reconstruction enter this same owned lane.
  // An internal driver already holding it must use its existing inline discipline,
  // never recursively invoke this retained-lane entry point.
  return owner.runRetainedOperationOwnerAction(operationId, () => {
    if (!isCurrent()) return refused();
    return record((query) => readAtRecipient(owner, selected, query, isCurrent), isCurrent);
  }).then((answer) => answer?.outcome ? answer : refused());
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
export {recordMessageGroupLearnerFromRecipient, recoverMessageGroupLearnerFromRecipient};
