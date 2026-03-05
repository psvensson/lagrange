import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import {join, relative, resolve} from 'node:path';

const FAILURE_BUNDLE_SCHEMA_VERSION = 1;
const FAILURE_BUNDLE_RUN_DIRNAME = 'failure-bundles';
const FAILURE_BUNDLE_JSON_FILENAME = 'failure-bundle.json';
const FAILURE_BUNDLE_MARKDOWN_FILENAME = 'failure-bundle.md';
const RUN_FAILURE_BUNDLE_JSON_FILENAME = 'run-failure-bundle.json';
const RUN_FAILURE_BUNDLE_MARKDOWN_FILENAME = 'run-failure-bundle.md';
const LOG_FILE_EXTENSION = '.log';
const TIMELINE_FILENAME = '_timeline.log';
const ANALYSIS_FILENAME = '_analysis.json';
const UTF8_ENCODING = 'utf8';
const ZERO = 0;
const LOG_TAIL_LINE_COUNT = 20;
const MARKDOWN_SECTION_BREAK = '\n\n';
const UNKNOWN_VALUE = 'unknown';
const NO_PROGRESS_REASON_CODE = 'stalled_no_progress';
const NODE_DIAGNOSTICS_TRACE_LIMIT = 5;
const NODE_ID_ERROR_PATTERN = /\bnode=([a-z0-9._:-]+)\b/gi;

function toWorkspaceRelative(targetPath, workspaceRoot = process.cwd()) {
  if (typeof targetPath !== 'string' || targetPath.length === ZERO) {
    return null;
  }
  return relative(workspaceRoot, resolve(targetPath));
}

function sanitizePathSegment(value, fallback = UNKNOWN_VALUE) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length > ZERO ? normalized : fallback;
}

function sliceLogTail(logContent, maxLines = LOG_TAIL_LINE_COUNT) {
  const lines = String(logContent || '')
    .split('\n')
    .filter((line) => line.length > ZERO);
  return lines.slice(-Math.max(1, maxLines));
}

function resolveFailureDiagnostics(entry) {
  const diagnostics = entry?.details?.diagnostics;
  return diagnostics && typeof diagnostics === 'object' ? diagnostics : {};
}

function resolveFailureReasonCounts(entry) {
  const reasonCounts = resolveFailureDiagnostics(entry)?.failure?.reasonCounts;
  return reasonCounts && typeof reasonCounts === 'object' ? reasonCounts : {};
}

function buildTopReasonCounts(reasonCounts, limit = 5) {
  return Object.entries(reasonCounts)
    .map(([reason, count]) => ({
      reason: String(reason),
      count: Number(count || ZERO),
    }))
    .filter((entry) => Number.isFinite(entry.count) && entry.count > ZERO)
    .sort((left, right) => right.count - left.count)
    .slice(ZERO, limit);
}

function resolveReadinessSnapshot(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const failedArtifacts = diagnostics?.failedPhase?.artifacts || {};
  const readinessTimeline = Array.isArray(failedArtifacts.readinessTimeline) ?
    failedArtifacts.readinessTimeline :
    (Array.isArray(failedArtifacts?.gateResult?.readinessTimeline) ?
      failedArtifacts.gateResult.readinessTimeline :
      []);
  return {
    nodeReasonsByNodeId:
      diagnostics?.failure?.nodeReasonsByNodeId ||
      failedArtifacts.nodeReasonsByNodeId ||
      null,
    strictDiscoveryGate: failedArtifacts.strictDiscoveryGate || null,
    sutLoadDiscovery: failedArtifacts.sutLoadDiscovery || null,
    lastReadinessTimelineEntry:
      readinessTimeline.length > ZERO ? readinessTimeline[readinessTimeline.length - 1] : null,
  };
}

