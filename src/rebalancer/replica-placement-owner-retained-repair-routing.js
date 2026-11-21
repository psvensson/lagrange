import {unavailableRepairPreparation, preparedRepairBody} from
  '../partition/partition-placement-repair-preparation-result.js';
import {canonicalRetainedPlacementRepair} from '../partition/partition-placement-retained-repair.js';
import {requestPlacementRepairPreparation} from '../partition/partition-placement-repair-preparation.js';
import {REPAIR_PREPARATION_STATE as PREPARATION, PLACEMENT_ADMISSION_ERROR,
  PLACEMENT_REPAIR_PREPARE_TYPE} from '../partition/partition-placement-admission-constants.js';
import {deliveryReadingOf} from '../transport/transport-semantic-outcome.js';
import {PLACEMENT_STATEMENT_VALIDITY} from './replica-placement-owner-admission-statement.js';
import {wrapPlacementTransport} from './replica-placement-owner-transport.js';

// ends-on: PLACEMENT_REPAIR_PREPARE owner reply
const PREPARATION_TIMEOUT_MS = 5000;
const OWNER_FIELDS = Object.freeze(['nodeId', 'replicaId']);

async function readRemotePreparation(coordinator, operation) {
  const owner = coordinator.resolveRemoteLedgerLeader();
  const transport = wrapPlacementTransport(coordinator.messageRouter);
  if (!owner?.address || !transport) {
    return {owner,
      answer: unavailableRepairPreparation(PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE)};
  }
  let answer;
  try {
    answer = deliveryReadingOf(await transport.deliver(owner.address,
      {type: PLACEMENT_REPAIR_PREPARE_TYPE, operation}, {timeoutMs: PREPARATION_TIMEOUT_MS}));
  } catch {
    answer = unavailableRepairPreparation(PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE);
  }
  return {owner, answer};
}

function validatePreparedRepair({owner, answer}, operation) {
  if (answer?.state !== PREPARATION.PREPARED) {
    return answer?.reason || answer?.failureCode ? answer :
      unavailableRepairPreparation(PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE);
  }
  if (!OWNER_FIELDS.every((key) => answer.owner?.[key] === owner?.[key])) {
    return unavailableRepairPreparation(PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE);
  }
  const canonical = canonicalRetainedPlacementRepair(answer.body);
  const exact = JSON.stringify(canonical.statement?.operation) === JSON.stringify(operation);
  return canonical.validity === PLACEMENT_STATEMENT_VALIDITY.VALID && exact ?
    preparedRepairBody(canonical.statement, answer.owner) :
    unavailableRepairPreparation(PLACEMENT_ADMISSION_ERROR.BYTES);
}

async function prepareRetainedPlacementRepairBody(coordinator, operation) {
  const local = coordinator.resolveActiveLocalLedgerLeaderService();
  const reading = local ? {owner: {nodeId: local.nodeId, replicaId: local.replicaId},
    answer: requestPlacementRepairPreparation(local, {operation})} :
    await readRemotePreparation(coordinator, operation);
  return validatePreparedRepair(reading, operation);
}

export {prepareRetainedPlacementRepairBody};
