import {CLUSTER_CLASS_SHARED_CONTEXT} from './cluster-class-shared-context.js';
import {buildCanonicalPublicationEvidenceFromControlPlane} from
  './publication-evidence-contract.js';
import {ClusterQuiescence} from './cluster-class-quiescence.js';
import {
  buildLoadPublicationGateProjectionContext,
  buildStartupSnapshotProjectionContext,
  projectLoadPublicationGateDiagnostic,
  projectStartupAdminAvailabilityDiagnostic,
  projectStartupSnapshotDiagnostic,
} from './cluster-class-active-probe-projections.js';
import {
  buildReadinessTimeoutReason,
  decidePartialCoverageConvergence,
  extractPublicationProjectionNodeIds,
  normalizePartialCoverageConvergenceEvidence,
  normalizeReadinessTimeoutEvidence,
} from './cluster-class-publication-coverage.js';

const {
  ACTIVE_POLL_INTERVAL_MS,
  ACTIVE_PROBE_ACTIVITY_SOURCE_BOOTSTRAP_READINESS,
  ACTIVE_PROBE_ACTIVITY_SOURCE_STARTUP_ADMIN_PROJECTION,
  ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS,
  ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_FALLBACK,
  ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_QUERY,
  ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS,
  ACTIVE_PROBE_REASON_ADMIN_NOT_READY,
  ACTIVE_PROBE_REASON_ADMIN_PROBE_ERROR_PREFIX,
  ACTIVE_STATE,
  ADMIN_QUERY_TIMEOUT_MS,
  ADMIN_SOCKET_LANE_PROBE,
  CLUSTER_ACTIVE_NODE_PROBE_TIMEOUT_MS,
  CLUSTER_READINESS_MODE_LOAD,
  CLUSTER_READINESS_MODE_STARTUP,
  CONTROL_SNAPSHOT_EXPECTED_MINIMUM_REVISION_FIELD,
  CONTROL_SNAPSHOT_NODES_FIELD,
  CONTROL_SNAPSHOT_READINESS_DIMENSION_CLUSTER_MEMBER_HEALTHY,
  CONTROL_SNAPSHOT_RESUME_TOKEN_FIELD,
  CONTROL_SNAPSHOT_REVISION_FIELD,
  CONTROL_SNAPSHOT_REVISION_GAP_FIELD,
  CONTROL_SNAPSHOT_REVISION_STATE_FIELD,
  HTTP_OK_LOWER,
  HTTP_OK_UPPER,
  INACTIVE_STATE,
  MIN_TIMEOUT_MS,
  STARTUP_ADMISSION_STATE_BLOCKED,
  STARTUP_ADMISSION_STATE_DEGRADED,
  STARTUP_ADMISSION_STATE_STRONG_ACTIVE,
  ZERO,
  buildPublicationRecoveryGateSnapshot,
  canProjectStartupActiveFromTransientAdmin,
  evaluateLoadPublishedConvergence,
  evaluatePriorityRecoveryCrossServiceInvariants,
  normalizeDistinctStringArray,
  normalizeProbeError,
  parseFiniteNumberField,
  parseJsonArrayField,
  parseJsonObjectField,
  withTimeout,
} = CLUSTER_CLASS_SHARED_CONTEXT;

const TYPEOF_OBJECT = 'object';
const TYPEOF_STRING = 'string';
const arrayIsArray = Array.isArray;
const mathFloor = Math.floor;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const objectCreate = Object.create;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const NUMBER_MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const QUEUE_DIAGNOSTIC_KEY_LIMIT = 4096;
const QUEUE_DIAGNOSTICS_SOURCE_LOGGING_RETENTION = 'logs_table_retention';
const QUEUE_DIAGNOSTICS_SOURCE_MEMBERSHIP_OWNER =
  'membership_publication_owner';
const QUEUE_DIAGNOSTICS_SOURCE_STATE_ABSENT = 'absent';
const QUEUE_DIAGNOSTICS_SOURCE_STATE_LEGACY_AMBIGUOUS = 'legacy_ambiguous';
const QUEUE_DIAGNOSTICS_SOURCE_STATE_SEPARATED = 'separated';
const ACTIVE_GATE_OWNER_COHORT_FIELD = 'activeGateOwnerCohort';
const MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD =
  'membershipPublicationHandoffOutcome';
const REACHABILITY_PROBE_TIMEOUT_FLOOR_MS = 1000;
const ACTIVE_PROBE_PHASE_UNAVAILABLE = null;
const ACTIVE_PROBE_REASONS_UNAVAILABLE = Object.freeze([]);
const ACTIVE_PROBE_ADMISSION_REASON_UNAVAILABLE = null;
const CONTROL_SNAPSHOT_SUMMARY_NODES_UNAVAILABLE = Object.freeze([]);
const CONTROL_SNAPSHOT_SUMMARY_CAPTURED_AT_UNAVAILABLE = null;
const CONTROL_SNAPSHOT_SUMMARY_REVISION_UNAVAILABLE = null;
const CONTROL_SNAPSHOT_SUMMARY_REVISION_STATE_UNAVAILABLE = null;
const CONTROL_SNAPSHOT_SUMMARY_EXPECTED_MINIMUM_REVISION_UNAVAILABLE = null;
const CONTROL_SNAPSHOT_SUMMARY_REVISION_GAP_UNAVAILABLE = null;
const CONTROL_SNAPSHOT_SUMMARY_RESUME_TOKEN_UNAVAILABLE = null;
const CONTROL_SNAPSHOT_PUBLICATION_SUMMARY_UNAVAILABLE = null;
const LOAD_ACTIVE_GATE_SNAPSHOT_COVERAGE_ATTEMPT_TIMEOUT_MS =
  ACTIVE_POLL_INTERVAL_MS;

function readOwnQueueDiagnosticField(record, field) {
  if (!record || typeof record !== TYPEOF_OBJECT) {
    return undefined;
  }
  const descriptor = objectGetOwnPropertyDescriptor(record, field);
  return descriptor && objectHasOwn(descriptor, 'value') ?
    descriptor.value :
    undefined;
}

function normalizeQueueDiagnosticNonNegativeInteger(value) {
  if (
    typeof value !== 'number' ||
    !numberIsFinite(value) ||
    value < ZERO
  ) {
    return null;
  }
  if (value === ZERO) {
    return ZERO;
  }
  if (value >= NUMBER_MAX_SAFE_INTEGER) {
    return NUMBER_MAX_SAFE_INTEGER;
  }
  return mathFloor(value);
}

function normalizeQueueDiagnosticStringArray(value) {
  if (!arrayIsArray(value)) {
    return [];
  }
  const lengthDescriptor = objectGetOwnPropertyDescriptor(value, 'length');
  const length = lengthDescriptor && objectHasOwn(lengthDescriptor, 'value') ?
    lengthDescriptor.value :
    ZERO;
  if (
    !numberIsSafeInteger(length) ||
    length < ZERO ||
    length > QUEUE_DIAGNOSTIC_KEY_LIMIT
  ) {
    return [];
  }
  const seen = objectCreate(null);
  const normalized = [];
  for (let index = ZERO; index < length; index += 1) {
    const descriptor = objectGetOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !objectHasOwn(descriptor, 'value')) {
      continue;
    }
    const entry = descriptor.value;
    if (
      typeof entry !== TYPEOF_STRING ||
      entry.length === ZERO ||
      objectHasOwn(seen, entry)
    ) {
      continue;
    }
    seen[entry] = true;
    normalized[normalized.length] = entry;
  }
  return normalized;
}