function resolveControlPlaneDiagnostics(entry) {
  const snapshotsByNodeId = resolveControlSnapshot(entry);
  const publicationModeByNodeId = {};
  const readinessByNodeId = {};
  const placementEligibilityByNodeId = {};
  const workflowAdmissionsByWorkflowId = {};
  const timeoutClassifications = [];

  if (snapshotsByNodeId && typeof snapshotsByNodeId === 'object') {
    for (const [snapshotNodeId, snapshot] of Object.entries(snapshotsByNodeId)) {
      const diagnostics = snapshot?.controlPlaneDiagnostics;
      if (!diagnostics || typeof diagnostics !== 'object') {
        continue;
      }

      if (diagnostics.publicationMode &&
          typeof diagnostics.publicationMode === 'object') {
        publicationModeByNodeId[snapshotNodeId] =
          diagnostics.publicationMode;
      }

      const readiness = diagnostics.readinessByNodeId &&
        typeof diagnostics.readinessByNodeId === 'object' ?
        diagnostics.readinessByNodeId :
        {};
      Object.assign(readinessByNodeId, readiness);

      const placement = diagnostics.placementEligibilityByNodeId &&
        typeof diagnostics.placementEligibilityByNodeId === 'object' ?
        diagnostics.placementEligibilityByNodeId :
        {};
      Object.assign(placementEligibilityByNodeId, placement);

      const workflows = diagnostics.workflowAdmissionsByWorkflowId &&
        typeof diagnostics.workflowAdmissionsByWorkflowId === 'object' ?
        diagnostics.workflowAdmissionsByWorkflowId :
        {};
      Object.assign(workflowAdmissionsByWorkflowId, workflows);

      const timeouts = Array.isArray(diagnostics.timeoutClassifications) ?
        diagnostics.timeoutClassifications :
        [];
      for (const timeout of timeouts) {
        if (!timeout || typeof timeout !== 'object') {
          continue;
        }
        timeoutClassifications.push({
          snapshotNodeId,
          ...timeout,
        });
      }
    }
  }

  if (Object.keys(publicationModeByNodeId).length === ZERO &&
      Object.keys(readinessByNodeId).length === ZERO &&
      Object.keys(placementEligibilityByNodeId).length === ZERO &&
      Object.keys(workflowAdmissionsByWorkflowId).length === ZERO &&
      timeoutClassifications.length === ZERO) {
    return null;
  }

  return {
    publicationModeByNodeId,
    readinessByNodeId,
    placementEligibilityByNodeId,
    workflowAdmissionsByWorkflowId,
    timeoutClassifications,
  };
}

function resolveControlSnapshot(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const snapshotsByNodeId = diagnostics?.rootCauseBundle?.snapshotsByNodeId;
  if (snapshotsByNodeId && typeof snapshotsByNodeId === 'object') {
    return snapshotsByNodeId;
  }
  return null;
}

function resolveAdminQueryTraceByNodeId(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const traceByNodeId = diagnostics?.rootCauseBundle?.adminQueryTraceByNodeId;
  if (traceByNodeId && typeof traceByNodeId === 'object') {
    return traceByNodeId;
  }
  return null;
}

function resolveLoadMetrics(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  if (diagnostics?.loadMetrics &&
      typeof diagnostics.loadMetrics === 'object' &&
      !Array.isArray(diagnostics.loadMetrics)) {
    return diagnostics.loadMetrics;
  }
  if (entry?.loadMetrics &&
      typeof entry.loadMetrics === 'object' &&
      !Array.isArray(entry.loadMetrics)) {
    return entry.loadMetrics;
  }
  return null;
}

function extractNodeIdsFromText(value) {
  const nodeIds = [];
  const matches = String(value || '').matchAll(NODE_ID_ERROR_PATTERN);
  for (const match of matches) {
    const nodeId = String(match?.[1] || '');
    if (nodeId.length > ZERO) {
      nodeIds.push(nodeId);
    }
  }
  return nodeIds;
}

function resolveRelevantNodeIds(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const loadMetrics = resolveLoadMetrics(entry);
  const affectedNodeIds = Array.isArray(diagnostics?.failure?.affectedNodeIds) ?
    diagnostics.failure.affectedNodeIds :
    [];
  const nodeIds = new Set(affectedNodeIds);
  for (const snapshotNodeId of Object.keys(resolveControlSnapshot(entry) || {})) {
    nodeIds.add(snapshotNodeId);
  }
  for (const traceNodeId of Object.keys(resolveAdminQueryTraceByNodeId(entry) || {})) {
    nodeIds.add(traceNodeId);
  }
  const perNodeMetrics = loadMetrics?.perNode &&
    typeof loadMetrics.perNode === 'object' &&
    !Array.isArray(loadMetrics.perNode) ?
    loadMetrics.perNode :
    {};
  for (const [nodeId, nodeMetrics] of Object.entries(perNodeMetrics)) {
    const attemptedErrors = Number(nodeMetrics?.attemptErrors || ZERO);
    const dispatched = Number(nodeMetrics?.dispatched || ZERO);
    const success = Number(nodeMetrics?.success || ZERO);
    const rejected = Number(nodeMetrics?.rejected || ZERO);
    if (attemptedErrors > ZERO ||
        dispatched > success ||
        rejected > ZERO) {
      nodeIds.add(nodeId);
    }
  }
  const failedPhaseErrors = Array.isArray(diagnostics?.failedPhase?.errors) ?
    diagnostics.failedPhase.errors :
    [];
  const distinctErrors = Array.isArray(loadMetrics?.distinctErrors) ?
    loadMetrics.distinctErrors :
    [];
  for (const errorText of [...failedPhaseErrors, ...distinctErrors]) {
    for (const nodeId of extractNodeIdsFromText(errorText)) {
      nodeIds.add(nodeId);
    }
  }
  return [...nodeIds];
}

