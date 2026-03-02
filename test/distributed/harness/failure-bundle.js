import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import {basename, join, relative, resolve} from 'node:path';

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

function resolveControlSnapshot(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const snapshotsByNodeId = diagnostics?.rootCauseBundle?.snapshotsByNodeId;
  if (snapshotsByNodeId && typeof snapshotsByNodeId === 'object') {
    return snapshotsByNodeId;
  }
  return null;
}

function resolveRelevantNodeIds(entry) {
  const diagnostics = resolveFailureDiagnostics(entry);
  const affectedNodeIds = Array.isArray(diagnostics?.failure?.affectedNodeIds) ?
    diagnostics.failure.affectedNodeIds :
    [];
  if (affectedNodeIds.length > ZERO) {
    return [...affectedNodeIds];
  }
  const snapshotNodeIds = Object.keys(resolveControlSnapshot(entry) || {});
  if (snapshotNodeIds.length > ZERO) {
    return snapshotNodeIds;
  }
  return [];
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
    readiness: resolveReadinessSnapshot(entry),
    topFailures: {
      reasonCounts: resolveFailureReasonCounts(entry),
      topReasons: buildTopReasonCounts(resolveFailureReasonCounts(entry)),
      affectedNodeIds: Array.isArray(failure?.affectedNodeIds) ?
        failure.affectedNodeIds :
        [],
      loadMetrics: entry.loadMetrics || null,
    },
    logs,
    playback: entry.playback || null,
    trace: entry.trace || null,
  };
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
        `- Reason Code: ${bundle.diagnostics.noProgress.reasonCode || NO_PROGRESS_REASON_CODE}`,
        `- Stalled Reason: ${bundle.diagnostics.noProgress.stalledReason || UNKNOWN_VALUE}`,
        `- Last Progress: ${bundle.diagnostics.noProgress.lastProgressEvent?.message || UNKNOWN_VALUE}`,
        `- Last Meaningful Change: ${bundle.diagnostics.noProgress.lastMeaningfulChange?.message || UNKNOWN_VALUE}`,
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
          `- ${scenario.scenario}: ${scenario.summary.phase || UNKNOWN_VALUE} (${scenario.markdownPath})`,
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