function normalizeControlSnapshotOwnerQueueDiagnostics(
  record,
  source = null,
) {
  if (!record || typeof record !== TYPEOF_OBJECT || arrayIsArray(record)) {
    return null;
  }
  const pendingWrites = readOwnQueueDiagnosticField(record, 'pendingWrites');
  const pendingWriteGrowthCount = readOwnQueueDiagnosticField(
    record,
    'pendingWriteGrowthCount',
  );
  const retainedBacklogGrowthCount = readOwnQueueDiagnosticField(
    record,
    'retainedBacklogGrowthCount',
  );
  const retryableDrainFailureCount = readOwnQueueDiagnosticField(
    record,
    'retryableDrainFailureCount',
  );
  const sharedPressureBackpressured = readOwnQueueDiagnosticField(
    record,
    'sharedPressureBackpressured',
  );
  const transportPressureBackpressured = readOwnQueueDiagnosticField(
    record,
    'transportPressureBackpressured',
  );
  const queryPressureBackpressured = readOwnQueueDiagnosticField(
    record,
    'queryPressureBackpressured',
  );
  const ownerKey = readOwnQueueDiagnosticField(record, 'ownerKey');
  const pendingKeys = readOwnQueueDiagnosticField(record, 'pendingKeys');
  const retryingKeys = readOwnQueueDiagnosticField(record, 'retryingKeys');
  const inFlightKeys = readOwnQueueDiagnosticField(record, 'inFlightKeys');
  return {
    source,
    pendingWrites:
      normalizeQueueDiagnosticNonNegativeInteger(pendingWrites),
    pendingWriteGrowthCount:
      normalizeQueueDiagnosticNonNegativeInteger(pendingWriteGrowthCount),
    retainedBacklogGrowthCount:
      normalizeQueueDiagnosticNonNegativeInteger(retainedBacklogGrowthCount),
    sharedPressureBackpressured: sharedPressureBackpressured === true,
    transportPressureBackpressured: transportPressureBackpressured === true,
    queryPressureBackpressured: queryPressureBackpressured === true,
    ownerKey: typeof ownerKey === TYPEOF_STRING ?
      ownerKey :
      null,
    pendingKeys: normalizeQueueDiagnosticStringArray(pendingKeys),
    retryingKeys: normalizeQueueDiagnosticStringArray(retryingKeys),
    inFlightKeys: normalizeQueueDiagnosticStringArray(inFlightKeys),
    retryableDrainFailureCount:
      normalizeQueueDiagnosticNonNegativeInteger(retryableDrainFailureCount),
  };
}

function normalizeLoggingRetentionQueueDiagnostics(record) {
  if (!record || typeof record !== TYPEOF_OBJECT || arrayIsArray(record)) {
    return null;
  }
  const pendingWrites = readOwnQueueDiagnosticField(record, 'pendingWrites');
  const pendingWriteGrowthCount = readOwnQueueDiagnosticField(
    record,
    'pendingWriteGrowthCount',
  );
  const retainedBacklogGrowthCount = readOwnQueueDiagnosticField(
    record,
    'retainedBacklogGrowthCount',
  );
  const retainedPressureBacklogCap = readOwnQueueDiagnosticField(
    record,
    'retainedPressureBacklogCap',
  );
  const maxPendingWrites = readOwnQueueDiagnosticField(
    record,
    'maxPendingWrites',
  );
  const consecutiveDeferredWriteFailures = readOwnQueueDiagnosticField(
    record,
    'consecutiveDeferredWriteFailures',
  );
  const isWriting = readOwnQueueDiagnosticField(record, 'isWriting');
  const sharedPressureBackpressured = readOwnQueueDiagnosticField(
    record,
    'sharedPressureBackpressured',
  );
  const transportPressureBackpressured = readOwnQueueDiagnosticField(
    record,
    'transportPressureBackpressured',
  );
  const queryPressureBackpressured = readOwnQueueDiagnosticField(
    record,
    'queryPressureBackpressured',
  );
  return {
    source: QUEUE_DIAGNOSTICS_SOURCE_LOGGING_RETENTION,
    pendingWrites:
      normalizeQueueDiagnosticNonNegativeInteger(pendingWrites),
    pendingWriteGrowthCount:
      normalizeQueueDiagnosticNonNegativeInteger(pendingWriteGrowthCount),
    retainedBacklogGrowthCount:
      normalizeQueueDiagnosticNonNegativeInteger(retainedBacklogGrowthCount),
    retainedPressureBacklogCap:
      normalizeQueueDiagnosticNonNegativeInteger(retainedPressureBacklogCap),
    maxPendingWrites:
      normalizeQueueDiagnosticNonNegativeInteger(maxPendingWrites),
    isWriting: isWriting === true,
    consecutiveDeferredWriteFailures:
      normalizeQueueDiagnosticNonNegativeInteger(
        consecutiveDeferredWriteFailures,
      ),
    sharedPressureBackpressured: sharedPressureBackpressured === true,
    transportPressureBackpressured: transportPressureBackpressured === true,
    queryPressureBackpressured: queryPressureBackpressured === true,
  };
}

function resolveActiveProbeOperationTimeoutMs(deadline) {
  const remainingMs = Math.floor(deadline - Date.now());
  const cappedTimeoutMs = Math.min(
    ADMIN_QUERY_TIMEOUT_MS,
    CLUSTER_ACTIVE_NODE_PROBE_TIMEOUT_MS,
  );
  if (remainingMs <= MIN_TIMEOUT_MS) {
    return MIN_TIMEOUT_MS;
  }
  if (remainingMs < REACHABILITY_PROBE_TIMEOUT_FLOOR_MS) {
    return Math.min(cappedTimeoutMs, remainingMs);
  }
  return Math.max(
    REACHABILITY_PROBE_TIMEOUT_FLOOR_MS,
    Math.min(cappedTimeoutMs, remainingMs),
  );
}