async function collectScenarioLogArtifacts(scenarioDir, relevantNodeIds, workspaceRoot) {
  const result = {
    scenarioDirPath: toWorkspaceRelative(scenarioDir, workspaceRoot),
    timelinePath: null,
    analysisPath: null,
    nodeLogPaths: {},
    excerptsByNodeId: {},
  };
  let entries = [];
  try {
    entries = await readdir(scenarioDir, {withFileTypes: true});
  } catch (_error) {
    return result;
  }

  const nodeLogCandidates = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (entry.name === TIMELINE_FILENAME) {
      result.timelinePath = toWorkspaceRelative(
        join(scenarioDir, entry.name),
        workspaceRoot,
      );
      continue;
    }
    if (entry.name === ANALYSIS_FILENAME) {
      result.analysisPath = toWorkspaceRelative(
        join(scenarioDir, entry.name),
        workspaceRoot,
      );
      continue;
    }
    if (entry.name.endsWith(LOG_FILE_EXTENSION)) {
      nodeLogCandidates.push(entry.name);
    }
  }

  const preferredNodeIds = relevantNodeIds.length > ZERO ?
    relevantNodeIds :
    nodeLogCandidates.map((entryName) =>
      entryName.slice(ZERO, -LOG_FILE_EXTENSION.length),
    );

  await Promise.all(preferredNodeIds.map(async (nodeId) => {
    const filename = sanitizePathSegment(nodeId) + LOG_FILE_EXTENSION;
    const absolutePath = join(scenarioDir, filename);
    try {
      const content = await readFile(absolutePath, UTF8_ENCODING);
      result.nodeLogPaths[nodeId] = toWorkspaceRelative(absolutePath, workspaceRoot);
      result.excerptsByNodeId[nodeId] = sliceLogTail(content);
    } catch (_error) {
      // Best effort: missing per-node logs are allowed.
    }
  }));

  return result;
}

function buildFocusedNodeDiagnostics(entry, logs, controlPlaneDiagnostics = null) {
  const relevantNodeIds = resolveRelevantNodeIds(entry);
  const loadMetrics = resolveLoadMetrics(entry);
  const perNodeMetrics = loadMetrics?.perNode &&
    typeof loadMetrics.perNode === 'object' &&
    !Array.isArray(loadMetrics.perNode) ?
    loadMetrics.perNode :
    {};
  const distinctErrors = Array.isArray(loadMetrics?.distinctErrors) ?
    loadMetrics.distinctErrors :
    [];
  const failedPhaseErrors = Array.isArray(resolveFailureDiagnostics(entry)?.failedPhase?.errors) ?
    resolveFailureDiagnostics(entry).failedPhase.errors :
    [];
  const errorTexts = [...failedPhaseErrors, ...distinctErrors];
  const controlSnapshotByNodeId = resolveControlSnapshot(entry) || {};
  const adminQueryTraceByNodeId = resolveAdminQueryTraceByNodeId(entry) || {};
  const nodeDiagnostics = {};

  for (const nodeId of relevantNodeIds) {
    const matchingErrors = errorTexts.filter((errorText) =>
      extractNodeIdsFromText(errorText).includes(nodeId),
    );
    const traceEntries = Array.isArray(adminQueryTraceByNodeId[nodeId]) ?
      adminQueryTraceByNodeId[nodeId].slice(-NODE_DIAGNOSTICS_TRACE_LIMIT) :
      [];
    const readiness =
      controlPlaneDiagnostics?.readinessByNodeId?.[nodeId] || null;
    const placementEligibility =
      controlPlaneDiagnostics?.placementEligibilityByNodeId?.[nodeId] || null;
    const publicationMode =
      controlPlaneDiagnostics?.publicationModeByNodeId?.[nodeId] || null;
    const nodeLogPath = logs?.nodeLogPaths?.[nodeId] || null;
    const logExcerpt = Array.isArray(logs?.excerptsByNodeId?.[nodeId]) ?
      logs.excerptsByNodeId[nodeId] :
      [];
    if (!perNodeMetrics[nodeId] &&
        matchingErrors.length === ZERO &&
        !controlSnapshotByNodeId[nodeId] &&
        traceEntries.length === ZERO &&
        !readiness &&
        !placementEligibility &&
        !publicationMode &&
        !nodeLogPath &&
        logExcerpt.length === ZERO) {
      continue;
    }
    nodeDiagnostics[nodeId] = {
      loadMetrics: perNodeMetrics[nodeId] || null,
      errors: matchingErrors,
      adminQueryTrace: traceEntries,
      controlSnapshot: controlSnapshotByNodeId[nodeId] || null,
      readiness,
      placementEligibility,
      publicationMode,
      logPath: nodeLogPath,
      logExcerpt,
    };
  }

  return nodeDiagnostics;
}

