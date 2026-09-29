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
import {classifyControlPlaneMutationResult} from
  '../../control-plane/control-plane-mutation-outcome-classifier.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../control-plane/owner-contract-outcome.js';
import {JOINING_LOG_MSG} from '../node-joining-constants.js';
import {
  ENDPOINT_INCARNATION_OUTCOME,
  isEndpointIncarnationOutcomeCompleted,
  mutateEndpointAtIncarnation,
  readAuthoritativeEndpointRow,
  stampEndpointIncarnation,
} from '../../control-plane/owners/endpoint-incarnation-authority.js';
import {
  NODE_TERMINAL_TRANSITION_OUTCOME,
  applyNodeTerminalTransition,
  isNodeTerminalTransitionRefused,
} from '../../control-plane/node-terminal-transition-fence.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  SERVICE_STATUS,
  STATE,
  TABLES,
  TRANSPORT_TYPE,
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
  normalizeString,
} from './node-registration-owner-constants.js';

const LOCAL_STR_UNHEALTHY = 'unhealthy';
const JOIN_ADMISSION_WITHDRAWAL_TARGET = Object.freeze({
  NODE_ENDPOINT: 'failed join node endpoint withdrawal',
  NODE_MEMBERSHIP: 'failed join node membership withdrawal',
  SERVICE_ENDPOINT: 'failed join service endpoint withdrawal',
});
const LOG_FAILED_JOIN_ENDPOINT_WITHDRAWAL_FAILED =
  'Failed join endpoint withdrawal failed after node membership withdrawal';
const SERVICE_ENDPOINT_HEALTH_STATUS_COLUMN = 'health_status';
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const objectIs = Object.is;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const reflectApply = Reflect.apply;
const stringPrototypeTrim = String.prototype.trim;
const DATA_DESCRIPTOR_VALUE_PROPERTY = 'value';
const NULL_VALUE = null;

function readOwnDataProperty(target, property) {
  let descriptor;
  try {
    descriptor = objectGetOwnPropertyDescriptor(target, property);
  } catch {
    return {present: true, valid: false, value: undefined};
  }
  if (!descriptor) {
    return {present: false, valid: true, value: undefined};
  }
  if (!objectHasOwn(descriptor, DATA_DESCRIPTOR_VALUE_PROPERTY)) {
    return {present: true, valid: false, value: undefined};
  }
  return {present: true, valid: true, value: descriptor.value};
}

function normalizeOwnString(property) {
  return property.valid && typeof property.value === 'string' ?
    reflectApply(stringPrototypeTrim, property.value, []) :
    '';
}

function normalizeOwnRetryAfterMs(primary, pressure) {
  for (const property of [primary, pressure]) {
    if (property.valid && property.present &&
      numberIsFinite(property.value) &&
      numberIsSafeInteger(property.value) &&
      property.value >= 0 && !objectIs(property.value, -0)) {
      return property.value;
    }
  }
  return NULL_VALUE;
}

function buildRejectedJoinAdmissionMutationAcceptance({
  contractState,
  nextAction,
  outcome,
  retryAfterMs,
}) {
  return {
    accepted: false,
    success: false,
    withdrawalDeferred: false,
    contractState,
    nextAction,
    outcome,
    retryAfterMs,
  };
}

function classifyJoinAdmissionMutationAcceptance(result) {
  const mutation = classifyControlPlaneMutationResult(result);
  if (!mutation.valid) {
    return buildRejectedJoinAdmissionMutationAcceptance({
      contractState: '',
      nextAction: '',
      outcome: mutation.outcome,
      retryAfterMs: NULL_VALUE,
    });
  }

  const contractState = normalizeOwnString(
    readOwnDataProperty(result, 'contractState'),
  );
  const nextAction = normalizeOwnString(
    readOwnDataProperty(result, 'nextAction'),
  );
  const retryAfterMs = normalizeOwnRetryAfterMs(
    readOwnDataProperty(result, 'retryAfterMs'),
    readOwnDataProperty(result, 'pressureRetryAfterMs'),
  );
  const terminal =
    contractState === OWNER_CONTRACT_STATE.BLOCKED ||
    contractState === OWNER_CONTRACT_STATE.FAILED ||
    nextAction === OWNER_CONTRACT_NEXT_ACTION.STOP ||
    mutation.terminal;
  if (terminal) {
    return buildRejectedJoinAdmissionMutationAcceptance({
      contractState,
      nextAction,
      outcome: mutation.outcome,
      retryAfterMs,
    });
  }

  const pendingContract =
    contractState === OWNER_CONTRACT_STATE.PENDING &&
    (
      nextAction === OWNER_CONTRACT_NEXT_ACTION.WAIT ||
      nextAction === OWNER_CONTRACT_NEXT_ACTION.RETRY
    );
  const deferredContract =
    contractState === OWNER_CONTRACT_STATE.DEFERRED &&
    nextAction === OWNER_CONTRACT_NEXT_ACTION.RETRY;
  const applied = mutation.applied;
  const accepted =
    applied ||
    mutation.accepted ||
    mutation.deferred ||
    pendingContract ||
    deferredContract;

  return {
    accepted,
    success: applied,
    withdrawalDeferred:
      accepted &&
      (
        applied !== true ||
        mutation.deferred ||
        pendingContract ||
        deferredContract
      ),
    contractState,
    nextAction,
    outcome: mutation.outcome,
    retryAfterMs,
  };
}

