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
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../../control-plane/control-plane-system-table-gateway.js';
import {JOINING_LOG_MSG} from '../node-joining-constants.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  NUM,
  TABLES,
  TRANSPORT_TYPE,
  TYPEOF,
} from '../../constants/index.js';
import {runRetryableControlPlaneWrite} from
  './retryable-control-plane-write.js';
import {
  JOIN_ADMISSION_DELIVERY_PRIORITY,
  JOIN_ADMISSION_PHASE_SCOPE,
  JOIN_ADMISSION_PUBLICATION,
  JOIN_ADMISSION_WRITE_RETRY_TIMEOUT_MS,
  LOCAL_STR_1S6CG,
  LOCAL_STR_UPSERT,
  LOCAL_STR_V0KZD,
  LOG_JOIN_ADMISSION_WRITE_RETRY,
  LOG_META_ENDPOINT_REGISTER_FAILED,
  NODE_REGISTRATION_ERROR,
  hasFunction,
} from './node-registration-owner-constants.js';

class NodeRegistrationOwnerPublicationMethods {
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
      this.delegates.getJoinAdmissionControlPlaneSystemTableGateway?.() ||
      null;
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

function createNodeRegistrationPublicationMethods() {
  const descriptors = Object.getOwnPropertyDescriptors(
    NodeRegistrationOwnerPublicationMethods.prototype,
  );
  delete descriptors.constructor;
  return descriptors;
}

export {createNodeRegistrationPublicationMethods};
