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
  STATE,
  TABLES,
} from '../../constants/index.js';
import {
  JOIN_ADMISSION_PUBLICATION,
  LOCAL_STR_1PE7K,
  LOCAL_STR_RNTKK,
  LOCAL_STR_VWYJO,
  LOG_NODE_REGISTER_ERROR_PREFIX,
  LOG_RESUMING_JOIN_ADMISSION_PROGRESS,
  LOG_REUSING_DURABLE_REJOIN_MEMBERSHIP,
  NODE_REGISTRATION_ERROR,
  assignRegistrationFailureCode,
  buildRegistrationFailureError,
} from './node-registration-owner-constants.js';
import {requireDeclaredNodeHostId} from
  '../../topology/node-host-identity.js';
import {
  NODE_IDENTITY_TWIN_SUSPECTED,
  createNodeRegistrationIssueRecord,
} from '../../control-plane/owners/node-registration-incarnation-write.js';
import {STALE_NODE_INCARNATION_CODE} from
  '../../control-plane/control-plane-error-classification.js';

const REGISTRATION_ERROR_RETRY_HINT = Object.freeze({
  RETRYABLE: 'retryable',
  NON_RETRYABLE: 'non_retryable',
  UNSPECIFIED: 'unspecified',
});

// A superseded lifecycle (STALE_NODE_INCARNATION) carries its explicit boolean
// verdict (`true` when retryable by a new lifecycle, `false` otherwise); any
// other explicitly typed retryable boolean carries through unchanged.
function classifyNodeRegistrationErrorRetryHint(error) {
  if (error?.code === STALE_NODE_INCARNATION_CODE) {
    return error.retryable === true ?
      REGISTRATION_ERROR_RETRY_HINT.RETRYABLE :
      REGISTRATION_ERROR_RETRY_HINT.NON_RETRYABLE;
  }
  if (error?.retryable === true) {
    return REGISTRATION_ERROR_RETRY_HINT.RETRYABLE;
  }
  return error?.retryable === false ?
    REGISTRATION_ERROR_RETRY_HINT.NON_RETRYABLE :
    REGISTRATION_ERROR_RETRY_HINT.UNSPECIFIED;
}

function carryRegistrationFailureIdentityFields(wrappedError, error) {
  if (typeof error?.failureCode === 'string' && error.failureCode.length > 0) {
    wrappedError.failureCode = error.failureCode;
  }
  if (typeof error?.outcome === 'string' && error.outcome.length > 0) {
    wrappedError.outcome = error.outcome;
  }
  if (typeof error?.entryId === 'string' && error.entryId.length > 0) {
    wrappedError.entryId = error.entryId;
  }
}

function carryIncarnationConflictDiagnostics(wrappedError, error) {
  // A superseded lifecycle (node-registration-incarnation-write.js) is
  // retryable by a new lifecycle that reserves above the incarnation that
  // superseded it: the join failure carries knownIncarnation to the reattempt.
  // A live twin carries its host identity diagnostics and never raises the
  // local incarnation floor (no knownIncarnation).
  if (error?.code === STALE_NODE_INCARNATION_CODE) {
    wrappedError.knownIncarnation = error.knownIncarnation;
    wrappedError.nodeId = error.nodeId;
    wrappedError.receivedIncarnation = error.receivedIncarnation;
  } else if (error?.code === NODE_IDENTITY_TWIN_SUSPECTED) {
    wrappedError.nodeId = error.nodeId;
    wrappedError.receivedIncarnation = error.receivedIncarnation;
    wrappedError.observedHostId = error.observedHostId;
    wrappedError.declaredHostId = error.declaredHostId;
  }
}

// Carry the retry hints and diagnostics the joiner needs to classify the
// failure (retryable, deferred, or terminal) onto the wrapped error.
function carryNodeRegistrationErrorHints(wrappedError, error) {
  carryRegistrationFailureIdentityFields(wrappedError, error);
  if (Number.isFinite(error?.retryAfterMs)) {
    wrappedError.retryAfterMs = Math.floor(error.retryAfterMs);
  }
  if (error?.deferRetry === true) {
    wrappedError.deferRetry = true;
  }
  const retryHint = classifyNodeRegistrationErrorRetryHint(error);
  if (retryHint !== REGISTRATION_ERROR_RETRY_HINT.UNSPECIFIED) {
    wrappedError.retryable =
      retryHint === REGISTRATION_ERROR_RETRY_HINT.RETRYABLE;
  }
  if (error?.publicationDiagnostics &&
    typeof error.publicationDiagnostics === 'object') {
    wrappedError.publicationDiagnostics =
      error.publicationDiagnostics;
  }
  carryIncarnationConflictDiagnostics(wrappedError, error);
}

