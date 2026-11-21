import {unavailableRepairPreparation, preparedRepairBody} from
  '../partition/partition-placement-repair-preparation-result.js';
import {canonicalRetainedPlacementRepair} from '../partition/partition-placement-retained-repair.js';
import {requestPlacementRepairPreparation} from '../partition/partition-placement-repair-preparation.js';
import {REPAIR_PREPARATION_STATE as PREPARATION, PLACEMENT_ADMISSION_ERROR,
  PLACEMENT_REPAIR_PREPARE_TYPE} from '../partition/partition-placement-admission-constants.js';
import {deliveryReadingOf} from '../transport/transport-semantic-outcome.js';
import {PLACEMENT_STATEMENT_VALIDITY} from './replica-placement-owner-admission-statement.js';
import {resolvePlacementLedgerDelivery} from './replica-placement-owner-transport.js';
import {RETAINED_REPAIR_BINDING as BINDING} from './replica-operation-retained-repair-record.js';
import {resolveTargetNodeIncarnationSnapshot} from './replica-status.js';
import {TABLES} from '../constants/index.js';

// ends-on: PLACEMENT_REPAIR_PREPARE owner reply
const PREPARATION_TIMEOUT_MS = 5000;
const OWNER_FIELDS = Object.freeze(['nodeId', 'replicaId']);

async function readRemotePreparation(coordinator, operation) {
  const delivery = resolvePlacementLedgerDelivery(coordinator);
  if (delivery === null) {
    return {owner: null,
      answer: unavailableRepairPreparation(PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE)};
  }
  const {owner, transport} = delivery;
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

const UNAVAILABLE_BINDING = Object.freeze({state: BINDING.UNAVAILABLE});

// The binding a retained decision presents to: the active local ledger leader
// (the node that would propose), else the canonical remote route together with
// the tenure pair existing owners attest a running replica by: the bound node's
// published boot incarnation and the replica's SERVICES birth (created_at).
function resolveRetainedPlacementRepairBinding(coordinator) {
  const local = coordinator.resolveActiveLocalLedgerLeaderService();
  if (local) return {state: BINDING.LOCAL, nodeId: local.nodeId, replicaId: local.replicaId};
  const route = coordinator.resolveRemoteLedgerLeader();
  if (route === null) return UNAVAILABLE_BINDING;
  const cache = coordinator.systemTableCache;
  return {state: BINDING.REMOTE, ...route,
    nodeBootIncarnation: resolveTargetNodeIncarnationSnapshot(cache, route.nodeId).bootIncarnation,
    replicaCreatedAt: cache.get(TABLES.SERVICES, route.replicaId).created_at};
}

export {prepareRetainedPlacementRepairBody, resolveRetainedPlacementRepairBinding};
