const LOCAL_STR_CONSTRUCTOR = 'constructor';
// CL-013: explicit REPLACE joins categorically target an EXISTING raft
// group; they must never fall back to solo bootstrap.
const EXPLICIT_REPLACE_OPERATION_TYPE = 'REPLACE';
const REPLICA_JOIN_TOPOLOGY_MISSING_PREFIX =
  'Replica join topology unavailable for partition ';

function replicaJoinTopologyMissingError(partitionId, replicaId) {
  return new Error(
    `${REPLICA_JOIN_TOPOLOGY_MISSING_PREFIX}${partitionId}: explicit ` +
    `REPLACE join for ${replicaId} resolved no sibling peers (dispatched ` +
    'bootstrap hints absent and local cache view reduced to self-only)',
  );
}

function assignReplicaHandlerRuntimeMetadataMethods(
  ReplicaHandler,
  options = {},
) {
  const {
    AddressManager,
    VOTER_RAFT_ROLES,
    METADATA_RESOLUTION_POLL_INTERVAL_MS,
    PRESSURE_WORK_CLASS,
    PARTITION_METADATA_MISSING_PREFIX,
    PartitionServiceRowOwner,
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
    isFreshPartitionBootstrapWindow,
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
        message.startsWith(TABLE_METADATA_MISSING_PREFIX) ||
        message.startsWith(REPLICA_JOIN_TOPOLOGY_MISSING_PREFIX)
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
      const requestedReplicaIds = Array.isArray(options.bootstrapReplicaIds) ?
        options.bootstrapReplicaIds.filter(
          (value) =>
            typeof value === REPLICA_HANDLER_TYPEOF.STRING &&
              value.length > 0,
        ) :
        [];
      const requestedPeerAddresses = Array.isArray(
        options.bootstrapPeerAddresses,
      ) ?
        options.bootstrapPeerAddresses.filter(
          (value) =>
            typeof value === REPLICA_HANDLER_TYPEOF.STRING &&
              value.length > 0,
        ) :
        [];
      const isExplicitReplaceJoin =
        typeof options.explicitOperationType ===
          REPLICA_HANDLER_TYPEOF.STRING &&
        options.explicitOperationType.trim().toUpperCase() ===
          EXPLICIT_REPLACE_OPERATION_TYPE;
      // A REPLACE operation's dispatched cohort is the placement owner's
      // closed-world membership decision. Local and hydrated service rows are
      // still useful for leader/voter readiness, but they cannot add a voter
      // that the owner excluded (for example, a just-retired source whose CDC
      // removal has not reached this target yet).
      const explicitReplaceReplicaIds = isExplicitReplaceJoin ?
        new Set(requestedReplicaIds) :
        null;
      const hasExplicitReplaceCohort =
        explicitReplaceReplicaIds?.size > 0;
      const services = hasExplicitReplaceCohort ?
        observedServices.filter((service) =>
          explicitReplaceReplicaIds.has(
            service?.service_id || service?.replica_id,
          ),
        ) :
        observedServices;
      const replicaIds = hasExplicitReplaceCohort ?
        [...requestedReplicaIds] :
        [];
      const peerAddresses =
        hasExplicitReplaceCohort && requestedPeerAddresses.length > 0 ?
          [...requestedPeerAddresses] :
          [];
      const seenReplicaIds = new Set(replicaIds);
      const hasExplicitReplacePeerAddresses =
        hasExplicitReplaceCohort && requestedPeerAddresses.length > 0;
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
        const joinServiceViable = isViableJoinService(service);
        if (
          shouldFilterUnavailablePeerTopology &&
          serviceReplicaId !== replicaId &&
          !joinServiceViable
        ) {
          continue;
        }
        if (!seenReplicaIds.has(serviceReplicaId)) {
          seenReplicaIds.add(serviceReplicaId);
          replicaIds.push(serviceReplicaId);
        }
        const isEstablishedVoter =
          service.status === ReplicaStatus.ACTIVE &&
          VOTER_RAFT_ROLES.has(service.raft_role);
        if (
          serviceReplicaId !== replicaId &&
          isEstablishedVoter &&
          joinServiceViable
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
        if (
          !hasExplicitReplacePeerAddresses &&
          !peerAddresses.includes(peerAddress)
        ) {
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
      const isFreshBootstrapPartition =
        isFreshPartitionBootstrapWindow(partition);
      // CL-013: dispatched bootstrap hints come from the placement owner
      // (the coordinator stamped the canonical topology at create time) and
      // are authoritative over this node's cache view — which under churn
      // can be viability-filtered down to self-only. They were previously
      // merged only inside the fresh-bootstrap window, so every REPLACE
      // join into an established partition discarded them and could solo-
      // bootstrap an isolated raft group.
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
      // CL-013: an explicit REPLACE join targets an EXISTING group by
      // definition — it must never proceed with a SELF-ONLY topology, which
      // fresh-bootstraps an isolated single-node raft group that elects
      // itself and pollutes the canonical leader row. When neither the
      // dispatched hints nor the local cache yield any sibling peer, the
      // context is stale: throw retryably so the caller's hydration loop
      // re-reads authoritative rows instead of proceeding. (Join MODE is
      // unchanged: with peers present but no viable leader, voter-mode
      // re-formation remains the designed dead-leader recovery behavior.)
      if (isExplicitReplaceJoin) {
        const siblingPeerCount = replicaIds.filter(
          (candidateReplicaId) => candidateReplicaId !== replicaId,
        ).length;
        if (siblingPeerCount === 0) {
          throw replicaJoinTopologyMissingError(partitionId, replicaId);
        }
      }
      return {
        tableId: partition.table_id,
        tableName: table.table_name,
        schema,
        keyRange,
        leaderAddress,
        replicaIds,
        peerAddresses,
        existingReplicaCount: isFreshBootstrapPartition ?
          0 :
          hasViableLeader ?
            Math.max(1, establishedExistingReplicaIds.size) :
            0,
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