const RESOLVED_JOIN_ADMISSION_WITHDRAWAL = Object.freeze({
  accepted: true,
  success: true,
  withdrawalDeferred: false,
  contractState: '',
  nextAction: '',
  outcome: NODE_TERMINAL_TRANSITION_OUTCOME.RESOLVED_BY_READBACK,
  retryAfterMs: NULL_VALUE,
});

function buildRefusedJoinAdmissionWithdrawal(registeredNodeId, transition) {
  return {
    success: false,
    accepted: false,
    withdrawalDeferred: false,
    registeredNodeId,
    outcome: transition.outcome,
    knownIncarnation: transition.knownIncarnation ?? null,
    nodeEndpointWithdrawn: false,
    metaEndpointCount: 0,
    metaEndpointWithdrawnCount: 0,
  };
}

class NodeRegistrationOwnerPublicationMethods {
  resolveNodeEndpointId() {
    return `ep-${this.nodeId}-ws`;
  }

  async registerNodeEndpoint(now) {
    const logger = this.delegates.getLogger();

    logger.info(JOINING_LOG_MSG.ENDPOINT_REGISTERING, {
      nodeId: this.nodeId,
      nodeAddress: this.nodeAddress,
    });

    const endpointId = this.resolveNodeEndpointId();
    const canonicalWsAddress =
      this.resolveCanonicalWsAddress();

    const endpointData = {
      [COLUMN.ENDPOINT_ID]: endpointId,
      [COLUMN.NODE_ID]: this.nodeId,
      [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
      [COLUMN.ADDRESS]: canonicalWsAddress,
      [COLUMN.PRIORITY]: 0,
      [COLUMN.METADATA]: JSON.stringify({}),
      [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
      [COLUMN.CREATED_AT]: now,
      [COLUMN.UPDATED_AT]: now,
    };

    // Bounded-await join membership write: full retry budget, fail on error.
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
    // The row as written: born at this boot's exact incarnation.
    return stampEndpointIncarnation(endpointData,
      this.getRegistrationBootIncarnation());
  }

  async registerMetaServiceEndpoints() {
    const logger = this.delegates.getLogger();

    try {
      const endpointRows = [];
      await registerBuiltInMetaServiceEndpoints({
        upsertRow: async (tableName, row) => {
          endpointRows.push(row);
          const result = await this.upsertSystemTableRowWithRetry(
            tableName,
            row,
            {
              admissionTarget:
                JOIN_ADMISSION_PUBLICATION.META_SERVICE_ENDPOINT,
            },
          );
          if (result?.success === false) {
            throw new Error(
              `Failed to register meta endpoint: ${result.error}`);
          }
          return result;
        },
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        advertisedNodeWsAddress: this.advertisedNodeWsAddress,
        wsPort: this.delegates.getWsPort?.(),
        bootIncarnation: this.getRegistrationBootIncarnation(),
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
      Math.max(1, this.getJoinAdmissionWriteRetryTimeoutMs());

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

    // Contract: when a join-admission SQL query engine exists (guaranteed
    // above), the gateway drives CDC through that engine; a direct
    // cdcIntegrationService delegate is never wired on this path.
    const cdcIntegrationService = null;
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
        'function'
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
          operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
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

  async updateJoinAdmissionSystemTableRowWithRetry(
    tableName,
    whereClause,
    data,
    options = {},
  ) {
    const controlPlaneSystemTableGateway =
      this.getJoinAdmissionControlPlaneSystemTableGateway();
    if (
      !controlPlaneSystemTableGateway ||
      typeof controlPlaneSystemTableGateway.updateSystemTableRow !==
        'function'
    ) {
      throw new Error(
        NODE_REGISTRATION_ERROR.JOIN_ADMISSION_GATEWAY_REQUIRED,
      );
    }

    const joinTimeOptions = this.getJoinTimeUpsertOptions();
    const queryTimeoutMs = this.getJoinAdmissionWriteRetryTimeoutMs();
    return runRetryableControlPlaneWrite(
      () => controlPlaneSystemTableGateway.updateSystemTableRow(
        tableName,
        whereClause,
        data,
        {
          ...joinTimeOptions,
          queryTimeoutMs,
        },
      ),
      {
        timeoutMs: queryTimeoutMs,
        now: () => this.delegates.getNow()(),
        onRetry: this.buildJoinAdmissionRetryLogger(
          tableName,
          options.admissionTarget || null,
        ),
        sleep: (delayMs) => this.sleep(delayMs),
      },
    );
  }

  // The final failed-join withdrawal mutation; the predicate is the exact
  // node id + boot incarnation.
  writeNodeWithdrawalAtIncarnation(whereClause, withdrawn) {
    return this.updateJoinAdmissionSystemTableRowWithRetry(
      TABLES.NODES,
      whereClause,
      withdrawn,
      {admissionTarget: JOIN_ADMISSION_WITHDRAWAL_TARGET.NODE_MEMBERSHIP},
    );
  }

  // Withdraw one endpoint row of this boot: the predicate carries the exact
  // incarnation, so a replacement incarnation's endpoint is never touched;
  // an unknown outcome is reread (this boot's withdrawn row or absence ->
  // done; another incarnation -> stale, never retried against it).
  async withdrawEndpointAtIncarnation(tableName, endpointId, data,
    admissionTarget) {
    const gateway = this.getJoinAdmissionControlPlaneSystemTableGateway();
    const {[COLUMN.UPDATED_AT]: _updatedAt, ...destination} = data;
    const outcome = await mutateEndpointAtIncarnation({
      bootIncarnation: this.getRegistrationBootIncarnation(),
      whereClause: {[COLUMN.ENDPOINT_ID]: endpointId},
      destination,
      write: (whereClause) => this.updateJoinAdmissionSystemTableRowWithRetry(
        tableName, whereClause, data, {admissionTarget}),
      observe: () => readAuthoritativeEndpointRow(gateway, tableName,
        endpointId),
    });
    if (isEndpointIncarnationOutcomeCompleted(outcome.outcome)) {
      return true;
    }
    this.delegates.getLogger().warn(LOG_FAILED_JOIN_ENDPOINT_WITHDRAWAL_FAILED,
      {
        nodeId: this.nodeId,
        tableName,
        endpointId,
        outcome: outcome.outcome,
        error: outcome.error?.message ?? null,
      });
    return false;
  }

  // The failed-join withdrawal of this node's own row, fenced by its exact
  // registered boot incarnation in the final mutation; an unknown outcome is
  // resolved by the NODES owner's readback, never assumed.
  async withdrawNodeMembershipAtIncarnation(registeredNodeId, now) {
    const withdrawn = {
      [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
      [COLUMN.CONNECTION_STATE]: STATE.DISCONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now,
      [COLUMN.READY_LEASE_EXPIRES_AT]: null,
      [COLUMN.UPDATED_AT]: now,
    };
    const transition = await applyNodeTerminalTransition({
      gateway: this.getJoinAdmissionControlPlaneSystemTableGateway(),
      nodeId: registeredNodeId,
      bootIncarnation: this.delegates.getBootIncarnation?.(),
      destination: {
        [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
        [COLUMN.CONNECTION_STATE]: STATE.DISCONNECTED,
      },
      write: (whereClause) =>
        this.writeNodeWithdrawalAtIncarnation(whereClause, withdrawn),
    });
    if (isNodeTerminalTransitionRefused(transition.outcome)) {
      return {refused: true, transition};
    }
    if (transition.outcome ===
        NODE_TERMINAL_TRANSITION_OUTCOME.RESOLVED_BY_READBACK) {
      return {refused: false, transition,
        acceptance: RESOLVED_JOIN_ADMISSION_WITHDRAWAL};
    }
    if (transition.error) throw transition.error;
    return {refused: false, transition,
      acceptance: classifyJoinAdmissionMutationAcceptance(transition.result)};
  }

  async withdrawFailedJoinAdmission(options = {}) {
    const registeredNodeId =
      normalizeString(options.registeredNodeId) || this.nodeId;
    if (registeredNodeId !== this.nodeId) {
      return {success: false, skipped: true};
    }
    const now = this.delegates.getNow()();
    const nodeWithdrawal =
      await this.withdrawNodeMembershipAtIncarnation(registeredNodeId, now);
    if (nodeWithdrawal.refused) {
      // A replacement incarnation (or no provable incarnation) owns the row
      // and its endpoints: this process withdraws nothing.
      return buildRefusedJoinAdmissionWithdrawal(
        registeredNodeId,
        nodeWithdrawal.transition,
      );
    }

    const nodeEndpointWithdrawn = await this.withdrawEndpointAtIncarnation(
      TABLES.NODE_ENDPOINTS,
      this.resolveNodeEndpointId(),
      {[COLUMN.STATUS]: ENDPOINT_STATUS.INACTIVE, [COLUMN.UPDATED_AT]: now},
      JOIN_ADMISSION_WITHDRAWAL_TARGET.NODE_ENDPOINT,
    );

    // Withdrawal is best-effort: an UNAVAILABLE authoritative read yields
    // zero meta endpoint rows (same as the pre-typed-outcome bare-array
    // collapse) instead of throwing, so the withdrawal still reports.
    const metaEndpointRows =
      await this.readAuthoritativeMetaEndpointRowsOutcome()
        .then((outcome) => outcome.rows)
        .catch(() => []);
    let metaEndpointWithdrawnCount = 0;
    for (const metaEndpointRow of metaEndpointRows) {
      const endpointId = normalizeString(
        metaEndpointRow?.[COLUMN.ENDPOINT_ID],
      );
      if (endpointId.length > 0 && await this.withdrawEndpointAtIncarnation(
        TABLES.SERVICE_ENDPOINTS,
        endpointId,
        {
          [SERVICE_ENDPOINT_HEALTH_STATUS_COLUMN]: LOCAL_STR_UNHEALTHY,
          [COLUMN.UPDATED_AT]: now,
        },
        JOIN_ADMISSION_WITHDRAWAL_TARGET.SERVICE_ENDPOINT,
      )) {
        metaEndpointWithdrawnCount += 1;
      }
    }

    const nodeMutationAcceptance = nodeWithdrawal.acceptance;
    return {
      success: nodeMutationAcceptance.success,
      accepted: nodeMutationAcceptance.accepted,
      withdrawalDeferred: nodeMutationAcceptance.withdrawalDeferred,
      registeredNodeId,
      contractState: nodeMutationAcceptance.contractState,
      nextAction: nodeMutationAcceptance.nextAction,
      outcome: nodeMutationAcceptance.outcome,
      retryAfterMs: nodeMutationAcceptance.retryAfterMs,
      nodeEndpointWithdrawn,
      metaEndpointCount: metaEndpointRows.length,
      metaEndpointWithdrawnCount,
    };
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
      ...(Number.isFinite(options.queryTimeoutMs) ?
        {queryTimeoutMs: Math.floor(options.queryTimeoutMs)} :
        {}),
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
    if (tableName !== TABLES.NODE_ENDPOINTS &&
        tableName !== TABLES.SERVICE_ENDPOINTS) {
      throw new Error(
        `${NODE_REGISTRATION_ERROR.UNSUPPORTED_PUBLICATION_TABLE}: ` +
        `${tableName}`,
      );
    }
    // Endpoint rows are born or advanced at this boot's exact incarnation;
    // a newer incarnation's row is never replaced.
    const endpointOutcome =
      await membershipPublicationRuntimeOwner.writeJoinEndpointAtIncarnation(
        tableName,
        rowData,
        this.getRegistrationBootIncarnation(),
        mutationOptions,
      );
    const completed =
      isEndpointIncarnationOutcomeCompleted(endpointOutcome.outcome) &&
      endpointOutcome.outcome !== ENDPOINT_INCARNATION_OUTCOME.ALREADY_ABSENT;
    if (!completed && endpointOutcome.error) throw endpointOutcome.error;
    return {
      success: completed,
      outcome: endpointOutcome.outcome,
      error: completed ? null : endpointOutcome.outcome,
    };
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
    if (!rowData || typeof rowData !== 'object') {
      return;
    }

    const systemTableCache =
      NodeService.getInstance().getSystemTableCache();
    if (
      !systemTableCache ||
      typeof systemTableCache.applySystemTableChange !==
        'function'
    ) {
      return;
    }

    createBootstrapCacheHydrationApplier(systemTableCache)(
      tableName,
      LOCAL_STR_UPSERT,
      rowData,
    );
  }

  getJoinAdmissionWriteRetryTimeoutMs() {
    const configured =
      this.delegates.getConfig?.()?.joinAdmissionWriteRetryTimeoutMs;
    if (Number.isFinite(configured) && configured >= 0) {
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