function buildScenarioFailureBundle({
  entry,
  reportOutputPath,
  reportSummary,
  standardSummary,
  benchmarkRegressionGate,
  logs,
}) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const failure = diagnostics.failure || null;
  const noProgress = diagnostics.noProgress || null;
  const controlPlane = resolveControlPlaneDiagnostics(entry);
  const nodeDiagnostics = buildFocusedNodeDiagnostics(
    entry,
    logs,
    controlPlane,
  );
  return {
    schemaVersion: FAILURE_BUNDLE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    reportPath: reportOutputPath,
    scenario: entry.scenario,
    summary: {
      passed: entry.passed === true,
      error: entry.error || null,
      phase: diagnostics?.failedPhase?.phase || null,
      rootCauseClass: failure?.rootCauseClass || null,
      dominantReason: failure?.dominantReason || null,
    },
    reportSummary,
    standardSummary,
    benchmarkRegressionGate: benchmarkRegressionGate || null,
    diagnostics: {
      failure,
      failedPhase: diagnostics.failedPhase || null,
      noProgress,
      invariantBreaches: diagnostics.invariantBreaches || entry.invariantBreaches || null,
      rootCauseBundle: diagnostics.rootCauseBundle || null,
    },
    controlSnapshot: resolveControlSnapshot(entry),
    controlPlane,
    readiness: resolveReadinessSnapshot(entry),
    topFailures: {
      reasonCounts: resolveFailureReasonCounts(entry),
      topReasons: buildTopReasonCounts(resolveFailureReasonCounts(entry)),
      affectedNodeIds: Array.isArray(failure?.affectedNodeIds) ?
        failure.affectedNodeIds :
        [],
      loadMetrics: entry.loadMetrics || null,
    },
    nodeDiagnostics,
    logs,
    playback: entry.playback || null,
    trace: entry.trace || null,
  };
}

function formatList(values) {
  const items = Array.isArray(values) ?
    values
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > ZERO) :
    [];
  return items.length > ZERO ? items.join(', ') : UNKNOWN_VALUE;
}

function formatReadinessDimensions(readiness) {
  const dimensions = readiness?.dimensions &&
    typeof readiness.dimensions === 'object' ?
    readiness.dimensions :
    {};
  const entries = Object.entries(dimensions)
    .map(([dimension, value]) =>
      `${dimension}=${value === true ? 'ready' : 'blocked'}`,
    );
  return entries.length > ZERO ? entries.join(', ') : UNKNOWN_VALUE;
}

function formatPublicationMode(publicationMode) {
  if (!publicationMode || typeof publicationMode !== 'object') {
    return UNKNOWN_VALUE;
  }
  return [
    'mode=' + String(publicationMode.currentMode || UNKNOWN_VALUE),
    'reason=' + String(publicationMode.reasonCode || UNKNOWN_VALUE),
  ].join(', ');
}

