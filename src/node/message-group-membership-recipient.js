/** MessageGroupServiceHandler's historical learner read. This is not a
 * membership proposal endpoint or CREATE admission. The host selects a real
 * local service/port; payload fields provide only the query and routing hint.
 */
import {SERVICE_TYPE} from '../constants/service.js';
import {ReplicaOperationField as FIELD, ReplicaOperationResponseStatus as STATUS} from
  '../rebalancer/replica-operation-constants.js';
import {RAFT_OPERATION} from '../raft/raft-operation-port-constants.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE as PURPOSE,
  COMMITTED_LEARNER_ACTION_KIND as KIND, COMMITTED_LEARNER_ACTION_REASON as REASON} from
  '../raft/raft-committed-membership-constants.js';
import {normalizeCommittedLearnerRead} from '../raft/raft-rs-committed-membership-read.js';
import {MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS as ADDRESS} from
  './message-group-service-handler-constants.js';

const FUNCTION = 'function';
const unavailable = () => Object.freeze({kind: KIND.REFUSED, reason: REASON.UNAVAILABLE});
const invalid = () => Object.freeze({kind: KIND.REFUSED, reason: REASON.INVALID});
const nonempty = (value) => typeof value === 'string' && value.length > 0;

function captureRecipient(handler, replicaId, delivery, invocation) {
  // This pair is captured by registerWithRouter and never comes from payload.
  // Re-reading the handler's current pair here would revive a retired callback.
  const router = invocation?.router;
  const registration = invocation?.callback;
  const isCurrent = delivery?.isCurrent;
  const address = `${handler.nodeId}/${ADDRESS.SERVICE_SEGMENT}/${ADDRESS.HANDLER_ID}`;
  const service = handler.resolveActiveReplicaService(replicaId);
  const port = service?.raft;
  if (!service || !router) return null;
  const current = () => typeof registration === FUNCTION &&
    handler.registeredRouterHandler === registration && handler.messageRouter === router &&
    router.getRegisteredHandler(address) === registration &&
    typeof isCurrent === FUNCTION && delivery.nodeId === handler.nodeId && isCurrent() === true &&
    handler.resolveActiveReplicaService(replicaId) === service && service.raft === port;
  if (!current() || typeof port?.[RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP] !== FUNCTION) {
    return null;
  }
  return {service, port, current};
}
function recipientQuery(request) {
  const replicaId = request?.[FIELD.REPLICA_ID];
  const groupId = request?.[FIELD.ENTITY_ID];
  const query = request?.[FIELD.MEMBERSHIP_QUERY];
  if (!nonempty(replicaId) || !nonempty(groupId) ||
    request[FIELD.ENTITY_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP ||
    query?.purpose !== PURPOSE.LEARNER_ACTION) return null;
  const normalized = normalizeCommittedLearnerRead(query, groupId);
  if (!normalized.query) return null;
  return {replicaId, groupId,
    query: Object.freeze({...normalized.query, purpose: PURPOSE.LEARNER_ACTION})};
}
async function readOrigin(handler, request, delivery, invocation) {
  const input = recipientQuery(request);
  if (!input) return invalid();
  const captured = captureRecipient(handler, input.replicaId, delivery, invocation);
  if (!captured) return unavailable();
  if (captured.service.groupId !== input.groupId ||
    captured.service.replicaId !== input.replicaId || captured.service.nodeId !== handler.nodeId) {
    return invalid();
  }
  const answer = await captured.port[RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP](input.query);
  // A retired registration/port or delivery may finish an old queued read;
  // that answer must not cross into the workflow's next observation.
  return captured.current() ? answer : unavailable();
}
async function readMessageGroupLearnerAtRecipient(handler, request, delivery, invocation) {
  let membership;
  try {
    membership = await readOrigin(handler, request, delivery, invocation);
  } catch {
    membership = unavailable();
  }
  return {status: STATUS.COMPLETED, nodeId: handler.nodeId,
    [FIELD.MEMBERSHIP]: membership};
}
export {readMessageGroupLearnerAtRecipient};
