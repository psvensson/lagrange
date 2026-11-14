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

function nodeOfEvent(cdcEvent) {
  const cdcData = cdcEvent?.data &&
    typeof cdcEvent.data === 'object' ?
    cdcEvent.data : {};
  return {cdcData, nodeId: cdcData[COLUMN.NODE_ID] ||
    cdcData.id || null};
}

// The previous row of every member of a NODES vector: what the node cache
// holds when that member is reached under one-event delivery. The whole
// vector is applied to the node cache only after this hook, so the first
// member of a node reads the cached row and a later member reads the row the
// cache itself would hold after the node's earlier members. The cache owner
// answers that from its own state (previewRowAfterEachChange), once per node
// that appears more than once in the vector; the hook holds no cache and
// writes no merge. Returns nodeId -> the previous rows of its members, in
// member order.
function previousNodeRowsOf(nodeCache, events) {
  const membersOf = new Map();
  for (const cdcEvent of events) {
    const {nodeId} = nodeOfEvent(cdcEvent);
    if (!nodeId) continue;
    if (!membersOf.has(nodeId)) membersOf.set(nodeId, []);
    membersOf.get(nodeId).push(cdcEvent);
  }
  const previousRowsOf = new Map();
  for (const [nodeId, members] of membersOf) {
    const afterEarlierMembers = members.length > 1 ?
      nodeCache.previewRowAfterEachChange(TABLES.NODES, nodeId, members.slice(0, -1)) : [];
    previousRowsOf.set(nodeId,
      [nodeCache.get(TABLES.NODES, nodeId), ...afterEarlierMembers]);
  }
  return previousRowsOf;
}

// The NODES node-ready trigger over one vector, member by member in order,
// each member against its previous row.
function triggerNodeReadyRebalanceForVector(delegates, events) {
  const previousRowsOf = previousNodeRowsOf(delegates.getSystemTableCache(), events);
  for (const cdcEvent of events) {
    const {nodeId} = nodeOfEvent(cdcEvent);
    const previousNodeRow = nodeId ? previousRowsOf.get(nodeId).shift() : null;
    delegates.handleNodeReadyRebalanceTrigger(cdcEvent,
      previousNodeRow ? {...previousNodeRow} : null);
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
