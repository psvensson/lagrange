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

function createAdminControlSnapshotPublicationConvergenceDiagnosticsMethods(
  factoryOptions = {},
) {
  const {
    ADMIN_CONTROL_SNAPSHOT_LITERAL,
    TYPEOF,
    buildPublicationRecoveryProtocolSnapshot,
  } = factoryOptions;

  return {
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
        return normalizedValue.length >
          LOCAL_PUBLICATION_SELECTION_EMPTY_COUNT ?
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
          fallbackCandidate.publicationEpoch >
            readinessCandidate.publicationEpoch ||
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
    },
  };
}

export {createAdminControlSnapshotPublicationConvergenceDiagnosticsMethods};
