import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {
  reconcileRaftPeersFromCacheForService,
} from './partition-service-raft-peer-cache-reconciliation.js';
import {PartitionServiceCoreBase} from './partition-service-core-base.js';
import {HLCTimestamp} from '../hlc/hlc-timestamp.js';

const {
  AddressManager,
  CANONICAL_PARTITION_LEADER_OBSERVATION_STATE,
  COLUMN,
  CONFIG_KEY,
  ConfigurationManager,
  Database,
  ENTITY_TYPE,
  LifeRaft,
  PARTITION_SERVICE_ADDRESS,
  PARTITION_SERVICE_COLUMN,
  PARTITION_SERVICE_COLUMN_SQL,
  PARTITION_SERVICE_DB,
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_INIT_STAGE,
  PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON,
  PARTITION_SERVICE_LIFERAFT_TIMER,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_REASON,
  PARTITION_SERVICE_ROLE,
  PARTITION_SERVICE_SQL_FRAGMENT,
  PARTITION_SERVICE_TYPE,
  PARTITION_SERVICE_VALUE,
  PartitionRaftStorage,
  RaftRole,
  ReplicaStatus,
  SERVICE_TYPE,
  SQLiteLogAdapter,
  SYSTEM_TABLE_NAME,
  TABLES,
  applyRuntimeRaftTiming,
  assertCritical,
  computeReplicaElectionTimeouts,
  fs,
  path,
  resolveCanonicalPartitionLeaderObservation,
  resolveRaftTransportDeliveryOptions,
  wireReplicaLifecycleEvents,
} = PARTITION_SERVICE_SHARED;

