import os from 'os';
import {assertCritical} from '../../utils/assert.js';
import {NodeStorageBudgetSetup} from './node-storage-budget-setup.js';
import {NodeService} from '../../node/node-service.js';
import {
  registerBuiltInMetaServiceEndpoints,
} from './meta-service-definition-registration.js';
import {createBootstrapCacheHydrationApplier} from
  '../bootstrap-cache-hydration-applier.js';
import {
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../../control-plane/control-plane-error-classification.js';
import {
  JOINING_ERROR_MSG,
  JOINING_LOG_MSG,
} from '../node-joining-constants.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  NUM,
  SERVICE_STATUS,
  STATE,
  TABLES,
  TIME_MS,
  TRANSPORT_TYPE,
  TYPEOF,
} from '../../constants/index.js';
import {resolveAdvertisedWebSocketAddress} from
  '../../transport/node-address-resolution.js';

const LOG_META_ENDPOINT_REGISTER_FAILED =
  'Failed to register built-in meta service endpoints';
const LOG_NODE_REGISTER_ERROR_PREFIX =
  'Failed to register node: ';
const LOG_JOIN_ADMISSION_WRITE_RETRY =
  'Retrying join admission system-table write after retryable failure';
const JOIN_ADMISSION_WRITE_RETRY_TIMEOUT_MS = TIME_MS.SECOND * NUM.TWO;
const JOIN_ADMISSION_WRITE_RETRY_BASE_DELAY_MS = NUM.HUNDRED;
const JOIN_ADMISSION_WRITE_RETRY_MAX_DELAY_MS = TIME_MS.SECOND;

const hasFunction = (value) => typeof value === TYPEOF.FUNCTION;

class NodeRegistrationOwner {
  constructor(options = {}) {
    this.nodeId = options.nodeId;
    this.nodeAddress = options.nodeAddress;
    this.advertisedNodeWsAddress = options.advertisedNodeWsAddress || null;
    this.delegates = options.delegates || {};
  }

  async registerNodeInCluster() {
    const logger = this.delegates.getLogger();

    logger.info('Registering node in cluster', {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
    });

    assertCritical(
      this.delegates.getCdcIntegrationService()?.sqlQueryEngine,
      JOINING_ERROR_MSG.STATE_QUERY_ENGINE_REQUIRED,
    );

    const now = this.delegates.getNow()();
    const nodeRow = this.buildNodeRegistrationRow(now);

    try {
      const budgetService =
        this.delegates.getNodeStorageBudgetService();
      const {budgetRow, resolution} =
        await NodeStorageBudgetSetup.resolveWithoutPersist({
          budgetService,
          nodeRow,
          nodeId: this.nodeId,
        });

      const nodeUpsertResult = await this.upsertSystemTableRowWithRetry(
        TABLES.NODES,
        budgetRow,
        {admissionTarget: 'node membership publication'},
      );
      if (nodeUpsertResult?.success !== true) {
        throw new Error(
          `Failed to register node: ${nodeUpsertResult?.error}`,
        );
      }

      this.delegates.setJoinMembershipPublished?.(true);
      this.seedJoinTimeCacheRow(TABLES.NODES, {
        ...budgetRow,
        [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
        [COLUMN.LAST_HEARTBEAT]: now,
        [COLUMN.READY_LEASE_EXPIRES_AT]: null,
      });

      logger.info('Node registered in cluster', {
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        cpuCores: budgetRow?.[COLUMN.CPU_CORES] || null,
        memoryMb: budgetRow?.[COLUMN.MEMORY_MB] || null,
        diskGb: budgetRow?.[COLUMN.DISK_GB] || null,
        budgetBytes: resolution?.budgetBytes || null,
        budgetSource: resolution?.source || null,
      });

      const endpointRow =
        await this.registerNodeEndpoint(now);
      this.seedJoinTimeCacheRow(
        TABLES.NODE_ENDPOINTS,
        endpointRow,
      );

      const metaEndpointRows =
        await this.registerMetaServiceEndpoints();
      for (const metaEndpointRow of metaEndpointRows) {
        this.seedJoinTimeCacheRow(
          TABLES.SERVICE_ENDPOINTS,
          metaEndpointRow,
        );
      }

      this.delegates
        .setMessageGroupServiceEndpointsPublished?.(true);

      return {
        nodeRow: budgetRow,
        endpointRow,
        metaEndpointRows,
        resolution,
      };
    } catch (error) {
      const wrappedError = new Error(
        `${LOG_NODE_REGISTER_ERROR_PREFIX}${error.message}`,
      );
      wrappedError.cause = error;
      if (typeof error?.code === TYPEOF.STRING &&
        error.code.length > NUM.ZERO) {
        wrappedError.code = error.code;
      } else if (typeof error?.errorCode === TYPEOF.STRING &&
        error.errorCode.length > NUM.ZERO) {
        wrappedError.code = error.errorCode;
      }
      if (Number.isFinite(error?.retryAfterMs)) {
        wrappedError.retryAfterMs = Math.floor(error.retryAfterMs);
      }
      if (error?.retryable === false) {
        wrappedError.retryable = false;
      }
      if (error?.publicationDiagnostics &&
        typeof error.publicationDiagnostics === TYPEOF.OBJECT) {
        wrappedError.publicationDiagnostics =
          error.publicationDiagnostics;
      }
      logger.error('Failed to register node in cluster', {
        nodeId: this.nodeId,
        error: wrappedError.message,
      });
      throw wrappedError;
    }
  }

  buildNodeRegistrationRow(now) {
    const cpus = os.cpus();
    const totalMemoryBytes = os.totalmem();
    const totalMemoryMb = Math.floor(
      totalMemoryBytes / (NUM.THOUSAND * NUM.THOUSAND),
    );

    return {
      [COLUMN.NODE_ID]: this.nodeId,
      [COLUMN.NODE_ADDRESS]: this.nodeAddress,
      [COLUMN.CPU_CORES]: cpus.length,
      [COLUMN.MEMORY_MB]: totalMemoryMb,
      [COLUMN.DISK_GB]: NUM.HUNDRED,
      [COLUMN.CPU_USAGE_PERCENT]: NUM.ZERO,
      [COLUMN.MEMORY_USAGE_PERCENT]: NUM.ZERO,
      [COLUMN.DISK_USAGE_PERCENT]: NUM.ZERO,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.CAPABILITIES]: JSON.stringify(
        this.delegates.getNodeCapabilities?.() || [],
      ),
      [COLUMN.LAST_HEARTBEAT]: now,
      [COLUMN.CREATED_AT]: now,
    };
  }

