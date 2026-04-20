function assignReplicaHandlerRuntimeMethods(ReplicaHandler, options = {}) {
  const {
    AddressManager,
    ESTABLISHED_VOTER_ROLES,
    METADATA_RESOLUTION_POLL_INTERVAL_MS,
    NUM,
    PRESSURE_WORK_CLASS,
    PARTITION_METADATA_MISSING_PREFIX,
    PartitionServiceRowOwner,
    REPLICA_HANDLER_ADDRESS,
    REPLICA_HANDLER_ERRNO,
    REPLICA_HANDLER_ERROR_MSG,
    REPLICA_HANDLER_EVENT,
    REPLICA_HANDLER_LITERAL,
    REPLICA_HANDLER_LOG_MSG,
    REPLICA_HANDLER_NUM,
    REPLICA_HANDLER_SERVICE,
    REPLICA_HANDLER_TYPEOF,
    ReplicaStatus,
    STORAGE_DEFAULT,
    SYSTEM_TABLE_HYDRATION_SQL,
    SYSTEM_TABLE_NAME,
    TABLE_METADATA_MISSING_PREFIX,
    createControlPlaneRuntimeBundle,
    createSystemMetadataGatewayRequiredError,
    fs,
    isFreshPartitionBootstrapWindow,
    isReplicaJoinNodeViable,
    path,
    partitionMetadataMissingError,
  } = options;
  class ReplicaHandlerRuntimeMethods {
    async resolveReplicaContextWithRetry(partitionId, replicaId, options = {}) {
      this.throwIfShuttingDown();
      const deadline = Date.now() + this.syncTimeoutMs;
      let metadataWaitLogged = false;
      let lastError = null;
      let metadataHydrationCount = NUM.ZERO;
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
        typeof error?.message === REPLICA_HANDLER_TYPEOF.STRING
          ? error.message
          : "";
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
          typeof table.schema_definition === REPLICA_HANDLER_TYPEOF.STRING
            ? JSON.parse(table.schema_definition)
            : table.schema_definition;
      } catch (error) {
        const schemaParseFailed = REPLICA_HANDLER_ERROR_MSG.SCHEMA_PARSE_FAILED;
        throw new Error(schemaParseFailed(error.message));
      }
      const keyRange = {
        start: partition.partition_key_start || null,
        end: partition.partition_key_end || null,
      };
      const cachedServices = this.systemTableCache.filter(
        SYSTEM_TABLE_NAME.SERVICES,
        (service) =>
          service.partition_id === partitionId &&
          service.service_type === REPLICA_HANDLER_SERVICE.TYPE,
      );
      const services = this.mergeHydratedServices(
        cachedServices,
        hydratedMetadata?.serviceRows || [],
      );
      const now = Date.now();
      const addressManager = AddressManager.getInstance();
      const replicaIds = [];
      const peerAddresses = [];
      const seenReplicaIds = new Set();
      const requestedReplicaIds = Array.isArray(options.bootstrapReplicaIds)
        ? options.bootstrapReplicaIds.filter(
            (value) =>
              typeof value === REPLICA_HANDLER_TYPEOF.STRING &&
              value.length > NUM.ZERO,
          )
        : [];
      const requestedPeerAddresses = Array.isArray(
        options.bootstrapPeerAddresses,
      )
        ? options.bootstrapPeerAddresses.filter(
            (value) =>
              typeof value === REPLICA_HANDLER_TYPEOF.STRING &&
              value.length > NUM.ZERO,
          )
        : [];
      // Count only established voters from sibling services. Freshly staged
      // rows in pending/creating/syncing states do not imply an existing group.
      const establishedExistingReplicaIds = new Set();
      const isViableJoinService = (service) => {
        if (
          !service?.node_id ||
          typeof this.systemTableCache.get !== REPLICA_HANDLER_TYPEOF.FUNCTION
        ) {
          return true;
        }
        return isReplicaJoinNodeViable(
          this.systemTableCache.get(SYSTEM_TABLE_NAME.NODES, service.node_id),
          { now },
        );
      };
      for (const service of services) {
        const serviceReplicaId = service.service_id || service.replica_id;
        if (!serviceReplicaId) {
          continue;
        }
        if (!seenReplicaIds.has(serviceReplicaId)) {
          seenReplicaIds.add(serviceReplicaId);
          replicaIds.push(serviceReplicaId);
        }
        const isEstablishedVoter =
          service.status === ReplicaStatus.ACTIVE &&
          ESTABLISHED_VOTER_ROLES.has(service.raft_role);
        if (
          serviceReplicaId !== replicaId &&
          isEstablishedVoter &&
          isViableJoinService(service)
        ) {
          establishedExistingReplicaIds.add(serviceReplicaId);
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
      if (replicaId && !seenReplicaIds.has(replicaId)) {
        replicaIds.push(replicaId);
        seenReplicaIds.add(replicaId);
        const selfAddress = addressManager.format(
          this.nodeId,
          REPLICA_HANDLER_SERVICE.TYPE,
          replicaId,
        );
        if (!peerAddresses.includes(selfAddress)) {
          peerAddresses.push(selfAddress);
        }
      }
      let leaderAddress = null;
      const canonicalLeaderNodeId =
        typeof partition.leader_node_id === "string" &&
        partition.leader_node_id.length > 0
          ? partition.leader_node_id
          : null;
      const leaderService = canonicalLeaderNodeId
        ? services.find(
            (service) =>
              service.node_id === canonicalLeaderNodeId &&
              service.status === ReplicaStatus.ACTIVE &&
              isViableJoinService(service),
          )
        : null;
      const isFreshBootstrapPartition =
        isFreshPartitionBootstrapWindow(partition);
      if (isFreshBootstrapPartition) {
        for (const requestedReplicaId of requestedReplicaIds) {
          if (!seenReplicaIds.has(requestedReplicaId)) {
            seenReplicaIds.add(requestedReplicaId);
            replicaIds.push(requestedReplicaId);
          }
        }
        for (const requestedPeerAddress of requestedPeerAddresses) {
          if (!peerAddresses.includes(requestedPeerAddress)) {
            peerAddresses.push(requestedPeerAddress);
          }
        }
      }
      // Fresh CREATE TABLE provisioning dispatches replica creation before the
      // partition row has a persisted leader_node_id. A single sibling leader
      // must not force later members of that first cohort into learner mode.
      const hasViableLeader =
        !isFreshBootstrapPartition && Boolean(leaderService);
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
        replicaIds,
        peerAddresses,
        existingReplicaCount: isFreshBootstrapPartition
          ? NUM.ZERO
          : hasViableLeader
            ? Math.max(NUM.ONE, establishedExistingReplicaIds.size)
            : NUM.ZERO,
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
        partitionId.length === NUM.ZERO
      ) {
        return NUM.ZERO;
      }
      const gateway = this.getControlPlaneSystemTableGateway();
      if (!gateway) {
        return NUM.ZERO;
      }
      let hydratedRows = NUM.ZERO;
      try {
        const partitionRows = await this.querySystemTableRows(
          gateway,
          SYSTEM_TABLE_NAME.PARTITIONS,
          SYSTEM_TABLE_HYDRATION_SQL.PARTITION_BY_ID,
          [partitionId],
        );
        const partitionRow = partitionRows[NUM.ZERO] || null;
        const tableId = partitionRow?.table_id || null;
        let tableRow = null;
        if (
          typeof tableId === REPLICA_HANDLER_TYPEOF.STRING &&
          tableId.length > NUM.ZERO
        ) {
          const tableRows = await this.querySystemTableRows(
            gateway,
            SYSTEM_TABLE_NAME.TABLES,
            SYSTEM_TABLE_HYDRATION_SQL.TABLE_BY_ID,
            [tableId],
          );
          tableRow = tableRows[NUM.ZERO] || null;
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
        hydratedRows += partitionRow ? NUM.ONE : NUM.ZERO;
        hydratedRows += tableRow ? NUM.ONE : NUM.ZERO;
        hydratedRows += serviceRows.length;
        if (hydratedRows > NUM.ZERO) {
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
        return NUM.ZERO;
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
        tableId.length === NUM.ZERO
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
        tableId.length === NUM.ZERO
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
        allowPressureDefer: true,
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
        partitionId.length === NUM.ZERO
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
        partitionId.length === NUM.ZERO
      ) {
        return;
      }
      const existingSnapshot =
        this.getHydratedMetadataSnapshot(partitionId) || {};
      const serviceRows = Array.isArray(snapshot.serviceRows)
        ? snapshot.serviceRows.filter(
            (row) => row && typeof row === REPLICA_HANDLER_TYPEOF.OBJECT,
          )
        : existingSnapshot.serviceRows || [];
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
        partitionId.length === NUM.ZERO
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
          serviceId.length > NUM.ZERO
        ) {
          mergedRows.set(serviceId, row);
        }
      }
      for (const row of Array.isArray(hydratedRows) ? hydratedRows : []) {
        const serviceId = row?.service_id || row?.replica_id;
        if (
          typeof serviceId === REPLICA_HANDLER_TYPEOF.STRING &&
          serviceId.length > NUM.ZERO
        ) {
          mergedRows.set(serviceId, row);
        }
      }
      return Array.from(mergedRows.values());
    }
    /**
     * Clean up local resources for a replica.
     * @param {string} partitionId - Partition ID.
     * @param {string} replicaId - Replica ID.
     * @return {Promise<void>}
     * @private
     */
    async cleanupRemovedReplicaLocalRuntime(
      replicaId,
      partitionId,
      service = null,
    ) {
      if (
        service &&
        typeof service.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        this.logger.debug(REPLICA_HANDLER_LOG_MSG.GRACEFUL_SHUTDOWN, {
          replicaId,
          nodeId: this.nodeId,
        });
        await service.shutdown();
      }
      await this.cleanupReplicaResources(partitionId, replicaId);
    }
    /**
     * Clean up local resources for a replica.
     * @param {string} partitionId - Partition ID.
     * @param {string} replicaId - Replica ID.
     * @return {Promise<void>}
     * @private
     */
    async cleanupReplicaResources(partitionId, replicaId) {
      const dbPath = this.getPartitionDbPath(partitionId, replicaId);
      this.logger.debug(REPLICA_HANDLER_LOG_MSG.CLEANUP_RESOURCES, {
        replicaId,
        partitionId,
        dbPath,
        nodeId: this.nodeId,
      });
      try {
        // Remove SQLite database file
        if (fs.existsSync(dbPath)) {
          fs.unlinkSync(dbPath);
          this.logger.debug(REPLICA_HANDLER_LOG_MSG.REMOVED_DB_FILE, {
            dbPath,
          });
        }
        // Remove WAL and SHM files if they exist
        const walPath = `${dbPath}-wal`;
        const shmPath = `${dbPath}-shm`;
        if (fs.existsSync(walPath)) {
          fs.unlinkSync(walPath);
        }
        if (fs.existsSync(shmPath)) {
          fs.unlinkSync(shmPath);
        }
        // Try to remove partition directory if empty
        const partitionDir = path.dirname(dbPath);
        try {
          if (!fs.existsSync(partitionDir)) {
            return;
          }
          const files = fs.readdirSync(partitionDir);
          if (files.length === REPLICA_HANDLER_NUM.ZERO) {
            fs.rmdirSync(partitionDir);
            this.logger.debug(REPLICA_HANDLER_LOG_MSG.REMOVED_EMPTY_DIR, {
              partitionDir,
            });
          }
        } catch (dirError) {
          if (dirError?.code === REPLICA_HANDLER_ERRNO.ENOENT) {
            return;
          }
          this.logger.warn(REPLICA_HANDLER_LOG_MSG.CLEANUP_FAILED, {
            replicaId,
            dbPath,
            error: dirError.message,
          });
          throw dirError;
        }
      } catch (error) {
        if (error?.code === REPLICA_HANDLER_ERRNO.ENOENT) {
          return;
        }
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.CLEANUP_FAILED, {
          replicaId,
          dbPath,
          error: error.message,
        });
        throw error;
      }
    }
    /**
     * Get the database path for a partition replica.
     * @param {string} partitionId - Partition ID.
     * @param {string} replicaId - Replica ID.
     * @return {string} Database file path.
     * @private
     */
    getPartitionDbPath(partitionId, replicaId) {
      return path.join(
        this.dataDir,
        STORAGE_DEFAULT.PARTITIONS_DIRNAME,
        partitionId,
        `${replicaId}${STORAGE_DEFAULT.DB_EXT}`,
      );
    }
    /**
     * Get local replica by ID.
     * Reads from System_Table_Cache and merges with local service reference.
     * @param {string} replicaId - Replica ID.
     * @return {Object|null} Local replica info or null.
     */
    getLocalReplica(replicaId) {
      const localReplica = this.localReplicas.get(replicaId);
      if (
        localReplica &&
        typeof localReplica === REPLICA_HANDLER_TYPEOF.OBJECT
      ) {
        const trackedService = this.getTrackedService(replicaId);
        if (!localReplica.replicaId) {
          localReplica.replicaId = replicaId;
        }
        if (localReplica.service === undefined) {
          localReplica.service = trackedService;
        } else if (!localReplica.service && trackedService) {
          localReplica.service = trackedService;
        }
        return localReplica;
      }
      // Read durable placement from cache and merge tracked local runtime service.
      const cacheEntry = this.systemTableCache.get(
        SYSTEM_TABLE_NAME.SERVICES,
        replicaId,
      );
      const service = this.getTrackedService(replicaId);
      // Check if this replica belongs to this node
      if (!cacheEntry || cacheEntry.node_id !== this.nodeId) {
        // Compatibility fallback for legacy tests that seed in-memory local replicas
        // directly on the lifecycle manager.
        if (
          service &&
          typeof service === REPLICA_HANDLER_TYPEOF.OBJECT &&
          service.status
        ) {
          const compatibilityService =
            service.service ||
            (typeof service.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION ||
            typeof service.syncFromLeader === REPLICA_HANDLER_TYPEOF.FUNCTION
              ? service
              : null);
          return {
            replicaId: service.replicaId || replicaId,
            partitionId: service.partitionId || null,
            tableName: service.tableName || null,
            status: service.status,
            service: compatibilityService,
          };
        }
        return null;
      }
      // Merge cache state with local service reference
      return {
        replicaId: cacheEntry.service_id || cacheEntry.replica_id,
        partitionId: cacheEntry.partition_id,
        tableName: null,
        // Not stored in services table
        status: cacheEntry.status,
        service: service || null,
      };
    }
    /**
     * Get all local replicas.
     * Reads from System_Table_Cache filtered by node_id.
     * @return {Array<Object>} Array of local replica info.
     */
    getAllLocalReplicas() {
      const replicasById = new Map();
      const localServices = this.systemTableCache.filter(
        SYSTEM_TABLE_NAME.SERVICES,
        (row) => row.node_id === this.nodeId,
      );
      for (const cacheEntry of localServices) {
        const replicaId = cacheEntry.service_id || cacheEntry.replica_id;
        const tracked = this.localReplicas.get(replicaId);
        replicasById.set(replicaId, {
          replicaId,
          partitionId: cacheEntry.partition_id,
          tableName: tracked?.tableName || null,
          status: tracked?.status || cacheEntry.status,
          service: this.getTrackedService(replicaId),
        });
      }
      for (const [replicaId, trackedReplica] of this.localReplicas.entries()) {
        if (!replicasById.has(replicaId)) {
          replicasById.set(replicaId, {
            replicaId: trackedReplica?.replicaId || replicaId,
            partitionId: trackedReplica?.partitionId || null,
            tableName: trackedReplica?.tableName || null,
            status: trackedReplica?.status || null,
            service: this.getTrackedService(replicaId),
          });
        }
      }
      return Array.from(replicasById.values());
    }
    /**
     * Register an existing replica (created during bootstrap).
     * Stores only the service reference in localServices.
     * This method is idempotent - duplicate registrations are ignored.
     * @param {Object} replicaInfo - Replica information.
     * @param {string} replicaInfo.replicaId - Unique replica identifier.
     * @param {string} replicaInfo.partitionId - Partition identifier.
     * @param {string} replicaInfo.tableName - Table name.
     * @param {string} [replicaInfo.status] - Replica status (default: 'active').
     * @param {Object} [replicaInfo.service] - Partition service instance.
     */
    registerExistingReplica(replicaInfo) {
      const { replicaId, service } = replicaInfo;
      // Idempotent: no error on duplicate registration
      if (this.localReplicas.has(replicaId)) {
        this.logger.debug(REPLICA_HANDLER_LOG_MSG.ALREADY_REGISTERED, {
          replicaId,
          nodeId: this.nodeId,
        });
        return;
      }
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId: replicaInfo.partitionId || null,
        tableName: replicaInfo.tableName || null,
        status: replicaInfo.status || ReplicaStatus.ACTIVE,
        service: service || null,
      });
      // Store service reference when provided
      if (service) {
        this.localServices.set(replicaId, service);
      }
      this.logger.info(REPLICA_HANDLER_LOG_MSG.REGISTERED_REPLICA, {
        replicaId,
        partitionId: replicaInfo.partitionId,
        tableName: replicaInfo.tableName,
        nodeId: this.nodeId,
      });
    }
    /**
     * Aggregate pending-request tracker telemetry from local replica services.
     * @return {Object}
     * @private
     */
    getPendingRequestTrackerAggregate() {
      const aggregate = {
        pendingCount: NUM.ZERO,
        maxPendingRequests: NUM.ZERO,
        availableCapacity: NUM.ZERO,
        saturationPercent: NUM.ZERO,
        trackedTotal: NUM.ZERO,
        resolvedTotal: NUM.ZERO,
        rejectedTotal: NUM.ZERO,
        timedOutTotal: NUM.ZERO,
        staleCleanedTotal: NUM.ZERO,
        backpressureRejectTotal: NUM.ZERO,
        maxPendingObserved: NUM.ZERO,
        replicaCountWithTracker: NUM.ZERO,
      };
      for (const service of this.localServices.values()) {
        if (
          !service ||
          typeof service.getStats !== REPLICA_HANDLER_TYPEOF.FUNCTION
        ) {
          continue;
        }
        let serviceStats = null;
        try {
          serviceStats = service.getStats();
        } catch (_error) {
          continue;
        }
        const tracker = serviceStats?.pendingRequestTracker;
        if (!tracker || typeof tracker !== REPLICA_HANDLER_TYPEOF.OBJECT) {
          continue;
        }
        aggregate.replicaCountWithTracker += NUM.ONE;
        aggregate.pendingCount += Number.isFinite(tracker.pendingCount)
          ? tracker.pendingCount
          : NUM.ZERO;
        aggregate.maxPendingRequests += Number.isFinite(
          tracker.maxPendingRequests,
        )
          ? tracker.maxPendingRequests
          : NUM.ZERO;
        aggregate.availableCapacity += Number.isFinite(
          tracker.availableCapacity,
        )
          ? tracker.availableCapacity
          : NUM.ZERO;
        aggregate.trackedTotal += Number.isFinite(tracker.trackedTotal)
          ? tracker.trackedTotal
          : NUM.ZERO;
        aggregate.resolvedTotal += Number.isFinite(tracker.resolvedTotal)
          ? tracker.resolvedTotal
          : NUM.ZERO;
        aggregate.rejectedTotal += Number.isFinite(tracker.rejectedTotal)
          ? tracker.rejectedTotal
          : NUM.ZERO;
        aggregate.timedOutTotal += Number.isFinite(tracker.timedOutTotal)
          ? tracker.timedOutTotal
          : NUM.ZERO;
        aggregate.staleCleanedTotal += Number.isFinite(
          tracker.staleCleanedTotal,
        )
          ? tracker.staleCleanedTotal
          : NUM.ZERO;
        aggregate.backpressureRejectTotal += Number.isFinite(
          tracker.backpressureRejectTotal,
        )
          ? tracker.backpressureRejectTotal
          : NUM.ZERO;
        aggregate.maxPendingObserved = Math.max(
          aggregate.maxPendingObserved,
          Number.isFinite(tracker.maxPendingObserved)
            ? tracker.maxPendingObserved
            : NUM.ZERO,
        );
      }
      if (aggregate.maxPendingRequests > NUM.ZERO) {
        aggregate.saturationPercent = Math.round(
          (aggregate.pendingCount / aggregate.maxPendingRequests) * NUM.HUNDRED,
        );
      }
      return aggregate;
    }
    /**
     * Get handler statistics.
     * @return {Object} Statistics object.
     */
    getStats() {
      const pendingRequestTracker = this.getPendingRequestTrackerAggregate();
      return {
        nodeId: this.nodeId,
        initialized: this.initialized,
        localReplicaCount: this.localReplicas.size,
        inProgressOperationCount: this.inProgressOperations.size,
        pendingRequestTracker,
      };
    }
    /**
     * Register this handler with a message router.
     * Registers at ${nodeId}/service/replica-handler address.
     * Requirements: 3.1
     * @param {Object} messageRouter - Message router instance.
     * @param {Object} [options={}] - Registration options.
     * @param {Object} [options.rpcClient] - RPC client for response handling.
     */
    registerWithRouter(messageRouter, options = {}) {
      if (!messageRouter) {
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.NO_MESSAGE_ROUTER);
        return;
      }
      const handlerAddress =
        `${this.nodeId}/${REPLICA_HANDLER_ADDRESS.SERVICE_SEGMENT}/` +
        `${REPLICA_HANDLER_ADDRESS.HANDLER_ID}`;
      // Store RPC client if provided
      if (options.rpcClient) {
        this.rpcClient = options.rpcClient;
      }
      // Create handler that wraps handleMessage
      const routerHandler = async (envelope) => {
        const response = await this.handleMessage(envelope);
        // If RPC client is available, also notify it of the response
        // This handles the case where the coordinator is on the same node
        if (this.rpcClient && response.correlationId) {
          this.rpcClient.handleResponse(response.correlationId, response);
        }
        return {
          acknowledged: true,
          ...response,
        };
      };
      messageRouter.register(handlerAddress, routerHandler);
      this.logger.info(REPLICA_HANDLER_LOG_MSG.REGISTERED_ROUTER, {
        address: handlerAddress,
        nodeId: this.nodeId,
      });
    }
    /**
     * Unregister this handler from a message router.
     * @param {Object} messageRouter - Message router instance.
     */
    unregisterFromRouter(messageRouter) {
      if (!messageRouter) {
        return;
      }
      const handlerAddress =
        `${this.nodeId}/${REPLICA_HANDLER_ADDRESS.SERVICE_SEGMENT}/` +
        `${REPLICA_HANDLER_ADDRESS.HANDLER_ID}`;
      messageRouter.unregister(handlerAddress);
      this.logger.info(REPLICA_HANDLER_LOG_MSG.UNREGISTERED_ROUTER, {
        address: handlerAddress,
        nodeId: this.nodeId,
      });
    }
    /**
     * Shutdown the replica handler.
     */
    async shutdown() {
      if (this.shutdownPromise) {
        return this.shutdownPromise;
      }
      this.shutdownPromise = (async () => {
        this.logger.info(REPLICA_HANDLER_LOG_MSG.SHUTTING_DOWN, {
          nodeId: this.nodeId,
        });
        this.shuttingDown = true;
        for (const progress of this.creationProgressByReplica.values()) {
          this.creationProgressReporter.fail(
            progress,
            REPLICA_HANDLER_LOG_MSG.SHUTTING_DOWN,
            { stage: ReplicaStatus.FAILED },
          );
        }
        await Promise.allSettled([...this.operationTasks]);
        const servicesToShutdown = new Set([
          ...this.localServices.values(),
          ...[...this.localReplicas.values()]
            .map((replica) => replica?.service)
            .filter(Boolean),
        ]);
        for (const service of servicesToShutdown) {
          try {
            if (typeof service.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION) {
              await service.shutdown();
            }
          } catch (error) {
            this.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVE_FAILED, {
              nodeId: this.nodeId,
              error: error.message,
            });
          }
        }
        this.creationProgressByReplica.clear();
        this.inProgressOperations.clear();
        this.localServices.clear();
        this.localReplicas.clear();
        this.initialized = false;
        this.emit(REPLICA_HANDLER_EVENT.SHUTDOWN, { nodeId: this.nodeId });
      })();
      return this.shutdownPromise;
    }
    /**
     * Get service reference for a replica from local tracking.
     * @param {string} replicaId - Replica ID.
     * @return {Object|null} Service instance or null.
     * @private
     */
    getTrackedService(replicaId) {
      const service = this.localServices.get(replicaId);
      if (service) {
        return service;
      }
      const trackedReplica = this.localReplicas.get(replicaId);
      if (
        !trackedReplica ||
        typeof trackedReplica !== REPLICA_HANDLER_TYPEOF.OBJECT
      ) {
        return null;
      }
      if (trackedReplica.service) {
        return trackedReplica.service;
      }
      if (
        typeof trackedReplica.shutdown === REPLICA_HANDLER_TYPEOF.FUNCTION ||
        typeof trackedReplica.syncFromLeader === REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        return trackedReplica;
      }
      return null;
    }
    /**
     * Determine whether CREATE_REPLICA idempotency is already satisfied.
     * Durable ownership alone is not enough; the local runtime service must
     * still be tracked and available on this node.
     * @param {Object|null} replica - Replica snapshot.
     * @return {boolean} True when the active replica is locally tracked.
     * @private
     */
    isReplicaCreateAlreadySatisfied(replica) {
      return Boolean(
        replica && replica.status === ReplicaStatus.ACTIVE && replica.service,
      );
    }
    /**
     * Get normalized raft role from the locally tracked service owner.
     * @param {string} replicaId - Replica ID.
     * @return {string|null} Lower-cased raft role or null.
     * @private
     */
    getTrackedReplicaRole(replicaId) {
      const service = this.getTrackedService(replicaId);
      if (!service) {
        return null;
      }
      const role =
        typeof service.getRole === REPLICA_HANDLER_TYPEOF.FUNCTION
          ? service.getRole()
          : service.role;
      return typeof role === REPLICA_HANDLER_TYPEOF.STRING
        ? role.toLowerCase()
        : null;
    }
    /**
     * Build the canonical service address for a tracked replica.
     * @param {string} replicaId - Replica ID.
     * @return {string} Formatted address.
     * @private
     */
    buildTrackedServiceAddress(replicaId) {
      const addressManager = AddressManager.getInstance();
      return addressManager.format(
        this.nodeId,
        REPLICA_HANDLER_SERVICE.TYPE,
        replicaId,
      );
    }
    /**
     * Update local replica metadata while preserving existing fields.
     * @param {string} replicaId - Replica ID.
     * @param {Object} updates - Fields to merge.
     * @return {Object} Updated local replica metadata.
     * @private
     */
    setLocalReplica(replicaId, updates) {
      const existing = this.localReplicas.get(replicaId) || {};
      const merged = {
        ...existing,
        ...updates,
        replicaId: updates.replicaId || existing.replicaId || replicaId,
      };
      this.localReplicas.set(replicaId, merged);
      return merged;
    }
  }
  for (const methodName of Object.getOwnPropertyNames(
    ReplicaHandlerRuntimeMethods.prototype,
  )) {
    if (methodName === "constructor") {
      continue;
    }
    Object.defineProperty(
      ReplicaHandler.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerRuntimeMethods.prototype,
        methodName,
      ),
    );
  }
}
export { assignReplicaHandlerRuntimeMethods };
