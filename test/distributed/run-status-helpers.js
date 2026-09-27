import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import {basename, dirname, extname, join, resolve} from 'node:path';

const SUPPRESSED_RUNNER_ERROR_CONTEXT = Object.freeze({
  REPORT_HISTORY_READ: 'report_history_read',
  REPORT_HISTORY_SCAN: 'report_history_scan',
  RUNNER_STATUS_UPDATE: 'runner_status_update',
});

export function createDistributedRunStatusHelpers({
  CLI,
  RUN_OUTPUT_DIRNAME,
  REPORT_JSON_EXTENSION,
  FALLBACK_OUTPUT_BASENAME,
  RUN_STATUS_FILENAME,
  RUN_STATUS_ARTIFACT_TYPE,
  HISTORICAL_REPORT_SCAN_LIMIT,
  UTF8_ENCODING,
  JSON_INDENT,
  NEWLINE,
}) {
  const suppressedRunnerErrors = new Map();

  function deriveRunOutputDir(reportOutputPath) {
    const outputPath = String(reportOutputPath || CLI.DEFAULT_OUTPUT);
    const reportDir = dirname(outputPath);
    const reportFilename = basename(outputPath);
    let reportBasename = reportFilename;
    if (reportFilename.endsWith(REPORT_JSON_EXTENSION)) {
      reportBasename = reportFilename.slice(0, -REPORT_JSON_EXTENSION.length);
    } else {
      const extension = extname(reportFilename);
      if (extension.length > 0) {
        reportBasename = reportFilename.slice(0, -extension.length);
      }
    }
    const outputBasename = reportBasename || FALLBACK_OUTPUT_BASENAME;
    return join(reportDir, RUN_OUTPUT_DIRNAME, outputBasename);
  }

  function deriveRunStatusPath(outputDir) {
    return join(String(outputDir || ''), RUN_STATUS_FILENAME);
  }

  function buildRunStatusArtifact(fields = {}) {
    const artifact = {
      artifactType: RUN_STATUS_ARTIFACT_TYPE,
      updatedAt: new Date().toISOString(),
    };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null) artifact[key] = value;
    }
    return artifact;
  }

  async function writeRunStatusArtifact(outputDir, fields = {}) {
    const statusPath = deriveRunStatusPath(outputDir);
    const artifact = buildRunStatusArtifact(fields);
    await mkdir(dirname(statusPath), {recursive: true});
    await writeFile(statusPath,
      JSON.stringify(artifact, null, JSON_INDENT) + NEWLINE, UTF8_ENCODING);
    return {path: statusPath, artifact};
  }

  function recordSuppressedRunnerError(context, error) {
    const entry = suppressedRunnerErrors.get(context) ||
      {count: 0, lastMessage: null};
    entry.count += 1;
    entry.lastMessage = error?.message || String(error);
    suppressedRunnerErrors.set(context, entry);
  }

  function parseTimestampMs(value) {
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async function loadHistoricalReports(reportOutputPath) {
    const resolvedOutputPath = resolve(String(reportOutputPath || CLI.DEFAULT_OUTPUT));
    const reportDir = dirname(resolvedOutputPath);
    const candidatePaths = new Set([resolvedOutputPath]);
    try {
      const entries = await readdir(reportDir, {withFileTypes: true});
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(REPORT_JSON_EXTENSION)) {
          candidatePaths.add(resolve(join(reportDir, entry.name)));
        }
      }
    } catch (scanErr) {
      recordSuppressedRunnerError(
        SUPPRESSED_RUNNER_ERROR_CONTEXT.REPORT_HISTORY_SCAN, scanErr);
    }

    const historicalReports = [];
    for (const candidatePath of candidatePaths) {
      try {
        const parsed = JSON.parse(await readFile(candidatePath, UTF8_ENCODING));
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.scenarios)) continue;
        historicalReports.push({
          path: candidatePath,
          timestamp: parsed.timestamp || null,
          summary: parsed.summary || null,
          standardSummary: parsed.standardSummary &&
            typeof parsed.standardSummary === 'object' ? parsed.standardSummary : null,
          metadata: parsed.metadata && typeof parsed.metadata === 'object' ?
            parsed.metadata : null,
          scenarios: parsed.scenarios,
        });
      } catch (readErr) {
        recordSuppressedRunnerError(
          SUPPRESSED_RUNNER_ERROR_CONTEXT.REPORT_HISTORY_READ, readErr);
      }
    }
    historicalReports.sort((left, right) =>
      parseTimestampMs(right.timestamp) - parseTimestampMs(left.timestamp));
    return historicalReports.slice(0, HISTORICAL_REPORT_SCAN_LIMIT);
  }

  return {
    SUPPRESSED_RUNNER_ERROR_CONTEXT,
    deriveRunOutputDir,
    deriveRunStatusPath,
    buildRunStatusArtifact,
    writeRunStatusArtifact,
    recordSuppressedRunnerError,
    loadHistoricalReports,
  };
}