class PartitionServiceRaftInitBase extends PartitionServiceCoreBase {
  /**
   * Join newly visible peers and replace moved peer addresses using the
   * authoritative services cache. Missing rows are ignored conservatively.
   * @private
   */
  reconcileRaftPeersFromCache() {
    reconcileRaftPeersFromCacheForService(this);
  }
  /**
   * Read one system table row from the local cache when present.
   * @param {string} tableName
   * @param {Function} predicate
   * @return {Object|null}
   * @private
   */
  getCachedSystemTableRow(tableName, predicate) {
    if (!this.systemTableCache || typeof predicate !== 'function') {
      return null;
    }
    if (typeof this.systemTableCache.filter === 'function') {
      const rows = this.systemTableCache.filter(tableName, predicate);
      return rows[0] || null;
    }
    if (typeof this.systemTableCache.getAll === 'function') {
      const rows = this.systemTableCache.getAll(tableName) || [];
      return rows.find(predicate) || null;
    }
    return null;
  }
  /**
   * Read matching system table rows from the local cache when present.
   * @param {string} tableName
   * @param {Function} predicate
   * @return {Array<Object>}
   * @private
   */
  getCachedSystemTableRows(tableName, predicate) {
    if (!this.systemTableCache || typeof predicate !== 'function') {
      return [];
    }
    if (typeof this.systemTableCache.filter === 'function') {
      return this.systemTableCache.filter(tableName, predicate);
    }
    if (typeof this.systemTableCache.getAll === 'function') {
      const rows = this.systemTableCache.getAll(tableName) || [];
      return rows.filter(predicate);
    }
    return [];
  }
  /**
   * Resolve the current leader replica from canonical owner-row metadata.
   * Owner rows are the only canonical leader truth for partition routing; if
   * leader_node_id is missing or stale, fail closed instead of deriving from
   * services.raft_role.
   * @return {string|null}
   * @private
   */
  resolveLeaderIdFromMetadata() {
    const serviceRows = this.getCachedSystemTableRows(
      TABLES.SERVICES,
      (service) =>
        service?.[COLUMN.PARTITION_ID] === this.partitionId &&
        service?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
        service?.[COLUMN.STATUS] !== ReplicaStatus.FAILED &&
        service?.[COLUMN.STATUS] !== ReplicaStatus.REMOVED,
    );
    if (serviceRows.length === 0) {
      return null;
    }
    const resolveLeaderReplicaId = (leaderNodeId) => {
      if (
        typeof leaderNodeId !== 'string' ||
        leaderNodeId.length === 0
      ) {
        return null;
      }
      const leaderReplica = serviceRows.find(
        (service) => service?.[COLUMN.NODE_ID] === leaderNodeId,
      );
      const leaderReplicaId =
        leaderReplica?.[COLUMN.REPLICA_ID] ||
        leaderReplica?.[COLUMN.SERVICE_ID] ||
        null;
      return typeof leaderReplicaId === 'string' &&
        leaderReplicaId.length > 0 ?
        leaderReplicaId :
        null;
    };
    const partitionRow = this.getCachedSystemTableRow(
      TABLES.PARTITIONS,
      (partition) => partition?.[COLUMN.PARTITION_ID] === this.partitionId,
    );
    const leaderObservation = resolveCanonicalPartitionLeaderObservation({
      partition: partitionRow,
      partitionPresent: partitionRow !== null,
      serviceRows,
    });
    if (
      leaderObservation?.state !==
      CANONICAL_PARTITION_LEADER_OBSERVATION_STATE.AVAILABLE
    ) {
      return null;
    }
    return resolveLeaderReplicaId(leaderObservation?.leaderNodeId);
  }
  /**
   * Seed leader identity from the startup leader-address hint when joining
   * an already-established group. Stable joins may not observe a fresh Raft
   * leader-change event before learner promotion needs to run.
   * @return {string|null}
   * @private
   */
  resolveLeaderIdFromHint() {
    if (!this.leaderAddressHint) {
      return null;
    }
    try {
      const parsed = AddressManager.getInstance().parse(this.leaderAddressHint);
      return parsed.serviceType === ENTITY_TYPE.PARTITION ?
        parsed.serviceId :
        null;
    } catch (_parseErr) {
      return null;
    }
  }
  /**
   * Report partition initialization progress stage.
   * @param {string} stage - Initialization stage.
   * @param {Object} details - Additional stage details.
   * @private
   */
  reportInitializationStage(stage, details = {}) {
    if (!this.onInitializationStage) {
      return;
    }
    try {
      this.onInitializationStage({
        stage,
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        ...details,
      });
    } catch (error) {
      this.logger.warn(PARTITION_SERVICE_LOG_MSG.INIT_STAGE_CALLBACK_FAILED, {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        stage,
        error: error.message,
      });
    }
  }
  /**
   * Warm the partition HLC from the maximum HLC over the committed Raft log, so
   * a restarted node never emits an HLC below one it previously committed.
   * One-time full scan of the committed prefix at init. NOTE: `_raft_log` is not
   * compacted, so this is O(committed-log-size); it is acceptable because init is
   * not re-entered, but a future optimization could tail-bound the scan once HLCs
   * are guaranteed monotonic along the log (they are, post merge-on-apply, for
   * entries written after this fix ships). Best-effort and never fatal to init.
   */
  warmHlcFromCommittedLog() {
    try {
      if (!this.logAdapter ||
        typeof this.logAdapter.getCommittedIndex !== 'function' ||
        typeof this.logAdapter.getRange !== 'function') {
        return;
      }
      const committedIndex = this.logAdapter.getCommittedIndex();
      if (!Number.isFinite(committedIndex) || committedIndex <= 0) {
        return;
      }
      const entries = this.logAdapter.getRange(1, committedIndex);
      let maxHlc = null;
      for (const entry of entries) {
        const witnessed = HLCTimestamp.tryFromString(entry?.command?.timestamp);
        if (witnessed && (maxHlc === null || witnessed.compare(maxHlc) > 0)) {
          maxHlc = witnessed;
        }
      }
      if (maxHlc) {
        this.hlcClock.update(maxHlc);
      }
    } catch (error) {
      this.logger.warn(PARTITION_SERVICE_LOG_MSG.APPLYING_COMMITTED_ENTRY, {
        partitionId: this.partitionId,
        hlcWarmFailed: true,
        error: error.message,
      });
    }
  }
  /**
   * Initialize the partition service.
   * Uses liferaft library for Raft consensus with simplified transport.
   * Requirements: 8.1, 10.1, 10.2, 10.3, 10.4, 10.5
   * @return {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }
    this.reportInitializationStage(PARTITION_SERVICE_INIT_STAGE.STARTING, {
      partitionId: this.partitionId,
      tableId: this.tableId,
      replicaId: this.replicaId,
      nodeId: this.nodeId,
      replicaCount: this.replicaIds.length,
      dbPath: this.dbPath,
    });
    if (!this.suppressLifecycleLogs) {
      this.logger.info(PARTITION_SERVICE_LOG_MSG.INITIALIZING, {
        partitionId: this.partitionId,
        tableId: this.tableId,
        replicaId: this.replicaId,
        nodeId: this.nodeId,
        replicaCount: this.replicaIds.length,
        dbPath: this.dbPath,
      });
    }
    if (this.dbPath !== PARTITION_SERVICE_DEFAULT.MEMORY_DB_PATH) {
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, {recursive: true});
        this.logger.debug(PARTITION_SERVICE_LOG_MSG.CREATED_PARTITION_DIR, {
          path: dbDir,
        });
      }
    }
    this.reportInitializationStage(PARTITION_SERVICE_INIT_STAGE.OPENING_DB, {
      dbPath: this.dbPath,
    });
    this.db = new Database(this.dbPath);
    this.db.pragma(PARTITION_SERVICE_DB.PRAGMA_JOURNAL_MODE);
    this.db.pragma(PARTITION_SERVICE_DB.PRAGMA_SYNCHRONOUS);
    this.logAdapter = new SQLiteLogAdapter(this.db, null, this.logger);
    this.storage = new PartitionRaftStorage(
      this.db,
      this.partitionId,
      this.logAdapter,
    );
    if (this.schema) {
      this.createTable();
    }
    if (this.transport) {
      this.transport.register(
        this.unifiedAddress,
        this.handleTransportMessage.bind(this),
      );
    }
    this.role = RaftRole.FOLLOWER;
    const config = ConfigurationManager.getInstance();
    const heartbeatMs =
      config.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS) ||
      PARTITION_SERVICE_VALUE.LIFERAFT_HEARTBEAT_DEFAULT_MS;
    const baseElectionMinMs =
      config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS) ||
      PARTITION_SERVICE_VALUE.LIFERAFT_ELECTION_MIN_DEFAULT_MS;
    const baseElectionMaxMs =
      config.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS) ||
      PARTITION_SERVICE_VALUE.LIFERAFT_ELECTION_MAX_DEFAULT_MS;
    const tickIntervalMs = config.get(CONFIG_KEY.RAFT_TICK_INTERVAL_MS);
    const {electionMinMs, electionMaxMs} = computeReplicaElectionTimeouts({
      replicaId: this.replicaId,
      replicaIds: this.replicaIds,
      baseElectionMinMs,
      baseElectionMaxMs,
      electionJitterPerReplicaMs:
        PARTITION_SERVICE_VALUE.ELECTION_JITTER_PER_REPLICA_MS,
    });
    this.raftTimingConfig = {
      heartbeatMs,
      baseElectionMinMs,
      baseElectionMaxMs,
      electionMinMs,
      electionMaxMs,
      tickIntervalMs: Number.isFinite(tickIntervalMs) ? tickIntervalMs : null,
    };
    const self = this;
    const deferElection = this.deferElection;
    class RaftNode extends LifeRaft {
      /**
       * Override initialize to support deferred election start.
       * When deferElection is true, we don't start the heartbeat timer.
       * Call startElection() later to begin the election process.
       * @param {Object} options - Initialization options.
       * @param {Function} callback - Completion callback.
       */
      initialize(options, callback) {
        if (deferElection) {
          self.logger.debug(
            PARTITION_SERVICE_LOG_MSG.DEFERRING_ELECTION_START,
            {replicaId: self.replicaId, partitionId: self.partitionId},
          );
          if (callback) callback();
        } else {
          if (callback) callback();
        }
      }
      /**
       * Write method for sending Raft messages to peers.
       * Called by liferaft when it needs to communicate with other nodes.
       * Sends packets directly to transport without type conversion.
       * Note: When liferaft calls node.write(), 'this' is the cloned node
       * representing the peer, so 'this.address' is the destination address.
       * Requirements: 10.2, 10.3, 10.4
       * @param {Object} packet - Raft protocol packet (packet.address is sender)
       * @param {Function} callback - Completion callback
       */
      write(packet, callback) {
        const peerAddress = self.buildPeerAddress(this.address);
        self.transport
          .deliver(
            peerAddress,
            packet,
            resolveRaftTransportDeliveryOptions({
              ...packet,
              targetAddress: peerAddress,
            }),
          )
          .then((result) => callback(null, result))
          .catch((err) => callback(err));
      }
    }
    // Restart recovery reloads committed state from the durable DB without
    // re-applying entries through applyCommittedEntry, so a fresh HLC clock would
    // not witness already-committed HLCs and could regress below a value this node
    // previously committed. Warm the clock from the max committed HLC on the log.
    this.warmHlcFromCommittedLog();
    const logAdapter = this.logAdapter;
    this.raft = new RaftNode(this.unifiedAddress, {
      [PARTITION_SERVICE_LIFERAFT_TIMER.HEARTBEAT]: heartbeatMs,
      [PARTITION_SERVICE_LIFERAFT_TIMER.ELECTION_MIN]: electionMinMs,
      [PARTITION_SERVICE_LIFERAFT_TIMER.ELECTION_MAX]: electionMaxMs,
      [PARTITION_SERVICE_LIFERAFT_TIMER.LOG]: function() {
        return logAdapter;
      },
    });
    if (this.deferElection && this.raft) {
      this.raftProvider.clearTimers(
        this.raft,
        PARTITION_SERVICE_LIFERAFT_TIMER.HEARTBEAT_ELECTION,
      );
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.CLEARED_LIFERAFT_TIMERS, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
      });
    }
    const isSingleReplica = () => {
      const peerCount = Array.isArray(this.raft?.nodes) ?
        this.raft.nodes.length :
        0;
      return this.replicaIds.length === 1 && peerCount === 0;
    };
    const shouldIgnoreDemotionEvent = (eventName) => {
      if (isSingleReplica() && this.isLeader) {
        return true;
      }
      const isJoiningLearner =
        this.isJoiningExistingGroup === true && this.role === RaftRole.LEARNER;
      if (!isJoiningLearner) {
        return false;
      }
      if (
        eventName !== PARTITION_SERVICE_ROLE.FOLLOWER &&
        eventName !== PARTITION_SERVICE_ROLE.CANDIDATE
      ) {
        return false;
      }
      if (this.raft) {
        this.raftProvider.clearTimers(
          this.raft,
          PARTITION_SERVICE_LIFERAFT_TIMER.HEARTBEAT_ELECTION,
        );
      }
      return true;
    };
    if (this.isJoiningExistingGroup) {
      this.role = RaftRole.LEARNER;
      this.logger.info(PARTITION_SERVICE_LOG_MSG.STARTING_AS_LEARNER, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        promotionDelayMs: this.learnerPromotionDelayMs,
      });
      this.scheduleLearnerPromotion(
        PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.INITIAL_DELAY,
      );
    }
    wireReplicaLifecycleEvents(this, {
      events: {
        LEADER: PARTITION_SERVICE_ROLE.LEADER,
        FOLLOWER: PARTITION_SERVICE_ROLE.FOLLOWER,
        CANDIDATE: PARTITION_SERVICE_ROLE.CANDIDATE,
        COMMIT: PARTITION_SERVICE_REASON.COMMIT,
        LEADER_CHANGE: PARTITION_SERVICE_REASON.LEADER_CHANGE,
        TERM_CHANGE: PARTITION_SERVICE_REASON.TERM_CHANGE,
      },
      roles: RaftRole,
      getCurrentTerm: () => this.raftProvider.getCurrentTerm(this.raft),
      normalizeLeaderId: (candidate) =>
        this.normalizeLeaderReplicaId(candidate),
      shouldIgnoreDemotionEvent,
      onLeader: ({term}) => {
        this.storage.currentTerm = term;
        this.scheduleLeaderOwnedActivation(term);
      },
      onFollower: ({term}) => {
        this.storage.currentTerm = term;
        this.cancelLeaderOwnedActivation();
        this.updateRebalancerLeadership();
      },
      onCandidate: ({term}) => {
        this.storage.currentTerm = term;
        this.cancelLeaderOwnedActivation();
        this.updateRebalancerLeadership();
      },
      onCommit: (command) => {
        this.applyCommittedEntry(command);
      },
      onLeaderChange: ({leaderId}) => {
        this.logger.debug(PARTITION_SERVICE_LOG_MSG.LEADER_CHANGED, {
          newLeader: leaderId,
          partitionId: this.partitionId,
        });
      },
      onTermChange: ({term}) => {
        this.storage.currentTerm = term;
      },
    });
    const totalPeerCount = Math.max(0, this.replicaIds.length - 1);
    let joinedPeerCount = 0;
    this.reportInitializationStage(PARTITION_SERVICE_INIT_STAGE.JOINING_PEERS, {
      peerTotal: totalPeerCount,
      peerJoined: joinedPeerCount,
    });
    for (const peerId of this.replicaIds) {
      if (peerId !== this.replicaId) {
        const peerAddress = this.buildPeerAddress(peerId);
        if (!this.suppressLifecycleLogs) {
          this.logger.info(PARTITION_SERVICE_LOG_MSG.JOINING_PEER_ADDRESS, {
            peerId,
            peerAddress,
            replicaId: this.replicaId,
            partitionId: this.partitionId,
            addressFormat: peerAddress.includes(
              PARTITION_SERVICE_ADDRESS.SEPARATOR,
            ) ?
              PARTITION_SERVICE_ADDRESS.FORMAT_UNIFIED :
              PARTITION_SERVICE_ADDRESS.FORMAT_SIMPLE,
          });
        }
        this.raftProvider.joinPeer(this.raft, peerAddress);
        joinedPeerCount += 1;
        this.reportInitializationStage(
          PARTITION_SERVICE_INIT_STAGE.JOINED_PEER,
          {
            peerId,
            peerAddress,
            peerTotal: totalPeerCount,
            peerJoined: joinedPeerCount,
          },
        );
      }
    }
    this.reconcileRaftPeersFromCache();
    this.maybeInitializeRebalancer();
    if (this.replicaIds.length === 1) {
      assertCritical(
        this.raft &&
          typeof this.raft.change === PARTITION_SERVICE_TYPE.FUNCTION,
        PARTITION_SERVICE_ERROR_MSG.SINGLE_REPLICA_RAFT_OWNER_REQUIRED,
        {partitionId: this.partitionId, replicaId: this.replicaId},
      );
      this.raft.change({state: LifeRaft.LEADER});
      this.raft.leader = this.unifiedAddress;
      this.logger.info(PARTITION_SERVICE_LOG_MSG.SINGLE_REPLICA_LEADER, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
      });
    } else {
      this.queueRoleUpdate(this.role);
    }
    this.startPeriodicSizeUpdates();
    this.startPreparedStateHoldTimeoutSweep();
    await this.updatePartitionSize();
    this.initialized = true;
    this.reportInitializationStage(PARTITION_SERVICE_INIT_STAGE.READY, {
      sizeBytes: this.sizeBytes,
      peerTotal: totalPeerCount,
      peerJoined: joinedPeerCount,
    });
    if (!this.suppressLifecycleLogs) {
      this.logger.info(PARTITION_SERVICE_LOG_MSG.INITIALIZED, {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        sizeBytes: this.sizeBytes,
      });
    }
    this.emit(PARTITION_SERVICE_EVENT.INITIALIZED, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });
  }
  /**
   * Start the Raft election timer.
   * Call this after all replicas in the group have been created and registered.
   * This prevents election storms when multiple replicas are created on the same node.
   * If deferElection was false, this is a no-op (election already started).
   */
  startElection() {
    if (this.electionStarted) {
      return;
    }
    if (this.replicaIds.length === 1) {
      this.electionStarted = true;
      return;
    }
    this.electionStarted = true;
    if (this.raft) {
      this.logger.info(PARTITION_SERVICE_LOG_MSG.STARTING_ELECTION_TIMER, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        peerCount: this.replicaIds.length - 1,
      });
      this.raftProvider.startElectionTimer(this.raft);
    }
  }
  /**
   * Apply raft timing configuration to this live replica.
   * @param {Object} timingConfig
   * @param {number} timingConfig.heartbeatIntervalMs
   * @param {number} timingConfig.electionTimeoutMinMs
   * @param {number} timingConfig.electionTimeoutMaxMs
   * @param {number} [timingConfig.tickIntervalMs]
   * @return {boolean} True when applied to an initialized raft instance.
   */
  applyRaftTimingConfig(timingConfig = {}) {
    const heartbeatMs = timingConfig.heartbeatIntervalMs;
    const baseElectionMinMs = timingConfig.electionTimeoutMinMs;
    const baseElectionMaxMs = timingConfig.electionTimeoutMaxMs;
    const previousTickIntervalMs =
      this.raftTimingConfig?.tickIntervalMs || null;
    const hasTickInterval = Object.prototype.hasOwnProperty.call(
      timingConfig,
      'tickIntervalMs',
    );
    const tickIntervalMs = timingConfig.tickIntervalMs;
    if (
      !Number.isFinite(heartbeatMs) ||
      !Number.isFinite(baseElectionMinMs) ||
      !Number.isFinite(baseElectionMaxMs) ||
      (hasTickInterval &&
        (!Number.isFinite(tickIntervalMs) || tickIntervalMs <= 0)) ||
      baseElectionMinMs > baseElectionMaxMs
    ) {
      return false;
    }
    const {electionMinMs, electionMaxMs, jitterMs} =
      computeReplicaElectionTimeouts({
        replicaId: this.replicaId,
        replicaIds: this.replicaIds,
        baseElectionMinMs,
        baseElectionMaxMs,
        electionJitterPerReplicaMs:
          PARTITION_SERVICE_VALUE.ELECTION_JITTER_PER_REPLICA_MS,
      });
    this.raftTimingConfig = {
      heartbeatMs,
      baseElectionMinMs,
      baseElectionMaxMs,
      electionMinMs,
      electionMaxMs,
      tickIntervalMs: hasTickInterval ?
        tickIntervalMs :
        this.raftTimingConfig?.tickIntervalMs || null,
    };
    const shouldRearmTimer =
      this.replicaIds.length > 1 &&
      (!this.deferElection || this.electionStarted);
    const applied = applyRuntimeRaftTiming({
      raft: this.raft,
      heartbeatMs,
      electionMinMs,
      electionMaxMs,
      rearmTimer: shouldRearmTimer,
    });
    if (!applied) {
      return false;
    }
    const tickChanged =
      hasTickInterval && tickIntervalMs !== previousTickIntervalMs;
    const tickRuntimeApplied =
      !tickChanged || this.applyRuntimeTickInterval(tickIntervalMs);
    this.logger.info(PARTITION_SERVICE_LOG_MSG.APPLIED_RUNTIME_RAFT_TIMING, {
      partitionId: this.partitionId,
      replicaId: this.replicaId,
      heartbeatMs,
      electionMinMs,
      electionMaxMs,
      tickIntervalMs: hasTickInterval ? tickIntervalMs : null,
      tickRuntimeApplied,
      jitterMs,
      rearmTimer: shouldRearmTimer,
    });
    return tickRuntimeApplied;
  }
  /**
   * Apply raft provider tick interval when supported by the active provider.
   * @param {number} tickIntervalMs
   * @return {boolean} True when applied to a live raft instance.
   */
  applyRuntimeTickInterval(tickIntervalMs) {
    if (
      !this.raft ||
      !Number.isFinite(tickIntervalMs) ||
      tickIntervalMs <= 0
    ) {
      return false;
    }
    if (typeof this.raft.setTickInterval === PARTITION_SERVICE_TYPE.FUNCTION) {
      this.raft.setTickInterval(tickIntervalMs);
      return true;
    }
    if (
      typeof this.raft.configureTickInterval === PARTITION_SERVICE_TYPE.FUNCTION
    ) {
      this.raft.configureTickInterval(tickIntervalMs);
      return true;
    }
    if (
      Object.prototype.hasOwnProperty.call(
        this.raft,
        PARTITION_SERVICE_LITERAL.TICKINTERVALMS,
      )
    ) {
      this.raft.tickIntervalMs = tickIntervalMs;
      return true;
    }
    return false;
  }
  /**
   * Create the table based on schema.
   * @private
   */
  createTable() {
    if (!this.schema || !this.schema.columns) {
      return;
    }
    const columns = this.schema.columns
      .map((col) => {
        let def = `${col.name} ${col.type}`;
        if (col.primaryKey) {
          def += PARTITION_SERVICE_SQL_FRAGMENT.PRIMARY_KEY;
        }
        if (col.notNull) {
          def += PARTITION_SERVICE_SQL_FRAGMENT.NOT_NULL;
        }
        if (col.defaultValue !== void 0) {
          def += ` DEFAULT ${col.defaultValue}`;
        }
        return def;
      })
      .join(PARTITION_SERVICE_SQL_FRAGMENT.COMMA_SPACE);
    const sql = `CREATE TABLE IF NOT EXISTS ${this.tableName} (${columns})`;
    this.db.exec(sql);
    this.ensureNodesTableColumns();
    this.ensureTablesTableColumns();
    this.ensureMessageGroupsTableColumns();
    this.ensurePartitionsTableColumns();
    this.ensureSqlTransactionsTableColumns();
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.CREATED_TABLE, {
      tableName: this.tableName,
      partitionId: this.partitionId,
    });
  }
  /**
   * Ensure nodes table includes connection_state column for readiness tracking.
   * @private
   */
  ensureNodesTableColumns() {
    if (this.tableName !== SYSTEM_TABLE_NAME.NODES) {
      return;
    }
    const columns = this.db
      .prepare(`PRAGMA table_info(${this.tableName})`)
      .all();
    const hasConnectionState = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.CONNECTION_STATE,
    );
    const hasLegacyWsConnectionState = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.LEGACY_WS_CONNECTION_STATE,
    );
    const hasCapabilities = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.CAPABILITIES,
    );
    const hasReadyLease = columns.some(
      (col) => col.name === PARTITION_SERVICE_COLUMN.READY_LEASE_EXPIRES_AT,
    );
    let connectionStateAdded = false;
    if (!hasConnectionState) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_CONNECTION_STATE,
      );
      connectionStateAdded = true;
      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_CONNECTION_STATE, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }
    if (connectionStateAdded && hasLegacyWsConnectionState) {
      this.db.exec(
        `UPDATE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.BACKFILL_CONNECTION_STATE_FROM_LEGACY_WS,
      );
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG.MIGRATED_CONNECTION_STATE_FROM_LEGACY_WS,
        {tableName: this.tableName, partitionId: this.partitionId},
      );
    }
    if (!hasCapabilities) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_CAPABILITIES,
      );
      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_CAPABILITIES, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }
    if (!hasReadyLease) {
      this.db.exec(
        `ALTER TABLE ${this.tableName} ` +
          PARTITION_SERVICE_COLUMN_SQL.ADD_READY_LEASE_EXPIRES_AT,
      );
      this.logger.info(PARTITION_SERVICE_LOG_MSG.ADDED_READY_LEASE, {
        tableName: this.tableName,
        partitionId: this.partitionId,
      });
    }
  }
}
export {PartitionServiceRaftInitBase};
