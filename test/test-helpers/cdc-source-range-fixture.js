// CDC Stage 3 for message-group witnesses that deliver synthetic durable
// vectors: every durable vector travels with its source range, and a
// recipient node applies a range only from a known position. These helpers
// name a vector as a range whose predecessor is the start of its source's
// ledger, and give a recipient node the position a leader image at applied
// index 0 installs (an empty source at its start), through the cache owner's
// own install (SystemTableCacheSourceOrder.recordListedPosition).
import {SOURCE_RELIST_OUTCOME, isSourceRange} from
  '../../src/cache/system-table-cache-source-order.js';
import {CDC_COMPLETION} from '../../src/cdc/cdc-delivery-outcome.js';
import {installSourceImage} from '../../src/cache/system-table-cache-source-image.js';
import {fetchSourceImage} from '../../src/cdc/cdc-integration-service-source-relist.js';
import {PARTITION_HYDRATION_IMAGE_PAGE_FIELD, PARTITION_HYDRATION_IMAGE_QUERY_FIELD} from
  '../../src/partition/partition-service-hydration-image-methods.js';
import {QUERY_MESSAGE_TYPE} from '../../src/query/query-constants.js';

const TEST_SOURCE_INCARNATION = 'test-source-incarnation';
const LEDGER_START = Object.freeze({logIndex: 0, ordinal: -1});

function positionOf(event) {
  return {logIndex: Number.isSafeInteger(event.sourceLogIndex) ? event.sourceLogIndex : 1,
    ordinal: Number.isSafeInteger(event.sourceOrdinal) ? event.sourceOrdinal : 0};
}

/**
 * The source range of a synthetic durable vector.
 * @param {Array<Object>} events - The vector, in source order.
 * @return {Object} {sourcePartition, incarnation, after, through}.
 */
function sourceRangeOfEvents(events) {
  return {sourcePartition: events[0].sourcePartition, incarnation: TEST_SOURCE_INCARNATION,
    after: {logIndex: LEDGER_START.logIndex, ordinal: LEDGER_START.ordinal},
    through: positionOf(events[events.length - 1])};
}

/**
 * Delivery options carrying the vector's source range.
 * @param {Array<Object>} events - The vector.
 * @param {Object} [options] - Other delivery options.
 * @return {Object} The options with sourceRange.
 */
function withSourceRange(events, options = {}) {
  return Object.assign(options, {sourceRange: sourceRangeOfEvents(events)});
}

/**
 * Give each message-group service's node cache the start position of the
 * synthetic source (as a list of it at applied index 0 would).
 * @param {Array<Object>} services - Message-group services.
 * @param {string} sourcePartition - The synthetic source partition.
 * @param {string|null} tableName - Its table.
 * @param {string|null} [incarnation] - A real source ledger's incarnation
 *   (readCdcLedgerIncarnation), when the source is a real partition.
 */
function positionRecipients(services, sourcePartition, tableName = null,
  incarnation = TEST_SOURCE_INCARNATION) {
  for (const service of services) {
    service.cdcHandler.cache.sourceOrder.recordListedPosition({sourcePartition, tableName,
      incarnation, appliedIndex: LEDGER_START.logIndex});
  }
}

/**
 * Register, on each message-group service's node cache, a relister that lists
 * the source table from the real source leader's paged hydration image and
 * installs rows and position together through the production fetch and
 * install (fetchSourceImage, installSourceImage), as the node's CDC
 * integration service does (relistSourceTable). For compositions that do
 * not build that service: only the owner-RPC hop is direct.
 * @param {Array<Object>} services - Message-group services.
 * @param {Function} sourceLeader - () => the source partition leader.
 */
function registerLeaderRelister(services, sourceLeader) {
  for (const service of services) {
    const cache = service.cdcHandler.cache;
    cache.sourceOrder.registerRelister(async (request) => {
      const token = cache.sourceOrder.beginImage(request.sourcePartition);
      if (token === null) return SOURCE_RELIST_OUTCOME.STOPPED;
      const fetched = await fetchSourceImage((cursor) => sourceLeader().handleRemoteQuery({
        type: QUERY_MESSAGE_TYPE.QUERY, sql: `SELECT * FROM ${request.tableName}`, params: [],
        [PARTITION_HYDRATION_IMAGE_QUERY_FIELD]: true,
        [PARTITION_HYDRATION_IMAGE_PAGE_FIELD]: cursor}), request);
      if (fetched.image) installSourceImage(cache, token, fetched.image);
      return SOURCE_RELIST_OUTCOME.STOPPED;
    });
  }
}

/**
 * A recipient model's first act on a shipped range, as the real receiver's
 * (captureSourceRange, message-group-cdc-committed-acceptance.js): a range the
 * range contract owner does not accept is refused as invalid input before
 * anything is classified. A model that skips this accepts ranges production
 * refuses.
 * @param {*} range - The shipped source range.
 * @return {void}
 */
function assertShippedSourceRange(range) {
  if (isSourceRange(range)) return;
  throw Object.assign(new Error(CDC_COMPLETION.INVALID), {code: CDC_COMPLETION.INVALID});
}

export {assertShippedSourceRange, positionRecipients,
  registerLeaderRelister, sourceRangeOfEvents, withSourceRange};
