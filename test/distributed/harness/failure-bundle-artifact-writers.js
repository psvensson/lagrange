import {
  FAILURE_BUNDLE_SCHEMA_VERSION,
  FAILURE_BUNDLE_RUN_DIRNAME,
  FAILURE_BUNDLE_JSON_FILENAME,
  FAILURE_BUNDLE_MARKDOWN_FILENAME,
  TRIAGE_SUMMARY_JSON_FILENAME,
  TRIAGE_SUMMARY_MARKDOWN_FILENAME,
  RUN_FAILURE_BUNDLE_JSON_FILENAME,
  RUN_FAILURE_BUNDLE_MARKDOWN_FILENAME,
  UTF8_ENCODING,
  ZERO,
  toWorkspaceRelative,
  sanitizePathSegment,
  isRecord,
} from './failure-bundle-artifact-foundation.js';
import {resolveRelevantNodeIds} from './failure-bundle-control-plane-diagnostics.js';
import {collectScenarioLogArtifacts} from './failure-bundle-scenario-log-artifacts.js';
import {buildScenarioFailureBundle} from './failure-bundle-scenario-assembly.js';
import {
  buildScenarioTriageSummary,
  renderScenarioTriageSummaryMarkdown,
} from './failure-bundle-triage-summary.js';
import {
  renderScenarioFailureBundleMarkdown,
  buildRunFailureBundle,
  renderRunFailureBundleMarkdown,
} from './failure-bundle-formatting.js';
import {mkdir, rm, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';

import {classifyScenarioVerdict} from './validation-matrix.js';
import {SCENARIO_OUTCOME, scenarioOutcomeOf} from './scenario-outcome.js';
import {
  resolveLogWindowMaxRetainedBytes,
} from './failure-bundle-artifact-foundation.js';

function ensureScenarioDiagnostics(entry) {
  if (!isRecord(entry)) {
    return null;
  }
  if (!isRecord(entry.details)) {
    entry.details = {};
  }
  if (!isRecord(entry.details.diagnostics)) {
    entry.details.diagnostics = {};
  }
  return entry.details.diagnostics;
}

function refreshScenarioVerdict(entry) {
  if (!isRecord(entry)) {
    return;
  }
  const verdict = classifyScenarioVerdict(entry);
  entry.verdict = verdict.verdict;
  entry.verdictReason = verdict.reason;
}

function applyBundleScenarioSummary(entry, bundleJson) {
  if (isRecord(bundleJson.summary?.logWindowCoverage)) {
    entry.logWindowCoverage = bundleJson.summary.logWindowCoverage;
  }

  if (isRecord(bundleJson.summary?.failureClassification)) {
    // Scenario-level only: mirroring the classification into
    // details.diagnostics doubled a multi-MB blob in every report and had no
    // reader (all consumers read scenario.failureClassification).
    entry.failureClassification = bundleJson.summary.failureClassification;
  }

  if (
    typeof bundleJson.summary?.rootCauseClass === 'string' &&
    bundleJson.summary.rootCauseClass.length > ZERO
  ) {
    entry.rootCauseClass = bundleJson.summary.rootCauseClass;
  }

  if (
    typeof bundleJson.summary?.dominantReason === 'string' &&
    bundleJson.summary.dominantReason.length > ZERO
  ) {
    entry.dominantReason = bundleJson.summary.dominantReason;
  }
}

function applyBundleSummaryGuidance(entry, diagnostics, bundleJson) {
  if (isRecord(bundleJson.summary?.readinessFailure)) {
    diagnostics.readinessFailure = bundleJson.summary.readinessFailure;
    entry.readinessFailure = bundleJson.summary.readinessFailure;
  }

  if (
    typeof bundleJson.summary?.failureAction === 'string' &&
    bundleJson.summary.failureAction.length > ZERO
  ) {
    diagnostics.failureAction = bundleJson.summary.failureAction;
    entry.failureAction = bundleJson.summary.failureAction;
  }

  if (
    typeof bundleJson.summary?.operatorRecommendation === 'string' &&
    bundleJson.summary.operatorRecommendation.length > ZERO
  ) {
    diagnostics.operatorRecommendation =
      bundleJson.summary.operatorRecommendation;
    entry.operatorRecommendation = bundleJson.summary.operatorRecommendation;
  }
}

function applyBundleRecoveryEvidence(entry, diagnostics, bundleJson) {
  if (isRecord(bundleJson.publicationConvergence)) {
    diagnostics.publicationConvergence = bundleJson.publicationConvergence;
    entry.publicationConvergence = bundleJson.publicationConvergence;
  }

  if (isRecord(bundleJson.stabilityGates)) {
    diagnostics.stabilityGates = bundleJson.stabilityGates;
    entry.stabilityGates = bundleJson.stabilityGates;
  }

  if (isRecord(bundleJson.controlPlane?.priorityRecoveryDecisionSnapshots)) {
    diagnostics.priorityRecoveryDecisionSnapshots =
      bundleJson.controlPlane.priorityRecoveryDecisionSnapshots;
    entry.priorityRecoveryDecisionSnapshots =
      bundleJson.controlPlane.priorityRecoveryDecisionSnapshots;
  }

  if (isRecord(bundleJson.controlPlane?.priorityRecoveryObservation)) {
    diagnostics.priorityRecoveryObservation =
      bundleJson.controlPlane.priorityRecoveryObservation;
    entry.priorityRecoveryObservation =
      bundleJson.controlPlane.priorityRecoveryObservation;
  }

  if (isRecord(bundleJson.controlPlane?.priorityRecoveryInvariants)) {
    diagnostics.priorityRecoveryInvariants =
      bundleJson.controlPlane.priorityRecoveryInvariants;
    entry.priorityRecoveryInvariants =
      bundleJson.controlPlane.priorityRecoveryInvariants;
  }
}

function applyBundleReadinessArtifacts(diagnostics, bundleJson) {
  if (isRecord(bundleJson.readiness?.nodeReasonsByNodeId)) {
    if (!isRecord(diagnostics.failedPhase)) {
      diagnostics.failedPhase = {};
    }
    if (!isRecord(diagnostics.failedPhase.artifacts)) {
      diagnostics.failedPhase.artifacts = {};
    }
    diagnostics.failedPhase.artifacts.nodeReasonsByNodeId =
      bundleJson.readiness.nodeReasonsByNodeId;
  }
}

function applyBundleDiagnosticsToScenarioEntry(entry, bundleJson) {
  const diagnostics = ensureScenarioDiagnostics(entry);
  if (!diagnostics || !isRecord(bundleJson)) {
    return;
  }

  if (isRecord(bundleJson.diagnostics?.failure)) {
    diagnostics.failure = bundleJson.diagnostics.failure;
  }

  // The bundle's root-cause bundle is the entry's own, or its withheld form
  // when the bundle is non-measuring (scenario-assembly withholds it).
  if (isRecord(bundleJson.diagnostics?.rootCauseBundle)) {
    diagnostics.rootCauseBundle = bundleJson.diagnostics.rootCauseBundle;
  }

  applyBundleScenarioSummary(entry, bundleJson);

  applyBundleSummaryGuidance(entry, diagnostics, bundleJson);

  applyBundleRecoveryEvidence(entry, diagnostics, bundleJson);

  if (
    bundleJson.decisionArtifactsByNodeId &&
    typeof bundleJson.decisionArtifactsByNodeId === 'object'
  ) {
    diagnostics.decisionArtifactsByNodeId =
      bundleJson.decisionArtifactsByNodeId;
    entry.decisionArtifactsByNodeId = bundleJson.decisionArtifactsByNodeId;
  }

  if (isRecord(bundleJson.diagnostics?.firstFaultTimeline)) {
    diagnostics.firstFaultTimeline = bundleJson.diagnostics.firstFaultTimeline;
  }

  if (isRecord(bundleJson.recoveryReadiness)) {
    diagnostics.recoveryReadiness = bundleJson.recoveryReadiness;
    entry.recoveryReadiness = bundleJson.recoveryReadiness;
  }

  applyBundleReadinessArtifacts(diagnostics, bundleJson);

  refreshScenarioVerdict(entry);
}

const SCENARIO_FAILURE_ARTIFACT_FILENAMES = Object.freeze([
  FAILURE_BUNDLE_JSON_FILENAME,
  FAILURE_BUNDLE_MARKDOWN_FILENAME,
  TRIAGE_SUMMARY_JSON_FILENAME,
  TRIAGE_SUMMARY_MARKDOWN_FILENAME,
]);

async function removeScenarioFailureArtifacts(scenarioDir) {
  for (const filename of SCENARIO_FAILURE_ARTIFACT_FILENAMES) {
    await rm(join(scenarioDir, filename), {force: true});
  }
}

async function writeScenarioFailureBundleArtifacts({
  entry,
  scenarioDir,
  absoluteReportPath,
  reportSummary,
  standardSummary,
  benchmarkRegressionGate,
  workspaceRoot,
  scenarioConfig,
}) {
  const logs = await collectScenarioLogArtifacts(
    scenarioDir,
    resolveRelevantNodeIds(entry),
    workspaceRoot,
    entry,
    {maxRetainedBytes: resolveLogWindowMaxRetainedBytes(scenarioConfig)},
  );
  const bundleJson = buildScenarioFailureBundle({
    entry,
    reportOutputPath: toWorkspaceRelative(absoluteReportPath, workspaceRoot),
    reportSummary,
    standardSummary,
    benchmarkRegressionGate,
    logs,
  });
  // Serialize BEFORE mutating the scenario entry: if the bundle cannot
  // stringify, the entry must not carry the bundle diagnostics into the
  // report writer (which would hit the same serialization limit there).
  const serializedBundleJson = JSON.stringify(bundleJson, null, 2);
  applyBundleDiagnosticsToScenarioEntry(entry, bundleJson);
  const jsonAbsolutePath = join(scenarioDir, FAILURE_BUNDLE_JSON_FILENAME);
  const markdownAbsolutePath = join(
    scenarioDir,
    FAILURE_BUNDLE_MARKDOWN_FILENAME,
  );
  const triageJsonAbsolutePath = join(
    scenarioDir,
    TRIAGE_SUMMARY_JSON_FILENAME,
  );
  const triageMarkdownAbsolutePath = join(
    scenarioDir,
    TRIAGE_SUMMARY_MARKDOWN_FILENAME,
  );
  await writeFile(
    jsonAbsolutePath,
    serializedBundleJson,
    UTF8_ENCODING,
  );
  await writeFile(
    markdownAbsolutePath,
    renderScenarioFailureBundleMarkdown(bundleJson),
    UTF8_ENCODING,
  );
  const triageLinks = {
    jsonPath: toWorkspaceRelative(jsonAbsolutePath, workspaceRoot),
    markdownPath: toWorkspaceRelative(markdownAbsolutePath, workspaceRoot),
  };
  const triageSummary = buildScenarioTriageSummary(bundleJson, triageLinks);
  await writeFile(
    triageJsonAbsolutePath,
    JSON.stringify(triageSummary, null, 2),
    UTF8_ENCODING,
  );
  await writeFile(
    triageMarkdownAbsolutePath,
    renderScenarioTriageSummaryMarkdown(triageSummary),
    UTF8_ENCODING,
  );
  const links = {
    ...triageLinks,
    triageJsonPath: toWorkspaceRelative(
      triageJsonAbsolutePath,
      workspaceRoot,
    ),
    triageMarkdownPath: toWorkspaceRelative(
      triageMarkdownAbsolutePath,
      workspaceRoot,
    ),
  };
  entry.failureBundle = links;
  return {
    scenario: entry.scenario,
    summary: bundleJson.summary,
    links,
  };
}

const FALLBACK_BUNDLE_ARTIFACT_TYPE = 'scenario-failure-bundle-fallback';
const FALLBACK_BUNDLE_NOTE =
  'Full failure-bundle serialization failed; the scenario failure is ' +
  'preserved here, and ground truth remains in .full-logs/ and ' +
  'events.ndjson in the run output directory.';

async function writeScenarioFailureBundleFallback({
  entry,
  scenarioDir,
  workspaceRoot,
  error,
}) {
  const fallbackJson = {
    artifactType: FALLBACK_BUNDLE_ARTIFACT_TYPE,
    schemaVersion: FAILURE_BUNDLE_SCHEMA_VERSION,
    scenario: entry.scenario,
    passed: false,
    scenarioError: String(entry.error || ''),
    bundleWriteError: String(error?.message || error),
    note: FALLBACK_BUNDLE_NOTE,
  };
  const jsonAbsolutePath = join(scenarioDir, FAILURE_BUNDLE_JSON_FILENAME);
  await writeFile(
    jsonAbsolutePath,
    JSON.stringify(fallbackJson, null, 2),
    UTF8_ENCODING,
  );
  const links = {
    jsonPath: toWorkspaceRelative(jsonAbsolutePath, workspaceRoot),
    bundleWriteError: fallbackJson.bundleWriteError,
  };
  entry.failureBundle = links;
  console.warn(
    '[harness] WARNING: failure-bundle write degraded to fallback for ' +
    `scenario ${entry.scenario}: ${fallbackJson.bundleWriteError}`,
  );
  return {
    scenario: entry.scenario,
    summary: {
      scenario: entry.scenario,
      scenarioError: fallbackJson.scenarioError,
      bundleWriteError: fallbackJson.bundleWriteError,
    },
    links,
  };
}

// A PASSING scenario still needs its measured publication-convergence evidence
// in the report. The statistical gate classifies each run by the independent
// measured missingPublishedCount (NOT by the scenario's own pass flag — see the
// rolling-restart-stat-gate.sh header), and applyBundleDiagnosticsToScenarioEntry
// (the only writer of entry.publicationConvergence) is reached solely through the
// failure-bundle path. So a passing run, which skips that path, emits a null
// publicationConvergence and is read as missing=null → downgraded to SLOW,
// masking a genuine convergence (CL-037). Derive the SAME measured convergence
// summary the failure path uses (from the captured playback control plane) and
// attach ONLY the neutral measurement fields — never the failure-oriented
// guidance and never refreshScenarioVerdict, so a pass is never flipped — without
// writing any failure-triage artifacts. Best-effort: a derivation error must
// leave publicationConvergence null (honest → SLOW, the gate could not read it),
// never fabricate a converged verdict or fail the passing run.
async function attachPassingScenarioConvergenceEvidence({
  entry,
  scenarioDir,
  absoluteReportPath,
  reportSummary,
  standardSummary,
  benchmarkRegressionGate,
  workspaceRoot,
}) {
  try {
    let logs = null;
    try {
      logs = await collectScenarioLogArtifacts(
        scenarioDir,
        resolveRelevantNodeIds(entry),
        workspaceRoot,
        entry,
        {retainLogWindows: false},
      );
    } catch (_logError) {
      // Playback-log collection is best-effort; the convergence summary can
      // still be derived from the entry's own control-plane diagnostics.
      logs = null;
    }
    const bundleJson = buildScenarioFailureBundle({
      entry,
      reportOutputPath: toWorkspaceRelative(absoluteReportPath, workspaceRoot),
      reportSummary,
      standardSummary,
      benchmarkRegressionGate,
      logs,
    });
    if (isRecord(bundleJson.publicationConvergence)) {
      entry.publicationConvergence = bundleJson.publicationConvergence;
    }
    if (isRecord(bundleJson.controlPlane?.priorityRecoveryObservation)) {
      entry.priorityRecoveryObservation =
        bundleJson.controlPlane.priorityRecoveryObservation;
    }
  } catch (convergenceError) {
    console.warn(
      '[harness] WARNING: could not attach publication-convergence ' +
      `evidence for passing scenario ${entry.scenario}: ` +
      `${convergenceError?.message || convergenceError}`,
    );
  }
}

async function writeFailedScenarioBundle({
  entry,
  scenarioDir,
  absoluteReportPath,
  reportSummary,
  standardSummary,
  benchmarkRegressionGate,
  workspaceRoot,
  scenarioConfigs,
}) {
  await mkdir(scenarioDir, {recursive: true});
  // Serialization failure is isolated to this scenario's diagnostic artifact.
  // Keep the explicit failure artifact and the original report outcome.
  try {
    return await writeScenarioFailureBundleArtifacts({
      entry,
      scenarioDir,
      absoluteReportPath,
      reportSummary,
      standardSummary,
      benchmarkRegressionGate,
      workspaceRoot,
      scenarioConfig: isRecord(scenarioConfigs) ?
        scenarioConfigs[entry.scenario] :
        null,
    });
  } catch (bundleError) {
    return await writeScenarioFailureBundleFallback({
      entry,
      scenarioDir,
      workspaceRoot,
      error: bundleError,
    });
  }
}

async function writeRunFailureBundle({
  absoluteOutputDir,
  absoluteReportPath,
  reportSummary,
  standardSummary,
  benchmarkRegressionGate,
  workspaceRoot,
  scenarioBundles,
}) {
  const runBundleDir = join(absoluteOutputDir, FAILURE_BUNDLE_RUN_DIRNAME);
  await mkdir(runBundleDir, {recursive: true});
  try {
    const runBundleJson = buildRunFailureBundle({
      reportOutputPath: toWorkspaceRelative(absoluteReportPath, workspaceRoot),
      reportSummary,
      standardSummary,
      benchmarkRegressionGate,
      scenarioBundles,
    });
    const runJsonAbsolutePath = join(
      runBundleDir,
      RUN_FAILURE_BUNDLE_JSON_FILENAME,
    );
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
        markdownPath: toWorkspaceRelative(
          runMarkdownAbsolutePath,
          workspaceRoot,
        ),
      },
      scenarioBundles,
    };
  } catch (runBundleError) {
    console.warn(
      '[harness] WARNING: run failure-bundle write failed: ' +
      `${String(runBundleError?.message || runBundleError)}`,
    );
    return {runBundle: null, scenarioBundles};
  }
}

