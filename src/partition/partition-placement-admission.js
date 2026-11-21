import {readPartitionAppliedIndex} from './partition-committed-log.js';
// Public entry: requestPlacementAdmission, requestPlacementHoldRelease, routePlacementAdmission, applyPlacementCommand.
// Required collaborators: PartitionService (replica_operations-p1), buildPlacementCommand, decidePlacementAdmission, decideHoldRelease.
// Durable authority / commit point: replica_operations and _partition_statement_outcomes rows committed in applyCommittedEntrySliceTransaction.
// Permitted post-commit work: resolveCommittedWrite and emit PARTITION_SERVICE_EVENT.ENTRY_COMMITTED via afterCommit; rejectCommittedWrite via afterRollback.
// Recovery / wake entry: settled _partition_statement_outcomes rows replay identical command fingerprints and reject same-ID/different-command collisions.
// Representative production tests: test/partition/placement-admission-apply.test.js, test/convergence/dt-placement-owner-formation-drain.test.js.
import {createHash} from 'node:crypto';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {deliveryReadingOf} from '../transport/transport-semantic-outcome.js';
import {OPERATION_METADATA_KEY, OperationType} from '../rebalancer/replica-operation-progress.js';
import {PLACEMENT_OUTCOME, PLACEMENT_REFUSAL, PLACEMENT_TRANSITION_KIND} from
  '../rebalancer/replica-placement-owner-constants.js';
import {admitCommittedCommand, PARTITION_COMMITTED_COMMAND_ORIGIN,
  committedCommandRefusalResult} from './partition-committed-command-admission.js';
import {partitionWriteLeadershipRefusalOf, startPartitionRaftWriteCommit} from
  './partition-service-raft-write-commit.js';
import {readCommittedStatementOutcome, recordCommittedStatementOutcome} from
  './partition-committed-statement-outcome.js';
import {PARTITION_COMMITTED_STATEMENT_RECORD_STATE as RECORD} from
  './partition-committed-statement-outcome-constants.js';
import {PARTITION_COMMITTED_COMMAND_OUTCOME as APPLY, PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_OPERATION as OPERATION} from './partition-service-constants.js';
import {advancePartitionWriteGeneration, isPartitionReserved} from
  './partition-participant-transaction-store.js';
import {settleReservedCommittedStatement} from './partition-participant-transaction-apply.js';
import {pausedWriteAnswerOf} from './partition-participant-transaction-pause.js';
import {PARTITION_CDC_ADMISSION_STATE, admitCdcOwedWork} from
  './partition-cdc-owed-admission.js';
import {recordCommittedOperationCdc} from './partition-cdc-obligation.js';
import {PARTITION_CDC_EVENT_BUILD_STATE} from './partition-cdc-generator.js';
import {eventCdcSourceScope} from '../cdc/cdc-source-scope-evidence.js';
import {buildPlacementCommand, isPinnedPlacementCommand} from
  './partition-placement-admission-command.js';
import {LEDGER_PARTITION_ID, decideHoldRelease, decidePlacementAdmission} from
  './partition-placement-admission-decision.js';
import {placementOperationIdOf, placementReplicaIdOf} from
  './partition-placement-admission-identity.js';
import {decideRetainedPlacementRepair} from './partition-placement-retained-repair.js';
import {PLACEMENT_REPAIR_TYPE, PLACEMENT_ADMISSION_ERROR as ERROR, PLACEMENT_ADMIT_TYPE,
  PLACEMENT_RELEASE_HOLD_TYPE, PLACEMENT_RESULT_FIELD} from
  './partition-placement-admission-constants.js';

const EVENT_KEY_SEPARATOR = ':';
const FINGERPRINT_HEX_LENGTH = 12;
const HEX_RADIX = 16;
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const PENDING_FINGERPRINTS_FIELD = 'pendingPlacementCommandFingerprints';
const OUTCOMES = Object.freeze(new Set(Object.values(PLACEMENT_OUTCOME)));

