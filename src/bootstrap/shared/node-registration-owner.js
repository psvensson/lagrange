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
import {META_SERVICE_ID} from '../../constants/wasm-meta.js';
import {resolveAdvertisedWebSocketAddress} from
  '../../transport/node-address-resolution.js';
import {runRetryableControlPlaneWrite} from
  './retryable-control-plane-write.js';
import {
  MEMBERSHIP_LIFECYCLE_INTENT,
  resolveMembershipJoinIntentType,
} from '../../control-plane/membership-lifecycle-controller.js';
import {AuthoritativeControlPlaneView} from
  '../../control-plane/authoritative-control-plane-view.js';

const LOG_META_ENDPOINT_REGISTER_FAILED =
  'Failed to register built-in meta service endpoints';
const LOG_NODE_REGISTER_ERROR_PREFIX =
  'Failed to register node: ';
const LOG_JOIN_ADMISSION_WRITE_RETRY =
  'Retrying join admission system-table write after retryable failure';
const LOG_REUSING_DURABLE_REJOIN_MEMBERSHIP =
  'Reusing existing canonical membership for durable rejoin';
const JOIN_ADMISSION_WRITE_RETRY_TIMEOUT_MS = TIME_MS.SECOND * NUM.TWO;
const DURABLE_REJOIN_REQUIRED_SERVICE_IDS = Object.freeze([
  META_SERVICE_ID.POSTGRES_WIRE,
]);

const hasFunction = (value) => typeof value === TYPEOF.FUNCTION;
const normalizeString = (value) =>
  typeof value === TYPEOF.STRING ? value.trim() : '';

