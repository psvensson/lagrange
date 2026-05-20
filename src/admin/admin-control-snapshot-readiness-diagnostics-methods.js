const LOCAL_STR_CONSTRUCTOR = 'constructor';
const LOCAL_PUBLICATION_DIAGNOSTIC_STATE = Object.freeze({
  AVAILABLE: 'available',
  KNOWN: 'known',
  UNAVAILABLE: 'unavailable',
});
const LOCAL_PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE =
  'reconcile_owner_membership_publication';
const LOCAL_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD = Object.freeze({
  EXPECTED_NODE_IDS: 'expectedNodeIds',
  NEXT_ACTION: 'nextAction',
  PENDING_RECONCILE_COUNT: 'pendingReconcileCount',
  PENDING_RECONCILE_NODE_IDS: 'pendingReconcileNodeIds',
  PUBLICATION_ACTIVE_GATE_HANDOFF: 'publicationActiveGateHandoff',
  PUBLISHED_ACTIVE_NODE_IDS: 'publishedActiveNodeIds',
});
const LOCAL_PUBLICATION_SELECTION_DECISION = Object.freeze({
  FALLBACK: 'fallback',
  READINESS: 'readiness',
  UNAVAILABLE: 'unavailable',
});
const LOCAL_PUBLICATION_SELECTION_EMPTY_COUNT = 0;
const LOCAL_PUBLICATION_SELECTION_EMPTY_SOURCE = Object.freeze({});
const LOCAL_PUBLICATION_SELECTION_EMPTY_TEXT = '';
const LOCAL_PUBLICATION_SELECTION_ORDER_UNAVAILABLE = Number.NEGATIVE_INFINITY;
const LOCAL_PUBLICATION_SELECTION_DECISION_TABLE = Object.freeze([
  Object.freeze({
    decision: LOCAL_PUBLICATION_SELECTION_DECISION.FALLBACK,
    matches: (evidence) =>
      evidence.useAuthoritativeHandoffReconcileFallback === true,
  }),
  Object.freeze({
    decision: LOCAL_PUBLICATION_SELECTION_DECISION.FALLBACK,
    matches: (evidence) => evidence.useDurablePublishedFallback === true,
  }),
  Object.freeze({
    decision: LOCAL_PUBLICATION_SELECTION_DECISION.READINESS,
    matches: (evidence) => evidence.readinessAvailable === true,
  }),
  Object.freeze({
    decision: LOCAL_PUBLICATION_SELECTION_DECISION.FALLBACK,
    matches: (evidence) => evidence.fallbackAvailable === true,
  }),
  Object.freeze({
    decision: LOCAL_PUBLICATION_SELECTION_DECISION.UNAVAILABLE,
    matches: () => true,
  }),
]);

function assignAdminControlSnapshotReadinessDiagnosticsMethods(
  AdminControlSnapshot,
  options = {},
) {
  const {
    ADMIN_CACHE_DUMP,
    ADMIN_CONTROL_SNAPSHOT_LITERAL,
    COLUMN,
    CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT,
    CONTROL_PLANE_PUBLICATION_STORY_NODE_STATE_FIELD,
    CONTROL_PLANE_PUBLICATION_STORY_SYNC_METHOD,
    CONTROL_PLANE_READINESS_DIMENSION,
    MANAGED_SPLIT_WORKFLOW_TYPE,
    PARTITION_TRANSITION_METADATA_FIELD,
    TYPEOF,
    buildCanonicalPublicationRecoveryEvidence,
    buildPublicationRecoveryProtocolSnapshot,
    firstStringField,
    uniqueSorted,
  } = options;
  class AdminControlSnapshotReadinessDiagnosticsMethods {
    resolveCanonicalPublicationRecoveryEvidenceDiagnostics(
      readinessEntries = [],
      publicationConvergence = null,
      priorityRecoveryDecisionSnapshots = null,
      options = {},
    ) {
      let readinessPublicationRecoveryGate = null;
      let readinessPriorityControlPlaneRecovery = null;
      for (const readiness of Array.isArray(readinessEntries) ?
        readinessEntries :
        []) {
        const priorityControlPlaneRecovery =
          readiness?.priorityControlPlaneRecovery;
        if (
          !priorityControlPlaneRecovery ||
          typeof priorityControlPlaneRecovery !== TYPEOF.OBJECT
        ) {
          continue;
        }
        const publicationRecoveryGate =
          priorityControlPlaneRecovery.publicationRecoveryGate;
        if (
          !publicationRecoveryGate ||
          typeof publicationRecoveryGate !== TYPEOF.OBJECT
        ) {
          continue;
        }
        readinessPublicationRecoveryGate = publicationRecoveryGate;
        readinessPriorityControlPlaneRecovery = priorityControlPlaneRecovery;
        break;
      }
      const normalizedPublicationConvergence =
        publicationConvergence &&
        typeof publicationConvergence === TYPEOF.OBJECT ?
          publicationConvergence :
          null;
      if (
        !readinessPublicationRecoveryGate &&
        !normalizedPublicationConvergence &&
        !priorityRecoveryDecisionSnapshots
      ) {
        return Object.freeze({
          publicationConvergence: null,
          publicationConvergenceGate: null,
          priorityRecoveryObservation: null,
        });
      }
      const gateScopedEvidence = buildCanonicalPublicationRecoveryEvidence({
        publicationConvergence: normalizedPublicationConvergence,
        publicationConvergenceGate: readinessPublicationRecoveryGate,
        priorityRecoveryObservation:
          readinessPriorityControlPlaneRecovery?.priorityRecoveryObservation ||
          null,
        priorityRecoveryDecisionSnapshots:
          readinessPublicationRecoveryGate?.ready === true ?
            null :
            priorityRecoveryDecisionSnapshots,
        logsTable: options.logsTable || null,
        publicationActiveGateHandoff: options.publicationActiveGateHandoff,
      });
      if (!priorityRecoveryDecisionSnapshots) {
        return gateScopedEvidence;
      }
      return Object.freeze({
        publicationConvergence:
          gateScopedEvidence.publicationConvergence,
        publicationConvergenceGate:
          gateScopedEvidence.publicationConvergenceGate,
        priorityRecoveryObservation:
          buildCanonicalPublicationRecoveryEvidence({
            publicationConvergence:
              gateScopedEvidence.publicationConvergence ||
              normalizedPublicationConvergence,
            publicationConvergenceGate:
              gateScopedEvidence.publicationConvergenceGate,
            priorityRecoveryObservation:
              readinessPriorityControlPlaneRecovery
                ?.priorityRecoveryObservation ||
              null,
            priorityRecoveryDecisionSnapshots,
            logsTable: options.logsTable || null,
            publicationActiveGateHandoff: options.publicationActiveGateHandoff,
          }).priorityRecoveryObservation ||
          gateScopedEvidence.priorityRecoveryObservation,
      });
    }

    resolvePublicationConvergenceGateDiagnostics(
      readinessEntries = [],
      publicationConvergence = null,
      priorityRecoveryDecisionSnapshots = null,
    ) {
      return this.resolveCanonicalPublicationRecoveryEvidenceDiagnostics(
        readinessEntries,
        publicationConvergence,
        priorityRecoveryDecisionSnapshots,
      ).publicationConvergenceGate;
    }

    resolvePublicationConvergenceDiagnostics(
      readinessEntries = [],
      fallbackPublication = null,
      options = {},
    ) {
      const unavailablePublicationDiagnostics = Object.freeze({
        publicationObservation: Object.freeze(
          {state: LOCAL_PUBLICATION_DIAGNOSTIC_STATE.UNAVAILABLE},
        ),
        timestamps: Object.freeze({
          publishedAt: Object.freeze({
            state: LOCAL_PUBLICATION_DIAGNOSTIC_STATE.UNAVAILABLE,
          }),
          updatedAt: Object.freeze({
            state: LOCAL_PUBLICATION_DIAGNOSTIC_STATE.UNAVAILABLE,
          }),
        }),
      });
      const normalizePublicationStatus = (value) =>
        String(value || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE).toUpperCase();
      const resolvePublicationOrderingValue = (...values) => {
        for (const value of values) {
          const normalized = Number(value);
          if (Number.isFinite(normalized)) {
            return normalized;
          }
        }
        return LOCAL_PUBLICATION_SELECTION_ORDER_UNAVAILABLE;
      };
      const normalizePublicationSelectionNodeId = (value) => {
        const normalizedValue = String(
          value || LOCAL_PUBLICATION_SELECTION_EMPTY_TEXT,
        ).trim();
        return normalizedValue.length > LOCAL_PUBLICATION_SELECTION_EMPTY_COUNT ?
          normalizedValue :
          null;
      };
      const normalizePublicationSelectionNodeIds = (values = []) =>
        Object.freeze(
          [
            ...new Set(
              (Array.isArray(values) ? values : [])
                .map((value) => normalizePublicationSelectionNodeId(value))
                .filter((value) => value !== null),
            ),
          ].sort((left, right) => left.localeCompare(right)),
        );
      const selectPublicationActiveGateHandoff = (value = null) => {
        if (!value || typeof value !== TYPEOF.OBJECT || Array.isArray(value)) {
          return null;
        }
        const nestedHandoff =
          value[
            LOCAL_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
              .PUBLICATION_ACTIVE_GATE_HANDOFF
          ];
        if (
          nestedHandoff &&
          typeof nestedHandoff === TYPEOF.OBJECT &&
          !Array.isArray(nestedHandoff)
        ) {
          return nestedHandoff;
        }
        return value;
      };
      const buildPublicationActiveGateHandoffEvidence = (
        publicationActiveGateHandoff = null,
      ) => {
        const selectedHandoff = selectPublicationActiveGateHandoff(
          publicationActiveGateHandoff,
        );
        if (!selectedHandoff) {
          return Object.freeze({
            reconcileTargetNodeIds: Object.freeze([]),
            reconcileSignalAvailable: false,
          });
        }
        const pendingReconcileNodeIds = normalizePublicationSelectionNodeIds(
          selectedHandoff[
            LOCAL_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
              .PENDING_RECONCILE_NODE_IDS
          ],
        );
        const publishedActiveNodeIds = normalizePublicationSelectionNodeIds(
          selectedHandoff[
            LOCAL_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
              .PUBLISHED_ACTIVE_NODE_IDS
          ],
        );
        const reconcileTargetNodeIds = normalizePublicationSelectionNodeIds([
          ...publishedActiveNodeIds,
          ...pendingReconcileNodeIds,
        ]);
        const fallbackTargetNodeIds =
          reconcileTargetNodeIds.length >
            LOCAL_PUBLICATION_SELECTION_EMPTY_COUNT ?
            reconcileTargetNodeIds :
            normalizePublicationSelectionNodeIds(
              selectedHandoff[
                LOCAL_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.EXPECTED_NODE_IDS
              ],
            );
        return Object.freeze({
          reconcileTargetNodeIds: fallbackTargetNodeIds,
          reconcileSignalAvailable:
            selectedHandoff[
              LOCAL_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.NEXT_ACTION
            ] ===
              LOCAL_PUBLICATION_ACTIVE_GATE_HANDOFF_NEXT_ACTION_RECONCILE ||
            pendingReconcileNodeIds.length >
              LOCAL_PUBLICATION_SELECTION_EMPTY_COUNT ||
            Number(
              selectedHandoff[
                LOCAL_PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD
                  .PENDING_RECONCILE_COUNT
              ],
            ) > LOCAL_PUBLICATION_SELECTION_EMPTY_COUNT,
        });
      };
      const publicationCandidateCoversTarget = (
        publicationCandidate,
        targetNodeIds,
      ) => {
        if (
          publicationCandidate?.available !== true ||
          !Array.isArray(targetNodeIds) ||
          targetNodeIds.length === LOCAL_PUBLICATION_SELECTION_EMPTY_COUNT
        ) {
          return false;
        }
        const publishedActiveNodeIdSet = new Set(
          publicationCandidate.publishedActiveNodeIds,
        );
        return targetNodeIds.every((nodeId) =>
          publishedActiveNodeIdSet.has(nodeId),
        );
      };
      const buildPublicationDiagnostics = (
        membershipPublication,
        timestampFields = {},
      ) => {
        const publicationSnapshot = buildPublicationRecoveryProtocolSnapshot(
          membershipPublication,
        );
        if (!publicationSnapshot) {
          return unavailablePublicationDiagnostics;
        }
        const requiredAckNodeIds = [...publicationSnapshot.requiredAckNodeIds];
        const acknowledgedNodeIds = [
          ...publicationSnapshot.acknowledgedNodeIds,
        ];
        const publishedAtKnown = Number.isFinite(timestampFields.publishedAt);
        const updatedAtKnown = Number.isFinite(timestampFields.updatedAt);
        return {
          publicationObservation: {
            state: LOCAL_PUBLICATION_DIAGNOSTIC_STATE.AVAILABLE,
            epoch: publicationSnapshot.publicationEpoch,
            status: publicationSnapshot.publicationStatus,
          },
          publicationEpoch: publicationSnapshot.publicationEpoch,
          status: publicationSnapshot.publicationStatus,
          publicationStatus: publicationSnapshot.publicationStatus,
          publishedActiveNodeIds: [
            ...publicationSnapshot.publishedActiveNodeIds,
          ],
          requiredAckNodeIds,
          acknowledgedNodeIds,
          pendingAckNodeIds: requiredAckNodeIds.filter(
            (nodeId) => !acknowledgedNodeIds.includes(nodeId),
          ),
          priorityPartitionSummary:
            publicationSnapshot.priorityPartitionSummary,
          sourceTopologyEpoch: publicationSnapshot.sourceTopologyEpoch,
          sourceSnapshotVersion: publicationSnapshot.sourceSnapshotVersion,
          timestamps: {
            publishedAt: publishedAtKnown ? {
              state: LOCAL_PUBLICATION_DIAGNOSTIC_STATE.KNOWN,
              value: timestampFields.publishedAt,
            } : {state: LOCAL_PUBLICATION_DIAGNOSTIC_STATE.UNAVAILABLE},
            updatedAt: updatedAtKnown ? {
              state: LOCAL_PUBLICATION_DIAGNOSTIC_STATE.KNOWN,
              value: timestampFields.updatedAt,
            } : {state: LOCAL_PUBLICATION_DIAGNOSTIC_STATE.UNAVAILABLE},
          },
          ...(publishedAtKnown ?
            {publishedAt: timestampFields.publishedAt} :
            {}),
          ...(updatedAtKnown ? {updatedAt: timestampFields.updatedAt} : {}),
          membershipLifecycleSummary:
            publicationSnapshot.membershipLifecycleSummary,
          projectionDiagnostics: publicationSnapshot.projectionDiagnostics,
          recoveryActiveNodeIds: publicationSnapshot.recoveryActiveNodeIds,
          recoveryActiveNodeSource:
            publicationSnapshot.recoveryActiveNodeSource,
          missingPublishedRecoveryActiveNodeIds:
            publicationSnapshot.missingPublishedRecoveryActiveNodeIds,
          participationByNodeId: publicationSnapshot.participationByNodeId,
          participationStateCounts:
            publicationSnapshot.participationStateCounts,
          recoveryProtocolState: publicationSnapshot.recoveryProtocolState,
          priorityRecoveryReasonCodes:
            publicationSnapshot.priorityRecoveryReasonCodes,
          publicationRecoveryGate: publicationSnapshot.publicationRecoveryGate,
        };
      };
      const buildPublicationCandidate = (
        membershipPublication,
        timestampFields = {},
        sourceEvidence = {},
      ) => {
        const diagnostics = buildPublicationDiagnostics(
          membershipPublication,
          timestampFields,
        );
        const publishedActiveNodeIds =
          Array.isArray(diagnostics.publishedActiveNodeIds) ?
            diagnostics.publishedActiveNodeIds : [];
        const priorityPartitionSummary =
          diagnostics.priorityPartitionSummary &&
          typeof diagnostics.priorityPartitionSummary === TYPEOF.OBJECT ?
            diagnostics.priorityPartitionSummary :
            LOCAL_PUBLICATION_SELECTION_EMPTY_SOURCE;
        const hasSourcePriorityControlPlaneRecovery =
          Boolean(
            sourceEvidence.priorityControlPlaneRecovery &&
            typeof sourceEvidence.priorityControlPlaneRecovery ===
              TYPEOF.OBJECT,
          );
        const ownerRecoveryEvidenceAvailable =
          hasSourcePriorityControlPlaneRecovery === true ||
          priorityPartitionSummary?.satisfied === false ||
          (
            Array.isArray(priorityPartitionSummary?.missingPartitionIds) &&
            priorityPartitionSummary.missingPartitionIds.length >
              LOCAL_PUBLICATION_SELECTION_EMPTY_COUNT
          ) ||
          (
            Array.isArray(priorityPartitionSummary?.blockedPartitions) &&
            priorityPartitionSummary.blockedPartitions.length >
              LOCAL_PUBLICATION_SELECTION_EMPTY_COUNT
          );
        return Object.freeze({
          diagnostics,
          available: diagnostics.publicationObservation?.state ===
            LOCAL_PUBLICATION_DIAGNOSTIC_STATE.AVAILABLE,
          ownerRecoveryEvidenceAvailable,
          publicationStatus: normalizePublicationStatus(
            diagnostics.publicationStatus || diagnostics.status),
          publicationEpoch:
            resolvePublicationOrderingValue(diagnostics.publicationEpoch),
          publishedAt: resolvePublicationOrderingValue(
            timestampFields.publishedAt,
            diagnostics.publishedAt),
          updatedAt: resolvePublicationOrderingValue(
            timestampFields.updatedAt,
            diagnostics.updatedAt),
          publishedActiveNodeIds: normalizePublicationSelectionNodeIds(
            publishedActiveNodeIds,
          ),
          publishedActiveNodeCount: publishedActiveNodeIds.length,
        });
      };
      const unavailablePublicationCandidate = Object.freeze({
        diagnostics: unavailablePublicationDiagnostics,
        available: false,
        ownerRecoveryEvidenceAvailable: false,
        publicationStatus: normalizePublicationStatus(
          unavailablePublicationDiagnostics.publicationObservation?.state,
        ),
        publicationEpoch: LOCAL_PUBLICATION_SELECTION_ORDER_UNAVAILABLE,
        publishedAt: LOCAL_PUBLICATION_SELECTION_ORDER_UNAVAILABLE,
        updatedAt: LOCAL_PUBLICATION_SELECTION_ORDER_UNAVAILABLE,
        publishedActiveNodeIds: Object.freeze([]),
        publishedActiveNodeCount: LOCAL_PUBLICATION_SELECTION_EMPTY_COUNT,
      });
      let readinessCandidate = unavailablePublicationCandidate;
      for (const readiness of Array.isArray(readinessEntries) ?
        readinessEntries :
        []) {
        const membershipPublication = readiness?.membershipPublication;
        if (
          !membershipPublication ||
          typeof membershipPublication !== TYPEOF.OBJECT
        ) {
          continue;
        }
        readinessCandidate = buildPublicationCandidate(membershipPublication, {
          publishedAt: membershipPublication.publishedAt,
          updatedAt: membershipPublication.updatedAt,
        }, {
          priorityControlPlaneRecovery:
            readiness.priorityControlPlaneRecovery,
        });
        break;
      }
      let fallbackCandidate = unavailablePublicationCandidate;
      if (fallbackPublication && typeof fallbackPublication === TYPEOF.OBJECT) {
        fallbackCandidate = buildPublicationCandidate(fallbackPublication, {
          publishedAt:
            fallbackPublication.publishedAt ?? fallbackPublication.published_at,
          updatedAt:
            fallbackPublication.updatedAt ?? fallbackPublication.updated_at,
        });
      }
      const readinessPublished = readinessCandidate?.available === true &&
        readinessCandidate.publicationStatus ===
          ADMIN_CONTROL_SNAPSHOT_LITERAL.PUBLISHED;
      const fallbackPublished = fallbackCandidate?.available === true &&
        fallbackCandidate.publicationStatus ===
          ADMIN_CONTROL_SNAPSHOT_LITERAL.PUBLISHED;
      const bothPublished = readinessPublished && fallbackPublished;
      const handoffEvidence = buildPublicationActiveGateHandoffEvidence(
        options.publicationActiveGateHandoff,
      );
      const authoritativeHandoffObservation =
        handoffEvidence.reconcileSignalAvailable === true &&
        (
          options.preferAuthoritativePublicationRead === true ||
          options.reconcileAuthoritativeMembershipPublication === true
        );
      const selectionEvidence = Object.freeze({
        readinessAvailable: readinessCandidate.available === true,
        fallbackAvailable: fallbackCandidate.available === true,
        useAuthoritativeHandoffReconcileFallback:
          authoritativeHandoffObservation === true &&
          fallbackPublished === true &&
          publicationCandidateCoversTarget(
            fallbackCandidate,
            handoffEvidence.reconcileTargetNodeIds,
          ),
        useDurablePublishedFallback: bothPublished &&
          readinessCandidate.ownerRecoveryEvidenceAvailable !== true && (
          fallbackCandidate.publishedActiveNodeCount >
            readinessCandidate.publishedActiveNodeCount ||
          fallbackCandidate.publicationEpoch > readinessCandidate.publicationEpoch ||
          fallbackCandidate.publishedAt > readinessCandidate.publishedAt ||
          fallbackCandidate.updatedAt > readinessCandidate.updatedAt),
      });
      const selectedDecision = LOCAL_PUBLICATION_SELECTION_DECISION_TABLE
        .find((row) => row.matches(selectionEvidence))?.decision ||
        LOCAL_PUBLICATION_SELECTION_DECISION.UNAVAILABLE;
      if (selectedDecision === LOCAL_PUBLICATION_SELECTION_DECISION.READINESS) {
        return readinessCandidate.diagnostics;
      }
      if (selectedDecision === LOCAL_PUBLICATION_SELECTION_DECISION.FALLBACK) {
        return fallbackCandidate.diagnostics;
      }
      return unavailablePublicationDiagnostics;
    }
    resolvePriorityControlPlaneRecoveryByNodeId(readinessEntries = []) {
      const entries = {};
      for (const readiness of Array.isArray(readinessEntries) ?
        readinessEntries :
        []) {
        const nodeId = firstStringField(readiness, COLUMN.NODE_ID, 'nodeId');
        if (!nodeId) {
          continue;
        }
        const priorityControlPlaneRecovery =
          readiness?.priorityControlPlaneRecovery;
        if (
          !priorityControlPlaneRecovery ||
          typeof priorityControlPlaneRecovery !== TYPEOF.OBJECT
        ) {
          continue;
        }
        entries[nodeId] = priorityControlPlaneRecovery;
      }
      return entries;
    }
    /**
     * Resolve canonical readiness vectors when the owner is available.
     * @return {Promise<Array<Object>>}
     * @private
     */
    async resolveControlPlaneReadinessEntries(options = {}) {
      if (
        !this.controlPlaneReadinessService ||
        typeof this.controlPlaneReadinessService.getAllNodeReadiness !==
          TYPEOF.FUNCTION
      ) {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
      try {
        const readiness =
          await this.controlPlaneReadinessService.getAllNodeReadiness({
            allowAuthoritativeRefresh:
              options.allowAuthoritativeRefresh !== false,
            allowStaleOnCacheChange: options.allowStaleOnCacheChange !== false,
            maxCachedAgeMs: this.readinessSnapshotCacheMaxAgeMs,
          });
        return Array.isArray(readiness) ? readiness : ADMIN_CACHE_DUMP.EMPTY;
      } catch (_error) {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
    }
    /**
     * Build one placement-eligibility explanation from canonical readiness.
     * @param {Object} readiness
     * @return {Object}
     * @private
     */
    buildPlacementEligibilityExplanation(readiness) {
      const dimensions =
        readiness?.dimensions && typeof readiness.dimensions === TYPEOF.OBJECT ?
          readiness.dimensions :
          {};
      const reasons = Array.isArray(readiness?.reasons) ?
        readiness.reasons :
        ADMIN_CACHE_DUMP.EMPTY;
      return {
        nodeId: firstStringField(
          readiness,
          COLUMN.NODE_ID,
          ADMIN_CONTROL_SNAPSHOT_LITERAL.NODEID,
        ),
        placementEligible:
          dimensions[CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE] ===
          true,
        failedDimensions: uniqueSorted(
          Object.entries(dimensions)
            .filter(([_dimension, value]) => value !== true)
            .map(([dimension]) => dimension),
        ),
        reasonCodes: uniqueSorted(
          reasons
            .map((reason) =>
              String(reason?.code || ADMIN_CONTROL_SNAPSHOT_LITERAL.VALUE),
            )
            .filter(Boolean),
        ),
        reasons,
      };
    }
    /**
     * Resolve the current publication-mode diagnostics.
     * @param {Array<Object>} readinessEntries
     * @return {Object|null}
     * @private
     */
    resolvePublicationModeDiagnostics(readinessEntries = []) {
      for (const readiness of readinessEntries) {
        const publication = readiness?.publication;
        if (publication && typeof publication === TYPEOF.OBJECT) {
          return publication;
        }
      }
      const publicationService =
        this.controlPlaneReadinessService?.cdcGroupPropagationService || null;
      if (
        publicationService &&
        typeof publicationService.getPublicationModeDiagnostics ===
          TYPEOF.FUNCTION
      ) {
        return publicationService.getPublicationModeDiagnostics();
      }
      return null;
    }
    /**
     * Resolve recent readiness transitions recorded by the canonical owner.
     * @return {Object}
     * @private
     */
    resolveReadinessTransitionHistory() {
      if (
        !this.controlPlaneReadinessService ||
        typeof this.controlPlaneReadinessService
          .getReadinessTransitionHistoryByNodeId !== TYPEOF.FUNCTION
      ) {
        return {};
      }
      try {
        const history =
          this.controlPlaneReadinessService.getReadinessTransitionHistoryByNodeId();
        return history && typeof history === TYPEOF.OBJECT ? history : {};
      } catch (_error) {
        return {};
      }
    }
    /**
     * Resolve recent canonical participation decisions.
     * @return {Object[]}
     * @private
     */
    resolveParticipationDecisionDiagnostics() {
      if (
        !this.controlPlaneReadinessService ||
        typeof this.controlPlaneReadinessService
          .getParticipationDecisionLedgerEntries !== TYPEOF.FUNCTION
      ) {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
      try {
        const entries =
          this.controlPlaneReadinessService.getParticipationDecisionLedgerEntries(
            {limit: CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT},
          );
        return Array.isArray(entries) ? entries : ADMIN_CACHE_DUMP.EMPTY;
      } catch (_error) {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
    }
    /**
     * Resolve recent authoritative readiness repair attempts.
     * @return {Object[]}
     * @private
     */
    resolveAuthoritativeReadinessRepairDiagnostics() {
      if (
        !this.controlPlaneReadinessService ||
        typeof this.controlPlaneReadinessService
          .getAuthoritativeReadinessRepairLedgerEntries !== TYPEOF.FUNCTION
      ) {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
      try {
        const entries =
          this.controlPlaneReadinessService.getAuthoritativeReadinessRepairLedgerEntries(
            {limit: CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT},
          );
        return Array.isArray(entries) ? entries : ADMIN_CACHE_DUMP.EMPTY;
      } catch (_error) {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
    }
    /**
     * Resolve bounded recovery epoch history by node.
     * @return {Object}
     * @private
     */
    resolveRecoveryEpochDiagnostics() {
      if (
        !this.controlPlaneReadinessService ||
        typeof this.controlPlaneReadinessService
          .getRecoveryEpochHistoryByNodeId !== TYPEOF.FUNCTION
      ) {
        return {};
      }
      try {
        const history =
          this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId();
        return history && typeof history === TYPEOF.OBJECT ? history : {};
      } catch (_error) {
        return {};
      }
    }
    /**
     * Resolve recent control-plane system-table operations.
     * @return {Object[]}
     * @private
     */
    resolveControlPlaneOperationDiagnostics() {
      if (
        !this.controlPlaneSystemTableGateway ||
        typeof this.controlPlaneSystemTableGateway
          .getControlPlaneOperationLedgerEntries !== TYPEOF.FUNCTION
      ) {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
      try {
        const entries =
          this.controlPlaneSystemTableGateway.getControlPlaneOperationLedgerEntries(
            {limit: CONTROL_PLANE_DIAGNOSTICS_LEDGER_LIMIT},
          );
        return Array.isArray(entries) ? entries : ADMIN_CACHE_DUMP.EMPTY;
      } catch (_error) {
        return ADMIN_CACHE_DUMP.EMPTY;
      }
    }
    /**
     * Resolve heartbeat publication diagnostics from the local owner.
     * @return {Object|null}
     * @private
     */
    resolveHeartbeatPublicationDiagnostics() {
      if (
        this.controlPlaneReadinessService &&
        typeof this.controlPlaneReadinessService[
          CONTROL_PLANE_PUBLICATION_STORY_SYNC_METHOD
        ] === TYPEOF.FUNCTION
      ) {
        try {
          const publicationStory = this.controlPlaneReadinessService[
            CONTROL_PLANE_PUBLICATION_STORY_SYNC_METHOD
          ](this.nodeId, this.nowFn());
          const nodeStatePublication =
            publicationStory?.[
              CONTROL_PLANE_PUBLICATION_STORY_NODE_STATE_FIELD
            ];
          if (
            nodeStatePublication &&
            typeof nodeStatePublication === TYPEOF.OBJECT
          ) {
            return nodeStatePublication;
          }
        } catch (_error) {
          void _error;
        }
      }
      if (
        !this.heartbeatService ||
        typeof this.heartbeatService.getHeartbeatPublicationDiagnostics !==
          TYPEOF.FUNCTION
      ) {
        return null;
      }
      try {
        const diagnostics =
          this.heartbeatService.getHeartbeatPublicationDiagnostics();
        return diagnostics && typeof diagnostics === TYPEOF.OBJECT ?
          diagnostics :
          null;
      } catch (_error) {
        return null;
      }
    }
    /**
     * Resolve split-evaluation diagnostics from the canonical owner.
     * @return {Object|null}
     * @private
     */
    resolveSplitEvaluationDiagnostics() {
      const splitManager = this.sqlQueryEngine?.partitionSplitMergeManager;
      if (
        !splitManager ||
        typeof splitManager.getEvaluationDiagnostics !== TYPEOF.FUNCTION
      ) {
        return null;
      }
      try {
        const diagnostics = splitManager.getEvaluationDiagnostics();
        return diagnostics && typeof diagnostics === TYPEOF.OBJECT ?
          diagnostics :
          null;
      } catch (_error) {
        return null;
      }
    }
    /**
     * Build persisted workflow-admission diagnostics from table metadata.
     * @param {Array<Object>} tableRows
     * @return {Object}
     * @private
     */
    buildWorkflowAdmissionDiagnostics(tableRows = []) {
      const workflowAdmissionsByWorkflowId = {};
      const timeoutClassifications = [];
      for (const tableRow of Array.isArray(tableRows) ? tableRows : []) {
        const workflow = this.buildWorkflowAdmissionEntry(tableRow);
        if (!workflow) {
          continue;
        }
        workflowAdmissionsByWorkflowId[workflow.workflowId] = workflow;
        if (
          workflow.timeoutClassification &&
          typeof workflow.timeoutClassification === TYPEOF.OBJECT
        ) {
          timeoutClassifications.push({
            workflowId: workflow.workflowId,
            workflowType: workflow.workflowType,
            tableId: workflow.tableId,
            tableName: workflow.tableName,
            transitionState: workflow.transitionState,
            timeoutClassification: workflow.timeoutClassification,
          });
        }
      }
      return {
        workflowAdmissionsByWorkflowId,
        timeoutClassifications,
      };
    }
    resolveWorkflowTransitionMetadataObject(metadata, field) {
      const entry = metadata?.[field];
      if (entry && typeof entry === TYPEOF.OBJECT) {
        return entry;
      }
      return null;
    }
    resolveWorkflowTransitionArray(primaryEntries, fallbackEntries = null) {
      if (Array.isArray(primaryEntries)) {
        return primaryEntries;
      }
      if (Array.isArray(fallbackEntries)) {
        return fallbackEntries;
      }
      return ADMIN_CACHE_DUMP.EMPTY;
    }
    /**
     * Build one workflow-admission record from table transition metadata.
     * @param {Object} tableRow
     * @return {Object|null}
     * @private
     */
    buildWorkflowAdmissionEntry(tableRow) {
      const transitionState = firstStringField(
        tableRow,
        'partition_transition_state',
        'partitionTransitionState',
      );
      const metadata = this.parseWorkflowTransitionMetadata(tableRow);
      const workflowId = firstStringField(
        metadata,
        PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID,
      );
      if (!transitionState || !metadata || !workflowId) {
        return null;
      }
      const admission = this.resolveWorkflowTransitionMetadataObject(
        metadata,
        PARTITION_TRANSITION_METADATA_FIELD.ADMISSION,
      );
      const failure = this.resolveWorkflowTransitionMetadataObject(
        metadata,
        PARTITION_TRANSITION_METADATA_FIELD.FAILURE,
      );
      const blockingReasons = Array.isArray(admission?.blockingReasons) ?
        admission.blockingReasons :
        ADMIN_CACHE_DUMP.EMPTY;
      const timeoutClassification = this.resolveWorkflowTransitionMetadataObject(
        failure,
        'timeoutClassification',
      );
      const retry = this.resolveWorkflowTransitionMetadataObject(
        metadata,
        PARTITION_TRANSITION_METADATA_FIELD.RETRY,
      );
      const topologySnapshot = this.resolveWorkflowTransitionMetadataObject(
        metadata,
        PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT,
      );
      return {
        workflowId,
        workflowType: MANAGED_SPLIT_WORKFLOW_TYPE,
        transitionState,
        tableId: firstStringField(
          tableRow,
          COLUMN.TABLE_ID,
          ADMIN_CONTROL_SNAPSHOT_LITERAL.ID,
        ),
        tableName: firstStringField(
          tableRow,
          COLUMN.TABLE_NAME,
          ADMIN_CONTROL_SNAPSHOT_LITERAL.NAME,
        ),
        sourcePartitionId: firstStringField(
          metadata,
          PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID,
        ),
        targetPartitionIds: this.resolveWorkflowTransitionArray(
          metadata?.[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS],
        ),
        topologySnapshotCapturedAt: firstStringField(
          topologySnapshot,
          ADMIN_CONTROL_SNAPSHOT_LITERAL.CAPTUREDAT,
        ),
        sourceLeaderNodeId: firstStringField(
          topologySnapshot,
          ADMIN_CONTROL_SNAPSHOT_LITERAL.SOURCELEADERNODEID,
        ),
        candidateTargetNodeIds: this.resolveWorkflowTransitionArray(
          admission?.candidateTargetNodeIds,
          topologySnapshot?.candidateTargetNodeIds,
        ),
        sourceRoutableNodeIds: this.resolveWorkflowTransitionArray(
          admission?.sourceRoutableNodeIds,
          topologySnapshot?.sourceRoutableNodeIds,
        ),
        eligibleNodeIds: this.resolveWorkflowTransitionArray(
          admission?.eligibleNodeIds,
        ),
        ineligibleNodes: this.resolveWorkflowTransitionArray(
          admission?.ineligibleNodes,
        ),
        estimatedBytes: Number.isFinite(Number(admission?.estimatedBytes)) ?
          Number(admission.estimatedBytes) :
          null,
        admissionDecisionAt: firstStringField(
          admission,
          ADMIN_CONTROL_SNAPSHOT_LITERAL.DECISIONTIMESTAMP,
        ),
        admission,
        blockingReasons,
        failure,
        failedAt: firstStringField(
          failure,
          ADMIN_CONTROL_SNAPSHOT_LITERAL.FAILEDAT,
        ),
        nextAttemptAt: firstStringField(
          retry,
          ADMIN_CONTROL_SNAPSHOT_LITERAL.NEXTATTEMPTAT,
        ),
        timeoutClassification,
      };
    }
    /**
     * Parse table transition metadata.
     * @param {Object} tableRow
     * @return {Object|null}
     * @private
     */
    parseWorkflowTransitionMetadata(tableRow) {
      const rawMetadata =
        tableRow?.partition_transition_metadata ??
        tableRow?.partitionTransitionMetadata ??
        null;
      if (!rawMetadata) {
        return null;
      }
      if (rawMetadata && typeof rawMetadata === TYPEOF.OBJECT) {
        return rawMetadata;
      }
      if (typeof rawMetadata !== TYPEOF.STRING) {
        return null;
      }
      try {
        const parsed = JSON.parse(rawMetadata);
        return parsed && typeof parsed === TYPEOF.OBJECT ? parsed : null;
      } catch (_error) {
        return null;
      }
    }
  }
  for (const methodName of Object.getOwnPropertyNames(
    AdminControlSnapshotReadinessDiagnosticsMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      AdminControlSnapshot.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        AdminControlSnapshotReadinessDiagnosticsMethods.prototype,
        methodName,
      ),
    );
  }
}
export {assignAdminControlSnapshotReadinessDiagnosticsMethods};
