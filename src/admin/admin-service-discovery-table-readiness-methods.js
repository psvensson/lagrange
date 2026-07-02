const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignAdminServiceDiscoveryTableReadinessMethods(
  AdminServiceDiscovery,
  options = {},
) {
  const {
    ADMIN_CACHE_DUMP,
    ADMIN_SERVICE_DISCOVERY_LITERAL,
    CANONICAL_LEADER_ROUTING_GAP_STATE,
    COLUMN,
    DISCOVERY_ROUTING_SNAPSHOT_FIELD,
    LEADER_RAFT_ROLE,
    NUM,
    SERVICE_TYPE_PARTITION,
    STATUS_ACTIVE,
    filterActiveServingPartitionRows,
    firstStringField,
    isTableCdcReadinessRelevant,
    resolveCanonicalLeaderRoutingGapState,
    extractSchemaVersionFromRecord,
    selectNewestSchemaVersion,
  } = options;

  class AdminServiceDiscoveryTableReadinessMethods {
    /**
     * Resolve partition context for optional table-scoped readiness.
     * @param {string|null} tableName
     * @param {string|null} tableId
     * @param {Array<Object>} partitionRows
     * @param {Array<Object>} tableRows
     * @return {Object}
     */
    resolveDiscoveryTablePartitionContext(
      tableName,
      tableId,
      partitionRows,
      tableRows,
    ) {
      if (!tableName && !tableId) {
        return {
          tableFound: true,
          partitionIds: new Set(),
          appliedSchemaVersion: null,
          cdcReadinessApplies: false,
        };
      }
      const tableContext = this.collectDiscoveryMatchingTableContext(
        tableName,
        tableId,
        tableRows,
      );
      const partitionContext = this.collectDiscoveryMatchingPartitionContext(
        tableName,
        tableContext.tableIds,
        partitionRows,
        tableContext.appliedSchemaVersion,
      );
      const activeServingPartitionRows = filterActiveServingPartitionRows(
        partitionContext.matchingPartitionRows,
        tableContext.matchingTableRows,
      );
      return {
        tableFound:
          tableContext.matchingTableRows.length > NUM.ZERO ||
          partitionContext.matchingPartitionRows.length > NUM.ZERO,
        partitionIds: this.buildDiscoveryPartitionIdSet(
          activeServingPartitionRows,
        ),
        appliedSchemaVersion: partitionContext.appliedSchemaVersion,
        cdcReadinessApplies: tableContext.cdcReadinessApplies,
      };
    }

    collectDiscoveryMatchingTableContext(tableName, tableId, tableRows) {
      const context = {
        tableIds: new Set(),
        matchingTableRows: [],
        appliedSchemaVersion: null,
        cdcReadinessApplies: false,
      };
      for (const tableRow of Array.isArray(tableRows) ?
        tableRows :
        ADMIN_CACHE_DUMP.EMPTY) {
        if (!this.isDiscoveryMatchingTableRow(tableRow, tableName, tableId)) {
          continue;
        }
        context.matchingTableRows.push(tableRow);
        const rowTableId = firstStringField(
          tableRow,
          COLUMN.TABLE_ID,
          'table_id',
          'tableId',
          'id',
        );
        if (rowTableId) {
          context.tableIds.add(rowTableId);
        }
        const rowTableName = firstStringField(
          tableRow,
          COLUMN.TABLE_NAME,
          'table_name',
          'tableName',
          'name',
        );
        if (isTableCdcReadinessRelevant(rowTableName)) {
          context.cdcReadinessApplies = true;
        }
        context.appliedSchemaVersion = selectNewestSchemaVersion(
          context.appliedSchemaVersion,
          extractSchemaVersionFromRecord(tableRow),
        );
      }
      if (tableId) {
        context.tableIds.add(tableId);
      }
      return context;
    }

    isDiscoveryMatchingTableRow(tableRow, tableName, tableId) {
      const rowTableName = firstStringField(
        tableRow,
        COLUMN.TABLE_NAME,
        'table_name',
        'tableName',
        'name',
      );
      const rowTableId = firstStringField(
        tableRow,
        COLUMN.TABLE_ID,
        'table_id',
        'tableId',
        'id',
      );
      return (
        (Boolean(tableName) && rowTableName === tableName) ||
        (Boolean(tableId) && rowTableId === tableId)
      );
    }

    collectDiscoveryMatchingPartitionContext(
      tableName,
      tableIds,
      partitionRows,
      appliedSchemaVersion,
    ) {
      const context = {
        matchingPartitionRows: [],
        appliedSchemaVersion,
      };
      for (const partitionRow of Array.isArray(partitionRows) ?
        partitionRows :
        ADMIN_CACHE_DUMP.EMPTY) {
        const rowTableName = firstStringField(
          partitionRow,
          COLUMN.TABLE_NAME,
          'table_name',
          'tableName',
          'name',
        );
        const rowTableId = firstStringField(
          partitionRow,
          COLUMN.TABLE_ID,
          'table_id',
          'tableId',
        );
        const matchesTableName =
          Boolean(tableName) && rowTableName === tableName;
        const matchesTableId = Boolean(rowTableId) && tableIds.has(rowTableId);
        if (!matchesTableName && !matchesTableId) {
          continue;
        }
        context.matchingPartitionRows.push(partitionRow);
        context.appliedSchemaVersion = selectNewestSchemaVersion(
          context.appliedSchemaVersion,
          extractSchemaVersionFromRecord(partitionRow),
        );
      }
      return context;
    }

    buildDiscoveryPartitionIdSet(partitionRows) {
      const partitionIds = new Set();
      for (const partitionRow of Array.isArray(partitionRows) ?
        partitionRows :
        ADMIN_CACHE_DUMP.EMPTY) {
        const partitionId = firstStringField(
          partitionRow,
          COLUMN.PARTITION_ID,
          'partition_id',
          'partitionId',
          'id',
        );
        if (partitionId) {
          partitionIds.add(partitionId);
        }
      }
      return partitionIds;
    }

    /**
     * Resolve table-scope schema readiness from active partition
     * coverage.
     * @param {Set<string>} partitionIds
     * @param {Array<Object>} serviceRows
     * @return {boolean}
     */
    resolveDiscoverySchemaReady(partitionIds, serviceRows) {
      if (!(partitionIds instanceof Set) || partitionIds.size === NUM.ZERO) {
        return false;
      }
      const readyPartitionIds = new Set();
      for (const serviceRow of serviceRows) {
        const serviceType = firstStringField(
          serviceRow,
          COLUMN.SERVICE_TYPE,
          'service_type',
          'serviceType',
          'type',
        );
        if (serviceType !== SERVICE_TYPE_PARTITION) {
          continue;
        }
        const partitionId = firstStringField(
          serviceRow,
          COLUMN.PARTITION_ID,
          'partition_id',
          'partitionId',
          'id',
        );
        if (!partitionId || !partitionIds.has(partitionId)) {
          continue;
        }
        const status = firstStringField(serviceRow, COLUMN.STATUS, 'status');
        if (
          String(
            status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE,
          ).toLowerCase() !== STATUS_ACTIVE
        ) {
          continue;
        }
        const nodeId = firstStringField(
          serviceRow,
          COLUMN.NODE_ID,
          'node_id',
          'nodeId',
        );
        if (!nodeId) {
          continue;
        }
        readyPartitionIds.add(partitionId);
      }
      return readyPartitionIds.size === partitionIds.size;
    }

    /**
     * Resolve leader-coverage stability for target partitions.
     * @param {Set<string>} partitionIds
     * @param {Array<Object>} partitionRows
     * @param {Array<Object>} serviceRows
     * @return {boolean}
     */
    resolveDiscoveryLeadershipStable(partitionIds, partitionRows, serviceRows) {
      if (!(partitionIds instanceof Set) || partitionIds.size === NUM.ZERO) {
        return true;
      }
      const activeReplicaCoverage = this.buildDiscoveryActiveReplicaCoverage(
        partitionIds,
        serviceRows,
      );
      const partitionRowsById = this.buildDiscoveryPartitionRowsById(
        partitionIds,
        partitionRows,
      );
      for (const partitionId of partitionIds) {
        if (
          !this.isDiscoveryPartitionLeadershipStable(
            partitionId,
            activeReplicaCoverage,
            partitionRowsById,
          )
        ) {
          return false;
        }
      }
      return true;
    }

    buildDiscoveryActiveReplicaCoverage(partitionIds, serviceRows) {
      const coverage = {
        activeReplicaNodeIdsByPartition: new Map(),
        advisoryLeaderPartitionIds: new Set(),
      };
      for (const serviceRow of Array.isArray(serviceRows) ?
        serviceRows :
        ADMIN_CACHE_DUMP.EMPTY) {
        const replicaRecord = this.resolveDiscoveryActiveReplicaRecord(
          serviceRow,
          partitionIds,
        );
        if (!replicaRecord) {
          continue;
        }
        let activeReplicaNodeIds = coverage.activeReplicaNodeIdsByPartition.get(
          replicaRecord.partitionId,
        );
        if (!activeReplicaNodeIds) {
          activeReplicaNodeIds = new Set();
          coverage.activeReplicaNodeIdsByPartition.set(
            replicaRecord.partitionId,
            activeReplicaNodeIds,
          );
        }
        activeReplicaNodeIds.add(replicaRecord.nodeId);
        if (replicaRecord.advisoryLeader === true) {
          coverage.advisoryLeaderPartitionIds.add(replicaRecord.partitionId);
        }
      }
      return coverage;
    }

    resolveDiscoveryActiveReplicaRecord(serviceRow, partitionIds) {
      const serviceType = firstStringField(
        serviceRow,
        COLUMN.SERVICE_TYPE,
        'service_type',
        'serviceType',
        'type',
      );
      if (serviceType !== SERVICE_TYPE_PARTITION) {
        return null;
      }
      const partitionId = firstStringField(
        serviceRow,
        COLUMN.PARTITION_ID,
        'partition_id',
        'partitionId',
        'id',
      );
      if (!partitionId || !partitionIds.has(partitionId)) {
        return null;
      }
      const status = firstStringField(serviceRow, COLUMN.STATUS, 'status');
      if (
        String(
          status || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE,
        ).toLowerCase() !== STATUS_ACTIVE
      ) {
        return null;
      }
      const nodeId = firstStringField(
        serviceRow,
        COLUMN.NODE_ID,
        'node_id',
        'nodeId',
      );
      if (!nodeId) {
        return null;
      }
      const raftRole = firstStringField(
        serviceRow,
        COLUMN.RAFT_ROLE,
        'raft_role',
        'raftRole',
      );
      return {
        partitionId,
        nodeId,
        advisoryLeader:
          String(
            raftRole || ADMIN_SERVICE_DISCOVERY_LITERAL.VALUE,
          ).toLowerCase() === LEADER_RAFT_ROLE,
      };
    }

    buildDiscoveryPartitionRowsById(partitionIds, partitionRows) {
      const partitionRowsById = new Map();
      for (const partitionRow of Array.isArray(partitionRows) ?
        partitionRows :
        ADMIN_CACHE_DUMP.EMPTY) {
        const partitionId = firstStringField(
          partitionRow,
          COLUMN.PARTITION_ID,
          'partition_id',
          'partitionId',
          'id',
        );
        if (
          !partitionId ||
          !partitionIds.has(partitionId) ||
          partitionRowsById.has(partitionId)
        ) {
          continue;
        }
        partitionRowsById.set(partitionId, partitionRow);
      }
      return partitionRowsById;
    }

    isDiscoveryPartitionLeadershipStable(
      partitionId,
      activeReplicaCoverage,
      partitionRowsById,
    ) {
      const activeReplicaNodeIds =
        activeReplicaCoverage.activeReplicaNodeIdsByPartition.get(partitionId);
      const routingSnapshot =
        this.resolveDiscoveryCanonicalLeaderRoutingSnapshot(partitionId);
      if (routingSnapshot) {
        return this.isDiscoveryRoutingSnapshotLeaderStable(
          routingSnapshot,
          activeReplicaNodeIds,
        );
      }
      const partitionRow = partitionRowsById.get(partitionId) || null;
      const canonicalLeaderNodeId = firstStringField(
        partitionRow,
        COLUMN.LEADER_NODE_ID,
        'leader_node_id',
        'leaderNodeId',
      );
      if (canonicalLeaderNodeId) {
        return this.hasDiscoveryActiveLeaderNode(
          activeReplicaNodeIds,
          canonicalLeaderNodeId,
        );
      }
      return activeReplicaCoverage.advisoryLeaderPartitionIds.has(partitionId);
    }

    isDiscoveryRoutingSnapshotLeaderStable(
      routingSnapshot,
      activeReplicaNodeIds,
    ) {
      const canonicalLeaderRoutingGapState =
        resolveCanonicalLeaderRoutingGapState(routingSnapshot);
      const canonicalLeaderNodeId = firstStringField(
        routingSnapshot,
        DISCOVERY_ROUTING_SNAPSHOT_FIELD.CANONICAL_LEADER_NODE_ID,
      );
      if (
        canonicalLeaderRoutingGapState !==
          CANONICAL_LEADER_ROUTING_GAP_STATE.NONE ||
        !canonicalLeaderNodeId
      ) {
        return false;
      }
      return this.hasDiscoveryActiveLeaderNode(
        activeReplicaNodeIds,
        canonicalLeaderNodeId,
      );
    }

    hasDiscoveryActiveLeaderNode(activeReplicaNodeIds, canonicalLeaderNodeId) {
      return (
        activeReplicaNodeIds instanceof Set &&
        activeReplicaNodeIds.has(canonicalLeaderNodeId)
      );
    }
  }

  for (const methodName of Object.getOwnPropertyNames(
    AdminServiceDiscoveryTableReadinessMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      AdminServiceDiscovery.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        AdminServiceDiscoveryTableReadinessMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignAdminServiceDiscoveryTableReadinessMethods};
