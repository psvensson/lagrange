import {ADMIN_WEBSOCKET_API_SHARED} from './admin-websocket-api-shared.js';

const LOCAL_STR_I = 'i';
const CLOSE_STALE_SOCKET_BEFORE_RETRY_MSG =
  'Closing stale admin socket connection on lane before retry';

const {
  ADMIN_CACHE_DUMP,
  EMPTY_STRING,
  TABLES,
  normalizeIdentifier,
  ADMIN_STREAM_LANE_SNAPSHOT,
} = ADMIN_WEBSOCKET_API_SHARED;

const ADMIN_WEBSOCKET_OBSERVATION_METHODS = {
  closeStaleSnapshotLaneSockets(activeClientId = null) {
    if (!activeClientId) {
      return;
    }
    const snapshotClients = [...this.clients].filter(
      (clientInfo) => clientInfo.lane === ADMIN_STREAM_LANE_SNAPSHOT,
    );
    for (const clientInfo of snapshotClients) {
      if (clientInfo.id === activeClientId) {
        continue;
      }
      if (clientInfo.socket && clientInfo.socket.readyState === 1) {
        continue;
      }
      this.logger.info(CLOSE_STALE_SOCKET_BEFORE_RETRY_MSG, {
        clientId: clientInfo.id,
        lane: ADMIN_STREAM_LANE_SNAPSHOT,
      });
      try {
        clientInfo.socket.close();
      } catch (_closeErr) {
        // Ignore
      }
      this.handleDisconnection(clientInfo);
    }
  },

  resolveLocalSystemTableObservationPartitions(tableName, rows) {
    if (tableName === TABLES.PARTITIONS) {
      return rows
        .map((row) => row?.partition_id || row?.partitionId || null)
        .filter(
          (partitionId) =>
            typeof partitionId === 'string' &&
            partitionId.length > 0,
        );
    }

    if (
      tableName === TABLES.SERVICES ||
      tableName === TABLES.REPLICA_OPERATIONS
    ) {
      return [
        ...new Set(
          rows
            .map((row) => row?.partition_id || row?.partitionId || null)
            .filter(
              (partitionId) =>
                typeof partitionId === 'string' &&
                partitionId.length > 0,
            ),
        ),
      ];
    }

    if (typeof this.systemTableCache.filter !== 'function') {
      return ADMIN_CACHE_DUMP.EMPTY;
    }

    return this.systemTableCache
      .filter(TABLES.PARTITIONS, (row) => {
        const rowTableName = normalizeIdentifier(
          row?.table_name || row?.tableName || null,
        );
        const rowTableId = normalizeIdentifier(
          row?.table_id || row?.tableId || null,
        );
        return rowTableName === tableName || rowTableId === tableName;
      })
      .map((row) => row?.partition_id || row?.partitionId || null)
      .filter(
        (partitionId) =>
          typeof partitionId === 'string' && partitionId.length > 0,
      );
  },

  matchesLocalSystemTableObservationLike(value, pattern) {
    const normalizedValue = String(value ?? EMPTY_STRING);
    const normalizedPattern = String(pattern ?? EMPTY_STRING)
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/%/g, '.*')
      .replace(/_/g, '.');
    return new RegExp(`^${normalizedPattern}$`, LOCAL_STR_I).test(
      normalizedValue,
    );
  },
};

export {ADMIN_WEBSOCKET_OBSERVATION_METHODS};
