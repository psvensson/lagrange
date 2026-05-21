import os from 'os';
import {NodeStorageBudgetSetup} from './node-storage-budget-setup.js';
import {NodeService} from '../../node/node-service.js';
import {
  registerBuiltInMetaServiceEndpoints,
} from './meta-service-definition-registration.js';
import {createBootstrapCacheHydrationApplier} from
  '../bootstrap-cache-hydration-applier.js';
import {
  MembershipPublicationRuntimeOwner,
} from '../../control-plane/owners/membership-publication-runtime-owner.js';
import {createControlPlaneRuntimeBundle} from
  '../../control-plane/control-plane-runtime-bundle.js';
import {CONTROL_PLANE_PHASE_SCOPE} from
  '../../control-plane/control-plane-system-table-gateway.js';
import {CONTROL_PLANE_MUTATION_OPERATION} from
  '../../control-plane/control-plane-system-table-gateway.js';
import {
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
import {
  isBootJoinRejoinMembershipOwnerOutcome,
  MEMBERSHIP_LIFECYCLE_INTENT,
  resolveMembershipJoinIntentType,
} from '../../control-plane/membership-lifecycle-controller.js';
import {resolveAutoRejoinStartupDecision} from '../rejoin-hints.js';
import {AuthoritativeControlPlaneView} from
  '../../control-plane/authoritative-control-plane-view.js';
import {runRetryableControlPlaneWrite} from './retryable-control-plane-write.js';

const LOCAL_STR_RNTKK = 'Registering node in cluster';
const LOCAL_STR_1PE7K = 'Node registered in cluster';
const LOCAL_STR_VWYJO = 'Failed to register node in cluster';
const LOCAL_STR_1YR7Z = 'Failed to refresh durable rejoin membership: ';
const LOCAL_STR_1S6CG = 'node_state_reporter';
const LOCAL_STR_V0KZD = 'retryable join admission write failure';
const LOCAL_STR_UPSERT = 'UPSERT';

const LOG_META_ENDPOINT_REGISTER_FAILED =
  'Failed to register built-in meta service endpoints';
const LOG_NODE_REGISTER_ERROR_PREFIX =
  'Failed to register node: ';
const LOG_JOIN_ADMISSION_WRITE_RETRY =
  'Retrying join admission system-table write after retryable failure';
const LOG_REUSING_DURABLE_REJOIN_MEMBERSHIP =
  'Reusing existing canonical membership for durable rejoin';
const LOG_RESUMING_JOIN_ADMISSION_PROGRESS =
  'Resuming join admission from canonical membership progress';
const JOIN_ADMISSION_DELIVERY_PRIORITY = 'critical';
const JOIN_ADMISSION_WRITE_RETRY_TIMEOUT_MS = TIME_MS.SECOND * NUM.THIRTY;
const JOIN_ADMISSION_PUBLICATION = Object.freeze({
  META_SERVICE_ENDPOINT:
    'built-in meta service endpoint publication',
  NODE_ENDPOINT: 'node websocket endpoint publication',
  NODE_MEMBERSHIP: 'node membership publication',
  NODE_MEMBERSHIP_REFRESH: 'durable rejoin membership refresh',
});
const NODE_REGISTRATION_ERROR = Object.freeze({
  JOIN_ADMISSION_GATEWAY_REQUIRED:
    'Join admission control-plane gateway required for join service registration',
  UNSUPPORTED_PUBLICATION_TABLE:
    'Unsupported join publication table for node registration',
});
const JOIN_ADMISSION_RESOLUTION_SOURCE = Object.freeze({
  DURABLE_REJOIN_EXISTING_MEMBERSHIP:
    'durable_rejoin_existing_membership',
  EXISTING_PROGRESS:
    'existing_join_admission_progress',
});
const DURABLE_REJOIN_REQUIRED_SERVICE_IDS = Object.freeze([
  META_SERVICE_ID.POSTGRES_WIRE,
]);
const REUSABLE_JOIN_ADMISSION_CONNECTION_STATES = Object.freeze([
  STATE.CONNECTED,
  STATE.READY,
]);
const JOIN_ADMISSION_PHASE_SCOPE = CONTROL_PLANE_PHASE_SCOPE.JOIN;

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
    this.membershipPublicationRuntimeOwner =
      options.membershipPublicationRuntimeOwner || null;
    this.joinAdmissionControlPlaneSystemTableGateway = null;
  }

  async registerNodeInCluster() {
    const logger = this.delegates.getLogger();

    logger.info(LOCAL_STR_RNTKK, {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
    });

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

      const existingJoinAdmissionProgress =
        await this.resolveExistingJoinAdmissionProgress();

      let budgetRow = existingJoinAdmissionProgress?.nodeRow || null;
      let resolution = existingJoinAdmissionProgress?.resolution || null;
      if (!budgetRow) {
        const budgetService =
          this.delegates.getNodeStorageBudgetService();
        const budgetResolution =
          await NodeStorageBudgetSetup.resolveWithoutPersist({
            budgetService,
            nodeRow,
            nodeId: this.nodeId,
          });
        budgetRow = budgetResolution.budgetRow;
        resolution = budgetResolution.resolution;

        const nodeUpsertResult = await this.upsertSystemTableRowWithRetry(
          TABLES.NODES,
          budgetRow,
          {
            admissionTarget: JOIN_ADMISSION_PUBLICATION.NODE_MEMBERSHIP,
          },
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

        logger.info(LOCAL_STR_1PE7K, {
          nodeId: this.nodeId,
          nodeAddress: this.nodeAddress,
          cpuCores: budgetRow?.[COLUMN.CPU_CORES] || null,
          memoryMb: budgetRow?.[COLUMN.MEMORY_MB] || null,
          diskGb: budgetRow?.[COLUMN.DISK_GB] || null,
          budgetBytes: resolution?.budgetBytes || null,
          budgetSource: resolution?.source || null,
        });
      } else {
        this.seedJoinTimeCacheRow(TABLES.NODES, budgetRow);
        logger.info(LOG_RESUMING_JOIN_ADMISSION_PROGRESS, {
          nodeId: this.nodeId,
          nodeAddress: this.nodeAddress,
          hasExistingNodeEndpoint:
            existingJoinAdmissionProgress.endpointRow !== null,
          reusedMetaEndpointCount:
            existingJoinAdmissionProgress.metaEndpointRows.length,
        });
      }

      const endpointRow =
        existingJoinAdmissionProgress?.endpointRow ||
        await this.registerNodeEndpoint(now);
      this.seedJoinTimeCacheRow(
        TABLES.NODE_ENDPOINTS,
        endpointRow,
      );

      const metaEndpointRows =
        this.hasCompleteRequiredMetaEndpointRows(
          existingJoinAdmissionProgress?.metaEndpointRows,
        ) ?
          existingJoinAdmissionProgress.metaEndpointRows :
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
      logger.error(LOCAL_STR_VWYJO, {
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

    if (await this.durableRejoinBlockedByClusterIncarnationFence()) {
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
        source:
          JOIN_ADMISSION_RESOLUTION_SOURCE
            .DURABLE_REJOIN_EXISTING_MEMBERSHIP,
      },
      reusedExistingMembership: true,
    };
  }

  hasReusableJoinAdmissionConnectionState(connectionState) {
    return REUSABLE_JOIN_ADMISSION_CONNECTION_STATES.includes(
      normalizeString(connectionState).toLowerCase(),
    );
  }

  hasCompleteRequiredMetaEndpointRows(metaEndpointRows) {
    return Array.isArray(metaEndpointRows) &&
      metaEndpointRows.length === DURABLE_REJOIN_REQUIRED_SERVICE_IDS.length;
  }

  canReuseObservedJoinAdmissionNodeRow(nodeRow) {
    if (!nodeRow || typeof nodeRow !== TYPEOF.OBJECT) {
      return false;
    }

    const cachedNodeAddress = normalizeString(
      nodeRow[COLUMN.NODE_ADDRESS],
    );
    const currentNodeAddress = normalizeString(this.nodeAddress);
    if (cachedNodeAddress.length > NUM.ZERO &&
      currentNodeAddress.length > NUM.ZERO &&
      cachedNodeAddress !== currentNodeAddress) {
      return false;
    }

    return this.hasReusableJoinAdmissionConnectionState(
      nodeRow[COLUMN.CONNECTION_STATE],
    );
  }

  async resolveExistingJoinAdmissionProgress() {
    if (await this.durableRejoinBlockedByClusterIncarnationFence()) {
      return null;
    }

    const authoritativeNodeRow =
      await this.readAuthoritativeDurableRejoinNodeRow();
    if (!this.canReuseObservedJoinAdmissionNodeRow(authoritativeNodeRow)) {
      return null;
    }

    const authoritativeEndpointRow =
      await this.readAuthoritativeNodeEndpointRow();
    const metaEndpointRows =
      await this.readAuthoritativeMetaEndpointRows();
    return {
      nodeRow: authoritativeNodeRow,
      endpointRow: authoritativeEndpointRow,
      metaEndpointRows,
      resolution: {
        source: JOIN_ADMISSION_RESOLUTION_SOURCE.EXISTING_PROGRESS,
      },
    };
  }

  async durableRejoinBlockedByClusterIncarnationFence() {
    const fence = await this.resolveClusterIncarnationFence();
    if (!fence || typeof fence !== TYPEOF.OBJECT) {
      return false;
    }
    return fence.allowed !== true;
  }

  async resolveClusterIncarnationFence() {
    if (hasFunction(this.delegates.getClusterIncarnationFence)) {
      const delegatedFence = await this.delegates.getClusterIncarnationFence();
      return delegatedFence &&
        typeof delegatedFence === TYPEOF.OBJECT ?
        delegatedFence :
        null;
    }

    const dataDir = normalizeString(this.delegates.getDataDir?.());
    if (dataDir.length === NUM.ZERO) {
      return null;
    }

    try {
      const startupDecision = await resolveAutoRejoinStartupDecision({
        dataDir,
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
      });
      return startupDecision?.clusterIncarnationFence &&
        typeof startupDecision.clusterIncarnationFence === TYPEOF.OBJECT ?
        startupDecision.clusterIncarnationFence :
        null;
    } catch (_error) {
      return null;
    }
  }

  async refreshExistingDurableRejoinMembership(existingMembership) {
    const nodeRow = existingMembership?.nodeRow || null;
    const refreshResult = await this.upsertJoinPublicationRow(
      JOIN_ADMISSION_PUBLICATION.NODE_MEMBERSHIP_REFRESH,
      nodeRow,
    );
    if (!refreshResult?.success) {
      throw new Error(
        LOCAL_STR_1YR7Z +
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
    const membershipOwnerOutcome =
      this.delegates.getMembershipOwnerOutcome?.();
    if (isBootJoinRejoinMembershipOwnerOutcome(membershipOwnerOutcome)) {
      return resolveMembershipJoinIntentType({
        membershipOwnerOutcome,
        startupMode: this.delegates.getJoinStartupMode?.(),
      });
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
      {
        admissionTarget: JOIN_ADMISSION_PUBLICATION.NODE_ENDPOINT,
      },
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
                JOIN_ADMISSION_PUBLICATION.META_SERVICE_ENDPOINT,
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
      publicationPath: LOCAL_STR_1S6CG,
    };
  }

  getMembershipPublicationRuntimeOwner() {
    if (this.membershipPublicationRuntimeOwner) {
      return this.membershipPublicationRuntimeOwner;
    }
    this.membershipPublicationRuntimeOwner =
      new MembershipPublicationRuntimeOwner({
        nodeId: this.nodeId,
        cdcIntegrationService:
          this.delegates.getCdcIntegrationService?.() || null,
        systemTableCache:
          this.delegates.getSystemTableCache?.() ||
          NodeService.getInstance().getSystemTableCache() ||
          null,
        messageRouter: this.delegates.getMessageRouter?.() || null,
        controlPlaneSystemTableGateway:
          this.getJoinAdmissionControlPlaneSystemTableGateway(),
        controlPlaneWriteRetryTimeoutMs:
          this.getJoinAdmissionWriteRetryTimeoutMs(),
        controlPlaneWriteRetryNow: () => this.delegates.getNow()(),
        controlPlaneWriteRetrySleep: (delayMs) => this.sleep(delayMs),
      });
    return this.membershipPublicationRuntimeOwner;
  }

  resolveJoinAdmissionSqlQueryEngine() {
    return this.delegates.getJoinAdmissionSqlQueryEngine?.() || null;
  }

  getJoinAdmissionControlPlaneSystemTableGateway() {
    const delegatedGateway =
      this.delegates.getJoinAdmissionControlPlaneSystemTableGateway?.() || null;
    if (delegatedGateway) {
      return delegatedGateway;
    }

    const joinAdmissionSqlQueryEngine =
      this.resolveJoinAdmissionSqlQueryEngine();
    if (!joinAdmissionSqlQueryEngine) {
      return null;
    }

    const cdcIntegrationService =
      joinAdmissionSqlQueryEngine ?
        null :
        this.delegates.getCdcIntegrationService?.() || null;
    const systemTableCache =
      this.delegates.getSystemTableCache?.() ||
      NodeService.getInstance().getSystemTableCache() ||
      null;
    const messageRouter = this.delegates.getMessageRouter?.() || null;

    if (this.joinAdmissionControlPlaneSystemTableGateway) {
      this.joinAdmissionControlPlaneSystemTableGateway.setSqlQueryEngine?.(
        joinAdmissionSqlQueryEngine,
      );
      this.joinAdmissionControlPlaneSystemTableGateway
        .setCdcIntegrationService?.(cdcIntegrationService);
      this.joinAdmissionControlPlaneSystemTableGateway
        .setSystemTableCache?.(systemTableCache);
      this.joinAdmissionControlPlaneSystemTableGateway
        .setMessageRouter?.(messageRouter);
      return this.joinAdmissionControlPlaneSystemTableGateway;
    }

    this.joinAdmissionControlPlaneSystemTableGateway =
      createControlPlaneRuntimeBundle({
        nodeId: this.nodeId,
        sqlQueryEngine: joinAdmissionSqlQueryEngine,
        cdcIntegrationService,
        systemTableCache,
        messageRouter,
      }).controlPlaneSystemTableGateway;
    return this.joinAdmissionControlPlaneSystemTableGateway;
  }

  buildJoinAdmissionRetryLogger(tableName, admissionTarget = null) {
    return ({
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
          admissionTarget,
          error:
            resultOrError?.error ||
            resultOrError?.message ||
            LOCAL_STR_V0KZD,
        },
      );
    };
  }

  async upsertJoinPublicationRow(admissionTarget, rowData) {
    const membershipPublicationRuntimeOwner =
      this.getMembershipPublicationRuntimeOwner();
    const joinTimeOptions = this.getJoinTimeUpsertOptions();
    const retryOptions = {
      ...joinTimeOptions,
      controlPlaneWriteRetryOnRetry:
        this.buildJoinAdmissionRetryLogger(
          TABLES.NODES,
          admissionTarget,
        ),
    };
    return membershipPublicationRuntimeOwner.upsertJoinNode(
      rowData,
      retryOptions,
    );
  }

  async upsertJoinServiceRowWithRetry(rowData, options = {}) {
    const controlPlaneSystemTableGateway =
      this.getJoinAdmissionControlPlaneSystemTableGateway();
    if (
      !controlPlaneSystemTableGateway ||
      typeof controlPlaneSystemTableGateway.submitMutation !==
        TYPEOF.FUNCTION
    ) {
      throw new Error(
        NODE_REGISTRATION_ERROR.JOIN_ADMISSION_GATEWAY_REQUIRED,
      );
    }

    const joinTimeOptions = this.getJoinTimeUpsertOptions();
    const queryTimeoutMs = this.getJoinAdmissionWriteRetryTimeoutMs();
    return runRetryableControlPlaneWrite(
      () => controlPlaneSystemTableGateway.submitMutation(
        {
          operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
          tableName: TABLES.SERVICES,
          row: rowData,
        },
        {
          ...joinTimeOptions,
          queryTimeoutMs,
        },
      ),
      {
        timeoutMs: queryTimeoutMs,
        now: () => this.delegates.getNow()(),
        onRetry: this.buildJoinAdmissionRetryLogger(
          TABLES.SERVICES,
          options.admissionTarget || null,
        ),
        sleep: (delayMs) => this.sleep(delayMs),
      },
    );
  }

  async upsertSystemTableRowWithRetry(
    tableName,
    rowData,
    options = {},
  ) {
    const membershipPublicationRuntimeOwner =
      this.getMembershipPublicationRuntimeOwner();
    const joinTimeOptions = this.getJoinTimeUpsertOptions();
    const mutationOptions = {
      ...joinTimeOptions,
      controlPlaneWriteRetryOnRetry:
        this.buildJoinAdmissionRetryLogger(
          tableName,
          options.admissionTarget || null,
        ),
    };
    if (tableName === TABLES.NODES) {
      return membershipPublicationRuntimeOwner.upsertJoinNode(
        rowData,
        mutationOptions,
      );
    }
    if (tableName === TABLES.NODE_ENDPOINTS) {
      return membershipPublicationRuntimeOwner.upsertJoinNodeEndpoint(
        rowData,
        mutationOptions,
      );
    }
    if (tableName !== TABLES.SERVICE_ENDPOINTS) {
      throw new Error(
        `${NODE_REGISTRATION_ERROR.UNSUPPORTED_PUBLICATION_TABLE}: ` +
        `${tableName}`,
      );
    }
    return membershipPublicationRuntimeOwner.upsertJoinServiceEndpoint(
      rowData,
      mutationOptions,
    );
  }

  getJoinTimeUpsertOptions() {
    return {
      deliveryPriority: JOIN_ADMISSION_DELIVERY_PRIORITY,
      phaseScope: JOIN_ADMISSION_PHASE_SCOPE,
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
      LOCAL_STR_UPSERT,
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
