import {readStateField} from '../utils/state-field-read.js';
import {PriorityPublicationSafetyTopology} from './priority-publication-safety-topology.js';
import {policyRefusalReason} from '../policy/table-policy-validation.js';
import {
  POLICY_AUTHORITY_STATE,
  POLICY_READ_REASON,
} from '../policy/policy-constants.js';
import {
  policyReadUnavailable,
  requirePolicyMinimumReplicaCount,
  resolveMessageGroupPolicyFactFromOwner,
  resolvePartitionPolicyFactFromOwner,
} from '../policy/table-policy-resolution.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SHARED} from './priority-publication-safety-shared.js';
import {classifySystemPartition} from '../bootstrap/system-partition-classification.js';
import {UNIFIED_SERVICE_TYPE} from
  '../constants/unified-service-lifecycle.js';
import {REBALANCER_DEFAULT_POLICY} from './rebalancer-constants.js';
import {
  readAuthoritativeEntityServiceRows,
} from './entity-service-row-read.js';
import {isValidLeaderReadAuthorityWitness} from
  '../control-plane/control-plane-authoritative-read-witness.js';
import {INITIAL_PARTITION_IDS} from
  '../bootstrap/system-table-schemas-constants.js';

import {
  hasAuthoritativeRemoveSafetyPlanningProvider,
  hasAvailablePriorityRecoveryPlanningProvider as hasAvailablePlanningProvider,
  readAuthoritativePriorityRecoveryPlanningSnapshotForRemoveSafety as
  readAuthoritativeRemoveSafetyPlanningSnapshot,
  readAvailablePriorityRecoveryPlanningSnapshot as readAvailablePlanningSnapshot,
} from './priority-recovery-planning-read.js';

const {
  REMOVE_SAFETY_READ_QUERY_OPTIONS,
  REMOVE_SAFETY_SQL,
  SERVICE_TYPE,
  SYSTEM_TABLE_NAME,
  normalizePriorityRecoveryOperationPartitionId,
  readAuthoritativeControlPlaneRows,
} = SHARED;

const AUTHORITATIVE_READ_AVAILABLE_PROP = 'authoritativeReadAvailable';

