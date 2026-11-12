// CDC Stage 3 for message-group witnesses that deliver synthetic durable
// vectors: every durable vector travels with its source range, and a
// recipient node applies a range only from a known position. These helpers
// name a vector as a range whose predecessor is the start of its source's
// ledger, and give a recipient node the position a leader image at applied
// index 0 installs (an empty source at its start), through the cache owner's
// own install (SystemTableCacheSourceOrder.recordListedPosition).
import {SOURCE_RELIST_OUTCOME, isSourceVector} from
  '../../src/cache/system-table-cache-source-order.js';
import {CDC_COMPLETION} from '../../src/cdc/cdc-delivery-outcome.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {SOURCE_RELIST_BOUND, registerSourceRelister} from
  '../../src/cdc/cdc-integration-service-source-relist.js';

const TEST_SOURCE_INCARNATION = 'test-source-incarnation';
const TEST_SOURCE_OWNER_UNAVAILABLE = 'test_source_owner_unavailable';
const LEDGER_START = Object.freeze({logIndex: 0, ordinal: -1});

function positionOf(event) {
  return {logIndex: event.sourceLogIndex, ordinal: event.sourceOrdinal};
}

/**
 * A test-owned row model supplies its list effect, while the real service
 * lifecycle and clock own failure pacing and terminal release. This remains
 * a model of delivery, not a native cache/occurrence witness.
 * @param {Object} t - Test context.
 * @param {Object} sourceOrder - The model's real position owner.
 * @param {Object} timeSource - Its existing injected clock.
 * @param {Function} list - The explicit model effect.
 */
function registerModeledRelister(t, sourceOrder, timeSource, list) {
  const service = new CDCIntegrationService({nodeId: 'source-relist-model', timeSource});
  const release = sourceOrder.registerRelister({
    list: (request) => service.isShuttingDown === true ? SOURCE_RELIST_OUTCOME.STOPPED : list(request),
    isStopped: () => service.isShuttingDown === true,
    paceAfterFailure: () => service.delayUntilShutdown(SOURCE_RELIST_BOUND.RELIST_RETRY_DELAY_MS),
  });
  t.after(() => {
    release();
    service.markShuttingDown();
  });
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
 * @param {string} tableName - Its canonical system table.
 * @param {string|null} [incarnation] - A real source ledger's incarnation
 *   (readCdcLedgerIncarnation), when the source is a real partition.
 */
function positionRecipients(services, sourcePartition, tableName,
  incarnation = TEST_SOURCE_INCARNATION) {
  for (const service of services) {
    service.cdcHandler.cache.sourceOrder.recordListedPosition({sourcePartition, tableName,
      incarnation, appliedIndex: LEDGER_START.logIndex});
  }
}

/**
 * Register, on each message-group service's node cache, a relister that lists
 * the source table from the real source leader's paged hydration image and
 * installs rows and position through the real CDC integration service. Only
 * its owner-RPC query hop is direct. A table this fixture does not host stays
 * explicitly unavailable until this relister is shut down.
 * @param {Object} t - Test context.
 * @param {Array<Object>} services - Message-group services.
 * @param {Function} sourceLeader - () => the source partition leader.
 */
function registerLeaderRelister(t, services, sourceLeader) {
  for (const service of services) {
    const cache = service.cdcHandler.cache;
    const relister = new CDCIntegrationService({nodeId: service.nodeId,
      cacheMutationTarget: cache, timeSource: service.timeSource,
      sqlQueryEngine: {queryExecutor: {async executeOnPartition(partitionId, _sql, _params,
        _forRead, _preferLeader, _sameGroup, options) {
        const leader = sourceLeader();
        if (partitionId !== leader.partitionId) {
          return {success: false, errorCode: TEST_SOURCE_OWNER_UNAVAILABLE};
        }
        const answer = await leader.handleRemoteQuery(options.buildRequest());
        return answer.success === true ? options.buildSuccessResult(answer) : answer;
      }}}});
    relister.logger = service.logger;
    t.after(() => relister.markShuttingDown());
    registerSourceRelister(relister);
  }
}

/**
 * A recipient model consumes the same complete range/member consistency
 * predicate as the real receiver before classification. Its map is only a
 * test row store; it must not admit a vector the production owner refuses.
 * @param {*} range - The shipped source range.
 * @param {Array<Object>} events - The exact shipped members.
 * @return {void}
 */
function assertShippedSourceVector(range, events) {
  if (isSourceVector(range, events)) return;
  throw Object.assign(new Error(CDC_COMPLETION.INVALID), {code: CDC_COMPLETION.INVALID});
}

export {assertShippedSourceVector, positionRecipients,
  registerLeaderRelister, registerModeledRelister, sourceRangeOfEvents, withSourceRange};
