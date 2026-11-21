import {canonicalRetainedPlacementRepair} from '../partition/partition-placement-retained-repair.js';
import {requestPlacementRepairPreparation} from '../partition/partition-placement-repair-preparation.js';
import {PLACEMENT_ADMISSION_ERROR, PLACEMENT_REPAIR_PREPARE_TYPE} from '../partition/partition-placement-admission-constants.js';
import {deliveryReadingOf} from '../transport/transport-semantic-outcome.js';
import {PLACEMENT_STATEMENT_VALIDITY} from './replica-placement-owner-admission-statement.js';
import {PLACEMENT_REFUSAL} from './replica-placement-owner-constants.js';
import {wrapPlacementTransport} from './replica-placement-owner-transport.js';

const PREPARATION_TIMEOUT_MS = 5000;

async function prepareRetainedPlacementRepairBody(coordinator, operation) {
  let answer;
  let expectedOwner;
  const local = coordinator.resolveActiveLocalLedgerLeaderService();
  if (local) {
    expectedOwner = {nodeId: local.nodeId, replicaId: local.replicaId};
    answer = requestPlacementRepairPreparation(local, {operation});
  } else {
    const leader = coordinator.resolveRemoteLedgerLeader();
    const address = leader?.address;
    expectedOwner = leader;
    const transport = wrapPlacementTransport(coordinator.messageRouter);
    if (!address || !transport) return {state: 'unavailable',
      reason: PLACEMENT_REFUSAL.RETAINED_COPY_POLICY_UNAVAILABLE};
    try {
      answer = deliveryReadingOf(await transport.deliver(address,
        {type: PLACEMENT_REPAIR_PREPARE_TYPE, operation}, {timeoutMs: PREPARATION_TIMEOUT_MS}));
    } catch {
      return {state: 'unavailable', reason: PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE};
    }
  }
  if (answer?.state !== 'prepared') return answer?.reason || answer?.failureCode ? answer :
    {state: 'unavailable', reason: PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE};
  if (answer.owner?.nodeId !== expectedOwner?.nodeId ||
      answer.owner?.replicaId !== expectedOwner?.replicaId) {
    return {state: 'unavailable', reason: PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE};
  }
  const canonical = canonicalRetainedPlacementRepair(answer.body);
  if (canonical.validity !== PLACEMENT_STATEMENT_VALIDITY.VALID ||
      JSON.stringify(canonical.statement.operation) !== JSON.stringify(operation)) {
    return {state: 'unavailable', reason: PLACEMENT_REFUSAL.RETAINED_IDENTITY_CHANGED};
  }
  return {state: 'prepared', body: canonical.statement, owner: answer.owner};
}

export {prepareRetainedPlacementRepairBody};
