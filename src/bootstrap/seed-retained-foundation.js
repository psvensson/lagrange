// Correspondence with the real registration and CDC mutation producers.
import {isDeepStrictEqual} from 'node:util';
import {COLUMN} from '../constants/index.js';
import {HLCTimestamp} from '../hlc/hlc-timestamp.js';
import {getSystemCachePrimaryKeyField} from '../cache/system-cache-key-descriptor.js';
import {prepareInsertData} from '../cdc/cdc-integration-service-insert-normalization.js';
import {buildSystemTableUpsert} from '../cdc/cdc-system-table-mutation-sql-helpers.js';
import {seedMessageGroupRow, seedTableRow, seedPartitionRow} from './seed-foundation-rows.js';
import {SYSTEM_TABLE_NAME, SYSTEM_TABLE_SCHEMAS, getSchemaByTableName} from
  './system-table-schemas-constants.js';
import {SEED_RETAINED_EFFECT_KIND as KIND} from './seed-retained-effects-constants.js';

function originalFoundationRows(declaration, tableName) {
  const {nodeId, declaredAt} = declaration;
  if (tableName === SYSTEM_TABLE_NAME.MESSAGE_GROUPS) {
    return [seedMessageGroupRow(nodeId, declaredAt)];
  }
  if (tableName === SYSTEM_TABLE_NAME.TABLES) {
    return SYSTEM_TABLE_SCHEMAS.map((schema) => seedTableRow(schema, declaredAt));
  }
  if (tableName === SYSTEM_TABLE_NAME.PARTITIONS) {
    return SYSTEM_TABLE_SCHEMAS.map((schema) => seedPartitionRow(schema, nodeId, declaredAt));
  }
  return [];
}

function originalFoundationPlans(declaration, tableName) {
  const schema = getSchemaByTableName(tableName);
  // Physical table/index creation runs directly at partition open. There is
  // no original native SQL producer for DDL, even when generic SQL admits it.
  const plans = [];
  const context = {getPrimaryKeyField: getSystemCachePrimaryKeyField,
    timeSource: {now: () => declaration.declaredAt}};
  for (const original of originalFoundationRows(declaration, tableName)) {
    const data = prepareInsertData(context, tableName, original, {generatePrimaryKey: false});
    // SQLite fills nullable columns omitted by INSERT. Schema defaults have
    // already been supplied by the normal mutation producer above.
    const row = Object.fromEntries(schema.columns.map(({name}) => [name, data[name] ?? null]));
    plans.push({kind: KIND.FOUNDATION, ...buildSystemTableUpsert(tableName, data),
      row, key: row[getSystemCachePrimaryKeyField(tableName)]});
  }
  return plans;
}

function isCanonicalRetainedHlc(timestamp) {
  const clock = HLCTimestamp.tryFromString(timestamp);
  return clock !== null && clock.toString() === timestamp &&
    Number.isSafeInteger(clock.physical) && clock.physical >= 0 &&
    Number.isSafeInteger(clock.logical) && clock.logical >= 0 && clock.nodeId.length > 0;
}

function isRetainedOriginalStamp(command, member) {
  return isCanonicalRetainedHlc(command.timestamp) &&
    HLCTimestamp.tryFromString(command.timestamp).nodeId === command.proposedBy &&
    member.replicaIds.includes(command.proposedBy) &&
    Number.isSafeInteger(command.proposedAt) && command.proposedAt >= 0;
}

function storedFoundationRowMatches(actual, expected) {
  const exact = Object.fromEntries(Object.entries(expected).map(([key, value]) =>
    [key, typeof value === 'number' && Number.isSafeInteger(value) ? BigInt(value) : value]));
  return isDeepStrictEqual(actual, exact);
}

function retainedFoundationEventMatches(event, declaration) {
  // Legacy relays may have reminted the envelope timestamp. Content-only
  // correspondence preserves BOTH stamps and remains unavailable; only the
  // source occurrence can establish their relationship.
  if (!isCanonicalRetainedHlc(event.timestamp) ||
      !isCanonicalRetainedHlc(event.data?.[COLUMN.UPDATED_AT_HLC])) return false;
  const plans = originalFoundationRows(declaration, event.tableName);
  if (plans.length === 0) return false;
  const {[COLUMN.UPDATED_AT_HLC]: _ignored, ...data} = event.data;
  return originalFoundationPlans(declaration, event.tableName)
    .some((plan) => plan.row && isDeepStrictEqual(plan.row, data));
}

export {originalFoundationPlans, isRetainedOriginalStamp,
  storedFoundationRowMatches, retainedFoundationEventMatches};