function formatWorkflowAdmission(workflow) {
  if (!workflow || typeof workflow !== 'object') {
    return UNKNOWN_VALUE;
  }
  return [
    'state=' + String(workflow.transitionState || UNKNOWN_VALUE),
    'decision=' + String(
      workflow?.admission?.decisionType ||
      workflow?.admission?.decision ||
      UNKNOWN_VALUE,
    ),
    'blockingReasons=' + formatList(
      Array.isArray(workflow?.blockingReasons) ?
        workflow.blockingReasons.map((reason) => reason?.code || reason) :
        [],
    ),
  ].join(', ');
}

function formatTimeoutClassificationEntry(entry) {
  const timeoutClassification = entry?.timeoutClassification &&
    typeof entry.timeoutClassification === 'object' ?
    entry.timeoutClassification :
    {};
  return [
    'workflowId=' + String(entry?.workflowId || UNKNOWN_VALUE),
    'classification=' + String(
      timeoutClassification.classification || UNKNOWN_VALUE,
    ),
    'boundaryHit=' + String(timeoutClassification.boundaryHit === true),
    'nestedOperation=' + String(
      timeoutClassification.nestedOperation || UNKNOWN_VALUE,
    ),
  ].join(', ');
}

function formatNodeClientChannelMetrics(channel, metrics) {
  if (!metrics || typeof metrics !== 'object') {
    return `- ${channel}: ` + UNKNOWN_VALUE;
  }
  return [
    '- ' + channel + ':',
    'requests=' + String(metrics.requests ?? ZERO),
    'successes=' + String(metrics.successes ?? ZERO),
    'errors=' + String(metrics.errors ?? ZERO),
    'timeouts=' + String(metrics.timeouts ?? ZERO),
    'retries=' + String(metrics.retries ?? ZERO),
    'breakerOpens=' + String(metrics.breakerOpens ?? ZERO),
    'budgetDenials=' + String(metrics.budgetDenials ?? ZERO),
    'timeoutBudgetMismatches=' + String(metrics.timeoutBudgetMismatches ?? ZERO),
    'timedOutInFlight=' + String(metrics.timedOutInFlight ?? ZERO),
  ].join(' ');
}

function formatNodeClientChannelState(channel, nodeId, state) {
  if (!state || typeof state !== 'object') {
    return `- ${channel}/${nodeId}: ` + UNKNOWN_VALUE;
  }
  return [
    '- ' + channel + '/' + nodeId + ':',
    'inFlight=' + String(state.inFlight ?? ZERO),
    'consecutiveFailures=' + String(state.consecutiveFailures ?? ZERO),
    'openUntilMs=' + String(state.openUntilMs ?? ZERO),
    'circuitOpen=' + String(state.circuitOpen === true),
  ].join(' ');
}

function formatNodeDiagnosticLoadMetrics(loadMetrics) {
  if (!loadMetrics || typeof loadMetrics !== 'object') {
    return null;
  }
  return [
    'dispatched=' + Number(loadMetrics.dispatched || ZERO),
    'success=' + Number(loadMetrics.success || ZERO),
    'attemptErrors=' + Number(loadMetrics.attemptErrors || ZERO),
    'admissionSignals=' + Number(loadMetrics.admissionSignals || ZERO),
    'queuePressureSignals=' + Number(loadMetrics.queuePressureSignals || ZERO),
    'rejected=' + Number(loadMetrics.rejected || ZERO),
  ].join(', ');
}

function formatAdminQueryTraceEntry(entry) {
  return [
    'outcome=' + String(entry?.outcome || UNKNOWN_VALUE),
    'operation=' + String(entry?.operation || UNKNOWN_VALUE),
    'lane=' + String(entry?.lane || UNKNOWN_VALUE),
    'timeoutMs=' + String(entry?.timeoutMs ?? UNKNOWN_VALUE),
    'durationMs=' + String(entry?.durationMs ?? UNKNOWN_VALUE),
    'error=' + String(entry?.error || UNKNOWN_VALUE),
  ].join(', ');
}

