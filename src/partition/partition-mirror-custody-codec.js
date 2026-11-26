import {extractLexedSqlMutationType} from './partition-statement-mutation-kind.js';
import {
  PARTITION_COMMITTED_COMMAND_OUTCOME, PARTITION_COMMITTED_SQL_COMMAND_TYPES,
  PARTITION_SERVICE_OPERATION,
} from './partition-service-constants.js';
import {decodeTypedParams, decodeTypedRowSet} from '../query/sql-value-codec.js';
import {
  MIRROR_RETENTION_BARRIER_ENTRY_KEY,
  MIRROR_RETENTION_BARRIER_KIND,
  MIRROR_RETENTION_CUSTODY_COMMAND_ERROR,
} from './partition-committed-statement-outcome-constants.js';

export const MIRROR_CUSTODY_FORMAT = 'partition-mirror-custody/1';

const ordinal = (value) => Number.isSafeInteger(value) && value >= 0;
const positiveOrdinal = (value) => Number.isSafeInteger(value) && value > 0;

export function validMirrorCustody(value) {
  return value !== null && typeof value === 'object' && value.format === MIRROR_CUSTODY_FORMAT &&
    Object.keys(value).length === 7 &&
    ordinal(value.barrierIndex) && typeof value.workflowId === 'string' &&
    value.workflowId.trim().length > 0 && positiveOrdinal(value.workflowAttempt) &&
    positiveOrdinal(value.workflowFenceToken) && positiveOrdinal(value.targetPartitionVersion) &&
    (value.family === 'split' || value.family === 'merge');
}

export function decodeMirrorCustodyRow(row) {
  let custody;
  try {
    custody = JSON.parse(row.typed_effects_json);
  } catch {
    custody = null;
  }
  if (row.entry_key !== MIRROR_RETENTION_BARRIER_ENTRY_KEY || row.log_index !== 0 ||
      row.mutation_kind !== MIRROR_RETENTION_BARRIER_KIND || !validMirrorCustody(custody)) {
    const error = new TypeError(MIRROR_RETENTION_CUSTODY_COMMAND_ERROR.BYTES);
    error.code = MIRROR_RETENTION_CUSTODY_COMMAND_ERROR.BYTES;
    throw error;
  }
  return custody;
}

export function sameMirrorCustody(a, b) {
  return a.workflowId === b.workflowId && a.workflowAttempt === b.workflowAttempt &&
    a.workflowFenceToken === b.workflowFenceToken && a.family === b.family &&
    a.targetPartitionVersion === b.targetPartitionVersion;
}

export function canAssumeMirrorCustody(existing, successor) {
  return successor.workflowFenceToken >= existing.workflowFenceToken &&
    sameMirrorCustody(existing, {...successor, workflowFenceToken: existing.workflowFenceToken});
}

function invalidReplay(message, cause) {
  return Object.assign(new TypeError(message, {cause}),
    {code: MIRROR_RETENTION_CUSTODY_COMMAND_ERROR.BYTES});
}

export function decodeMirrorReplayRecord(row) {
  try {
    const record = JSON.parse(row.typed_effects_json);
    const command = record.command;
    if (!positiveOrdinal(row.log_index) ||
        !PARTITION_COMMITTED_SQL_COMMAND_TYPES.includes(command?.type) ||
        command.type === PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE ||
        typeof command.entryId !== 'string' || command.entryId.length === 0 ||
        row.entry_key !== `entry:${command.entryId}` ||
        typeof command.sql !== 'string' || command.sql.trim().length === 0) {
      throw new TypeError('Invalid mirror command');
    }
    if (Object.hasOwn(command, 'typedParams')) decodeTypedParams(command.typedParams);
    if (command.params != null && !Array.isArray(command.params)) {
      throw new TypeError('Invalid mirror params');
    }
    decodeTypedRowSet(record.typedEffects);
    return record;
  } catch (cause) {
    throw invalidReplay('Invalid mirror replay record', cause);
  }
}

export function assertAppliedMirrorEffect(command, index, previousIndex, rowCount, recorded) {
  const mutationKind = extractLexedSqlMutationType(command.sql);
  if (index <= previousIndex || !ordinal(rowCount) ||
      !mutationKind || mutationKind !== recorded?.mutationKind ||
      recorded.outcome !== PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED ||
      recorded.logIndex !== index || recorded.changes !== rowCount) {
    throw invalidReplay(`Mirror effect lacks matching applied statement at index ${index}`);
  }
}

export function terminalMirrorIdentity(workflow, family) {
  const {workflowAttempt, targetPartitionVersion} = workflow.metadata;
  return Object.freeze({workflowId: workflow.workflowId, workflowAttempt,
    workflowFenceToken: workflow.fenceToken, targetPartitionVersion, family});
}
