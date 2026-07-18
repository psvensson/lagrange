import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {SQLQueryEngineWriteFailureMethods} from './sql-query-engine-write-failure-methods.js';
import {
  buildControlPlaneWorkloadProfile,
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../control-plane/control-plane-workload-profile.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_FUNCTION = 'function';

const {
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  PRESSURE_WORK_CLASS,
  QUERY_LOG_MSG,
  TABLES,
  createEmptyTransactionRecoveryReplaySummary,
} = SQL_QUERY_ENGINE_SHARED;

const TRANSACTION_CONTROL_MUTATION_WORKLOAD_TABLES = new Set([
  TABLES.SQL_TRANSACTIONS,
  TABLES.SQL_TRANSACTION_PARTICIPANTS,
]);

class SQLQueryEngineTransactionRecoveryMethods
  extends SQLQueryEngineWriteFailureMethods {
  /**
   * Recover distributed transaction state from system cache snapshots.
   * @private
   */
  recoverDistributedTransactionStateFromCache() {
    if (this.transactionStateRecovered || !this.systemCache) {
      return;
    }
    if (
      typeof this.transactionCoordinator.recoverFromSystemTables !== LOCAL_STR_FUNCTION
    ) {
      this.transactionStateRecovered = true;
      return;
    }

    const transactions = this.loadSystemTableRows(TABLES.SQL_TRANSACTIONS);
    if (transactions.length === 0) {
      return;
    }

    const participants = this.loadSystemTableRows(
      TABLES.SQL_TRANSACTION_PARTICIPANTS,
    );
    const writeOperations = this.loadSystemTableRows(
      TABLES.SQL_WRITE_OPERATIONS,
    );

    this.transactionCoordinator.recoverFromSystemTables({
      transactions,
      participants,
      writeOperations,
    });
    this.transactionStateRecovered = true;
  }

  /**
   * Replay recovered in-flight distributed transactions, if supported.
   * @return {Promise<Object>} Replay summary.
   * @private
   */
  resumeRecoveredDistributedTransactions() {
    if (
      typeof this.transactionCoordinator.resumeRecoveredTransactions !==
      LOCAL_STR_FUNCTION
    ) {
      const summary = createEmptyTransactionRecoveryReplaySummary();
      this.lastTransactionRecoveryReplayResult = summary;
      return Promise.resolve(summary);
    }
    if (this.transactionRecoveryReplayPromise) {
      return this.transactionRecoveryReplayPromise;
    }

    this.transactionRecoveryReplayPromise = this.transactionCoordinator
      .resumeRecoveredTransactions()
      .then((summary) => {
        const normalizedSummary =
          summary || createEmptyTransactionRecoveryReplaySummary();
        this.lastTransactionRecoveryReplayResult = normalizedSummary;
        return normalizedSummary;
      })
      .catch((error) => {
        this.logger.warn(QUERY_LOG_MSG.DISTRIBUTED_TX_RECOVERY_REPLAY_FAILED, {
          error: error.message,
        });
        const summary = {
          totalRecovered: 0,
          resumed: 0,
          failed: 1,
          results: [],
          error: error.message,
        };
        this.lastTransactionRecoveryReplayResult = summary;
        return summary;
      })
      .finally(() => {
        this.transactionRecoveryReplayPromise = null;
      });

    return this.transactionRecoveryReplayPromise;
  }

  /**
   * Await currently running transaction recovery replay, if any.
   * @return {Promise<Object>} Replay summary.
   */
  async waitForDistributedTransactionRecoveryReplay() {
    if (!this.transactionRecoveryReplayPromise) {
      return this.lastTransactionRecoveryReplayResult;
    }
    return this.transactionRecoveryReplayPromise;
  }

  /**
   * Load rows for one table from system cache.
   * @param {string} tableName - System table name.
   * @return {Object[]} Cached rows.
   * @private
   */
  loadSystemTableRows(tableName) {
    if (!this.systemCache) {
      return [];
    }
    if (typeof this.systemCache.getAll === LOCAL_STR_FUNCTION) {
      return this.systemCache.getAll(tableName) || [];
    }
    if (typeof this.systemCache.filter === LOCAL_STR_FUNCTION) {
      return this.systemCache.filter(tableName, () => true) || [];
    }
    return [];
  }

  /**
   * Load distributed transaction recovery rows from system cache snapshots.
   * @return {{transactions: Object[], participants: Object[], writeOperations: Object[]}}
   *   Recovery payload.
   * @private
   */
  loadDistributedTransactionRecoveryState() {
    return {
      transactions: this.loadSystemTableRows(TABLES.SQL_TRANSACTIONS),
      participants: this.loadSystemTableRows(
        TABLES.SQL_TRANSACTION_PARTICIPANTS,
      ),
      writeOperations: this.loadSystemTableRows(TABLES.SQL_WRITE_OPERATIONS),
    };
  }

  /**
   * Check whether distributed transaction metadata can be persisted through the
   * canonical control-plane mutation ingress.
   * @return {boolean}
   * @private
   */
  canPersistDistributedTransactionState() {
    const gateway = this.getControlPlaneSystemTableGateway();
    if (typeof gateway?.supportsMutationSubmission === LOCAL_STR_FUNCTION) {
      return gateway.supportsMutationSubmission();
    }
    return Boolean(this.cdcIntegrationService);
  }

  /**
   * Build canonical mutation options for distributed transaction metadata.
   * Transaction state writes are durable-control-plane metadata and must not
   * fail on read-model cache lag under pressure.
   *
   * @param {string} tableName
   * @param {Object} [options={}]
   * @param {string|null} [options.coalescingKey]
   * @param {string} [options.workClass]
   * @return {Object}
   * @private
   */
  buildDistributedTransactionMutationOptions(tableName, options = {}) {
    const requestedWorkClass =
      options?.workClass || PRESSURE_WORK_CLASS.CRITICAL;
    const workloadClass =
      typeof options?.workloadClass === LOCAL_STR_STRING &&
      options.workloadClass.length > 0 ?
        options.workloadClass :
        TRANSACTION_CONTROL_MUTATION_WORKLOAD_TABLES.has(tableName) ?
          CONTROL_PLANE_WORKLOAD_CLASS.TRANSACTION_CONTROL_MUTATION :
          null;
    const workloadProfile = workloadClass ?
      buildControlPlaneWorkloadProfile(workloadClass, {
        workClass: requestedWorkClass,
      }) :
      null;
    const workClass = workloadProfile?.workClass || requestedWorkClass;
    const mutationOptions = {
      workClass,
      deliveryPriority:
        workClass === PRESSURE_WORK_CLASS.CRITICAL ?
          'critical' :
          this.resolveRoutedDeliveryPriority(tableName),
      skipCacheWait: true,
      mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
    };
    if (workloadProfile) {
      mutationOptions.workloadClass = workloadProfile.workloadClass;
    }
    const coalescingKey =
      typeof options?.coalescingKey === LOCAL_STR_STRING ?
        options.coalescingKey :
        '';
    if (coalescingKey.length > 0) {
      mutationOptions.coalescingKey = coalescingKey;
    }
    return mutationOptions;
  }
}

export {SQLQueryEngineTransactionRecoveryMethods};