// Wrap one registration failure, preserving the code, retry hints, and
// diagnostics the joiner needs to classify it.
function wrapNodeRegistrationError(error) {
  const wrappedError = new Error(
    `${LOG_NODE_REGISTER_ERROR_PREFIX}${error.message}`,
  );
  wrappedError.cause = error;
  assignRegistrationFailureCode(wrappedError, error);
  carryNodeRegistrationErrorHints(wrappedError, error);
  return wrappedError;
}

class NodeRegistrationOwner {
  constructor(options = {}) {
    this.nodeId = options.nodeId;
    this.nodeAddress = options.nodeAddress;
    // The declared host identity (topology/node-host-identity.js): every
    // NODES row this owner writes carries it; without it the node refuses to
    // register.
    this.hostId = options.hostId;
    this.advertisedNodeWsAddress = options.advertisedNodeWsAddress || null;
    this.delegates = options.delegates || {};
    const {getSystemTableCache} = this.delegates;
    if (typeof getSystemTableCache !== 'function') {
      throw new TypeError(
        NODE_REGISTRATION_ERROR.SYSTEM_TABLE_CACHE_GETTER_REQUIRED,
      );
    }
    this.getSystemTableCache = getSystemTableCache;
    this.authoritativeControlPlaneView = null;
    this.membershipPublicationRuntimeOwner =
      options.membershipPublicationRuntimeOwner || null;
    this.joinAdmissionControlPlaneSystemTableGateway = null;
    // This boot lifecycle's record of the NODES registration write it issued
    // (node-registration-incarnation-write.js): a row at this incarnation
    // that this lifecycle never wrote supersedes it.
    this.registrationIssueRecord = createNodeRegistrationIssueRecord();
  }

  async registerNodeInCluster() {
    const logger = this.delegates.getLogger();

    logger.info(LOCAL_STR_RNTKK, {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
    });

    const now = this.delegates.getNow()();

    try {
      // Refused before any registration effect: no NODES row is written
      // without the node's declared host.
      requireDeclaredNodeHostId(this.hostId);
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
            1 + existingMembership.metaEndpointRows.length,
        });
        return existingMembership;
      }

      const existingJoinAdmissionProgress =
        await this.resolveExistingJoinAdmissionProgress();

      let budgetRow = existingJoinAdmissionProgress?.nodeRow || null;
      let resolution = existingJoinAdmissionProgress?.resolution || null;
      if (!budgetRow) {
        const nodeRow = this.buildNodeRegistrationRow(now);
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
          throw buildRegistrationFailureError(
            LOG_NODE_REGISTER_ERROR_PREFIX,
            nodeUpsertResult,
          );
        }
        const nodeOriginHlc =
          nodeUpsertResult?.originHlc ||
          nodeUpsertResult?.partitionResult?.originHlc ||
          null;
        if (typeof nodeOriginHlc === 'string' && nodeOriginHlc.length > 0) {
          budgetRow = {
            ...budgetRow,
            [COLUMN.UPDATED_AT_HLC]: nodeOriginHlc,
          };
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
        await this.advanceStaleJoinAdmissionIncarnation(
          existingJoinAdmissionProgress,
        );
        budgetRow = existingJoinAdmissionProgress.nodeRow;
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
        await this.registerNodeEndpoint(this.delegates.getNow()());
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

      const lostStorageReplicas =
        await this.failLostStoragePartitionReplicas(now);

      return {
        nodeRow: budgetRow,
        endpointRow,
        metaEndpointRows,
        lostStorageReplicas,
        resolution,
      };
    } catch (error) {
      const wrappedError = wrapNodeRegistrationError(error);
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
      hostId: this.hostId,
      nodeCapabilities: this.delegates.getNodeCapabilities?.() || [],
      bootIncarnation: this.delegates.getBootIncarnation(),
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