class NodeRegistrationOwner {
  constructor(options = {}) {
    this.nodeId = options.nodeId;
    this.nodeAddress = options.nodeAddress;
    this.advertisedNodeWsAddress = options.advertisedNodeWsAddress || null;
    this.delegates = options.delegates || {};
    this.authoritativeControlPlaneView = null;
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
      const existingMembership =
        await this.resolveExistingDurableRejoinMembership(now);
      if (existingMembership) {
        await this.refreshExistingDurableRejoinMembership(
          existingMembership,
        );
        this.activateExistingDurableRejoinMembership(
          existingMembership,
        );
        logger.info(LOG_REUSING_DURABLE_REJOIN_MEMBERSHIP, {
          nodeId: this.nodeId,
          nodeAddress: this.nodeAddress,
          reusedEndpointCount:
            NUM.ONE + existingMembership.metaEndpointRows.length,
        });
        return existingMembership;
      }

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

  async resolveExistingDurableRejoinMembership(now) {
    if (this.getJoinLifecycleIntentType() !==
      MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY) {
      return null;
    }

    const authoritativeNodeRow =
      await this.readAuthoritativeDurableRejoinNodeRow();
    if (!authoritativeNodeRow) {
      return null;
    }

    const cachedNodeAddress = normalizeString(
      authoritativeNodeRow[COLUMN.NODE_ADDRESS],
    );
    const currentNodeAddress = normalizeString(this.nodeAddress);
    if (cachedNodeAddress.length > NUM.ZERO &&
      currentNodeAddress.length > NUM.ZERO &&
      cachedNodeAddress !== currentNodeAddress) {
      return null;
    }

    const authoritativeEndpointRow =
      await this.readAuthoritativeNodeEndpointRow();
    if (!authoritativeEndpointRow) {
      return null;
    }

    const metaEndpointRows =
      await this.readAuthoritativeMetaEndpointRows();
    if (metaEndpointRows.length !==
      DURABLE_REJOIN_REQUIRED_SERVICE_IDS.length) {
      return null;
    }

    const reusedNodeRow = {
      ...authoritativeNodeRow,
      [COLUMN.STATUS]:
        authoritativeNodeRow[COLUMN.STATUS] || SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now,
      [COLUMN.READY_LEASE_EXPIRES_AT]: null,
    };
    return {
      nodeRow: reusedNodeRow,
      endpointRow: authoritativeEndpointRow,
      metaEndpointRows,
      resolution: {
        source: 'durable_rejoin_existing_membership',
      },
      reusedExistingMembership: true,
    };
  }

  async refreshExistingDurableRejoinMembership(existingMembership) {
    const nodeRow = existingMembership?.nodeRow || null;
    const refreshResult = await this.upsertSystemTableRowWithRetry(
      TABLES.NODES,
      nodeRow,
      {
        admissionTarget: 'durable rejoin membership refresh',
      },
    );
    if (!refreshResult?.success) {
      throw new Error(
        `Failed to refresh durable rejoin membership: ` +
        `${refreshResult?.error}`,
      );
    }
    return refreshResult;
  }

  activateExistingDurableRejoinMembership(existingMembership) {
    if (!existingMembership || typeof existingMembership !== TYPEOF.OBJECT) {
      return;
    }
    this.seedJoinTimeCacheRow(TABLES.NODES, existingMembership.nodeRow);
    this.seedJoinTimeCacheRow(
      TABLES.NODE_ENDPOINTS,
      existingMembership.endpointRow,
    );
    for (const metaEndpointRow of existingMembership.metaEndpointRows || []) {
      this.seedJoinTimeCacheRow(
        TABLES.SERVICE_ENDPOINTS,
        metaEndpointRow,
      );
    }
  }

  getJoinLifecycleIntentType() {
    const joinLifecycleIntentType =
      this.delegates.getJoinLifecycleIntentType?.();
    if (typeof joinLifecycleIntentType === TYPEOF.STRING &&
        joinLifecycleIntentType.length > NUM.ZERO) {
      return joinLifecycleIntentType;
    }
    return resolveMembershipJoinIntentType(
      this.delegates.getJoinStartupMode?.(),
    );
  }

  getAuthoritativeControlPlaneView() {
    if (this.authoritativeControlPlaneView) {
      this.authoritativeControlPlaneView.syncOwnerDependencies({
        cdcIntegrationService: this.delegates.getCdcIntegrationService?.(),
        messageRouter: this.delegates.getMessageRouter?.() || null,
      });
      return this.authoritativeControlPlaneView;
    }

    const cdcIntegrationService =
      this.delegates.getCdcIntegrationService?.() || null;
    if (!cdcIntegrationService) {
      return null;
    }

    this.authoritativeControlPlaneView =
      new AuthoritativeControlPlaneView({
        nodeId: this.delegates.getSeedNodeId?.() || this.nodeId,
        cdcIntegrationService,
        messageRouter: this.delegates.getMessageRouter?.() || null,
      });
    return this.authoritativeControlPlaneView;
  }

  async readAuthoritativeRows(tableName, sql, params = []) {
    const view = this.getAuthoritativeControlPlaneView();
    if (!view?.canRead()) {
      return [];
    }
    try {
      const result = await view.readRows(tableName, sql, params);
      return result?.success === true && Array.isArray(result.rows) ?
        result.rows :
        [];
    } catch (_error) {
      return [];
    }
  }

  async readAuthoritativeDurableRejoinNodeRow() {
    const rows = await this.readAuthoritativeRows(
      TABLES.NODES,
      `SELECT * FROM ${TABLES.NODES} WHERE ${COLUMN.NODE_ID} = ?`,
      [this.nodeId],
    );
    return rows.find((row) =>
      normalizeString(row?.[COLUMN.NODE_ID]) === this.nodeId,
    ) || null;
  }

  async readAuthoritativeNodeEndpointRow() {
    const expectedWsAddress = normalizeString(
      this.resolveCanonicalWsAddress(),
    );
    const rows = await this.readAuthoritativeRows(
      TABLES.NODE_ENDPOINTS,
      `SELECT * FROM ${TABLES.NODE_ENDPOINTS} WHERE ${COLUMN.NODE_ID} = ?`,
      [this.nodeId],
    );
    return rows.find((row) => {
      const nodeId = normalizeString(row?.[COLUMN.NODE_ID]);
      const transportType = normalizeString(
        row?.[COLUMN.TRANSPORT_TYPE],
      ).toLowerCase();
      const status = normalizeString(
        row?.[COLUMN.STATUS],
      ).toLowerCase();
      const address = normalizeString(row?.[COLUMN.ADDRESS]);
      return nodeId === this.nodeId &&
        transportType ===
          String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase() &&
        status === String(ENDPOINT_STATUS.ACTIVE).toLowerCase() &&
        address === expectedWsAddress;
    }) || null;
  }

  async readAuthoritativeMetaEndpointRows() {
    const rows = await this.readAuthoritativeRows(
      TABLES.SERVICE_ENDPOINTS,
      `SELECT * FROM ${TABLES.SERVICE_ENDPOINTS} WHERE ${COLUMN.NODE_ID} = ?`,
      [this.nodeId],
    );
    const rowsByServiceId = new Map();
    for (const row of rows) {
      const nodeId = normalizeString(row?.[COLUMN.NODE_ID]);
      const serviceId = normalizeString(row?.[COLUMN.SERVICE_ID]);
      if (nodeId !== this.nodeId ||
        !DURABLE_REJOIN_REQUIRED_SERVICE_IDS.includes(serviceId) ||
        rowsByServiceId.has(serviceId)) {
        continue;
      }
      rowsByServiceId.set(serviceId, row);
    }

    return DURABLE_REJOIN_REQUIRED_SERVICE_IDS
      .map((serviceId) => rowsByServiceId.get(serviceId) || null)
      .filter(Boolean);
  }

  resolveCanonicalWsAddress() {
    return this.advertisedNodeWsAddress ||
      resolveAdvertisedWebSocketAddress({
        nodeAddress: this.nodeAddress,
        wsPort: this.delegates.getWsPort?.() || null,
      }) ||
      this.nodeAddress;
  }

  async registerNodeEndpoint(now) {
    const logger = this.delegates.getLogger();

    logger.info(JOINING_LOG_MSG.ENDPOINT_REGISTERING, {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
    });

    const endpointId = `ep-${this.nodeId}-ws`;
    const canonicalWsAddress =
      this.resolveCanonicalWsAddress();

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

  async publishNodeMembershipViaHeartbeat(rowData) {
    const heartbeatService =
      this.delegates.getHeartbeatService?.() || null;
    if (!hasFunction(heartbeatService?.writeNodeHeartbeat) ||
        !hasFunction(heartbeatService?.nodeStateReporter)) {
      return null;
    }

    const now = Number.isFinite(rowData?.[COLUMN.LAST_HEARTBEAT]) ?
      rowData[COLUMN.LAST_HEARTBEAT] :
      this.delegates.getNow()();
    const queryTimeoutMs =
      Math.max(NUM.ONE, this.getJoinAdmissionWriteRetryTimeoutMs());

    await heartbeatService.writeNodeHeartbeat(
      rowData,
      this.delegates.getNodeCapabilities?.() || null,
      now,
      queryTimeoutMs,
    );
    return {
      success: true,
      publicationPath: 'node_state_reporter',
    };
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
    return runRetryableControlPlaneWrite(
      () => this.upsertSystemTableRow(tableName, rowData),
      {
        timeoutMs: this.getJoinAdmissionWriteRetryTimeoutMs(),
        now: () => this.delegates.getNow()(),
        onRetry: ({
          attempt,
          delayMs,
          remainingMs,
          retryAfterMs,
          resultOrError,
        }) => {
          this.delegates.getLogger().warn(
            LOG_JOIN_ADMISSION_WRITE_RETRY,
            {
              nodeId: this.nodeId,
              tableName,
              attempt,
              retryAfterMs,
              delayMs,
              remainingMs,
              admissionTarget: options.admissionTarget || null,
              error:
                resultOrError?.error ||
                resultOrError?.message ||
                'retryable join admission write failure',
            },
          );
        },
        sleep: (delayMs) => this.sleep(delayMs),
      },
    );
  }

  getJoinTimeUpsertOptions() {
    return {
      deliveryPriority: 'critical',
      skipCacheWait: true,
      queryTimeoutMs: this.getJoinAdmissionWriteRetryTimeoutMs(),
    };
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