function renderScenarioFailureBundleMarkdown(bundle) {
  const topReasons = Array.isArray(bundle?.topFailures?.topReasons) ?
    bundle.topFailures.topReasons :
    [];
  const relevantLogs = bundle?.logs?.nodeLogPaths &&
    typeof bundle.logs.nodeLogPaths === 'object' ?
    Object.entries(bundle.logs.nodeLogPaths) :
    [];
  const sections = [
    '# Failure Bundle',
    [
      `- Scenario: ${bundle.scenario}`,
      `- Phase: ${bundle.summary.phase || UNKNOWN_VALUE}`,
      `- Root Cause Class: ${bundle.summary.rootCauseClass || UNKNOWN_VALUE}`,
      `- Dominant Reason: ${bundle.summary.dominantReason || UNKNOWN_VALUE}`,
      `- Report: ${bundle.reportPath || UNKNOWN_VALUE}`,
    ].join('\n'),
  ];

  sections.push(
    '## Top Reasons\n' +
    (topReasons.length > ZERO ?
      topReasons.map((entry) => `- ${entry.reason}: ${entry.count}`).join('\n') :
      '- none'),
  );

  if (bundle?.diagnostics?.noProgress) {
    sections.push(
      '## No Progress\n' +
      [
        '- Reason Code: ' +
          String(
            bundle.diagnostics.noProgress.reasonCode ||
            NO_PROGRESS_REASON_CODE,
          ),
        '- Stalled Reason: ' +
          String(
            bundle.diagnostics.noProgress.stalledReason || UNKNOWN_VALUE,
          ),
        '- Last Progress: ' +
          String(
            bundle.diagnostics.noProgress.lastProgressEvent?.message ||
            UNKNOWN_VALUE,
          ),
        '- Last Meaningful Change: ' +
          String(
            bundle.diagnostics.noProgress.lastMeaningfulChange?.message ||
            UNKNOWN_VALUE,
          ),
      ].join('\n'),
    );
  }

  sections.push(
    '## Log Paths\n' +
    (relevantLogs.length > ZERO ?
      relevantLogs.map(([nodeId, path]) => `- ${nodeId}: ${path}`).join('\n') :
      '- none'),
  );

  const excerpts = bundle?.logs?.excerptsByNodeId &&
    typeof bundle.logs.excerptsByNodeId === 'object' ?
    Object.entries(bundle.logs.excerptsByNodeId) :
    [];
  if (excerpts.length > ZERO) {
    sections.push(
      '## Log Excerpts\n' +
      excerpts.map(([nodeId, lines]) => {
        const content = Array.isArray(lines) ? lines.join('\n') : '';
        return `### ${nodeId}\n\n\`\`\`text\n${content}\n\`\`\``;
      }).join(MARKDOWN_SECTION_BREAK),
    );
  }

  const nodeDiagnostics = bundle?.nodeDiagnostics &&
    typeof bundle.nodeDiagnostics === 'object' ?
    Object.entries(bundle.nodeDiagnostics) :
    [];
  if (nodeDiagnostics.length > ZERO) {
    sections.push(
      '## Node Diagnostics\n' +
      nodeDiagnostics.map(([nodeId, nodeDiagnostic]) => {
        const lines = [];
        if (nodeDiagnostic?.logPath) {
          lines.push(`- Log Path: ${nodeDiagnostic.logPath}`);
        }
        const loadMetrics = formatNodeDiagnosticLoadMetrics(
          nodeDiagnostic?.loadMetrics,
        );
        if (loadMetrics) {
          lines.push(`- Load Metrics: ${loadMetrics}`);
        }
        if (nodeDiagnostic?.readiness) {
          lines.push(
            `- Readiness: ${formatReadinessDimensions(nodeDiagnostic.readiness)}`,
          );
        }
        if (nodeDiagnostic?.placementEligibility) {
          lines.push(
            '- Placement Eligibility: ' +
              String(
                nodeDiagnostic.placementEligibility.placementEligible === true ?
                  'eligible' :
                  'ineligible',
              ) +
              ` (failedDimensions=${formatList(
                nodeDiagnostic.placementEligibility.failedDimensions,
              )}, reasonCodes=${formatList(
                nodeDiagnostic.placementEligibility.reasonCodes,
              )})`,
          );
        }
        if (nodeDiagnostic?.publicationMode) {
          lines.push(
            `- Publication Mode: ${formatPublicationMode(nodeDiagnostic.publicationMode)}`,
          );
        }
        const errors = Array.isArray(nodeDiagnostic?.errors) ?
          nodeDiagnostic.errors :
          [];
        if (errors.length > ZERO) {
          for (const errorText of errors) {
            lines.push(`- Error: ${errorText}`);
          }
        }
        const traces = Array.isArray(nodeDiagnostic?.adminQueryTrace) ?
          nodeDiagnostic.adminQueryTrace :
          [];
        if (traces.length > ZERO) {
          lines.push('```text');
          for (const traceEntry of traces) {
            lines.push(formatAdminQueryTraceEntry(traceEntry));
          }
          lines.push('```');
        }
        return `### ${nodeId}\n\n${lines.join('\n')}`;
      }).join(MARKDOWN_SECTION_BREAK),
    );
  }

  const publicationModes = bundle?.controlPlane?.publicationModeByNodeId &&
    typeof bundle.controlPlane.publicationModeByNodeId === 'object' ?
    Object.entries(bundle.controlPlane.publicationModeByNodeId) :
    [];
  const workflowAdmissions = bundle?.controlPlane?.workflowAdmissionsByWorkflowId &&
    typeof bundle.controlPlane.workflowAdmissionsByWorkflowId === 'object' ?
    Object.entries(bundle.controlPlane.workflowAdmissionsByWorkflowId) :
    [];
  const timeoutClassifications = Array.isArray(
    bundle?.controlPlane?.timeoutClassifications,
  ) ?
    bundle.controlPlane.timeoutClassifications :
    [];
  if (publicationModes.length > ZERO ||
      workflowAdmissions.length > ZERO ||
      timeoutClassifications.length > ZERO) {
    const controlPlaneSections = [];
    if (publicationModes.length > ZERO) {
      controlPlaneSections.push(
        '### Publication Modes\n' +
        publicationModes
          .map(([nodeId, publicationMode]) =>
            `- ${nodeId}: ${formatPublicationMode(publicationMode)}`,
          )
          .join('\n'),
      );
    }
    if (workflowAdmissions.length > ZERO) {
      controlPlaneSections.push(
        '### Workflow Admissions\n' +
        workflowAdmissions
          .map(([workflowId, workflow]) =>
            `- ${workflowId}: ${formatWorkflowAdmission(workflow)}`,
          )
          .join('\n'),
      );
    }
    if (timeoutClassifications.length > ZERO) {
      controlPlaneSections.push(
        '### Timeout Classifications\n' +
        timeoutClassifications
          .map((entry) => `- ${formatTimeoutClassificationEntry(entry)}`)
          .join('\n'),
      );
    }
    sections.push(
      '## Control Plane Diagnostics\n' +
      controlPlaneSections.join(MARKDOWN_SECTION_BREAK),
    );
  }

  const channelMetrics = bundle?.diagnostics?.rootCauseBundle?.channelMetrics &&
    typeof bundle.diagnostics.rootCauseBundle.channelMetrics === 'object' ?
    Object.entries(bundle.diagnostics.rootCauseBundle.channelMetrics) :
    [];
  const channelStateByChannel = bundle?.diagnostics?.rootCauseBundle?.channelStateByChannel &&
    typeof bundle.diagnostics.rootCauseBundle.channelStateByChannel === 'object' ?
    Object.entries(bundle.diagnostics.rootCauseBundle.channelStateByChannel) :
    [];
  if (channelMetrics.length > ZERO || channelStateByChannel.length > ZERO) {
    const nodeClientSections = [];
    if (channelMetrics.length > ZERO) {
      nodeClientSections.push(
        '### Metrics\n' +
        channelMetrics
          .map(([channel, metrics]) =>
            formatNodeClientChannelMetrics(channel, metrics),
          )
          .join('\n'),
      );
    }
    if (channelStateByChannel.length > ZERO) {
      nodeClientSections.push(
        '### Channel State\n' +
        channelStateByChannel
          .flatMap(([channel, nodeStates]) =>
            Object.entries(
              nodeStates && typeof nodeStates === 'object' ? nodeStates : {},
            )
              .map(([nodeId, state]) =>
                formatNodeClientChannelState(channel, nodeId, state)),
          )
          .join('\n'),
      );
    }
    sections.push(
      '## Node Client Channels\n' +
      nodeClientSections.join(MARKDOWN_SECTION_BREAK),
    );
  }

  return sections.join(MARKDOWN_SECTION_BREAK) + '\n';
}

