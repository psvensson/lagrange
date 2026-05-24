import {
  buildPartitionCdcPropagationSubscriber,
} from '../shared/partition-cdc-propagation-subscriber.js';
import {
  BOOTSTRAP_LOG_MSG,
} from '../bootstrap-constants.js';
import {
  COLUMN,
  TABLES,
} from '../../constants/index.js';

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
        propagatePartitionCDCEvent: (messageGroupService, cdcEvent) =>
          d.propagatePartitionCDCEvent(messageGroupService, cdcEvent),
        beforePropagation: async (cdcEvent) => {
          const cdcData = cdcEvent?.data &&
            typeof cdcEvent.data === 'object' ?
            cdcEvent.data : {};
          const nodeId = cdcData[COLUMN.NODE_ID] ||
            cdcData.id || null;
          let previousNodeRow = null;
          if (tableName === TABLES.NODES && nodeId) {
            const stc = d.getSystemTableCache();
            const cachedNodeRow =
              stc.get(TABLES.NODES, nodeId);
            previousNodeRow = cachedNodeRow ?
              {...cachedNodeRow} : null;
          }

          if (tableName === TABLES.NODES) {
            d.handleNodeReadyRebalanceTrigger(
              cdcEvent, previousNodeRow,
            );
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
          catchupMode: handshake.catchup.mode,
          bufferedEventsReplayed:
            handshake.catchup.bufferedEventsReplayed,
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