  async registerNodeEndpoint(now) {
    const logger = this.delegates.getLogger();

    logger.info(JOINING_LOG_MSG.ENDPOINT_REGISTERING, {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
    });

    const endpointId = `ep-${this.nodeId}-ws`;
    const canonicalWsAddress =
      this.advertisedNodeWsAddress ||
      resolveAdvertisedWebSocketAddress({
        nodeAddress: this.nodeAddress,
        wsPort: this.delegates.getWsPort?.() || null,
      }) ||
      this.nodeAddress;

    const endpointData = {
      [COLUMN.ENDPOINT_ID]: endpointId,
      [COLUMN.NODE_ID]: this.nodeId,
      [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
      [COLUMN.ADDRESS]: canonicalWsAddress,
      [COLUMN.PRIORITY]: NUM.ZERO,
      [COLUMN.METADATA]: JSON.stringify({}),
      [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
      [COLUMN.CREATED_AT]: now,
      [COLUMN.UPDATED_AT]: now,
    };

    const endpointResult = await this.upsertSystemTableRowWithRetry(
      TABLES.NODE_ENDPOINTS,
      endpointData,
      {admissionTarget: 'node websocket endpoint publication'},
    );
    if (!endpointResult?.success) {
      throw new Error(
        `Failed to register endpoint: ${endpointResult?.error}`,
      );
    }

    logger.info(JOINING_LOG_MSG.ENDPOINT_REGISTERED, {
      nodeId: this.nodeId,
      endpointId,
      transportType: TRANSPORT_TYPE.WEBSOCKET,
      address: canonicalWsAddress,
    });
    return endpointData;
  }

  async registerMetaServiceEndpoints() {
    const logger = this.delegates.getLogger();

    try {
      const endpointRows = [];
      await registerBuiltInMetaServiceEndpoints({
        upsertRow: async (tableName, row) => {
          endpointRows.push(row);
          return this.upsertSystemTableRowWithRetry(
            tableName,
            row,
            {
              admissionTarget:
                'built-in meta service endpoint publication',
            },
          );
        },
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        advertisedNodeWsAddress: this.advertisedNodeWsAddress,
        wsPort: this.delegates.getWsPort?.(),
      });
      return endpointRows;
    } catch (error) {
      logger.error(
        LOG_META_ENDPOINT_REGISTER_FAILED,
        {nodeId: this.nodeId, error: error.message},
      );
      throw error;
    }
  }

  async upsertSystemTableRow(tableName, rowData) {
    const cdcIntegrationService =
      this.delegates.getCdcIntegrationService();
    const upsertOptions = this.getJoinTimeUpsertOptions();
    if (hasFunction(cdcIntegrationService?.upsertSystemTableRow)) {
      return cdcIntegrationService.upsertSystemTableRow(
        tableName,
        rowData,
        upsertOptions,
      );
    }

    const columns = Object.keys(rowData);
    const placeholders =
      columns.map(() => '?').join(', ');
    const sql =
      `INSERT INTO ${tableName} ` +
      `(${columns.join(', ')}) VALUES (${placeholders})`;
    const params = columns.map((column) => rowData[column]);
    return cdcIntegrationService.sqlQueryEngine
      .executeQuery(sql, params, upsertOptions);
  }

  async upsertSystemTableRowWithRetry(
    tableName,
    rowData,
    options = {},
  ) {
    const startMs = this.delegates.getNow()();
    const deadlineMs =
      startMs + this.getJoinAdmissionWriteRetryTimeoutMs();
    let nextDelayMs = JOIN_ADMISSION_WRITE_RETRY_BASE_DELAY_MS;
    let attempt = NUM.ZERO;

    while (true) {
      attempt += NUM.ONE;
      try {
        const result = await this.upsertSystemTableRow(
          tableName,
          rowData,
        );
        if (result?.success !== false) {
          return result;
        }
        if (!this.shouldRetryJoinAdmissionWrite(result, deadlineMs)) {
          return result;
        }
        nextDelayMs = await this.delayJoinAdmissionWriteRetry(
          deadlineMs,
          nextDelayMs,
          result,
          tableName,
          attempt,
          options,
        );
        continue;
      } catch (error) {
        if (!this.shouldRetryJoinAdmissionWrite(error, deadlineMs)) {
          throw error;
        }
        nextDelayMs = await this.delayJoinAdmissionWriteRetry(
          deadlineMs,
          nextDelayMs,
          error,
          tableName,
          attempt,
          options,
        );
      }
    }
  }

  getJoinTimeUpsertOptions() {
    const options = {deliveryPriority: 'critical'};
    if (this.delegates.getCdcSubscriptionsActive?.() !== true) {
      options.skipCacheWait = true;
    }
    return options;
  }

  seedJoinTimeCacheRow(tableName, rowData) {
    if (!rowData || typeof rowData !== TYPEOF.OBJECT) {
      return;
    }

    const systemTableCache =
      NodeService.getInstance().getSystemTableCache();
    if (
      !systemTableCache ||
      typeof systemTableCache.applySystemTableChange !==
        TYPEOF.FUNCTION
    ) {
      return;
    }

    void createBootstrapCacheHydrationApplier(systemTableCache)(
      tableName,
      'UPSERT',
      rowData,
    );
  }

  getJoinAdmissionWriteRetryTimeoutMs() {
    const configured =
      this.delegates.getConfig?.()?.joinAdmissionWriteRetryTimeoutMs;
    if (Number.isFinite(configured) && configured >= NUM.ZERO) {
      return Math.floor(configured);
    }
    return JOIN_ADMISSION_WRITE_RETRY_TIMEOUT_MS;
  }

  shouldRetryJoinAdmissionWrite(resultOrError, deadlineMs) {
    if (!isRetryableControlPlaneError(resultOrError)) {
      return false;
    }
    return this.delegates.getNow()() < deadlineMs;
  }

  async delayJoinAdmissionWriteRetry(
    deadlineMs,
    nextDelayMs,
    resultOrError,
    tableName,
    attempt,
    options = {},
  ) {
    const now = this.delegates.getNow()();
    const remainingMs = Math.max(NUM.ZERO, deadlineMs - now);
    if (remainingMs <= NUM.ZERO) {
      return nextDelayMs;
    }

    const retryAfterMs = getControlPlaneRetryAfterMs(resultOrError);
    const boundedDelayMs = Math.min(
      remainingMs,
      Math.min(
        JOIN_ADMISSION_WRITE_RETRY_MAX_DELAY_MS,
        Math.max(
          JOIN_ADMISSION_WRITE_RETRY_BASE_DELAY_MS,
          retryAfterMs > NUM.ZERO ? retryAfterMs : nextDelayMs,
        ),
      ),
    );

    this.delegates.getLogger().warn(
      LOG_JOIN_ADMISSION_WRITE_RETRY,
      {
        nodeId: this.nodeId,
        tableName,
        attempt,
        retryAfterMs:
          retryAfterMs > NUM.ZERO ? retryAfterMs : null,
        delayMs: boundedDelayMs,
        remainingMs,
        admissionTarget: options.admissionTarget || null,
        error:
          resultOrError?.error ||
          resultOrError?.message ||
          'retryable join admission write failure',
      },
    );

    await this.sleep(boundedDelayMs);
    return Math.min(
      JOIN_ADMISSION_WRITE_RETRY_MAX_DELAY_MS,
      Math.max(
        JOIN_ADMISSION_WRITE_RETRY_BASE_DELAY_MS,
        nextDelayMs * NUM.TWO,
      ),
    );
  }

  async sleep(delayMs) {
    const sleepImpl = this.delegates.getSleep?.();
    if (hasFunction(sleepImpl)) {
      await sleepImpl(delayMs);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

export {NodeRegistrationOwner};
