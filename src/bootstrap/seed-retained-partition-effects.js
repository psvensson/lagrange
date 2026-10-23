// A read-only correspondence reduction, not an application/replay engine.
import {isDeepStrictEqual} from 'node:util';
import {PARTITION_SERVICE_OPERATION as OPERATION,
  PARTITION_COMMITTED_COMMAND_OUTCOME as OUTCOME} from '../partition/partition-service-constants.js';
import {PARTICIPANT_TRANSACTION_COMMAND as PARTICIPANT,
  PARTICIPANT_ORIGIN_HISTORY_STATE as ORIGIN} from
  '../partition/partition-participant-transaction-constants.js';
import {readPartitionWriteOriginIn, readParticipantTransactionCensusIn} from
  '../partition/partition-participant-transaction-store.js';
import {committedStatementEntryKey, readCommittedStatementCensusIn} from
  '../partition/partition-committed-statement-outcome.js';
import {PARTITION_CDC_COMMAND as CDC_COMMAND} from '../partition/partition-cdc-obligation-constants.js';
import {PARTITION_CDC_DELIVERY_FLAG, readCdcObligationCensusIn, isPinnedCdcAcknowledgementCommand,
  buildCdcAcknowledgementCommand, cdcObligationEventKeyDigest} from
  '../partition/partition-cdc-obligation-ledger.js';
import {PartitionCDCGenerator, hydratePartitionCdcEvent, PARTITION_CDC_EVENT_BUILD_STATE} from
  '../partition/partition-cdc-generator.js';
import {RAFT_RS_RETAINED_ENTRY_KIND as ENTRY_KIND, RAFT_RS_RETAINED_ENTRY_PHASE as PHASE} from
  '../raft/raft-rs-durable-store-constants.js';
import {readSystemTableRowsIn} from './system-table-schema-sql.js';
import {getSchemaByTableName, SYSTEM_TABLE_NAME} from './system-table-schemas-constants.js';
import {readPartitionServiceTableSchemaIn, PARTITION_TABLE_OBSERVATION as SCHEMA} from
  '../partition/partition-service-table-bootstrap.js';
import {readTransactionSchemaEnforcement, TRANSACTION_SCHEMA_ENFORCEMENT_STATE as ENFORCEMENT} from
  '../query/distributed/distributed-transaction-schema-enforcement.js';
import {originalFoundationPlans, isRetainedOriginalStamp, storedFoundationRowMatches} from
  './seed-retained-foundation.js';
import {SEED_RETAINED_EFFECT_STATE as STATE, SEED_RETAINED_EFFECT_REASON as REASON,
  SEED_RETAINED_EFFECT_KIND as KIND} from './seed-retained-effects-constants.js';

const OPTIONAL_QUERY_FIELDS = Object.freeze(['operationId', 'idempotencyKey', 'splitMirrorOrigin']);
const OBSERVATION_LOGGER = Object.freeze({debug() {}, warn() {}});
const POSITIVE_INTEGER = /^[1-9][0-9]*$/u;
const FOUNDATION_CHANGED_ROWS = '1';
const FOUNDATION_EVENT_ORDINAL = '0';

function canonicalQuery(command, member) {
  if (command.type !== OPERATION.QUERY || typeof command.entryId !== 'string' ||
      command.entryId.length === 0 || !isRetainedOriginalStamp(command, member)) return false;
  const expected = {type: OPERATION.QUERY, sql: command.sql, params: command.params,
    entryId: command.entryId, timestamp: command.timestamp,
    proposedBy: command.proposedBy, proposedAt: command.proposedAt};
  for (const field of OPTIONAL_QUERY_FIELDS) {
    if (Object.hasOwn(command, field)) {
      if (command[field] !== null) return false;
      expected[field] = null;
    }
  }
  return isDeepStrictEqual(command, expected);
}

function classifyEntries(history, plans, member) {
  return history.entries.map((entry) => classifyEntry(entry, plans, member));
}

function canonicalAcknowledgment(command, member) {
  const {timestamp, proposedBy, proposedAt} = command;
  return isPinnedCdcAcknowledgementCommand(command) &&
    command.partitionId === member.groupId && isRetainedOriginalStamp(command, member) &&
    isDeepStrictEqual(command, buildCdcAcknowledgementCommand(member.groupId,
      command.acknowledged, {timestamp, proposedBy, proposedAt}));
}

function classifyEntry(entry, plans, member) {
  const command = entry.command;
  if (entry.kind === ENTRY_KIND.NOOP) {
    return {entry, kind: KIND.NOOP};
  } else if (command?.type === PARTICIPANT.GENERATION_ORIGIN) {
    return {entry, kind: isRetainedOriginalStamp(command, member) ? KIND.ORIGIN : null};
  } else if (command?.type === CDC_COMMAND.DELIVERED) {
    return {entry, kind: canonicalAcknowledgment(command, member) ? KIND.ACK : null};
  } else {
    return classifyFoundationEntry(entry, plans, member);
  }
}