class ClusterPublicationEvidence extends ClusterQuiescence {
  async _probeClusterActiveState(deadline, options = {}) {
    const readinessMode =
      options.mode === CLUSTER_READINESS_MODE_LOAD ?
        CLUSTER_READINESS_MODE_LOAD :
        CLUSTER_READINESS_MODE_STARTUP;
    const nodes = [...this._nodes.values()];
    const expectedNodeIds = nodes.map((node) => node.id);
    const nodeDiagnosticsPromise = Promise.all(
      nodes.map(async (node) => {
        let attemptedReadinessProbe = false;
        let attemptedReadinessProbeSource = ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS;
        const buildStatusProbeResult = async (
          statusReason = null,
          activitySource = ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_QUERY,
        ) => {
          const statusProbeTimeoutMs =
            resolveActiveProbeOperationTimeoutMs(deadline);
          const status = await withTimeout(
            node.getStatus({
              timeoutMs: statusProbeTimeoutMs,
              lane: ADMIN_SOCKET_LANE_PROBE,
            }),
            statusProbeTimeoutMs,
            'Node status probe timed out for ' + node.id,
          );
          const active = this._isNodeActive(status);
          const state = active ?
            ACTIVE_STATE.toLowerCase() :
            this._extractNodeState(status) || INACTIVE_STATE;
          return {
            nodeId: node.id,
            active,
            state,
            phase: ACTIVE_PROBE_PHASE_UNAVAILABLE,
            reasons: statusReason ?
              [statusReason] :
              ACTIVE_PROBE_REASONS_UNAVAILABLE,
            activitySource,
            admissionState:
              status.active === true ?
                STARTUP_ADMISSION_STATE_STRONG_ACTIVE :
                STARTUP_ADMISSION_STATE_BLOCKED,
            error: null,
          };
        };
        try {
          let active = false;
          let state = INACTIVE_STATE;
          let phase = ACTIVE_PROBE_PHASE_UNAVAILABLE;
          let reasons = ACTIVE_PROBE_REASONS_UNAVAILABLE;
          let activitySource = ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS;
          let admissionState = STARTUP_ADMISSION_STATE_BLOCKED;
          let admissionReason = ACTIVE_PROBE_ADMISSION_REASON_UNAVAILABLE;

          const readinessProbeOrder =
            readinessMode === CLUSTER_READINESS_MODE_LOAD ?
              [
                [
                  ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS,
                  'probeTrafficReadiness',
                ],
                [
                  ACTIVE_PROBE_ACTIVITY_SOURCE_BOOTSTRAP_READINESS,
                  'probeBootstrapReadiness',
                ],
              ] :
              [
                [
                  ACTIVE_PROBE_ACTIVITY_SOURCE_BOOTSTRAP_READINESS,
                  'probeBootstrapReadiness',
                ],
                [
                  ACTIVE_PROBE_ACTIVITY_SOURCE_TRAFFIC_READINESS,
                  'probeTrafficReadiness',
                ],
              ];
          let readiness = null;
          for (const [probeSource, probeMethod] of readinessProbeOrder) {
            if (typeof node?.[probeMethod] !== 'function') {
              continue;
            }
            attemptedReadinessProbe = true;
            attemptedReadinessProbeSource = probeSource;
            const readinessProbeTimeoutMs =
              resolveActiveProbeOperationTimeoutMs(deadline);
            readiness = await withTimeout(
              node[probeMethod]({
                timeoutMs: readinessProbeTimeoutMs,
              }),
              readinessProbeTimeoutMs,
              'Node readiness probe timed out for ' + node.id,
            );
            active =
              readiness.status >= HTTP_OK_LOWER &&
              readiness.status <= HTTP_OK_UPPER;
            admissionState =
              active === true ?
                STARTUP_ADMISSION_STATE_STRONG_ACTIVE :
                STARTUP_ADMISSION_STATE_BLOCKED;
            admissionReason =
              active === true ?
                ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_QUERY :
                ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_FALLBACK;
            phase =
              typeof readiness.phase === 'string' ? readiness.phase : null;
            reasons = Array.isArray(readiness.reasons) ? readiness.reasons : [];
            if (active) {
              state = ACTIVE_STATE.toLowerCase();
            } else if (
              typeof readiness.state === 'string' &&
              readiness.state.length > 0
            ) {
              state = readiness.state.toLowerCase();
            } else if (phase && phase.length > 0) {
              state = phase.toLowerCase();
            }
            activitySource = probeSource;
            break;
          }
          if (readiness) {
            if (typeof node.getReachabilityDiagnostics === 'function') {
              try {
                const adminProbeTimeoutMs =
                  resolveActiveProbeOperationTimeoutMs(deadline);
                const adminDiagnostics = await withTimeout(
                  node.getReachabilityDiagnostics({
                    timeoutMs: adminProbeTimeoutMs,
                  }),
                  adminProbeTimeoutMs,
                  'Node admin readiness probe timed out for ' + node.id,
                );
                if (
                  readinessMode === CLUSTER_READINESS_MODE_STARTUP &&
                  canProjectStartupActiveFromTransientAdmin(
                    readiness,
                    adminDiagnostics,
                  )
                ) {
                  admissionState = STARTUP_ADMISSION_STATE_DEGRADED;
                  admissionReason =
                    ACTIVE_PROBE_ACTIVITY_SOURCE_STARTUP_ADMIN_PROJECTION;
                  activitySource =
                    ACTIVE_PROBE_ACTIVITY_SOURCE_STARTUP_ADMIN_PROJECTION;
                  reasons = [...reasons];
                } else if (adminDiagnostics?.adminReady !== true) {
                  active = false;
                  state = INACTIVE_STATE;
                  admissionState = STARTUP_ADMISSION_STATE_BLOCKED;
                  const adminLastError =
                    typeof adminDiagnostics?.lastError === 'string' &&
                    adminDiagnostics.lastError.length > 0 ?
                      adminDiagnostics.lastError :
                      ACTIVE_PROBE_REASON_ADMIN_NOT_READY;
                  admissionReason =
                    ACTIVE_PROBE_REASON_ADMIN_NOT_READY + '=' + adminLastError;
                  reasons = [
                    ...reasons,
                    ACTIVE_PROBE_REASON_ADMIN_NOT_READY + '=' + adminLastError,
                  ];
                }
              } catch (adminProbeError) {
                active = false;
                state = INACTIVE_STATE;
                reasons = [
                  ...reasons,
                  ACTIVE_PROBE_REASON_ADMIN_PROBE_ERROR_PREFIX +
                    normalizeProbeError(adminProbeError),
                ];
              }
            }
          } else {
            const statusResult = await buildStatusProbeResult();
            active = statusResult.active;
            state = statusResult.state;
            phase = statusResult.phase;
            reasons = statusResult.reasons;
            activitySource = statusResult.activitySource;
            admissionState =
              statusResult.active === true ?
                STARTUP_ADMISSION_STATE_STRONG_ACTIVE :
                STARTUP_ADMISSION_STATE_BLOCKED;
            admissionReason =
              statusResult.active === true ?
                ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS_QUERY :
                ACTIVE_PROBE_REASON_ADMIN_NOT_READY;
          }

          return {
            nodeId: node.id,
            active,
            state,
            phase,
            reasons,
            activitySource,
            admissionState,
            admissionReason,
            error: null,
          };
        } catch (error) {
          const timeoutEvidence = normalizeReadinessTimeoutEvidence({
            attemptedReadinessProbe,
            error,
            readinessMode,
          });
          if (
            timeoutEvidence.attemptedReadinessProbe === true &&
            timeoutEvidence.timeoutShaped === true
          ) {
            const timeoutReason =
              buildReadinessTimeoutReason(error, readinessMode);
            return {
              nodeId: node.id,
              active: false,
              state: INACTIVE_STATE,
              phase: ACTIVE_PROBE_PHASE_UNAVAILABLE,
              reasons: [timeoutReason],
              activitySource: attemptedReadinessProbeSource,
              admissionState: STARTUP_ADMISSION_STATE_BLOCKED,
              admissionReason: timeoutReason,
              error: normalizeProbeError(error),
            };
          }
          return {
            nodeId: node.id,
            active: false,
            state: INACTIVE_STATE,
            phase: ACTIVE_PROBE_PHASE_UNAVAILABLE,
            reasons: ACTIVE_PROBE_REASONS_UNAVAILABLE,
            activitySource: ACTIVE_PROBE_ACTIVITY_SOURCE_STATUS,
            admissionState: STARTUP_ADMISSION_STATE_BLOCKED,
            admissionReason:
              ACTIVE_PROBE_REASON_ADMIN_PROBE_ERROR_PREFIX +
              String(normalizeProbeError(error)),
            error: normalizeProbeError(error),
          };
        }
      }),
    );
    const snapshotCoverageDeadline =
      readinessMode === CLUSTER_READINESS_MODE_LOAD ?
        Math.min(
          deadline,
          Date.now() + LOAD_ACTIVE_GATE_SNAPSHOT_COVERAGE_ATTEMPT_TIMEOUT_MS,
        ) :
        deadline;
    const snapshotCoveragePromise = this._probeControlSnapshotCoverage(
      snapshotCoverageDeadline,
      expectedNodeIds,
      {
        forceRepair: options.forceRepair === true,
        readinessMode,
      },
    );
    const [nodeDiagnostics, snapshotCoverage] = await Promise.all([
      nodeDiagnosticsPromise,
      snapshotCoveragePromise,
    ]);
    const publicationConvergenceGate =
      readinessMode === CLUSTER_READINESS_MODE_LOAD ?
        evaluateLoadPublishedConvergence(
          snapshotCoverage,
          expectedNodeIds,
        ) :
        {
          ready: true,
          reasons: Object.freeze([]),
        };
    const projectionContext = buildLoadPublicationGateProjectionContext(
      readinessMode,
      snapshotCoverage,
      publicationConvergenceGate,
    );
    const startupProjectionContext = buildStartupSnapshotProjectionContext(
      readinessMode,
      snapshotCoverage,
      publicationConvergenceGate,
    );
    const startupProjectedNodeDiagnostics = nodeDiagnostics.map((diagnostic) =>
      projectStartupSnapshotDiagnostic(diagnostic, startupProjectionContext),
    );
    const startupReadinessProjectedNodeDiagnostics =
      startupProjectedNodeDiagnostics.map((diagnostic) =>
        projectStartupAdminAvailabilityDiagnostic(
          diagnostic,
          startupProjectionContext,
        ),
      );
    const projectedNodeDiagnostics =
      startupReadinessProjectedNodeDiagnostics.map((diagnostic) =>
        projectLoadPublicationGateDiagnostic(diagnostic, projectionContext),
      );
    const activeByStatus = projectedNodeDiagnostics.every(
      (diagnostic) => diagnostic.active === true,
    );

    const partialCoverageEvidence = normalizePartialCoverageConvergenceEvidence({
      readinessMode,
      activeByStatus,
      snapshotCoverage,
      publicationConvergenceGate,
    });
    const partialCoverageDecision =
      decidePartialCoverageConvergence(partialCoverageEvidence);

    const allActive =
      activeByStatus &&
      (snapshotCoverage.completeCoverage === true ||
        partialCoverageDecision.converged === true) &&
      publicationConvergenceGate.ready === true;
    const priorityRecoveryInvariants =
      evaluatePriorityRecoveryCrossServiceInvariants({
        readinessMode,
        nodeDiagnostics: projectedNodeDiagnostics,
        publicationConvergenceGate,
        allActive,
      });

    return {
      allActive,
      nodeDiagnostics: projectedNodeDiagnostics,
      snapshotCoverage,
      publicationConvergenceGate,
      priorityRecoveryInvariants,
    };
  }

