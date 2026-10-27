import {transactionSettlementBytes} from
  '../query/distributed/distributed-transaction-settlement.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {COORDINATOR_SETTLEMENT_TYPE} from './partition-coordinator-settlement-constants.js';

const FIELDS = Object.freeze(['type', 'entryId', 'partitionId', 'settlement',
  'settlementText', 'settlementDigest', 'timestamp', 'proposedBy', 'proposedAt']);

function buildCoordinatorSettlementCommand(service, input) {
  const bytes = transactionSettlementBytes(input);
  return bytes === null ? null : Object.freeze({type: COORDINATOR_SETTLEMENT_TYPE,
    entryId: bytes.entryId, partitionId: service.partitionId,
    settlement: bytes.command, settlementText: bytes.commandText,
    settlementDigest: bytes.commandDigest, timestamp: service.hlcClock.now().toString(),
    proposedBy: service.replicaId, proposedAt: service.timeSource.now()});
}

function hasRequiredSettlementHeader(command) {
  if (!command || Object.keys(command).length !== FIELDS.length ||
      !FIELDS.every((field) => Object.hasOwn(command, field))) return false;
  return command.type === COORDINATOR_SETTLEMENT_TYPE &&
    typeof command.partitionId === 'string' && command.partitionId.length > 0 &&
    typeof command.timestamp === 'string' &&
    typeof command.proposedBy === 'string' &&
    Number.isFinite(command.proposedAt);
}

function isPinnedCoordinatorSettlementCommand(input) {
  const command = copyStrictOwnDataRecord(input);
  if (!hasRequiredSettlementHeader(command)) return false;
  const bytes = transactionSettlementBytes(command.settlement);
  return bytes !== null && command.entryId === bytes.entryId &&
    command.settlementText === bytes.commandText &&
    command.settlementDigest === bytes.commandDigest;
}

export {buildCoordinatorSettlementCommand, isPinnedCoordinatorSettlementCommand};
