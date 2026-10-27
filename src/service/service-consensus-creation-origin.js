// Immutable original creation identity. Journal, handler and physical owner
// use the same capture; an absent token is a PENDING hint, never admission.
import {SERVICE_INSTANCE_LIMIT as LIMIT, SERVICE_INSTANCE_OUTCOME as OUTCOME} from
  '../constants/service-instance.js';
import {captureInstanceJson, instanceDigest, requireInstance} from
  '../control-plane/owners/service-instance-contract.js';
import {matchesInstanceResourceToken} from '../control-plane/owners/service-instance-state.js';
import {captureConsensusCreationIntent} from './service-consensus-creation-intent.js';

function captureRetainedCreationOrigin(value) {
  const intent = captureConsensusCreationIntent(value?.intent);
  const operationId = intent.consensusSlotRequest.operationId;
  requireInstance(value.operationId === undefined || value.operationId === operationId,
    OUTCOME.CONTENT_CONFLICT);
  const token = value.token === null ? null : captureInstanceJson(value.token, LIMIT.SLOT_BYTES);
  requireInstance(token === null || matchesInstanceResourceToken(intent.consensusBinding,
    intent.consensusSlotRequest, token), OUTCOME.CONTENT_CONFLICT);
  return {operationId, intent, token};
}

function sameRetainedCreation(left, right) {
  return left !== undefined && left !== null && right !== undefined && right !== null &&
    instanceDigest(left.intent) === instanceDigest(right.intent) &&
    instanceDigest(left.token) === instanceDigest(right.token);
}

export {captureRetainedCreationOrigin, sameRetainedCreation};