function classifyFoundationEntry(entry, plans, member) {
  const {command} = entry;
  const plan = command && canonicalQuery(command, member) ?
    plans.find(({sql, params}) => sql === command.sql &&
      isDeepStrictEqual(params, command.params)) : null;
  return {entry, kind: plan?.kind ?? null,
    ...(plan ? {plan, entryKey: committedStatementEntryKey(command)} : {})};
}

function outcomeMatches(outcome, classified) {
  const {entry} = classified;
  return outcome?.outcome === OUTCOME.APPLIED && outcome.logIndex === entry.index &&
    outcome.term === entry.term && outcome.failureCode === null &&
    outcome.failureMessage === null &&
    outcome.ownerResultText === null && outcome.changes === FOUNDATION_CHANGED_ROWS &&
    POSITIVE_INTEGER.test(outcome.lastInsertRowid);
}

function censusRefusal(reason, entry) {
  return {state: STATE.CONTRARY, reason, entry};
}

function statementCensus(entries, outcomes, origin) {
  const seen = new Map();
  const applied = [];
  const sources = new Map();
  const expectedRows = new Map();
  let generation = 0n;
  for (const classified of entries) {
    const {entry, entryKey, kind, plan} = classified;
    if (kind !== KIND.FOUNDATION) continue;
    const prior = seen.get(entryKey);
    if (prior) {
      if (!isDeepStrictEqual(prior.plan, plan)) return censusRefusal(REASON.OUTCOME, entry);
      continue;
    }
    seen.set(entryKey, classified);
    sources.set(entry.index, classified);
    if (entry.phase !== PHASE.APPLIED) continue;
    if (!outcomeMatches(outcomes.find((row) => row.entryKey === entryKey), classified)) {
      return censusRefusal(REASON.OUTCOME, entry);
    }
    applied.push(classified);
    if (origin.appliedOrigin === null ||
        BigInt(entry.index) > BigInt(origin.appliedOrigin.originIndex)) generation++;
    expectedRows.set(plan.key, plan.row);
  }
  if (applied.length !== outcomes.length) return censusRefusal(REASON.OUTCOME);
  if (String(generation) !== origin.generation) return censusRefusal(REASON.GENERATION);
  return {state: STATE.ACCEPTED, applied, sources, expectedRows};
}

function acknowledgmentNamesSource(group, source, entry) {
  return source && BigInt(source.entry.index) < BigInt(entry.index) &&
    group.events.length === 1 && group.events[0].ordinal === 0 &&
    group.events[0].eventKeyDigest === cdcObligationEventKeyDigest(source.entryKey);
}

function acknowledgmentCensus(entries, sources) {
  const firstApplied = new Map();
  const pending = [];
  for (const {entry, kind} of entries) {
    if (kind !== KIND.ACK) continue;
    for (const group of entry.command.acknowledged) {
      const source = sources.get(String(group.logIndex));
      if (!acknowledgmentNamesSource(group, source, entry)) {
        return censusRefusal(REASON.ACK, entry);
      }
      if (source.entry.phase !== PHASE.APPLIED) {
        if (entry.phase === PHASE.APPLIED) return censusRefusal(REASON.ACK, entry);
        pending.push({source: source.entry, acknowledgment: entry});
      } else if (entry.phase === PHASE.APPLIED && !firstApplied.has(source.entryKey)) {
        firstApplied.set(source.entryKey, entry);
      }
    }
  }
  return {state: STATE.ACCEPTED, firstApplied, pending};
}

function expectedEvent(classified, member) {
  const {command} = classified.entry;
  const generator = new PartitionCDCGenerator({partitionId: member.groupId,
    replicaId: member.replicaId, tableName: member.tableName, logger: OBSERVATION_LOGGER});
  const envelope = generator.resolveEventEnvelope({...command, changes: 1},
    {suppressNoOpWrite: true, sourceReplica: command.proposedBy});
  if (envelope.state !== PARTITION_CDC_EVENT_BUILD_STATE.BUILT) return null;
  return hydratePartitionCdcEvent(envelope.cdcEventEnvelope, classified.plan.row);
}

function obligationEventMatches(eventJson, source, member) {
  let event;
  try {
    event = JSON.parse(eventJson);
  } catch {
    return false;
  }
  if (event === null || typeof event !== 'object' || Array.isArray(event)) return false;
  const expected = expectedEvent(source, member);
  if (expected === null) return false;
  // Original composition does not install source-scope evidence. The
  // observed payload cannot supply its own producer authority by adding it.
  return isDeepStrictEqual(event, expected);
}

function obligationMatches(row, source, acknowledgment, member) {
  if (row.eventKey !== source.entryKey || row.entryId !== source.entry.command.entryId ||
      row.logIndex !== source.entry.index || row.term !== source.entry.term ||
      row.ordinal !== FOUNDATION_EVENT_ORDINAL) {
    return false;
  }
  if (!obligationEventMatches(row.eventJson, source, member)) return false;
  return acknowledgment ?
    row.delivered === String(PARTITION_CDC_DELIVERY_FLAG.DELIVERED) &&
      row.deliveredIndex === acknowledgment.index &&
      row.deliveredTerm === acknowledgment.term :
    row.delivered === String(PARTITION_CDC_DELIVERY_FLAG.OWED) &&
      row.deliveredIndex === null && row.deliveredTerm === null;
}

