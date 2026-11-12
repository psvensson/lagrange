import {
  registerPartitionCdcPropagation,
} from '../shared/partition-cdc-propagation-subscriber.js';
import {
  BOOTSTRAP_LOG_MSG,
} from '../bootstrap-constants.js';
import {COLUMN, TABLES} from '../../constants/index.js';
import {foldCdcEventsOntoRows} from '../../cache/system-table-cache-cdc-fold.js';
import {isUsableSystemCacheKey} from
  '../../cache/system-cache-key-descriptor.js';

// The seed hydration path's name in its propagation subscribers' ids.
const SEED_CDC_SUBSCRIBER_ROLE = 'bootstrap';

// The node a nodes event names: its row's node_id, the one key field the
// nodes partition emits (null: none).
function nodeIdOfEvent(cdcEvent) {
  const nodeId = cdcEvent?.data?.[COLUMN.NODE_ID];
  return isUsableSystemCacheKey(nodeId) ? nodeId : null;
}

/**
 * Raise the node-ready rebalance trigger for each event of a nodes vector,
 * comparing each event with its predecessor: the row its node holds after the
 * vector's earlier events for that node, or, for a node's first event in the
 * vector, the cached row. This is what one-by-one delivery compared (the
 * cache then held every earlier event), so a node that flaps inside one
 * vector raises exactly the transitions it raised one event at a time. The
 * predecessor is the cache owner's own fold (foldCdcEventsOntoRows, the
 * function its apply decides every CDC-merge row with), never a copy of it.
 * @param {Array<Object>} events - The nodes vector, in log order.
 * @param {Object} owner - {readCachedNodeRow(nodeId), trigger(cdcEvent,
 *   previousNodeRow)}.
 * @return {void}
 */
function raiseNodeReadyRebalanceTriggers(events, {readCachedNodeRow, trigger}) {
  const keyed = events.map((cdcEvent) => ({key: nodeIdOfEvent(cdcEvent),
    operation: cdcEvent.operation, data: cdcEvent.data, source: cdcEvent,
    cdcEvent}));
  foldCdcEventsOntoRows(TABLES.NODES, keyed, readCachedNodeRow,
    (event, previousNodeRow) => trigger(event.cdcEvent, previousNodeRow));
}

/**
 * Subscribe message groups to CDC events from a partition: every message
 * group takes the table's CDC, and each local replica of the partition
 * registers its one propagation subscriber, preferring the hydration's
 * message group (the subscriber selects the operational group per delivery).
 * @param {Object} options
 * @param {Object} options.delegates
 * @param {string} options.tableName
 * @param {string} options.partitionId
 * @param {Array<string>} options.replicaIds
 * @param {Object} options.preferredService - The hydration's message group.
 * @return {Promise<void>}
 */
async function subscribeToHydrationCDC({
  delegates,
  tableName,
  partitionId,
  replicaIds,
  preferredService,
}) {
  const d = delegates;
  const logger = d.getLogger();

  logger.debug(BOOTSTRAP_LOG_MSG.CDC_SUBSCRIPTION_START, {
    tableName,
    partitionId,
    replicaIds,
  });

  for (const messageGroup of d.getMessageGroupServices().values()) {
    await messageGroup.subscribeToCDC(tableName);
  }

  for (const replicaId of replicaIds) {
    const partition =
      d.getPartitionServices().get(replicaId);
    if (!partition) {
      logger.warn(BOOTSTRAP_LOG_MSG.CDC_PARTITION_MISSING, {
        tableName,
        replicaId,
      });
      continue;
    }

    const handshake = await registerPartitionCdcPropagation(partition, {
      role: SEED_CDC_SUBSCRIBER_ROLE,
      nodeId: d.getNodeId(),
      tableName,
      partitionId,
      replicaId,
      logger,
      eventLogMessage: BOOTSTRAP_LOG_MSG.CDC_EVENT_RECEIVED,
      preferredService,
      resolveOperationalMessageGroupSelection: (selectionOptions = {}) =>
        d.resolveOperationalMessageGroupSelection(selectionOptions),
      resolveOperationalMessageGroupSelectionAsync: (selectionOptions = {}) =>
        d.resolveOperationalMessageGroupSelectionAsync(selectionOptions),
      buildMessageGroupOwnerNotReadyError: (selection, errorOptions) =>
        d.buildMessageGroupOwnerNotReadyError(selection, errorOptions),
      propagatePartitionCDCEvent: (messageGroupService, events, deliveryContext) =>
        d.propagatePartitionCDCEvent(messageGroupService, events, deliveryContext),
      beforePropagation: async (events) => {
        if (tableName !== TABLES.NODES) return;
        const stc = d.getSystemTableCache();
        raiseNodeReadyRebalanceTriggers(events, {
          readCachedNodeRow: (nodeId) => stc.get(TABLES.NODES, nodeId),
          trigger: (cdcEvent, previousNodeRow) =>
            d.handleNodeReadyRebalanceTrigger(cdcEvent, previousNodeRow),
        });
      },
      afterPropagation: async () => {
        if (tableName === TABLES.CONFIG) {
          d.applyCurrentEpochFromCache();
        }
      },
    });

    logger.debug(
      BOOTSTRAP_LOG_MSG.CDC_SUBSCRIPTION_REGISTERED, {
        tableName,
        partitionId,
        replicaId,
        subscriberId: handshake.subscriberId,
        subscriptionEpoch: handshake.subscriptionEpoch,
        isLeader: partition.isLeader,
      });
  }
}

export {raiseNodeReadyRebalanceTriggers, subscribeToHydrationCDC};