function pendingFingerprintsOf(service) {
  let map = service[PENDING_FINGERPRINTS_FIELD];
  if (map === undefined) {
    map = new Map();
    service[PENDING_FINGERPRINTS_FIELD] = map;
  }
  return map;
}

function commandFingerprintOf(command) {
  return Number.parseInt(createHash(HASH_ALGORITHM)
    .update(`${command.type}:${command.bodyText}`)
    .digest(HASH_ENCODING)
    .slice(0, FINGERPRINT_HEX_LENGTH), HEX_RADIX);
}

const SELECT_ADMITTED_OPERATION_SQL =
  'SELECT type, target_node_id, source_node_id, partition_id, entity_type, ' +
  'entity_id, replica_id, source_replica_id, copy_source_node_id, ' +
  'membership_publication_epoch, steps_history ' +
  'FROM replica_operations WHERE operation_id = ?';

function nullableField(value) {
  return value ?? null;
}

function matchesAdmittedRowIdentity(row, statement, move, opId) {
  const expectedReplicaId = move.replicaId ?? placementReplicaIdOf(opId);
  return row.type === move.type &&
    row.target_node_id === move.targetNodeId &&
    row.source_node_id === statement.sourceNodeId &&
    row.partition_id === statement.partitionId &&
    row.entity_type === statement.entityType &&
    row.entity_id === statement.entityId &&
    row.replica_id === expectedReplicaId;
}

function matchesAdmittedRowOptionalColumns(row, statement, move) {
  return nullableField(row.source_replica_id) === nullableField(move.sourceReplicaId) &&
    nullableField(row.copy_source_node_id) === nullableField(move.copySourceNodeId) &&
    nullableField(row.membership_publication_epoch) ===
      nullableField(statement.membershipPublicationEpoch);
}

function readFirstStepEntry(row) {
  if (typeof row?.steps_history !== 'string' || row.steps_history.length === 0) {
    return null;
  }
  const history = JSON.parse(row.steps_history);
  return Array.isArray(history) && history.length > 0 ? nullableField(history[0]) : null;
}

function matchesFirstStepIncarnations(firstStep, move) {
  return nullableField(firstStep?.[OPERATION_METADATA_KEY.TARGET_NODE_BOOT_INCARNATION]) ===
      nullableField(move.targetNodeBootIncarnation) &&
    nullableField(firstStep?.[OPERATION_METADATA_KEY.TARGET_NODE_STORAGE_INCARNATION]) ===
      nullableField(move.targetNodeStorageIncarnation);
}

function matchesAdmissionMetaFields(meta, command, statement) {
  return meta.entryId === command.entryId &&
    meta.transitionKind === statement.transitionKind &&
    meta.placementClass === statement.placementClass &&
    meta.repair === statement.repair &&
    nullableField(meta.formationLatchEpoch) === nullableField(statement.formationLatchEpoch) &&
    nullableField(meta.foundingIntentId) === nullableField(statement.foundingIntentId);
}

function matchesRetirementScope(recorded, requested) {
  if (requested === undefined || recorded === undefined) return recorded === requested;
  if (recorded === null || requested === null) return false;
  return Object.keys(recorded).length === Object.keys(requested).length &&
    Object.entries(requested).every(([key, value]) => recorded[key] === value);
}

function matchesAdmittedStepMetadata(row, command, statement, move) {
  const firstStep = readFirstStepEntry(row);
  const meta = nullableField(firstStep?.[OPERATION_METADATA_KEY.PLACEMENT_ADMISSION]);
  return meta !== null &&
    matchesFirstStepIncarnations(firstStep, move) &&
    matchesAdmissionMetaFields(meta, command, statement) &&
    matchesRetirementScope(meta.voterRetirement, move.voterRetirement) &&
    matchesRetirementScope(meta.learnerRetirement, move.learnerRetirement);
}

function matchesAdmittedRow(row, command, statement, move, opId) {
  return Boolean(row) &&
    matchesAdmittedRowIdentity(row, statement, move, opId) &&
    matchesAdmittedRowOptionalColumns(row, statement, move) &&
    matchesAdmittedStepMetadata(row, command, statement, move);
}