function buildRunFailureBundle({
  reportOutputPath,
  reportSummary,
  standardSummary,
  benchmarkRegressionGate,
  scenarioBundles,
}) {
  return {
    schemaVersion: FAILURE_BUNDLE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    reportPath: reportOutputPath,
    reportSummary,
    standardSummary,
    benchmarkRegressionGate: benchmarkRegressionGate || null,
    failedScenarioCount: scenarioBundles.length,
    scenarios: scenarioBundles.map((bundle) => ({
      scenario: bundle.scenario,
      summary: bundle.summary,
      jsonPath: bundle.links.jsonPath,
      markdownPath: bundle.links.markdownPath,
    })),
  };
}

function renderRunFailureBundleMarkdown(bundle) {
  return [
    '# Run Failure Bundle',
    `- Report: ${bundle.reportPath || UNKNOWN_VALUE}`,
    `- Failed Scenarios: ${bundle.failedScenarioCount}`,
    '## Scenarios\n' + (
      Array.isArray(bundle.scenarios) && bundle.scenarios.length > ZERO ?
        bundle.scenarios.map((scenario) =>
          `- ${scenario.scenario}: ` +
            `${scenario.summary.phase || UNKNOWN_VALUE} ` +
            `(${scenario.markdownPath})`,
        ).join('\n') :
        '- none'
    ),
  ].join(MARKDOWN_SECTION_BREAK) + '\n';
}

