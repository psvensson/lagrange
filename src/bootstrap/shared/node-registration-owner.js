import {NodeStorageBudgetSetup} from './node-storage-budget-setup.js';
import {
  buildNodeRegistrationRow,
} from './node-registration-owner-row-builder.js';
import {
  createNodeRegistrationDurableRejoinMethods,
} from './node-registration-owner-durable-rejoin-methods.js';
import {
  createNodeRegistrationPublicationMethods,
} from './node-registration-owner-publication-methods.js';
import {
  COLUMN,
  NUM,
  STATE,
  TABLES,
  TYPEOF,
} from '../../constants/index.js';
import {
  JOIN_ADMISSION_PUBLICATION,
  LOCAL_STR_1PE7K,
  LOCAL_STR_RNTKK,
  LOCAL_STR_VWYJO,
  LOG_NODE_REGISTER_ERROR_PREFIX,
  LOG_RESUMING_JOIN_ADMISSION_PROGRESS,
  LOG_REUSING_DURABLE_REJOIN_MEMBERSHIP,
} from './node-registration-owner-constants.js';

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
    return buildNodeRegistrationRow({
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
      nodeCapabilities: this.delegates.getNodeCapabilities?.() || [],
      now,
    });
  }
}

Object.defineProperties(
  NodeRegistrationOwner.prototype,
  createNodeRegistrationDurableRejoinMethods(),
);
Object.defineProperties(
  NodeRegistrationOwner.prototype,
  createNodeRegistrationPublicationMethods(),
);

export {NodeRegistrationOwner};