function matchesPreFingerprintAdmittedResult(service, recorded, result, command) {
  if (command.type !== PLACEMENT_ADMIT_TYPE || !Array.isArray(result.operationIds) ||
      !Array.isArray(command.body?.moves) || result.operationIds.length === 0 ||
      result.operationIds.length !== command.body.moves.length) {
    return false;
  }
  const selectOp = service.db.prepare(SELECT_ADMITTED_OPERATION_SQL);
  for (let idx = 0; idx < result.operationIds.length; idx += 1) {
    const opId = result.operationIds[idx];
    const expectedOpId = placementOperationIdOf(
      command.body.partitionId, recorded.logIndex, idx);
    if (opId !== expectedOpId) return false;
    const row = selectOp.get(opId);
    if (!matchesAdmittedRow(row, command, command.body, command.body.moves[idx], opId)) {
      return false;
    }
  }
  return true;
}

function isPreFingerprintCommandReplay(service, recorded, command) {
  const result = retainedResult(recorded);
  if (result.outcome === PLACEMENT_OUTCOME.ADMITTED) {
    return matchesPreFingerprintAdmittedResult(service, recorded, result, command);
  }
  if (result.outcome === PLACEMENT_OUTCOME.RELEASED) {
    return command.type === PLACEMENT_RELEASE_HOLD_TYPE &&
      Array.isArray(result.operationIds) &&
      result.operationIds.length === 1 &&
      command.body?.operationId === result.operationIds[0];
  }
  return false;
}

function isSameCommandReplay(service, recorded, command) {
  if (Number.isSafeInteger(recorded.lastInsertRowid)) {
    return recorded.lastInsertRowid === commandFingerprintOf(command);
  }
  if (recorded.lastInsertRowid !== null) return false;
  return isPreFingerprintCommandReplay(service, recorded, command);
}

function refusal(service, failureCode) {
  return {success: false, admitted: false, partitionId: service.partitionId,
    failureCode};
}

function placementAnswer(service, result, fields = {}) {
  return {success: result.outcome !== PLACEMENT_OUTCOME.REFUSED,
    partitionId: service.partitionId, [PLACEMENT_RESULT_FIELD]: result, ...fields};
}

function deepFreezeResult(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreezeResult(child);
  return Object.freeze(value);
}

function retainedResult(recorded) {
  if (typeof recorded.ownerResultText !== 'string') throw new Error(ERROR.RESULT);
  const result = JSON.parse(recorded.ownerResultText);
  if (!OUTCOMES.has(result?.outcome)) throw new Error(ERROR.RESULT);
  return deepFreezeResult(result);
}

function recordedAnswer(service, recorded, command) {
  return placementAnswer(service, retainedResult(recorded), {committed: true,
    logIndex: recorded.logIndex, term: recorded.term,
    ...(command.type === PLACEMENT_REPAIR_TYPE ? {entryId: command.entryId} : {})});
}