export async function writeFailureBundlesForReport({
  scenarios,
  reportOutputPath,
  outputDir,
  reportSummary,
  standardSummary,
  benchmarkRegressionGate,
  workspaceRoot = process.cwd(),
}) {
  const scenarioEntries = Array.isArray(scenarios) ? scenarios : [];
  const absoluteOutputDir = resolve(String(outputDir || '.'));
  const absoluteReportPath = resolve(String(reportOutputPath || ''));
  const scenarioBundles = [];

  for (const entry of scenarioEntries) {
    if (!entry || entry.passed === true) {
      continue;
    }
    const scenarioName = sanitizePathSegment(entry.scenario, 'scenario');
    const scenarioDir = join(absoluteOutputDir, scenarioName);
    await mkdir(scenarioDir, {recursive: true});
    const logs = await collectScenarioLogArtifacts(
      scenarioDir,
      resolveRelevantNodeIds(entry),
      workspaceRoot,
    );
    const bundleJson = buildScenarioFailureBundle({
      entry,
      reportOutputPath: toWorkspaceRelative(absoluteReportPath, workspaceRoot),
      reportSummary,
      standardSummary,
      benchmarkRegressionGate,
      logs,
    });
    const jsonAbsolutePath = join(scenarioDir, FAILURE_BUNDLE_JSON_FILENAME);
    const markdownAbsolutePath = join(scenarioDir, FAILURE_BUNDLE_MARKDOWN_FILENAME);
    await writeFile(
      jsonAbsolutePath,
      JSON.stringify(bundleJson, null, 2),
      UTF8_ENCODING,
    );
    await writeFile(
      markdownAbsolutePath,
      renderScenarioFailureBundleMarkdown(bundleJson),
      UTF8_ENCODING,
    );
    const links = {
      jsonPath: toWorkspaceRelative(jsonAbsolutePath, workspaceRoot),
      markdownPath: toWorkspaceRelative(markdownAbsolutePath, workspaceRoot),
    };
    entry.failureBundle = links;
    scenarioBundles.push({
      scenario: entry.scenario,
      summary: bundleJson.summary,
      links,
    });
  }

  if (scenarioBundles.length === ZERO) {
    return {runBundle: null, scenarioBundles: []};
  }

  const runBundleDir = join(absoluteOutputDir, FAILURE_BUNDLE_RUN_DIRNAME);
  await mkdir(runBundleDir, {recursive: true});
  const runBundleJson = buildRunFailureBundle({
    reportOutputPath: toWorkspaceRelative(absoluteReportPath, workspaceRoot),
    reportSummary,
    standardSummary,
    benchmarkRegressionGate,
    scenarioBundles,
  });
  const runJsonAbsolutePath = join(runBundleDir, RUN_FAILURE_BUNDLE_JSON_FILENAME);
  const runMarkdownAbsolutePath = join(
    runBundleDir,
    RUN_FAILURE_BUNDLE_MARKDOWN_FILENAME,
  );
  await writeFile(
    runJsonAbsolutePath,
    JSON.stringify(runBundleJson, null, 2),
    UTF8_ENCODING,
  );
  await writeFile(
    runMarkdownAbsolutePath,
    renderRunFailureBundleMarkdown(runBundleJson),
    UTF8_ENCODING,
  );

  return {
    runBundle: {
      jsonPath: toWorkspaceRelative(runJsonAbsolutePath, workspaceRoot),
      markdownPath: toWorkspaceRelative(runMarkdownAbsolutePath, workspaceRoot),
    },
    scenarioBundles,
  };
}