function createCriticalReplicaRowsList(
  rows = [],
  authoritativeReadAvailable = true,
) {
  const list = [...rows];
  Object.defineProperty(list, AUTHORITATIVE_READ_AVAILABLE_PROP, {
    value: Boolean(authoritativeReadAvailable),
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return list;
}

function isCompleteAuthoritativeServicesResult(result) {
  return Boolean(
    result?.success === true &&
      result?.partial !== true &&
      result?.rowSetComplete === true &&
      Array.isArray(result?.rows) &&
      isValidLeaderReadAuthorityWitness(
        result?.readAuthorityWitness,
        INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES],
      ),
  );
}

class PriorityPublicationSafetyRows extends PriorityPublicationSafetyTopology {
  async getCriticalReplicaRowsForSafety(partitionId) {
    const gateway = this.repository?.controlPlaneSystemTableGateway;
    if (!gateway) {
      return createCriticalReplicaRowsList([], false);
    }
    try {
      const result = await readAuthoritativeControlPlaneRows(
        gateway,
        SYSTEM_TABLE_NAME.SERVICES,
        REMOVE_SAFETY_SQL.SELECT_PARTITION_REPLICA_ROWS,
        [SERVICE_TYPE.PARTITION, partitionId],
        REMOVE_SAFETY_READ_QUERY_OPTIONS,
      );
      if (!isCompleteAuthoritativeServicesResult(result)) {
        return createCriticalReplicaRowsList([], false);
      }
      if (result.rows.length === 0) {
        return createCriticalReplicaRowsList([], true);
      }
      return createCriticalReplicaRowsList(
        result.rows
          .filter((row) => row && typeof row === 'object')
          .map((row) => ({...row})),
        true,
      );
    } catch {
      return createCriticalReplicaRowsList([], false);
    }
  }

  /**
   * Read the service rows owned by a non-partition rebalancer entity. The
   * canonical owner read is shared with coordinator admission. Removal safety
   * never merges or substitutes cache projection for owner evidence.
   * @param {Object} identity
   * @return {Promise<{available: boolean, rows: Object[]}>}
   */
  async getEntityReplicaRowsForSafety(identity) {
    const gateway = this.repository?.controlPlaneSystemTableGateway;
    if (!gateway) {
      return Object.freeze({
        available: false,
        rows: [],
      });
    }
    try {
      const result = await readAuthoritativeEntityServiceRows(
        gateway,
        identity,
        REMOVE_SAFETY_READ_QUERY_OPTIONS,
      );
      if (!isCompleteAuthoritativeServicesResult(result)) {
        return Object.freeze({
          available: false,
          rows: [],
        });
      }
      return Object.freeze({
        available: true,
        rows: result.rows,
      });
    } catch {
      return Object.freeze({
        available: false,
        rows: [],
      });
    }
  }

  async resolveEntityRemoveSafetyPolicyFact(entityType, entityId) {
    if (entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE) {
      const minReplicaCount =
        REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE.minReplicaCount;
      return Object.freeze({
        state: POLICY_AUTHORITY_STATE.AUTHORITATIVE_POLICY,
        minReplicaCount,
        targetReplicaCount: minReplicaCount,
        reason: null,
      });
    }
    if (entityType !== SERVICE_TYPE.MESSAGE_GROUP) {
      return Object.freeze({
        state: POLICY_AUTHORITY_STATE.AUTHORITATIVE_ABSENCE,
        minReplicaCount: null,
        targetReplicaCount: null,
        reason: POLICY_READ_REASON.UNSUPPORTED_ENTITY_TYPE,
      });
    }
    return resolveMessageGroupPolicyFactFromOwner(
      this.tablePolicyService,
      entityId,
      {requireAuthoritative: true},
    );
  }

  /**
   * Resolve the minimum live-replica floor from the policy owner for the
   * entity type. Runtime services own an availability floor; message groups
   * own a replicated-group target floor. Destructive REMOVE authorization
   * requires an accepted authoritative policy fact and never substitutes a
   * caller default when policy is absent, stale, or unavailable.
   * @param {string} entityType
   * @param {string} entityId
   * @return {Promise<number|null>}
   */
  async getEntityRemoveSafetyMinReplicaCount(entityType, entityId) {
    if (entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE) {
      return REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE.minReplicaCount;
    }
    if (entityType !== SERVICE_TYPE.MESSAGE_GROUP) {
      return null;
    }
    const decision = await this.resolveEntityRemoveSafetyPolicyFact(
      entityType,
      entityId,
    );
    if (decision?.state !== POLICY_AUTHORITY_STATE.AUTHORITATIVE_POLICY) {
      throw policyReadUnavailable(
        policyRefusalReason(decision, POLICY_READ_REASON.POLICY_READ_UNAVAILABLE),
        {
          groupId: entityId,
          authorityState:
            decision?.state || POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
        },
      );
    }
    return requirePolicyMinimumReplicaCount(decision);
  }

  getCachedCriticalPartitionRow(partitionId) {
    const systemTableCache = this.repository.systemTableCache;
    if (
      !partitionId ||
      !systemTableCache ||
      typeof systemTableCache.get !== 'function'
    ) {
      return null;
    }
    return (
      systemTableCache.get(SYSTEM_TABLE_NAME.PARTITIONS, partitionId) || null
    );
  }

  mergePartitionRowForSafety(authoritativeRow, cachedRow) {
    if (!authoritativeRow) {
      return null;
    }
    const mergedRow = {
      ...authoritativeRow,
    };
    // The owner-local canonical leader seed (the PARTITIONS-row sibling of
    // CL-035, partition-service-metadata-delivery-methods.js) makes an
    // actually-won LOCAL election visible before the durable leader
    // publication lands. A blunt authoritative-wins merge re-imposes the
    // stale durable leader for the whole publication round-trip (measured
    // 5-6s per ledger self-move during formation), deferring remove safety
    // on leadership the local raft already committed.
    //
    // The preference is TENURE-BOUND, not content-based (quest
    // local-leadership-tenure-bound-safety-evidence): it fires only when the
    // cached row carries this node's live tenure claim — the local-only
    // leader_claim_* annotations the projection stamps at election time with
    // the raft term the election was won at, nulled on demotion,
    // supersession, and replica teardown, and impossible for a CDC replay of
    // any durable row to carry. A row merely NAMING this node (a fossil of
    // an old tenure) or naming any other node keeps deferring to the
    // authoritative read.
    const localNodeId = this.repository?.nodeId;
    const cachedClaimNodeId =
      typeof cachedRow?.leader_claim_node_id === 'string' &&
      cachedRow.leader_claim_node_id.length > 0 ?
        cachedRow.leader_claim_node_id :
        null;
    const rawClaimTerm = cachedRow?.leader_claim_raft_term;
    const cachedClaimTerm =
      rawClaimTerm === null || rawClaimTerm === undefined ?
        Number.NaN :
        Number(rawClaimTerm);
    const liveLocalClaim =
      cachedClaimNodeId !== null &&
      cachedClaimNodeId === localNodeId &&
      cachedRow?.leader_node_id === cachedClaimNodeId &&
      Number.isFinite(cachedClaimTerm);
    if (liveLocalClaim && mergedRow.leader_node_id !== cachedClaimNodeId) {
      mergedRow.leader_node_id = cachedClaimNodeId;
    }
    return mergedRow;
  }

  async getCriticalPartitionRowForSafety(partitionId) {
    const gateway = this.repository?.controlPlaneSystemTableGateway;
    if (!partitionId || !gateway) {
      return null;
    }
    try {
      const result = await readAuthoritativeControlPlaneRows(
        gateway,
        SYSTEM_TABLE_NAME.PARTITIONS,
        REMOVE_SAFETY_SQL.SELECT_PARTITION_ROW,
        [partitionId],
        REMOVE_SAFETY_READ_QUERY_OPTIONS,
      );
      if (
        !result?.success ||
        !Array.isArray(result.rows) ||
        result.rows.length === 0
      ) {
        return null;
      }
      // Revalidate AFTER the await: a demotion (or successor publication)
      // landing while the authoritative read was in flight clears or
      // replaces the cached leader projection, and a pre-await capture must
      // not resurrect the superseded self-belief into the merge (external
      // review TOCTOU, 2026-07-17). The post-await cache state is the
      // freshest local truth the preference may consult.
      const postAwaitCachedRow =
        this.getCachedCriticalPartitionRow(partitionId);
      return this.mergePartitionRowForSafety(
        result.rows[0],
        postAwaitCachedRow,
      );
    } catch {
      return null;
    }
  }

  async resolvePartitionRemoveSafetyPolicyFact(partitionId) {
    return resolvePartitionPolicyFactFromOwner(
      this.tablePolicyService,
      partitionId,
      {requireAuthoritative: true},
    );
  }

  async getCriticalMinReplicaCount(partitionId) {
    const decision = await this.resolvePartitionRemoveSafetyPolicyFact(
      partitionId,
    );
    if (decision?.state !== POLICY_AUTHORITY_STATE.AUTHORITATIVE_POLICY) {
      throw policyReadUnavailable(
        policyRefusalReason(decision, POLICY_READ_REASON.POLICY_READ_UNAVAILABLE),
        {
          partitionId,
          authorityState:
            decision?.state || POLICY_AUTHORITY_STATE.UNAVAILABLE_OR_STALE,
        },
      );
    }
    return requirePolicyMinimumReplicaCount(decision);
  }

  isNodeReadyForRouting(nodeId, options = {}) {
    if (!nodeId) {
      return false;
    }
    const decisionDimension =
      typeof options?.decisionDimension === 'string' &&
      options.decisionDimension.length > 0 ?
        options.decisionDimension :
        this.resolveOperationReadinessDecisionDimension(
          options?.partitionId || null,
        );
    const participationKind = options?.participationKind || null;
    if (
      participationKind &&
      this.controlPlaneReadinessService &&
      typeof this.controlPlaneReadinessService
        .getControlPlaneParticipationSync === 'function'
    ) {
      const participation =
        this.controlPlaneReadinessService.getControlPlaneParticipationSync(
          nodeId,
          {
            decisionDimension,
            participationKind,
            partitionId: options?.partitionId || null,
          },
        );
      return participation?.eligible === true;
    }
    const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(
      nodeId,
      {
        decisionDimension: decisionDimension,
      },
    );
    return this.isReadinessDimensionSatisfied(readiness, decisionDimension);
  }

  /**
   * The planning-read context for one operation, or null when this operation
   * is not a priority-control-plane partition or no readiness service is
   * installed. Classification and clock belong to this family; the read
   * POLICY belongs to priority-recovery-planning-read.js.
   * @param {Object} operation
   * @return {Object|null}
   * @private
   */
  resolvePriorityRecoveryPlanningReadContext(operation) {
    const partitionId = normalizePriorityRecoveryOperationPartitionId(
      operation,
    );
    if (
      !operation ||
      !classifySystemPartition({
        partitionId,
      }).priorityControlPlane
    ) {
      return null;
    }
    const readinessService = this.controlPlaneReadinessService;
    if (!readinessService) {
      return null;
    }
    return {
      readinessService,
      publicationNodeId: String(this.nodeId || '').trim(),
      // The OWNER's clock, not the ambient one. observedAt becomes the
      // planning currency the readiness memo is keyed on, so reading host
      // wall time here makes a simulated node's planning generation advance
      // with the host rather than with its own virtual clock - the same
      // ambient-clock seam the timeout path already routes through
      // resolveTimeoutCheckNowMs.
      observedAt: typeof this.resolveTimeoutCheckNowMs === 'function' ?
        this.resolveTimeoutCheckNowMs() :
        Date.now(),
    };
  }

  /**
   * AVAILABLE planning evidence: narration, progress and follow-up. This read
   * can never classify a REMOVE as SAFE.
   * @param {Object} operation
   * @return {Promise<Object|null>}
   */
  async readAvailablePriorityRecoveryPlanningSnapshot(operation) {
    const read = this.resolvePriorityRecoveryPlanningReadContext(operation);
    if (!read || !hasAvailablePlanningProvider(read.readinessService)) {
      return null;
    }
    return readAvailablePlanningSnapshot(read);
  }

  /**
   * AUTHORITATIVE planning evidence for a REMOVE-safety decision. A safety
   * decision must not consume evidence that merely happened to be available,
   * and it must never fall back to the available surface to make removal
   * progress: absent owner-read evidence means removal defers, which is the
   * fail-closed shape this contract relies on.
   * @param {Object} operation
   * @return {Promise<Object|null>}
   */
  async readAuthoritativePriorityRecoveryPlanningSnapshotForRemoveSafety(
    operation,
  ) {
    const read = this.resolvePriorityRecoveryPlanningReadContext(operation);
    if (
      !read ||
      !hasAuthoritativeRemoveSafetyPlanningProvider(read.readinessService)
    ) {
      return null;
    }
    return readAuthoritativeRemoveSafetyPlanningSnapshot(read);
  }

  normalizePriorityPublicationStatus(planningSnapshot) {
    if (!planningSnapshot || typeof planningSnapshot !== 'object') {
      return null;
    }
    const publicationStatus = readStateField(
      planningSnapshot.publicationStatus,
      planningSnapshot.status,
    );
    return publicationStatus ? publicationStatus.trim().toUpperCase() : null;
  }
}

export {PriorityPublicationSafetyRows};