function schemaEffectStateIn(db, member, origin, physicalSchema) {
  if (physicalSchema.state !== SCHEMA.COMPLETE) {
    return {state: physicalSchema.state === SCHEMA.CONTRARY ?
      STATE.CONTRARY : STATE.UNAVAILABLE, reason: REASON.SCHEMA};
  } else if (member.tableName !== SYSTEM_TABLE_NAME.SQL_TRANSACTIONS) {
    return {state: STATE.ACCEPTED};
  } else {
    return originEnforcementStateIn(db, origin, physicalSchema);
  }
}

function originEnforcementStateIn(db, origin, physicalSchema) {
  const enforcement = readTransactionSchemaEnforcement(db);
  const expected = origin.appliedOrigin === null ? ENFORCEMENT.REQUIRED : ENFORCEMENT.ENFORCED;
  const triggers = physicalSchema.objects.filter(({type}) => type === 'trigger');
  const expectedTriggerCount = origin.appliedOrigin === null ? 0 : 1;
  if (enforcement.state === ENFORCEMENT.UNAVAILABLE) {
    return {enforcement, state: STATE.UNAVAILABLE, reason: REASON.ENFORCEMENT};
  } else if (enforcement.state !== expected || triggers.length !== expectedTriggerCount) {
    return {enforcement, state: STATE.CONTRARY, reason: REASON.ENFORCEMENT};
  } else {
    return {enforcement, state: STATE.ACCEPTED};
  }
}

function foundationRowsMatch(rows, expectedRows) {
  return rows.length === expectedRows.size &&
    rows.every((row) => [...expectedRows.values()]
      .some((expected) => storedFoundationRowMatches(row, expected)));
}

function obligationCensusMatches(obligations, emitting, acknowledgments, member) {
  return emitting.length === obligations.rows.length &&
    emitting.every((source) => {
      const row = obligations.rows.find(({eventKey}) => eventKey === source.entryKey);
      return row && obligationMatches(row, source,
        acknowledgments.firstApplied.get(source.entryKey), member);
    });
}

function observePartitionEffectsIn(db, declaration, member, history) {
  const origin = readPartitionWriteOriginIn(db, member.groupId, history);
  const participants = readParticipantTransactionCensusIn(db);
  const outcomes = readCommittedStatementCensusIn(db);
  const obligations = readCdcObligationCensusIn(db);
  const schema = getSchemaByTableName(member.tableName);
  const physicalSchema = readPartitionServiceTableSchemaIn(db, schema);
  const rows = physicalSchema.state === SCHEMA.COMPLETE ? readSystemTableRowsIn(db, schema) : [];
  const entries = classifyEntries(history,
    originalFoundationPlans(declaration, member.tableName), member);
  const observation = {origin, participants, outcomes, obligations, rows, entries, physicalSchema};
  const contrary = (reason, detail = {}) =>
    ({...observation, state: STATE.CONTRARY, reason, ...detail});
  const unavailable = (reason, detail = {}) =>
    ({...observation, state: STATE.UNAVAILABLE, reason, ...detail});
  if (origin.state === ORIGIN.CONTRARY) return contrary(REASON.ORIGIN);
  if (origin.state === ORIGIN.UNAVAILABLE) {
    return unavailable(REASON.ORIGIN);
  }
  const schemaEffects = schemaEffectStateIn(db, member, origin, physicalSchema);
  Object.assign(observation, schemaEffects);
  if (schemaEffects.state !== STATE.ACCEPTED) return observation;
  if (participants.length > 0) return contrary(REASON.PARTICIPANT);
  const unknown = entries.find(({kind}) => kind === null);
  if (unknown) return contrary(REASON.COMMAND, {entry: unknown.entry});
  const statements = statementCensus(entries, outcomes, origin);
  if (statements.state === STATE.CONTRARY) {
    return contrary(statements.reason, {entry: statements.entry});
  }
  if (!foundationRowsMatch(rows, statements.expectedRows)) {
    return contrary(REASON.ROWS);
  }
  const acknowledgments = acknowledgmentCensus(entries, statements.sources);
  if (acknowledgments.state === STATE.CONTRARY) {
    return contrary(acknowledgments.reason, {entry: acknowledgments.entry});
  }
  if (!obligationCensusMatches(obligations, statements.applied, acknowledgments, member)) {
    return contrary(REASON.OBLIGATION);
  }
  if (acknowledgments.pending.length > 0) {
    return unavailable(REASON.PENDING_SOURCE, {pendingDependencies: acknowledgments.pending});
  }
  return {...observation, state: STATE.ACCEPTED};
}

export {observePartitionEffectsIn};