async function writeFailureBundlesForReport({
  scenarios,
  reportOutputPath,
  outputDir,
  reportSummary,
  standardSummary,
  benchmarkRegressionGate,
  workspaceRoot = process.cwd(),
  scenarioConfigs = null,
}) {
  const scenarioEntries = Array.isArray(scenarios) ? scenarios : [];
  const absoluteOutputDir = resolve(String(outputDir || '.'));
  const absoluteReportPath = resolve(String(reportOutputPath || ''));
  const scenarioBundles = [];

  for (const entry of scenarioEntries) {
    if (!entry) {
      continue;
    }
    const scenarioName = sanitizePathSegment(entry.scenario, 'scenario');
    const scenarioDir = join(absoluteOutputDir, scenarioName);
    // A refused scenario never ran: no cluster, no logs, nothing to triage
    // as a failure - no bundle, and its directory (an earlier run's
    // evidence) is left untouched. The report entry names the refusal.
    if (scenarioOutcomeOf(entry) === SCENARIO_OUTCOME.REFUSED) {
      delete entry.failureBundle;
      continue;
    }
    if (entry.passed === true) {
      await removeScenarioFailureArtifacts(scenarioDir);
      delete entry.failureBundle;
      await attachPassingScenarioConvergenceEvidence({
        entry,
        scenarioDir,
        absoluteReportPath,
        reportSummary,
        standardSummary,
        benchmarkRegressionGate,
        workspaceRoot,
      });
      continue;
    }
    scenarioBundles.push(await writeFailedScenarioBundle({
      entry,
      scenarioDir,
      absoluteReportPath,
      reportSummary,
      standardSummary,
      benchmarkRegressionGate,
      workspaceRoot,
      scenarioConfigs,
    }));
  }

  if (scenarioBundles.length === ZERO) {
    await rm(join(absoluteOutputDir, FAILURE_BUNDLE_RUN_DIRNAME), {
      recursive: true,
      force: true,
    });
    return {runBundle: null, scenarioBundles: []};
  }

  return writeRunFailureBundle({
    absoluteOutputDir,
    absoluteReportPath,
    reportSummary,
    standardSummary,
    benchmarkRegressionGate,
    workspaceRoot,
    scenarioBundles,
  });
}

export {
  writeFailureBundlesForReport,
};
