import {
  buildPartitionCdcPropagationSubscriber,
} from '../shared/partition-cdc-propagation-subscriber.js';
import {
  BOOTSTRAP_LOG_MSG,
} from '../bootstrap-constants.js';
import {
  CDC_OPERATION,
  COLUMN,
  TABLES,
} from '../../constants/index.js';

function nodeOfEvent(cdcEvent) {
  const cdcData = cdcEvent?.data &&
    typeof cdcEvent.data === 'object' ?
    cdcEvent.data : {};
  return {cdcData, nodeId: cdcData[COLUMN.NODE_ID] ||
    cdcData.id || null};
}

// The NODES node-ready trigger over one vector, member by member in order.
// Each member's previous row is what the node cache holds when that member is
// reached under one-event delivery: the cached row, overlaid by the earlier
// members of the same node in this vector (a deleted node has no row), because
// the whole vector is applied to the cache only after this hook.
function triggerNodeReadyRebalanceForVector(delegates, events) {
  const rowsAfterEarlierMembers = new Map();
  const cachedRowOf = (nodeId) => {
    const cachedNodeRow =
      delegates.getSystemTableCache().get(TABLES.NODES, nodeId);
    return cachedNodeRow ?
      {...cachedNodeRow} : null;
  };
  for (const cdcEvent of events) {
    const {cdcData, nodeId} = nodeOfEvent(cdcEvent);
    let previousNodeRow = null;
    if (nodeId) {
      previousNodeRow = rowsAfterEarlierMembers.has(nodeId) ?
        rowsAfterEarlierMembers.get(nodeId) : cachedRowOf(nodeId);
      rowsAfterEarlierMembers.set(nodeId, cdcEvent.operation === CDC_OPERATION.DELETE ?
        null : {...previousNodeRow, ...cdcData});
    }
    delegates.handleNodeReadyRebalanceTrigger(cdcEvent, previousNodeRow);
  }
}

/**
 * Subscribe message groups to CDC events from a partition.
 * @param {Object} options
 * @param {Object} options.delegates
 * @param {string} options.tableName
 * @param {string} options.partitionId
 * @param {Array<string>} options.replicaIds
 * @return {Promise<void>}
 */
async function subscribeToHydrationCDC({
  delegates,
  tableName,
  partitionId,
  replicaIds,
}) {
  const d = delegates;
  const logger = d.getLogger();

  logger.debug(BOOTSTRAP_LOG_MSG.CDC_SUBSCRIPTION_START, {
    tableName,
    partitionId,
    replicaIds,
  });

  const messageGroups =
    [...d.getMessageGroupServices().values()];

  for (const messageGroup of messageGroups) {
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

    for (const messageGroup of messageGroups) {
      const subscriberId = [
        'bootstrap',
        d.getNodeId(),
        tableName,
        replicaId,
        messageGroup?.groupId || 'message-group',
      ].join(':');
      const cdcSubscriber = buildPartitionCdcPropagationSubscriber({
        tableName,
        partitionId,
        replicaId,
        logger,
        eventLogMessage: BOOTSTRAP_LOG_MSG.CDC_EVENT_RECEIVED,
        preferredService: messageGroup,
        resolveOperationalMessageGroupSelection: (selectionOptions = {}) =>
          d.resolveOperationalMessageGroupSelection(
            selectionOptions,
          ),
        resolveOperationalMessageGroupSelectionAsync: (selectionOptions = {}) =>
          d.resolveOperationalMessageGroupSelectionAsync(
            selectionOptions,
          ),
        buildMessageGroupOwnerNotReadyError: (selection, errorOptions) =>
          d.buildMessageGroupOwnerNotReadyError(selection, errorOptions),
        propagatePartitionCDCEvent: (messageGroupService, events, deliveryContext) =>
          d.propagatePartitionCDCEvent(messageGroupService, events, deliveryContext),
        beforePropagation: async (events) => {
          if (tableName === TABLES.NODES) {
            triggerNodeReadyRebalanceForVector(d, events);
          }
        },
        afterPropagation: async () => {
          if (tableName === TABLES.CONFIG) {
            d.applyCurrentEpochFromCache();
          }
        },
      });
      const handshake =
        await partition.subscribeToCDCWithHandshake(
          cdcSubscriber,
          {subscriberId},
        );
      logger.debug(
        BOOTSTRAP_LOG_MSG.CDC_SUBSCRIPTION_REGISTERED, {
          tableName,
          partitionId,
          replicaId,
          subscriberId: handshake.subscriberId,
          subscriptionEpoch: handshake.subscriptionEpoch,
        });
    }

    logger.debug(
      BOOTSTRAP_LOG_MSG.CDC_SUBSCRIPTION_REGISTERED, {
        tableName,
        partitionId,
        replicaId,
        isLeader: partition.isLeader,
      });
  }
}

export {subscribeToHydrationCDC};