  _extractControlSnapshotNodes(snapshotResult) {
    return this._extractControlSnapshotSummary(snapshotResult).nodes;
  }

  _extractControlSnapshotPayload(snapshotResult) {
    const rows = Array.isArray(snapshotResult?.rows) ? snapshotResult.rows : [];
    if (
      rows.length === ZERO ||
      !rows[ZERO] ||
      typeof rows[ZERO] !== TYPEOF_OBJECT
    ) {
      return null;
    }
    return rows[ZERO];
  }

  _extractControlSnapshotSummary(snapshotResult) {
    const rows = Array.isArray(snapshotResult?.rows) ? snapshotResult.rows : [];
    if (rows.length === ZERO) {
      return {
        nodes: CONTROL_SNAPSHOT_SUMMARY_NODES_UNAVAILABLE,
        capturedAtMs: CONTROL_SNAPSHOT_SUMMARY_CAPTURED_AT_UNAVAILABLE,
        snapshotRevision: CONTROL_SNAPSHOT_SUMMARY_REVISION_UNAVAILABLE,
        snapshotRevisionState:
          CONTROL_SNAPSHOT_SUMMARY_REVISION_STATE_UNAVAILABLE,
        snapshotExpectedMinimumRevision:
          CONTROL_SNAPSHOT_SUMMARY_EXPECTED_MINIMUM_REVISION_UNAVAILABLE,
        snapshotRevisionGap:
          CONTROL_SNAPSHOT_SUMMARY_REVISION_GAP_UNAVAILABLE,
        snapshotResumeToken: CONTROL_SNAPSHOT_SUMMARY_RESUME_TOKEN_UNAVAILABLE,
      };
    }
    const row = rows[0];
    const controlPlaneDiagnostics =
      row?.controlPlaneDiagnostics &&
      typeof row.controlPlaneDiagnostics === 'object' ?
        row.controlPlaneDiagnostics :
        null;
    const activeNodeViews =
      controlPlaneDiagnostics?.activeNodeViews &&
      typeof controlPlaneDiagnostics.activeNodeViews === 'object' ?
        controlPlaneDiagnostics.activeNodeViews :
        null;
    const publicationProjectionNodeIds =
      extractPublicationProjectionNodeIds(row);
    const nodes = normalizeDistinctStringArray([
      ...parseJsonArrayField(row?.[CONTROL_SNAPSHOT_NODES_FIELD]),
      ...parseJsonArrayField(row?.publishedNodes ?? row?.published_nodes),
      ...parseJsonArrayField(row?.projectedNodes ?? row?.projected_nodes),
      ...parseJsonArrayField(
        row?.suspectedOrTransitioningNodes ??
          row?.suspected_or_transitioning_nodes,
      ),
      ...parseJsonArrayField(activeNodeViews?.authoritativeNodeIds),
      ...parseJsonArrayField(activeNodeViews?.effectiveNodeIds),
      ...parseJsonArrayField(activeNodeViews?.projectedNodeIds),
      ...parseJsonArrayField(activeNodeViews?.publishedNodeIds),
      ...publicationProjectionNodeIds,
    ]);
    const capturedAtMs =
      parseFiniteNumberField(row?.capturedAtMs) ??
      parseFiniteNumberField(row?.capturedAt);
    const snapshotRevision = parseFiniteNumberField(
      row?.[CONTROL_SNAPSHOT_REVISION_FIELD],
    );
    const snapshotExpectedMinimumRevision = parseFiniteNumberField(
      row?.[CONTROL_SNAPSHOT_EXPECTED_MINIMUM_REVISION_FIELD],
    );
    const snapshotRevisionGap = parseFiniteNumberField(
      row?.[CONTROL_SNAPSHOT_REVISION_GAP_FIELD],
    );
    const snapshotRevisionState =
      typeof row?.[CONTROL_SNAPSHOT_REVISION_STATE_FIELD] === 'string' &&
      row[CONTROL_SNAPSHOT_REVISION_STATE_FIELD].length > ZERO ?
        row[CONTROL_SNAPSHOT_REVISION_STATE_FIELD] :
        CONTROL_SNAPSHOT_SUMMARY_REVISION_STATE_UNAVAILABLE;
    const snapshotResumeToken =
      typeof row?.[CONTROL_SNAPSHOT_RESUME_TOKEN_FIELD] === 'string' &&
      row[CONTROL_SNAPSHOT_RESUME_TOKEN_FIELD].length > ZERO ?
        row[CONTROL_SNAPSHOT_RESUME_TOKEN_FIELD] :
        CONTROL_SNAPSHOT_SUMMARY_RESUME_TOKEN_UNAVAILABLE;
    return {
      nodes,
      capturedAtMs,
      snapshotRevision,
      snapshotRevisionState,
      snapshotExpectedMinimumRevision,
      snapshotRevisionGap,
      snapshotResumeToken,
    };
  }

