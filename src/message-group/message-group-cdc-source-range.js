// The committed application of a durable CDC range in a message group (CDC
// Stage 3). The group's log is the delivery unit; each member's node cache is
// the state it feeds. When a committed CDC_BATCH applies, every member decides
// the range against its own cache's position cell
// (system-table-cache-cdc-observation.js): a range whose predecessor this
// node has not applied is a GAP - no member is merged, the cell records the
// gap and the table is listed again; otherwise members at or below the cell's
// position are refused as already applied, the rest are applied in source
// order, and the cell advances to the range's last member.
//
// The replica also keeps, per source partition, the highest range its
// group's log committed (in that source incarnation): once a range committed
// here, every member applied it or listed past it, so the leader answers a
// replay of it already-applied without proposing it again. Volatile and
// bounded by the number of source partitions; a restarted replica proposes
// again (members skip by position).
import {SOURCE_RANGE_DECISION, SystemTableCacheSourceOrder} from
  '../cache/system-table-cache-cdc-observation.js';
import {CDC_PROPAGATED_TABLES} from '../cache/cdc-table-policy.js';
import {INITIAL_PARTITION_IDS} from '../bootstrap/system-table-schemas-constants.js';

const SOURCE_RANGE_LOG_MSG = Object.freeze({
  MEMBER_GAP: 'CDC range committed past this node\'s position; not merged, the table is listed again',
  LEADER_GAP:
    'CDC range refused: this node has not applied its predecessor; the table is listed again',
});

// The decision of the replica that will propose a durable range: the cache's
// node-level APPLY / GAP, and the group-level ALREADY_APPLIED.
const DURABLE_RANGE_DECISION = Object.freeze({
  APPLY: SOURCE_RANGE_DECISION.APPLY,
  GAP: SOURCE_RANGE_DECISION.GAP,
  ALREADY_APPLIED: 'already_applied',
});

function comparePositions(left, right) {
  return left.logIndex === right.logIndex ? Math.sign(left.ordinal - right.ordinal) :
    Math.sign(left.logIndex - right.logIndex);
}

function committedRangesOf(service) {
  service.cdcCommittedRanges ??= new Map();
  return service.cdcCommittedRanges;
}

/**
 * This group's committed position for a range's source, when its log already
 * committed the whole range in the same incarnation; else null.
 * @param {Object} service - The message group service.
 * @param {Object} range - The source range.
 * @return {Object|null} Frozen {incarnation, through}.
 */
function groupCommittedThroughOf(service, range) {
  const committed = committedRangesOf(service).get(range.sourcePartition);
  return committed !== undefined && committed.incarnation === range.incarnation &&
    comparePositions(range.through, committed.through) <= 0 ? committed : null;
}

/**
 * The range decision of the replica that will propose (CDC Stage 3), on the
 * shallow range only, before any payload is captured: ALREADY_APPLIED when
 * this group's own log already committed the range (every member applied it
 * or listed past it), GAP when this node's cache has not applied the range's
 * predecessor (the table is listed again; nothing is proposed), else APPLY.
 * A replica that does not lead only relays: the leader decides.
 * @param {Object} service - The message group service.
 * @param {Object} range - The source range.
 * @param {string|null} tableName - The range's table.
 * @return {Object} {decision: a DURABLE_RANGE_DECISION, committed?, have?,
 *   need?}.
 */
function classifyDurableRangeAtLeader(service, range, tableName) {
  if (!service.isCurrentRaftLeader()) return {decision: DURABLE_RANGE_DECISION.APPLY};
  const committed = groupCommittedThroughOf(service, range);
  if (committed !== null) return {decision: DURABLE_RANGE_DECISION.ALREADY_APPLIED, committed};
  const sourceOrder = service.cdcHandler.cache.sourceOrder;
  const classified = sourceOrder.classifyRange(range);
  if (classified.decision === SOURCE_RANGE_DECISION.GAP) {
    sourceOrder.recordGap(range, tableName);
    service.logger?.info?.(SOURCE_RANGE_LOG_MSG.LEADER_GAP, {groupId: service.groupId,
      sourcePartition: range.sourcePartition, have: classified.have, need: classified.need});
  }
  return classified;
}

function recordGroupCommittedRange(service, range) {
  const ranges = committedRangesOf(service);
  const committed = ranges.get(range.sourcePartition);
  if (committed === undefined || committed.incarnation !== range.incarnation ||
      comparePositions(range.through, committed.through) > 0) {
    ranges.set(range.sourcePartition,
      Object.freeze({incarnation: range.incarnation, through: range.through}));
  }
}

function memberPositionOf(event) {
  return {logIndex: event.sourceLogIndex, ordinal: event.sourceOrdinal};
}

/**
 * Apply one committed durable range on this member.
 * @param {Object} service - The message group service.
 * @param {Object} committed - The committed entry ({command, index, effects}).
 * @param {Array<Object>} events - Its captured members, in source order.
 * @param {Function} applyMember - Applies one member to the cache.
 * @return {Object} {decision, applied, skipped}.
 */
function applyCommittedCdcRange(service, committed, events, applyMember) {
  const range = committed.command.sourceRange;
  const tableName = events[0].tableName;
  committed.effects.afterCommit.push(() => recordGroupCommittedRange(service, range));
  const sourceOrder = service.cdcHandler.cache.sourceOrder;
  const classified = sourceOrder.classifyRange(range);
  if (classified.decision === SOURCE_RANGE_DECISION.GAP) {
    sourceOrder.recordGap(range, tableName);
    service.logger?.info?.(SOURCE_RANGE_LOG_MSG.MEMBER_GAP, {groupId: service.groupId,
      logIndex: committed.index, sourcePartition: range.sourcePartition,
      have: classified.have, need: classified.need});
    return {decision: classified.decision, applied: 0, skipped: events.length};
  }
  let applied = 0;
  for (let index = 0; index < events.length; index += 1) {
    if (sourceOrder.memberApplied(range, memberPositionOf(events[index]))) continue;
    applyMember(events[index]);
    applied += 1;
  }
  sourceOrder.advance(range, tableName);
  return {decision: classified.decision, applied, skipped: events.length - applied};
}

/**
 * A message-group replica joined its group on this node (CDC Stage 3): every
 * propagated source this node's cache holds no position of is listed now, so
 * a new member of a quiet group does not wait for the next range to learn
 * that its cache is stale. A node whose cache is already positioned lists
 * nothing.
 * @param {Object} service - The message group service.
 * @return {number} How many sources owe a list.
 */
function requireSourcePositions(service) {
  const sourceOrder = service.cdcHandler?.cache?.sourceOrder;
  if (!(sourceOrder instanceof SystemTableCacheSourceOrder)) return 0;
  let owed = 0;
  for (const tableName of CDC_PROPAGATED_TABLES) {
    const sourcePartition = INITIAL_PARTITION_IDS[tableName];
    if (typeof sourcePartition !== 'string') continue;
    if (sourceOrder.positionOf(sourcePartition).position === null) owed += 1;
    sourceOrder.requireListed(sourcePartition, tableName);
  }
  return owed;
}

export {DURABLE_RANGE_DECISION, applyCommittedCdcRange, classifyDurableRangeAtLeader,
  groupCommittedThroughOf, requireSourcePositions};
