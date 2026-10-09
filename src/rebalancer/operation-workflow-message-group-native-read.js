/** OperationWorkflowOwner's transport capability for the existing recorder.
 * The route is a hint. Only the selected recipient's native answer supplies
 * membership; the repository validates the original action and writes its CAS.
 * This does not issue a permit, advance ordinary workflow, or admit CREATE.
 */
import {SERVICE_TYPE} from '../constants/service.js';
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

const {OPERATION_WORKFLOW_OWNER_LITERAL, REPLICA_OPERATION_DISPATCH_TIMEOUT_MS} =
  OPERATION_WORKFLOW_OWNER_SHARED;
const unavailable = () => Object.freeze({kind: KIND.REFUSED, reason: REASON.UNAVAILABLE});
const invalid = () => Object.freeze({kind: KIND.REFUSED, reason: REASON.INVALID});
const nonempty = (value) => typeof value === 'string' && value.length > 0;

async function readAtRecipient(owner, recipient, query) {
  if (owner.isShuttingDown) return unavailable();
  const address = `${recipient.nodeId}/${ADDRESS.SERVICE_SEGMENT}/${ADDRESS.HANDLER_ID}`;
  try {
    const result = classifyTransportDeliveryOutcome(await owner.messageRouter.deliver(address, {
      [FIELD.TYPE]: TYPE.READ_COMMITTED_MEMBERSHIP,
      [FIELD.ENTITY_TYPE]: SERVICE_TYPE.MESSAGE_GROUP, [FIELD.ENTITY_ID]: query.groupId,
      [FIELD.REPLICA_ID]: recipient.replicaId, [FIELD.MEMBERSHIP_QUERY]: query,
    }, {targetNodeId: recipient.nodeId, deliveryPriority: OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL,
      timeoutMs: REPLICA_OPERATION_DISPATCH_TIMEOUT_MS}));
    if (owner.isShuttingDown || !isDeliveredTransportDeliveryOutcome(result) ||
      result.noHandler === true) return unavailable();
    if (result.status !== STATUS.COMPLETED || result.nodeId !== recipient.nodeId) return invalid();
    return result[FIELD.MEMBERSHIP];
  } catch {
    return unavailable();
  }
}
function recordMessageGroupLearnerFromRecipient(owner, request, route) {
  const {nodeId, replicaId} = route || {};
  if (!nonempty(nodeId) || !nonempty(replicaId)) {
    return Promise.resolve(Object.freeze({outcome: OUTCOME.INVALID, operation: null}));
  }
  if (owner.isShuttingDown) {
    return Promise.resolve(Object.freeze({outcome: OUTCOME.UNAVAILABLE, operation: null}));
  }
  const recipient = Object.freeze({nodeId, replicaId});
  return owner.repository.recordMessageGroupLearnerOutcome(request,
    (query) => readAtRecipient(owner, recipient, query));
}
export {recordMessageGroupLearnerFromRecipient};