  _summarizeControlSnapshotPublication(publication) {
    if (!publication || typeof publication !== TYPEOF_OBJECT) {
      return CONTROL_SNAPSHOT_PUBLICATION_SUMMARY_UNAVAILABLE;
    }
    const publishedActiveNodeIds = parseJsonArrayField(
      publication.publishedActiveNodeIds ??
        publication.published_active_node_ids,
    );
    const pendingAckNodeIds = parseJsonArrayField(
      publication.pendingAckNodeIds ?? publication.pending_ack_node_ids,
    );
    const acknowledgedNodeIds = parseJsonArrayField(
      publication.acknowledgedNodeIds ?? publication.acknowledged_node_ids,
    );
    const membershipLifecycleSummaryRaw =
      parseJsonObjectField(publication.membershipLifecycleSummary) ??
      parseJsonObjectField(publication.membership_lifecycle_summary);
    const projectionDiagnosticsFromLifecycle =
      parseJsonObjectField(
        membershipLifecycleSummaryRaw?.projectionDiagnostics,
      ) ??
      parseJsonObjectField(
        membershipLifecycleSummaryRaw?.projection_diagnostics,
      );
    const projectionDiagnosticsRaw =
      parseJsonObjectField(publication.projectionDiagnostics) ??
      parseJsonObjectField(publication.projection_diagnostics) ??
      projectionDiagnosticsFromLifecycle;
    const participationByNodeIdRaw = parseJsonObjectField(
      publication.participationByNodeId ??
        publication.participation_by_node_id ??
        membershipLifecycleSummaryRaw?.participationByNodeId ??
        membershipLifecycleSummaryRaw?.participation_by_node_id,
    );
    const participationByNodeId = participationByNodeIdRaw ?
      Object.keys(participationByNodeIdRaw)
        .sort((left, right) => left.localeCompare(right))
        .reduce((accumulator, nodeId) => {
          const normalizedNodeId = String(nodeId || '').trim();
          if (normalizedNodeId.length === ZERO) {
            return accumulator;
          }
          const participation = participationByNodeIdRaw[nodeId];
          accumulator[normalizedNodeId] = {
            state:
                typeof participation?.state === 'string' &&
                participation.state.length > ZERO ?
                  participation.state :
                  null,
            durable: participation?.durable === true,
            publishedActive: participation?.publishedActive === true,
            recoveryActive: participation?.recoveryActive === true,
            projectedServing: participation?.projectedServing === true,
            locallyEligible: participation?.locallyEligible === true,
            suspectedOrTransitioning:
                participation?.suspectedOrTransitioning === true,
            recoverySource:
                typeof participation?.recoverySource === 'string' &&
                participation.recoverySource.length > ZERO ?
                  participation.recoverySource :
                  null,
            reasons: normalizeDistinctStringArray(
              parseJsonArrayField(participation?.reasons),
            ),
          };
          return accumulator;
        }, {}) :
      null;
    const participationStateCountsRaw = parseJsonObjectField(
      publication.participationStateCounts ??
        publication.participation_state_counts ??
        membershipLifecycleSummaryRaw?.participationStateCounts ??
        membershipLifecycleSummaryRaw?.participation_state_counts,
    );
    const participationStateCounts = participationStateCountsRaw ?
      Object.keys(participationStateCountsRaw)
        .sort((left, right) => left.localeCompare(right))
        .reduce((accumulator, state) => {
          const normalizedState = String(state || '').trim();
          const count = parseFiniteNumberField(
            participationStateCountsRaw[state],
          );
          if (normalizedState.length === ZERO || count === null) {
            return accumulator;
          }
          accumulator[normalizedState] = count;
          return accumulator;
        }, {}) :
      null;
    const priorityPartitionSummaryRaw =
      parseJsonObjectField(publication.priorityPartitionSummary) ??
      parseJsonObjectField(publication.priority_partition_summary);
    const blockedPartitions = parseJsonArrayField(
      priorityPartitionSummaryRaw?.blockedPartitions ??
        priorityPartitionSummaryRaw?.blocked_partitions,
    );
    const missingPartitionIds = parseJsonArrayField(
      priorityPartitionSummaryRaw?.missingPartitionIds ??
        priorityPartitionSummaryRaw?.missing_partition_ids,
    );
    const totalSpreadGap = blockedPartitions.reduce((sum, partition) => {
      const spreadGap = Number.isFinite(partition?.spreadGap) ?
        Math.max(ZERO, Math.floor(partition.spreadGap)) :
        ZERO;
      return sum + spreadGap;
    }, ZERO);
    const largestSpreadGap = blockedPartitions.reduce(
      (largestGap, partition) => {
        const spreadGap = Number.isFinite(partition?.spreadGap) ?
          Math.max(ZERO, Math.floor(partition.spreadGap)) :
          ZERO;
        return Math.max(largestGap, spreadGap);
      },
      ZERO,
    );
    const priorityPartitionSummary = priorityPartitionSummaryRaw ?
      {
        satisfied:
            priorityPartitionSummaryRaw.satisfied === true ?
              true :
              priorityPartitionSummaryRaw.satisfied === false ?
                false :
                null,
        requiredDistinctNodeCount: Number.isFinite(
          priorityPartitionSummaryRaw.requiredDistinctNodeCount,
        ) ?
          Math.max(
            ZERO,
            Math.floor(
              priorityPartitionSummaryRaw.requiredDistinctNodeCount,
            ),
          ) :
          Number.isFinite(
            priorityPartitionSummaryRaw.required_distinct_node_count,
          ) ?
            Math.max(
              ZERO,
              Math.floor(
                priorityPartitionSummaryRaw.required_distinct_node_count,
              ),
            ) :
            null,
        readyEligibleNodeCount: Number.isFinite(
          priorityPartitionSummaryRaw.readyEligibleNodeCount,
        ) ?
          Math.max(
            ZERO,
            Math.floor(priorityPartitionSummaryRaw.readyEligibleNodeCount),
          ) :
          Number.isFinite(
            priorityPartitionSummaryRaw.ready_eligible_node_count,
          ) ?
            Math.max(
              ZERO,
              Math.floor(
                priorityPartitionSummaryRaw.ready_eligible_node_count,
              ),
            ) :
            null,
        totalPriorityPartitionCount: Number.isFinite(
          priorityPartitionSummaryRaw.totalPriorityPartitionCount,
        ) ?
          Math.max(
            ZERO,
            Math.floor(
              priorityPartitionSummaryRaw.totalPriorityPartitionCount,
            ),
          ) :
          Number.isFinite(
            priorityPartitionSummaryRaw.total_priority_partition_count,
          ) ?
            Math.max(
              ZERO,
              Math.floor(
                priorityPartitionSummaryRaw.total_priority_partition_count,
              ),
            ) :
            null,
        missingPartitionIds: missingPartitionIds
          .map((partitionId) => String(partitionId || ''))
          .filter((partitionId) => partitionId.length > ZERO),
        blockedPartitionCount: blockedPartitions.length,
        largestSpreadGap,
        totalSpreadGap,
      } :
      null;
    const projectionDiagnostics = projectionDiagnosticsRaw ?
      {
        readinessDecisionMode:
            typeof projectionDiagnosticsRaw.readinessDecisionMode ===
              'string' &&
            projectionDiagnosticsRaw.readinessDecisionMode.length > ZERO ?
              projectionDiagnosticsRaw.readinessDecisionMode :
              null,
        readinessDecisionDimensions: parseJsonArrayField(
          projectionDiagnosticsRaw.readinessDecisionDimensions,
        )
          .map((dimension) => String(dimension || ''))
          .filter((dimension) => dimension.length > ZERO),
        recoveryEligibleProjectionEnabled:
            projectionDiagnosticsRaw.recoveryEligibleProjectionEnabled === true,
        recoveryEligibleIncludedNodeIds: parseJsonArrayField(
          projectionDiagnosticsRaw.recoveryEligibleIncludedNodeIds,
        )
          .map((nodeId) => String(nodeId || ''))
          .filter((nodeId) => nodeId.length > ZERO),
        readinessExcludedNodeIds: parseJsonArrayField(
          projectionDiagnosticsRaw.readinessExcludedNodeIds,
        )
          .map((nodeId) => String(nodeId || ''))
          .filter((nodeId) => nodeId.length > ZERO),
        clusterMemberUnhealthyExcludedNodeIds: parseJsonArrayField(
          projectionDiagnosticsRaw.clusterMemberUnhealthyExcludedNodeIds,
        )
          .map((nodeId) => String(nodeId || ''))
          .filter((nodeId) => nodeId.length > ZERO),
        // CL-001 variant C: carry the per-node retention-grace miss attribution
        // through to the scenario report so a trimmed already-published node's
        // binding condition is observable on the next gate.
        retentionGraceMisses: parseJsonArrayField(
          projectionDiagnosticsRaw.retentionGraceMisses,
        )
          .map((entry) => (entry && typeof entry === 'object' ?
            {
              nodeId: String(entry.nodeId || ''),
              reason: String(entry.reason || ''),
            } :
            null))
          .filter((entry) => entry && entry.nodeId.length > ZERO),
      } :
      null;
    const publishedActiveNodeIdsNormalized = publishedActiveNodeIds
      .map((nodeId) => String(nodeId || ''))
      .filter((nodeId) => nodeId.length > ZERO);
    const recoveryActiveNodeIdsFromParticipation = participationByNodeId ?
      Object.entries(participationByNodeId)
        .filter(([, participation]) => participation?.recoveryActive === true)
        .map(([nodeId]) => nodeId) :
      [];
    const recoveryActiveNodeIdsFromPublication = parseJsonArrayField(
      publication.recoveryActiveNodeIds ?? publication.recovery_active_node_ids,
    )
      .map((nodeId) => String(nodeId || ''))
      .filter((nodeId) => nodeId.length > ZERO);
    const recoveryActiveNodeIdsFromLifecycle = parseJsonArrayField(
      membershipLifecycleSummaryRaw?.recoveryActiveNodeIds ??
        membershipLifecycleSummaryRaw?.recovery_active_node_ids,
    )
      .map((nodeId) => String(nodeId || ''))
      .filter((nodeId) => nodeId.length > ZERO);
    const recoveryActiveNodeIds = normalizeDistinctStringArray(
      recoveryActiveNodeIdsFromParticipation.length > ZERO ?
        recoveryActiveNodeIdsFromParticipation :
        recoveryActiveNodeIdsFromPublication.length > ZERO ?
          recoveryActiveNodeIdsFromPublication :
          recoveryActiveNodeIdsFromLifecycle.length > ZERO ?
            recoveryActiveNodeIdsFromLifecycle :
            parseJsonArrayField(
              membershipLifecycleSummaryRaw?.locallyEligibleNodeIds,
            )
              .map((nodeId) => String(nodeId || ''))
              .filter((nodeId) => nodeId.length > ZERO).length > ZERO ?
              parseJsonArrayField(
                membershipLifecycleSummaryRaw?.locallyEligibleNodeIds,
              )
                .map((nodeId) => String(nodeId || ''))
                .filter((nodeId) => nodeId.length > ZERO) :
              publishedActiveNodeIdsNormalized,
    );
    const recoveryActiveNodeSourceRaw =
      typeof publication.recoveryActiveNodeSource === 'string' &&
      publication.recoveryActiveNodeSource.length > ZERO ?
        publication.recoveryActiveNodeSource :
        typeof membershipLifecycleSummaryRaw?.recoveryActiveNodeSource ===
              'string' &&
            membershipLifecycleSummaryRaw.recoveryActiveNodeSource.length > ZERO ?
          membershipLifecycleSummaryRaw.recoveryActiveNodeSource :
          null;
    const recoveryActiveNodeSource =
      recoveryActiveNodeSourceRaw ||
      (recoveryActiveNodeIds.length > ZERO ?
        publishedActiveNodeIdsNormalized.length > ZERO &&
          recoveryActiveNodeIds.every((nodeId) =>
            publishedActiveNodeIdsNormalized.includes(nodeId),
          ) ?
          'published_membership' :
          'locally_eligible_projection' :
        null);
    const missingPublishedRecoveryActiveNodeIdsRaw = parseJsonArrayField(
      publication.missingPublishedRecoveryActiveNodeIds ??
        publication.missing_published_recovery_active_node_ids ??
        membershipLifecycleSummaryRaw?.missingPublishedRecoveryActiveNodeIds ??
        membershipLifecycleSummaryRaw?.missing_published_recovery_active_node_ids,
    )
      .map((nodeId) => String(nodeId || ''))
      .filter((nodeId) => nodeId.length > ZERO);
    const missingPublishedRecoveryActiveNodeIds = normalizeDistinctStringArray(
      missingPublishedRecoveryActiveNodeIdsRaw.length > ZERO ?
        missingPublishedRecoveryActiveNodeIdsRaw :
        recoveryActiveNodeIds.filter(
          (nodeId) => !publishedActiveNodeIdsNormalized.includes(nodeId),
        ),
    );
    const recoveryProtocolState =
      typeof publication.recoveryProtocolState === 'string' &&
      publication.recoveryProtocolState.length > ZERO ?
        publication.recoveryProtocolState :
        typeof membershipLifecycleSummaryRaw?.recoveryProtocolState ===
              'string' &&
            membershipLifecycleSummaryRaw.recoveryProtocolState.length > ZERO ?
          membershipLifecycleSummaryRaw.recoveryProtocolState :
          null;
    const priorityRecoveryReasonCodes = normalizeDistinctStringArray(
      parseJsonArrayField(
        publication.priorityRecoveryReasonCodes ??
          publication.priority_recovery_reason_codes ??
          membershipLifecycleSummaryRaw?.recoveryProtocolReasonCodes ??
          membershipLifecycleSummaryRaw?.recovery_protocol_reason_codes,
      ),
    );
    const publicationRecoveryGateRaw =
      parseJsonObjectField(publication.publicationRecoveryGate) ??
      parseJsonObjectField(publication.publication_recovery_gate);
    const publicationActiveGateHandoffRaw =
      parseJsonObjectField(publication.publicationActiveGateHandoff) ??
      parseJsonObjectField(publication.publication_active_gate_handoff);
    const membershipLifecycleSummary = membershipLifecycleSummaryRaw ?
      {
        lifecycleState:
            typeof membershipLifecycleSummaryRaw.lifecycleState === 'string' &&
            membershipLifecycleSummaryRaw.lifecycleState.length > ZERO ?
              membershipLifecycleSummaryRaw.lifecycleState :
              null,
        epochBoundary:
            typeof membershipLifecycleSummaryRaw.epochBoundary === 'string' &&
            membershipLifecycleSummaryRaw.epochBoundary.length > ZERO ?
              membershipLifecycleSummaryRaw.epochBoundary :
              null,
        publishedActiveNodeIds: parseJsonArrayField(
          membershipLifecycleSummaryRaw.publishedActiveNodeIds,
        )
          .map((nodeId) => String(nodeId || ''))
          .filter((nodeId) => nodeId.length > ZERO),
        projectedServingNodeIds: parseJsonArrayField(
          membershipLifecycleSummaryRaw.projectedServingNodeIds,
        )
          .map((nodeId) => String(nodeId || ''))
          .filter((nodeId) => nodeId.length > ZERO),
        locallyEligibleNodeIds: parseJsonArrayField(
          membershipLifecycleSummaryRaw.locallyEligibleNodeIds,
        )
          .map((nodeId) => String(nodeId || ''))
          .filter((nodeId) => nodeId.length > ZERO),
        suspectedOrTransitioningNodeIds: parseJsonArrayField(
          membershipLifecycleSummaryRaw.suspectedOrTransitioningNodeIds,
        )
          .map((nodeId) => String(nodeId || ''))
          .filter((nodeId) => nodeId.length > ZERO),
        recoveryActiveNodeIds,
        recoveryActiveNodeSource,
        missingPublishedRecoveryActiveNodeIds,
        projectionDiagnostics,
        ...(participationByNodeId &&
          Object.keys(participationByNodeId).length > ZERO ?
          {
            participationByNodeId,
          } :
          {}),
        ...(participationStateCounts &&
          Object.keys(participationStateCounts).length > ZERO ?
          {
            participationStateCounts,
          } :
          {}),
        ...(typeof recoveryProtocolState === 'string' &&
          recoveryProtocolState.length > ZERO ?
          {
            recoveryProtocolState,
          } :
          {}),
        ...(priorityRecoveryReasonCodes.length > ZERO ?
          {
            recoveryProtocolReasonCodes: priorityRecoveryReasonCodes,
          } :
          {}),
      } :
      null;
    return {
      publicationEpoch:
        parseFiniteNumberField(
          publication.publicationEpoch ?? publication.publication_epoch,
        ) ?? null,
      publicationStatus:
        typeof publication.publicationStatus === TYPEOF_STRING &&
        publication.publicationStatus.length > ZERO ?
          publication.publicationStatus :
          typeof publication.status === TYPEOF_STRING &&
              publication.status.length > ZERO ?
            publication.status :
            null,
      publishedActiveNodeIds: publishedActiveNodeIds
        .map((nodeId) => String(nodeId))
        .filter((nodeId) => nodeId.length > ZERO),
      pendingAckNodeIds: pendingAckNodeIds
        .map((nodeId) => String(nodeId))
        .filter((nodeId) => nodeId.length > ZERO),
      acknowledgedNodeIds: acknowledgedNodeIds
        .map((nodeId) => String(nodeId))
        .filter((nodeId) => nodeId.length > ZERO),
      recoveryActiveNodeIds,
      recoveryActiveNodeSource,
      missingPublishedRecoveryActiveNodeIds,
      priorityPartitionSummary,
      membershipLifecycleSummary,
      projectionDiagnostics,
      ...(participationByNodeId &&
      Object.keys(participationByNodeId).length > ZERO ?
        {
          participationByNodeId,
        } :
        {}),
      ...(participationStateCounts &&
      Object.keys(participationStateCounts).length > ZERO ?
        {
          participationStateCounts,
        } :
        {}),
      ...(typeof recoveryProtocolState === TYPEOF_STRING &&
      recoveryProtocolState.length > ZERO ?
        {
          recoveryProtocolState,
        } :
        {}),
      ...(priorityRecoveryReasonCodes.length > ZERO ?
        {
          priorityRecoveryReasonCodes,
        } :
        {}),
      ...(publicationActiveGateHandoffRaw ?
        {
          publicationActiveGateHandoff:
            JSON.parse(JSON.stringify(publicationActiveGateHandoffRaw)),
        } :
        {}),
      ...(publicationRecoveryGateRaw ?
        {
          publicationRecoveryGate: buildPublicationRecoveryGateSnapshot({
            ...publicationRecoveryGateRaw,
            publicationStatus:
                publicationRecoveryGateRaw.publicationStatus ??
                publication.publicationStatus ??
                publication.status,
            recoveryProtocolState:
                publicationRecoveryGateRaw.recoveryProtocolState ??
                recoveryProtocolState,
            priorityRecoveryReasonCodes:
                publicationRecoveryGateRaw.reasonCodes ??
                priorityRecoveryReasonCodes,
            priorityPartitionSummary:
                publicationRecoveryGateRaw.priorityPartitionSummary ??
                priorityPartitionSummary,
            pendingAckNodeIds:
                publicationRecoveryGateRaw.pendingAckNodeIds ??
                pendingAckNodeIds,
            missingPublishedNodeIds:
                publicationRecoveryGateRaw.missingPublishedNodeIds ??
                missingPublishedRecoveryActiveNodeIds,
          }),
        } :
        {}),
    };
  }

