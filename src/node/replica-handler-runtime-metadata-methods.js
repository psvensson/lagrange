const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignReplicaHandlerRuntimeMetadataMethods(
  ReplicaHandler,
  options = {},
) {
  const {
    AddressManager,
    METADATA_RESOLUTION_POLL_INTERVAL_MS,
    PRESSURE_WORK_CLASS,
    PARTITION_METADATA_MISSING_PREFIX,
    PartitionServiceRowOwner,
    ReplicaCleanupTombstoneOwner,
    REPLICA_HANDLER_ERROR_MSG,
    REPLICA_HANDLER_LITERAL,
    REPLICA_HANDLER_LOG_MSG,
    REPLICA_HANDLER_SERVICE,
    REPLICA_HANDLER_TYPEOF,
    ReplicaStatus,
    SYSTEM_TABLE_HYDRATION_SQL,
    SYSTEM_TABLE_NAME,
    TABLE_METADATA_MISSING_PREFIX,
    classifySystemPartition,
    createControlPlaneRuntimeBundle,
    createSystemMetadataGatewayRequiredError,
    isReplicaJoinNodeViable,
    partitionMetadataMissingError,
  } = options;
  class ReplicaHandlerRuntimeMetadataMethods {
    async resolveReplicaContextWithRetry(partitionId, replicaId, options = {}) {
      this.throwIfShuttingDown();
      const deadline = Date.now() + this.syncTimeoutMs;
      let metadataWaitLogged = false;
      let lastError = null;
      let metadataHydrationCount = 0;
      while (Date.now() <= deadline) {
        this.throwIfShuttingDown();
        try {
          const context = this.resolveReplicaContext(
            partitionId,
            replicaId,
            options,
          );
          this.clearHydratedMetadataSnapshot(partitionId);
          return context;
        } catch (error) {
          if (!this.isTransientMetadataResolutionError(error)) {
            this.clearHydratedMetadataSnapshot(partitionId);
            throw error;
          }
          lastError = error;
          metadataHydrationCount +=
            await this.hydrateMetadataFromAuthority(partitionId);
          if (!metadataWaitLogged) {
            this.logger.info(
              REPLICA_HANDLER_LOG_MSG.WAITING_METADATA_PROPAGATION,
              {
                partitionId,
                replicaId,
                timeoutMs: this.syncTimeoutMs,
                hydratedRows: metadataHydrationCount,
                nodeId: this.nodeId,
              },
            );
            metadataWaitLogged = true;
          }
        }
        await new Promise((resolve) => {
          setTimeout(resolve, METADATA_RESOLUTION_POLL_INTERVAL_MS);
        });
      }
      this.clearHydratedMetadataSnapshot(partitionId);
      throw lastError || new Error(partitionMetadataMissingError(partitionId));
    }
    /**
     * Check whether replica context resolution error can be retried.
     * @param {Error} error - Resolution error.
     * @return {boolean} True when error is a transient metadata visibility miss.
     * @private
     */
    isTransientMetadataResolutionError(error) {
      const message =
        typeof error?.message === REPLICA_HANDLER_TYPEOF.STRING ?
          error.message :
          '';
      return (
        message.startsWith(PARTITION_METADATA_MISSING_PREFIX) ||
        message.startsWith(TABLE_METADATA_MISSING_PREFIX)
      );
    }
    /**
     * Resolve replica metadata from the system table cache.
     * @param {string} partitionId - Partition ID.
     * @param {string} replicaId - Replica ID.
     * @return {Object} Resolved metadata.
     * @private
     */
    resolveReplicaContext(partitionId, replicaId, options = {}) {
      if (!this.systemTableCache) {
        throw new Error(REPLICA_HANDLER_ERROR_MSG.CACHE_NOT_AVAILABLE);
      }
      if (
        typeof this.systemTableCache.filter !== REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        throw new Error(REPLICA_HANDLER_ERROR_MSG.CACHE_MISSING_FILTER);
      }
      const payloadPartition = this.normalizeBootstrapPartitionMetadata(
        partitionId,
        options.bootstrapPartitionMetadata,
      );
      const payloadTable = this.normalizeBootstrapTableMetadata(
        payloadPartition?.table_id || null,
        options.bootstrapTableMetadata,
      );
      const hydratedMetadata = this.getHydratedMetadataSnapshot(partitionId);
      const partition =
        this.systemTableCache.get(SYSTEM_TABLE_NAME.PARTITIONS, partitionId) ||
        payloadPartition ||
        hydratedMetadata?.partitionRow ||
        null;
      if (!partition) {
        const partitionMetadataMissing =
          REPLICA_HANDLER_ERROR_MSG.PARTITION_METADATA_MISSING;
        throw new Error(partitionMetadataMissing(partitionId));
      }
      const table =
        this.systemTableCache.get(
          SYSTEM_TABLE_NAME.TABLES,
          partition.table_id,
        ) ||
        payloadTable ||
        hydratedMetadata?.tableRow ||
        null;
      if (!table) {
        const tableMetadataMissing =
          REPLICA_HANDLER_ERROR_MSG.TABLE_METADATA_MISSING;
        throw new Error(tableMetadataMissing(partition.table_id));
      }
      let schema = null;
      try {
        schema =
          typeof table.schema_definition === REPLICA_HANDLER_TYPEOF.STRING ?
            JSON.parse(table.schema_definition) :
            table.schema_definition;
      } catch (error) {
        const schemaParseFailed = REPLICA_HANDLER_ERROR_MSG.SCHEMA_PARSE_FAILED;
        throw new Error(schemaParseFailed(error.message));
      }
      const keyRange = {
        start: partition.partition_key_start ?? null,
        end: partition.partition_key_end ?? null,
      };
      const cachedServices = this.systemTableCache.filter(
        SYSTEM_TABLE_NAME.SERVICES,
        (service) =>
          service.partition_id === partitionId &&
          service.service_type === REPLICA_HANDLER_SERVICE.TYPE,
      );
      const observedServices = this.mergeHydratedServices(
        cachedServices,
        hydratedMetadata?.serviceRows || [],
      );
      const shouldFilterUnavailablePeerTopology =
        classifySystemPartition({
          partitionId,
          partitionRow: partition,
        }).priorityControlPlane;
      const now = Date.now();
      const addressManager = AddressManager.getInstance();
      // The new replica's membership is its validated committed-membership
      // stamp alone (owner decision O1): the dispatched replica ids and this
      // node's services rows are an address book, never membership, and the
      // stamp kind - not a row count - decides the join mode.
      const stamped = this.resolveStampedBootstrapMembership({
        partitionId,
        replicaId,
        bootstrapMembership: options.bootstrapMembership,
        observedServices,
      });
      const requestedPeerAddresses = Array.isArray(
        options.bootstrapPeerAddresses,
      ) ?
        options.bootstrapPeerAddresses.filter(
          (value) =>
            typeof value === REPLICA_HANDLER_TYPEOF.STRING &&
              value.length > 0,
        ) :
        [];
      const services = observedServices;
      const peerAddresses = [];
      const isViableJoinService = (service) => {
        if (
          !service?.node_id ||
          typeof this.systemTableCache.get !== REPLICA_HANDLER_TYPEOF.FUNCTION
        ) {
          return true;
        }
        return isReplicaJoinNodeViable(
          this.systemTableCache.get(SYSTEM_TABLE_NAME.NODES, service.node_id),
          {
            now,
            nodeId: service.node_id,
            localNodeId: this.nodeId,
            messageRouter: this.messageRouter,
          },
        );
      };
      for (const service of services) {
        const serviceReplicaId = service.service_id || service.replica_id;
        if (!serviceReplicaId) {
          continue;
        }
        if (
          shouldFilterUnavailablePeerTopology &&
          serviceReplicaId !== replicaId &&
          !isViableJoinService(service)
        ) {
          continue;
        }
        const peerAddress =
          service.address ||
          addressManager.format(
            service.node_id,
            REPLICA_HANDLER_SERVICE.TYPE,
            serviceReplicaId,
          );
        if (!peerAddresses.includes(peerAddress)) {
          peerAddresses.push(peerAddress);
        }
      }
      const selfAddress = addressManager.format(
        this.nodeId,
        REPLICA_HANDLER_SERVICE.TYPE,
        replicaId,
      );
      if (!peerAddresses.includes(selfAddress)) {
        peerAddresses.push(selfAddress);
      }
      let leaderAddress = null;
      const canonicalLeaderNodeId =
        typeof partition.leader_node_id === 'string' &&
        partition.leader_node_id.length > 0 ?
          partition.leader_node_id :
          null;
      const leaderService = canonicalLeaderNodeId ?
        services.find(
          (service) =>
            service.node_id === canonicalLeaderNodeId &&
              service.status === ReplicaStatus.ACTIVE &&
              isViableJoinService(service),
        ) :
        null;
      // The dispatched addresses come from the placement owner's address
      // book and are kept over this node's cache view, which under churn can
      // be viability-filtered down to self-only.
      for (const requestedPeerAddress of requestedPeerAddresses) {
        if (!peerAddresses.includes(requestedPeerAddress)) {
          peerAddresses.push(requestedPeerAddress);
        }
      }
      if (leaderService) {
        leaderAddress =
          leaderService.address ||
          addressManager.format(
            leaderService.node_id,
            REPLICA_HANDLER_SERVICE.TYPE,
            leaderService.service_id,
          );
      }
      return {
        tableId: partition.table_id,
        tableName: table.table_name,
        schema,
        keyRange,
        leaderAddress,
        replicaIds: stamped.replicaIds,
        peerAddresses,
        existingReplicaCount: stamped.existingReplicaCount,
        bootstrapMembership: stamped.bootstrapMembership,
      };
    }
    /**
     * Hydrate replica metadata from authoritative system-table SQL queries.
     * This covers cases where local cache propagation lags behind the operation.
     * @param {string} partitionId - Partition ID.
     * @return {Promise<number>} Number of hydrated rows.
     * @private
     */
    async hydrateMetadataFromAuthority(partitionId) {
      if (
        !partitionId ||
        typeof partitionId !== REPLICA_HANDLER_TYPEOF.STRING ||
        partitionId.length === 0
      ) {
        return 0;
      }
      const gateway = this.getControlPlaneSystemTableGateway();
      if (!gateway) {
        return 0;
      }
      let hydratedRows = 0;
      try {
        const partitionRows = await this.querySystemTableRows(
          gateway,
          SYSTEM_TABLE_NAME.PARTITIONS,
          SYSTEM_TABLE_HYDRATION_SQL.PARTITION_BY_ID,
          [partitionId],
        );
        const partitionRow = partitionRows[0] || null;
        const tableId = partitionRow?.table_id || null;
        let tableRow = null;
        if (
          typeof tableId === REPLICA_HANDLER_TYPEOF.STRING &&
          tableId.length > 0
        ) {
          const tableRows = await this.querySystemTableRows(
            gateway,
            SYSTEM_TABLE_NAME.TABLES,
            SYSTEM_TABLE_HYDRATION_SQL.TABLE_BY_ID,
            [tableId],
          );
          tableRow = tableRows[0] || null;
        }
        const serviceRows = await this.querySystemTableRows(
          gateway,
          SYSTEM_TABLE_NAME.SERVICES,
          SYSTEM_TABLE_HYDRATION_SQL.PARTITION_SERVICES,
          [partitionId, REPLICA_HANDLER_SERVICE.TYPE],
        );
        this.setHydratedMetadataSnapshot(partitionId, {
          partitionRow,
          tableRow,
          serviceRows,
        });
        hydratedRows += partitionRow ? 1 : 0;
        hydratedRows += tableRow ? 1 : 0;
        hydratedRows += serviceRows.length;
        if (hydratedRows > 0) {
          this.logger.debug(
            REPLICA_HANDLER_LOG_MSG.HYDRATED_METADATA_FROM_QUERY,
            {
              partitionId,
              hydratedRows,
              nodeId: this.nodeId,
            },
          );
        }
        return hydratedRows;
      } catch (error) {
        this.logger.debug(
          REPLICA_HANDLER_LOG_MSG.METADATA_HYDRATION_QUERY_FAILED,
          {
            partitionId,
            error: error.message,
            nodeId: this.nodeId,
          },
        );
        return 0;
      }
    }
    /**
     * Apply bootstrap metadata payload rows into the local cache before context
     * resolution retries. This avoids waiting for eventual CDC visibility when
     * the coordinator already knows the canonical rows.
     * @param {Object} options
     * @param {string} options.partitionId
     * @param {Object|null} options.bootstrapTableMetadata
     * @param {Object|null} options.bootstrapPartitionMetadata
     * @return {void}
     * @private
     */
    applyBootstrapMetadataPayload(options = {}) {
      const partitionRow = this.normalizeBootstrapPartitionMetadata(
        options.partitionId,
        options.bootstrapPartitionMetadata,
      );
      const tableRow = this.normalizeBootstrapTableMetadata(
        partitionRow?.table_id || null,
        options.bootstrapTableMetadata,
      );
      this.setHydratedMetadataSnapshot(options.partitionId, {
        partitionRow,
        tableRow,
      });
    }
    /**
     * Normalize bootstrap table metadata from a CREATE_REPLICA payload.
     * @param {string|null} expectedTableId
     * @param {Object|null} tableRow
     * @return {Object|null}
     * @private
     */
    normalizeBootstrapTableMetadata(expectedTableId, tableRow) {
      if (!tableRow || typeof tableRow !== REPLICA_HANDLER_TYPEOF.OBJECT) {
        return null;
      }
      const tableId = tableRow.table_id || tableRow.tableId || null;
      if (
        typeof tableId !== REPLICA_HANDLER_TYPEOF.STRING ||
        tableId.length === 0
      ) {
        return null;
      }
      if (expectedTableId && tableId !== expectedTableId) {
        return null;
      }
      return {
        ...tableRow,
        table_id: tableId,
      };
    }
    /**
     * Normalize bootstrap partition metadata from a CREATE_REPLICA payload.
     * @param {string} expectedPartitionId
     * @param {Object|null} partitionRow
     * @return {Object|null}
     * @private
     */
    normalizeBootstrapPartitionMetadata(expectedPartitionId, partitionRow) {
      if (
        !partitionRow ||
        typeof partitionRow !== REPLICA_HANDLER_TYPEOF.OBJECT
      ) {
        return null;
      }
      const partitionId =
        partitionRow.partition_id || partitionRow.partitionId || null;
      const tableId = partitionRow.table_id || partitionRow.tableId || null;
      if (
        partitionId !== expectedPartitionId ||
        typeof tableId !== REPLICA_HANDLER_TYPEOF.STRING ||
        tableId.length === 0
      ) {
        return null;
      }
      return {
        ...partitionRow,
        partition_id: partitionId,
        table_id: tableId,
      };
    }
    /**
     * Execute a system-table query and normalize result to row array.
     * @param {ControlPlaneSystemTableGateway} gateway - Canonical read ingress.
     * @param {string} tableName - System table name.
     * @param {string} sql - Query text.
     * @param {Array<*>} params - Positional params.
     * @return {Promise<Array<Object>>}
     * @private
     */
    async querySystemTableRows(gateway, tableName, sql, params = []) {
      if (!gateway) {
        throw createSystemMetadataGatewayRequiredError({
          serviceName: REPLICA_HANDLER_LITERAL.REPLICAHANDLER,
          tableName,
          operation: REPLICA_HANDLER_LITERAL.READ,
        });
      }
      const result = await gateway.readRows(tableName, sql, params, {
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
      });
      if (result.success === false) {
        throw new Error(
          result.error || REPLICA_HANDLER_LITERAL.SYSTEM_TABLE_QUERY_FAILED,
        );
      }
      return Array.isArray(result.rows) ? result.rows : [];
    }
    getControlPlaneSystemTableGateway() {
      if (this.controlPlaneSystemTableGateway) {
        return this.controlPlaneSystemTableGateway;
      }
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle({
        nodeId: this.nodeId,
        getSqlQueryEngine: () => this.getMetadataSqlQueryEngine(),
        getCdcIntegrationService: () => this.cdcIntegrationService,
        getSystemTableCache: () => this.systemTableCache,
      }).controlPlaneSystemTableGateway;
      return this.controlPlaneSystemTableGateway;
    }
    getPartitionServiceRowOwner() {
      if (this.partitionServiceRowOwner) {
        return this.partitionServiceRowOwner;
      }
      this.partitionServiceRowOwner = new PartitionServiceRowOwner({
        systemTableWriter: this.getControlPlaneSystemTableGateway(),
      });
      return this.partitionServiceRowOwner;
    }
    getReplicaCleanupTombstoneOwner() {
      if (this.replicaCleanupTombstoneOwner) {
        return this.replicaCleanupTombstoneOwner;
      }
      this.replicaCleanupTombstoneOwner = new ReplicaCleanupTombstoneOwner({
        gateway: this.getControlPlaneSystemTableGateway(),
        logger: this.logger,
      });
      return this.replicaCleanupTombstoneOwner;
    }
    /**
     * @return {Object|null}
     * @private
     */
    getMetadataSqlQueryEngine() {
      if (this.cdcIntegrationService?.sqlQueryEngine) {
        return this.cdcIntegrationService.sqlQueryEngine;
      }
      if (
        typeof this.cdcIntegrationService?.executeSQL ===
        REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        return {
          executeQuery: (sql, params = []) => {
            return this.cdcIntegrationService.executeSQL(sql, params);
          },
        };
      }
      return null;
    }
    /**
     * @param {string} partitionId
     * @return {Object|null}
     * @private
     */
    getHydratedMetadataSnapshot(partitionId) {
      if (
        typeof partitionId !== REPLICA_HANDLER_TYPEOF.STRING ||
        partitionId.length === 0
      ) {
        return null;
      }
      return this.hydratedMetadataByPartitionId.get(partitionId) || null;
    }
    /**
     * @param {string} partitionId
     * @param {Object} snapshot
     * @return {void}
     * @private
     */
    setHydratedMetadataSnapshot(partitionId, snapshot = {}) {
      if (
        typeof partitionId !== REPLICA_HANDLER_TYPEOF.STRING ||
        partitionId.length === 0
      ) {
        return;
      }
      const existingSnapshot =
        this.getHydratedMetadataSnapshot(partitionId) || {};
      const serviceRows = Array.isArray(snapshot.serviceRows) ?
        snapshot.serviceRows.filter(
          (row) => row && typeof row === REPLICA_HANDLER_TYPEOF.OBJECT,
        ) :
        existingSnapshot.serviceRows || [];
      this.hydratedMetadataByPartitionId.set(partitionId, {
        partitionRow:
          snapshot.partitionRow || existingSnapshot.partitionRow || null,
        tableRow: snapshot.tableRow || existingSnapshot.tableRow || null,
        serviceRows,
      });
    }
    /**
     * @param {string} partitionId
     * @return {void}
     * @private
     */
    clearHydratedMetadataSnapshot(partitionId) {
      if (
        typeof partitionId !== REPLICA_HANDLER_TYPEOF.STRING ||
        partitionId.length === 0
      ) {
        return;
      }
      this.hydratedMetadataByPartitionId.delete(partitionId);
    }
    /**
     * @param {Array<Object>} cachedRows
     * @param {Array<Object>} hydratedRows
     * @return {Array<Object>}
     * @private
     */
    mergeHydratedServices(cachedRows = [], hydratedRows = []) {
      const mergedRows = new Map();
      for (const row of Array.isArray(cachedRows) ? cachedRows : []) {
        const serviceId = row?.service_id || row?.replica_id;
        if (
          typeof serviceId === REPLICA_HANDLER_TYPEOF.STRING &&
          serviceId.length > 0
        ) {
          mergedRows.set(serviceId, row);
        }
      }
      for (const row of Array.isArray(hydratedRows) ? hydratedRows : []) {
        const serviceId = row?.service_id || row?.replica_id;
        if (
          typeof serviceId === REPLICA_HANDLER_TYPEOF.STRING &&
          serviceId.length > 0
        ) {
          mergedRows.set(serviceId, row);
        }
      }
      return Array.from(mergedRows.values());
    }
  }
  for (const methodName of Object.getOwnPropertyNames(
    ReplicaHandlerRuntimeMetadataMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaHandler.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerRuntimeMetadataMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaHandlerRuntimeMetadataMethods};
