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
import {SystemTableCache} from '../../cache/system-table-cache.js';

function nodeOfEvent(cdcEvent) {
  const cdcData = cdcEvent?.data &&
    typeof cdcEvent.data === 'object' ?
    cdcEvent.data : {};
  return {cdcData, nodeId: cdcData[COLUMN.NODE_ID] ||
    cdcData.id || null};
}

// The row the node cache would hold for one node after the earlier members of
// a vector, worked out by the cache owner's own apply path: the members are
// replayed, in order, into a private system table cache that starts from the
// row the node cache holds now. The hook writes no merge of its own. The
// private cache starts from the cached row only; what the node cache holds
// beyond the row (a delete tombstone, an authoritative-absence mark) is not
// readable from here.
function createNodeRowReplay(nodeCache) {
  let replay = null;
  const earlierMembers = new Map();
  const started = new Set();
  const cachedRowOf = (nodeId) => {
    const cachedNodeRow = nodeCache.get(TABLES.NODES, nodeId);
    return cachedNodeRow ? {...cachedNodeRow} : null;
  };
  const startFromCachedRow = (nodeId) => {
    started.add(nodeId);
    const cachedNodeRow = cachedRowOf(nodeId);
    if (cachedNodeRow) {
      replay.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, cachedNodeRow);
    }
  };
  const replayedRowOf = (nodeId, members) => {
    if (replay === null) replay = new SystemTableCache();
    if (!started.has(nodeId)) startFromCachedRow(nodeId);
    for (const cdcEvent of members.splice(0)) {
      replay.applySystemTableChange(TABLES.NODES, cdcEvent.operation, cdcEvent.data);
    }
    const replayedNodeRow = replay.get(TABLES.NODES, nodeId);
    return replayedNodeRow ? {...replayedNodeRow} : null;
  };
  return {
    // The row a member of `nodeId` is compared against: the cached row for the
    // node's first member, the replayed row for a later one.
    previousRowOf(nodeId) {
      const members = earlierMembers.get(nodeId);
      return members ? replayedRowOf(nodeId, members) : cachedRowOf(nodeId);
    },
    remember(nodeId, cdcEvent) {
      if (!earlierMembers.has(nodeId)) earlierMembers.set(nodeId, []);
      earlierMembers.get(nodeId).push(cdcEvent);
    },
  };
}

// The NODES node-ready trigger over one vector, member by member in order.
// Each member's previous row is what the node cache holds when that member is
// reached under one-event delivery: the whole vector is applied to the node
// cache only after this hook, so a later member of a node reads the row the
// cache's own apply path leaves after the node's earlier members.
function triggerNodeReadyRebalanceForVector(delegates, events) {
  const replay = createNodeRowReplay(delegates.getSystemTableCache());
  for (const cdcEvent of events) {
    const {nodeId} = nodeOfEvent(cdcEvent);
    const previousNodeRow = nodeId ? replay.previousRowOf(nodeId) : null;
    if (nodeId) replay.remember(nodeId, cdcEvent);
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