// The leader-local proposal of a built command: leadership, the cutover
// pause, the committed-command admission, a settled answer replayed, a
// pending one joined; the CDC owed admission counts its rows before it is
// proposed (startPartitionRaftWriteCommit); a reserved partition parks it.
function proposePlacementCommand(service, command) {
  const leadership = partitionWriteLeadershipRefusalOf(service);
  if (leadership !== null) return leadership;
  const paused = pausedWriteAnswerOf(service);
  if (paused !== null) return paused;
  const admission = admitCommittedCommand(command,
    {origin: PARTITION_COMMITTED_COMMAND_ORIGIN.PLACEMENT_OWNER});
  if (!admission.admitted) {
    return committedCommandRefusalResult(admission, service.partitionId);
  }
  const entryKey = service.getCommittedEntryKey(command);
  const recorded = readCommittedStatementOutcome(service, entryKey);
  if (recorded.state === RECORD.SETTLED) {
    if (!isSameCommandReplay(service, recorded, command)) return refusal(service, ERROR.BYTES);
    const answer = recordedAnswer(service, recorded, command);
    return command.type === PLACEMENT_ADMIT_TYPE &&
      command.body.transitionKind === PLACEMENT_TRANSITION_KIND.FOUND ?
      {...answer, observedLedgerAppliedIndex: readPartitionAppliedIndex(service)} :
      answer;
  }
  const fingerprint = commandFingerprintOf(command);
  const pendingFingerprints = pendingFingerprintsOf(service);
  const pending = service.getPendingCommittedWriteOutcome(command.entryId);
  if (pending !== null) {
    return pendingFingerprints.get(command.entryId) === fingerprint ?
      pending : refusal(service, ERROR.BYTES);
  }
  const body = command.body;
  if (command.type === PLACEMENT_ADMIT_TYPE &&
      body.transitionKind === PLACEMENT_TRANSITION_KIND.PLACEMENT &&
      body.moves.some((move) => move.type === OperationType.REMOVE &&
        move.learnerRetirement === undefined && move.voterRetirement === undefined)) {
    return refusal(service, ERROR.REMOVE_INTENT_UNSCOPED);
  }
  pendingFingerprints.set(command.entryId, fingerprint);
  const commitPromise = startPartitionRaftWriteCommit(service, {entry: command,
    phaseTimings: null, applyStartMs: service.timeSource.now(),
    park: isPartitionReserved(service.db)});
  Promise.resolve(commitPromise).finally(() => {
    if (pendingFingerprints.get(command.entryId) === fingerprint) {
      pendingFingerprints.delete(command.entryId);
    }
  }).catch(() => {});
  return commitPromise;
}

async function requestPlacementCommand(service, type, payload) {
  if (service.tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
    return refusal(service, ERROR.TARGET);
  }
  if (service.partitionId !== LEDGER_PARTITION_ID) {
    return refusal(service, PLACEMENT_REFUSAL.LEDGER_PARTITION_REQUIRED);
  }
  const command = buildPlacementCommand(service, {type,
    entryId: payload.entryId, body: payload.body});
  return command === null ? refusal(service, ERROR.BYTES) :
    proposePlacementCommand(service, command);
}

/**
 * Request one admission on this replica_operations partition: the placement
 * owner's local call, and the PLACEMENT_ADMIT partition message a remote
 * proposer routes to the leader.
 * @param {Object} service - The partition.
 * @param {Object} payload - {entryId, body}: one proposal attempt's id and
 *   its admission statement.
 * @return {Promise<Object>|Object} The typed answer.
 */
function requestPlacementRepair(service, payload) {
  return requestPlacementCommand(service, PLACEMENT_REPAIR_TYPE, payload);
}

function requestPlacementAdmission(service, payload) {
  return requestPlacementCommand(service, PLACEMENT_ADMIT_TYPE, payload);
}

/**
 * Request the release of an engaged ledger move's dispatch hold (the owner's
 * local call on the leader).
 * @param {Object} service - The partition.
 * @param {Object} payload - {entryId, body: {operationId}}.
 * @return {Promise<Object>|Object} The typed answer.
 */
function requestPlacementHoldRelease(service, payload) {
  return requestPlacementCommand(service, PLACEMENT_RELEASE_HOLD_TYPE, payload);
}

/**
 * Route one admission request to the replica_operations-p1 leader through
 * the partition message route.
 * @param {Object} transport - The sender's transport ({deliver}).
 * @param {string} leaderAddress - The leader replica's address.
 * @param {Object} payload - {entryId, body}.
 * @param {Object} options - {timeoutMs}: the delivery's bound.
 * @return {Promise<Object>} The leader's answer, or the transport outcome.
 */
async function routePlacementAdmission(transport, leaderAddress, payload,
  options) {
  return deliveryReadingOf(await transport.deliver(leaderAddress, {
    type: PLACEMENT_ADMIT_TYPE, entryId: payload.entryId, body: payload.body,
  }, options));
}