  _extractControlSnapshotCoverageDiagnostics(snapshotResult) {
    const snapshotPayload =
      this._extractControlSnapshotPayload(snapshotResult) || {};
    const controlPlaneDiagnostics =
      snapshotPayload?.controlPlaneDiagnostics &&
      typeof snapshotPayload.controlPlaneDiagnostics === 'object' ?
        snapshotPayload.controlPlaneDiagnostics :
        null;
    const publicationConvergenceGateRaw =
      controlPlaneDiagnostics?.publicationConvergenceGate &&
      typeof controlPlaneDiagnostics.publicationConvergenceGate === 'object' ?
        controlPlaneDiagnostics.publicationConvergenceGate :
        controlPlaneDiagnostics?.publicationConvergence?.publicationRecoveryGate &&
            typeof controlPlaneDiagnostics.publicationConvergence
              .publicationRecoveryGate === 'object' ?
          controlPlaneDiagnostics.publicationConvergence
            .publicationRecoveryGate :
          null;
    const readinessByNodeId =
      controlPlaneDiagnostics?.readinessByNodeId &&
      typeof controlPlaneDiagnostics.readinessByNodeId === 'object' ?
        controlPlaneDiagnostics.readinessByNodeId :
        {};
    const priorityRecoveryDecisionSnapshots =
      controlPlaneDiagnostics?.priorityRecoveryDecisionSnapshots &&
      typeof controlPlaneDiagnostics.priorityRecoveryDecisionSnapshots ===
        'object' ?
        JSON.parse(
          JSON.stringify(
            controlPlaneDiagnostics.priorityRecoveryDecisionSnapshots,
          ),
        ) :
        null;
    const priorityRecoveryInvariants =
      controlPlaneDiagnostics?.priorityRecoveryInvariants &&
      typeof controlPlaneDiagnostics.priorityRecoveryInvariants === 'object' ?
        JSON.parse(
          JSON.stringify(
            controlPlaneDiagnostics.priorityRecoveryInvariants,
          ),
        ) :
        null;
    const rawPublicationConvergence =
      this._summarizeControlSnapshotPublication(
        controlPlaneDiagnostics?.publicationConvergence || null,
      );
    const activeGateOwnerCohort =
      controlPlaneDiagnostics?.[ACTIVE_GATE_OWNER_COHORT_FIELD] &&
      typeof controlPlaneDiagnostics[ACTIVE_GATE_OWNER_COHORT_FIELD] ===
        TYPEOF_OBJECT ?
        JSON.parse(
          JSON.stringify(
            controlPlaneDiagnostics[ACTIVE_GATE_OWNER_COHORT_FIELD],
          ),
        ) :
        null;
    const publicationActiveGateHandoff =
      controlPlaneDiagnostics?.publicationActiveGateHandoff &&
      typeof controlPlaneDiagnostics.publicationActiveGateHandoff ===
        TYPEOF_OBJECT ?
        JSON.parse(
          JSON.stringify(controlPlaneDiagnostics.publicationActiveGateHandoff),
        ) :
        rawPublicationConvergence?.publicationActiveGateHandoff || null;
    const membershipPublicationHandoffOutcome =
      controlPlaneDiagnostics?.[MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD] &&
      typeof controlPlaneDiagnostics[
        MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD
      ] === TYPEOF_OBJECT ?
        JSON.parse(
          JSON.stringify(
            controlPlaneDiagnostics[
              MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD
            ],
          ),
        ) :
        rawPublicationConvergence?.[
          MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD
        ] &&
          typeof rawPublicationConvergence[
            MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD
          ] === TYPEOF_OBJECT ?
          JSON.parse(
            JSON.stringify(
              rawPublicationConvergence[
                MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD
              ],
            ),
          ) :
          activeGateOwnerCohort?.[
            MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD
          ] &&
            typeof activeGateOwnerCohort[
              MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD
            ] === TYPEOF_OBJECT ?
            JSON.parse(
              JSON.stringify(
                activeGateOwnerCohort[
                  MEMBERSHIP_PUBLICATION_HANDOFF_OUTCOME_FIELD
                ],
              ),
            ) :
            null;
    const logsTableCandidate = readOwnQueueDiagnosticField(
      controlPlaneDiagnostics,
      'logsTable',
    );
    const logsTable =
      logsTableCandidate && typeof logsTableCandidate === TYPEOF_OBJECT &&
      arrayIsArray(logsTableCandidate) !== true ?
        logsTableCandidate :
        null;
    const ownerQueueCandidate = readOwnQueueDiagnosticField(
      controlPlaneDiagnostics,
      'controlPlaneOwnerQueueDepth',
    );
    const explicitControlPlaneOwnerQueueDepth =
      ownerQueueCandidate &&
      typeof ownerQueueCandidate === TYPEOF_OBJECT &&
      arrayIsArray(ownerQueueCandidate) !== true ?
        ownerQueueCandidate :
        null;
    const cdcReplay =
      controlPlaneDiagnostics?.cdcReplay &&
      typeof controlPlaneDiagnostics.cdcReplay === 'object' ?
        controlPlaneDiagnostics.cdcReplay :
        null;
    const hasSeparatedQueueSources =
      explicitControlPlaneOwnerQueueDepth &&
      readOwnQueueDiagnosticField(
        explicitControlPlaneOwnerQueueDepth,
        'source',
      ) ===
        QUEUE_DIAGNOSTICS_SOURCE_MEMBERSHIP_OWNER &&
      logsTable &&
      readOwnQueueDiagnosticField(logsTable, 'source') ===
        QUEUE_DIAGNOSTICS_SOURCE_LOGGING_RETENTION;
    const queueDiagnosticsSourceState = hasSeparatedQueueSources ?
      QUEUE_DIAGNOSTICS_SOURCE_STATE_SEPARATED :
      explicitControlPlaneOwnerQueueDepth || logsTable ?
        QUEUE_DIAGNOSTICS_SOURCE_STATE_LEGACY_AMBIGUOUS :
        QUEUE_DIAGNOSTICS_SOURCE_STATE_ABSENT;
    const controlPlaneOwnerQueueDepth =
      normalizeControlSnapshotOwnerQueueDiagnostics(
        explicitControlPlaneOwnerQueueDepth || logsTable,
        hasSeparatedQueueSources ?
          QUEUE_DIAGNOSTICS_SOURCE_MEMBERSHIP_OWNER :
          null,
      );
    const loggingRetentionQueueDepth =
      logsTable &&
      readOwnQueueDiagnosticField(logsTable, 'source') ===
        QUEUE_DIAGNOSTICS_SOURCE_LOGGING_RETENTION ?
        normalizeLoggingRetentionQueueDiagnostics(logsTable) :
        null;
    const cdcReplayLag = cdcReplay ?
      {
        bufferedEvents: Number.isFinite(cdcReplay.bufferedEvents) ?
          Math.max(ZERO, Math.floor(cdcReplay.bufferedEvents)) :
          ZERO,
        replayBufferGrowthCount: Number.isFinite(
          cdcReplay.replayBufferGrowthCount,
        ) ?
          Math.max(ZERO, Math.floor(cdcReplay.replayBufferGrowthCount)) :
          ZERO,
        replayRetryDepth: Number.isFinite(cdcReplay.replayRetryDepth) ?
          Math.max(ZERO, Math.floor(cdcReplay.replayRetryDepth)) :
          ZERO,
        replayInFlightPartitionCount: Number.isFinite(
          cdcReplay.replayInFlightPartitionCount,
        ) ?
          Math.max(ZERO, Math.floor(cdcReplay.replayInFlightPartitionCount)) :
          ZERO,
        partitionCount: Number.isFinite(cdcReplay.partitionCount) ?
          Math.max(ZERO, Math.floor(cdcReplay.partitionCount)) :
          ZERO,
      } :
      null;
    const healthyReadinessNodeIds = Object.entries(readinessByNodeId)
      .filter(([, readiness]) => {
        const dimensions =
          readiness?.dimensions && typeof readiness.dimensions === 'object' ?
            readiness.dimensions :
            null;
        return (
          dimensions?.[
            CONTROL_SNAPSHOT_READINESS_DIMENSION_CLUSTER_MEMBER_HEALTHY
          ] === true
        );
      })
      .map(([nodeId]) => String(nodeId))
      .filter((nodeId) => nodeId.length > ZERO)
      .sort();
    const publicationEvidence = buildCanonicalPublicationEvidenceFromControlPlane({
      publicationConvergence: rawPublicationConvergence,
      publicationConvergenceGate: publicationConvergenceGateRaw,
      priorityRecoveryObservation:
        controlPlaneDiagnostics?.priorityRecoveryObservation || null,
      priorityRecoveryDecisionSnapshots,
      priorityRecoveryInvariants,
      activeGate: controlPlaneDiagnostics?.activeGate || null,
      activeGateProgress: controlPlaneDiagnostics?.activeGateProgress || null,
      activeGateAdmissionState:
        controlPlaneDiagnostics?.activeGateAdmissionState || null,
      logsTable,
    });
    const publicationConvergence = publicationEvidence.publicationConvergence;
    const publicationConvergenceGate =
      publicationEvidence.publicationConvergenceGate;
    const priorityRecoveryObservation =
      publicationEvidence.priorityRecoveryObservation;
    return {
      controlPlaneDiagnosticsAvailable: Boolean(controlPlaneDiagnostics),
      publicationConvergence,
      publicationConvergenceGate,
      publishedMembershipObservation: this._summarizeControlSnapshotPublication(
        controlPlaneDiagnostics?.publishedMembershipObservation || null,
      ),
      publicationActiveGateHandoff,
      membershipPublicationHandoffOutcome,
      activeGateOwnerCohort,
      priorityRecoveryObservation,
      priorityRecoveryDecisionSnapshots,
      queueDiagnosticsSourceState,
      controlPlaneOwnerQueueDepth,
      loggingRetentionQueueDepth,
      cdcReplayLag,
      healthyReadinessNodeIds,
    };
  }
}

export {ClusterPublicationEvidence};