// The CDC row image of one written row, recorded through the participant
// model in the same apply transaction (never the settlement model).
function cdcEventsOf(service, {command, index, term, entryKey}, rows, operation) {
  const generator = service.syncCDCGeneratorDependencies();
  const sourceScope = eventCdcSourceScope(service);
  return rows.flatMap((row, ordinal) => {
    const built = generator.buildEvent({type: operation, tableName: service.tableName,
      data: {...row}, whereClause: {operation_id: row.operation_id},
      entryId: command.entryId, timestamp: command.timestamp, changes: 1},
    {suppressNoOpWrite: true, sourceReplica: command.proposedBy});
    if (built.state !== PARTITION_CDC_EVENT_BUILD_STATE.BUILT) return [];
    return [Object.freeze({eventKey: `${entryKey}${EVENT_KEY_SEPARATOR}${ordinal}`,
      logIndex: index, term, ordinal, entryId: command.entryId,
      cdcEvent: built.cdcEvent, eventJson: JSON.stringify({...built.cdcEvent,
        ...(sourceScope === null ? {} : {sourceScope})})})];
  });
}

function decide(service, committed) {
  if (admitCdcOwedWork(service, committed.command).state ===
      PARTITION_CDC_ADMISSION_STATE.REFUSED) {
    return {result: Object.freeze({outcome: PLACEMENT_OUTCOME.REFUSED,
      reason: PLACEMENT_REFUSAL.CDC_CAPACITY}), rows: [], operation: null};
  }
  const {command, index} = committed;
  if (command.type === PLACEMENT_REPAIR_TYPE) {
    return {...decideRetainedPlacementRepair(service.db, command.body),
      operation: OPERATION.INSERT};
  }
  if (command.type === PLACEMENT_ADMIT_TYPE) {
    return {...decidePlacementAdmission(service.db,
      {command, statement: command.body, index}), operation: OPERATION.INSERT};
  }
  return {...decideHoldRelease(service.db, {command, release: command.body}),
    operation: OPERATION.UPDATE};
}

/**
 * Apply one committed placement command inside its application transaction.
 * @param {Object} service - The partition.
 * @param {Object} committed - {command, index, term, afterCommit,
 *   afterRollback}.
 * @return {string} A PARTITION_COMMITTED_COMMAND_OUTCOME.
 */
function applyPlacementCommand(service, committed) {
  const {command, index, term, afterCommit, afterRollback} = committed;
  if (service.tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS ||
      command.partitionId !== service.partitionId ||
      !isPinnedPlacementCommand(command)) {
    throw new Error(ERROR.BYTES);
  }
  const entryKey = service.getCommittedEntryKey(command);
  const recorded = readCommittedStatementOutcome(service, entryKey);
  if (recorded.state === RECORD.SETTLED) {
    if (!isSameCommandReplay(service, recorded, command)) throw new Error(ERROR.BYTES);
    const answer = recordedAnswer(service, recorded, command);
    afterCommit(() => service.resolveCommittedWrite(command.entryId, answer));
    return APPLY.REPLAYED;
  }
  if (isPartitionReserved(service.db)) {
    return settleReservedCommittedStatement(service, {command, afterCommit});
  }
  try {
    const {result, rows, operation} = decide(service, committed);
    recordCommittedStatementOutcome(service, {entryKey, outcome: APPLY.APPLIED,
      index, term, result: {changes: rows.length,
        lastInsertRowid: commandFingerprintOf(command)},
      ownerResultText: JSON.stringify(result)});
    if (rows.length > 0) {
      recordCommittedOperationCdc(service, committed,
        cdcEventsOf(service, {command, index, term, entryKey}, rows, operation));
      advancePartitionWriteGeneration(service.db);
    }
    afterCommit(() => service.resolveCommittedWrite(command.entryId,
      placementAnswer(service, result, {committed: true, logIndex: index, term,
        ...(command.type === PLACEMENT_REPAIR_TYPE ? {entryId: command.entryId} : {})})));
    afterCommit(() => service.emit(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED,
      {partitionId: service.partitionId, command}));
    return APPLY.APPLIED;
  } catch (error) {
    afterRollback(() => service.rejectCommittedWrite(command.entryId, error));
    throw error;
  }
}

export {requestPlacementRepair, applyPlacementCommand, requestPlacementAdmission,
  requestPlacementHoldRelease, routePlacementAdmission};
