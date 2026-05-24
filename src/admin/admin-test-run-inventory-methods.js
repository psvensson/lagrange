/**
 * Saved-run inventory and archive helpers for AdminTestRunService.
 */

import {
  open as openFile,
  readFile,
  rm as removePath,
  stat,
} from 'node:fs/promises';
import {basename, extname, join, resolve} from 'node:path';
import {
  ADMIN_TEST_DEFAULT,
  ADMIN_TEST_ERROR_MSG,
  ADMIN_TEST_LOG_STREAM,
  ADMIN_TEST_RUN_PATH,
} from './admin-constants.js';
import {
  buildArchivedTimelineCandidates,
  buildLivePlaybackViewerUrl,
  buildPlaybackViewerUrl,
  buildRunPlaybackOutputDir,
  buildScenarioOutputDir,
  buildScenarioPlaybackPaths,
  isPathInside,
  normalizeWorkspaceRelativePath,
  toOutputWebPath,
} from './admin-test-run-paths.js';
import {
  extractReportSummary,
  isRunStatusActive,
  mergeRunRecord,
  serializeRun,
} from './admin-test-run-report.js';
import {buildAdminTestRunServiceHelpers} from './admin-test-run-service-helpers.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_NUM_ZERO = 0;

const FILE_ENCODING = 'utf8';
const REPORT_TIMESTAMP_FALLBACK_MS = 0;
const METADATA_FILE_EXTENSION = '.json';
const CLEAN_LINE_BREAK_REGEX = /\r?\n/;
const FIRST_SPACE_REGEX = /\s+/;
const ISO_TIMESTAMP_PREFIX_REGEX = /^\d{4}-\d{2}-\d{2}T/;
const FILE_READ_BYTES_PER_CHUNK = 65536;
const BUFFER_ENCODING = 'utf8';
const METADATA_FILENAME_PREFIX = 'run-';
const EMPTY_STRING = '';

const {tryReadJson} = buildAdminTestRunServiceHelpers({
  ADMIN_TEST_ERROR_MSG,
  FILE_ENCODING,
  readFile,
});

const adminTestRunInventoryMethods = Object.freeze({
  /**
   * List historical and active runs.
   * @return {Promise<Array<Object>>}
   */
  async listSavedRuns() {
    const runsById = new Map();
    const reportRuns = await this.listRunsFromReports();
    for (const reportRun of reportRuns) {
      runsById.set(reportRun.runId, reportRun);
    }

    const metadataRuns = await this.listRunsFromMetadata();
    for (const metadataRun of metadataRuns) {
      const existing = runsById.get(metadataRun.runId) || {};
      runsById.set(
        metadataRun.runId,
        this.mergeRunRecord(existing, metadataRun),
      );
    }

    for (const activeRun of this.runs.values()) {
      const existing = runsById.get(activeRun.runId) || {};
      runsById.set(
        activeRun.runId,
        this.mergeRunRecord(
          existing,
          this.serializeRun(activeRun),
        ),
      );
    }

    return Array.from(runsById.values())
      .sort((a, b) => {
        const aValue = Date.parse(a.startedAt || EMPTY_STRING) ||
          REPORT_TIMESTAMP_FALLBACK_MS;
        const bValue = Date.parse(b.startedAt || EMPTY_STRING) ||
          REPORT_TIMESTAMP_FALLBACK_MS;
        return bValue - aValue;
      });
  },

  /**
   * Return one run by id.
   * @param {string} runId
   * @return {Promise<Object|null>}
   */
  async getRun(runId) {
    const activeRun = this.runs.get(runId);
    if (activeRun) {
      return this.serializeRun(activeRun, {includeLogs: true});
    }

    const metadataFile = this.resolveMetadataFilePath(runId);
    const metadata = await tryReadJson(metadataFile);
    if (metadata) {
      const reportData = await this.getReportSummary(
        metadata.outputReportPath || null,
        metadata.runId,
      );
      const runRecord = this.mergeRunRecord(metadata, reportData);
      runRecord.logs = await this.loadArchivedLogs(runRecord);
      return runRecord;
    }

    const reportOnlyRun = await this.getReportOnlyRun(runId);
    if (!reportOnlyRun) {
      return null;
    }

    const runRecord = {...reportOnlyRun};
    runRecord.logs = await this.loadArchivedLogs(runRecord);
    return runRecord;
  },

  /**
   * Delete a completed historical run by id.
   * Removes report and metadata artifacts where present.
   * @param {string} runId
   * @return {Promise<Object>}
   */
  async deleteRun(runId) {
    const normalizedRunId = String(runId || EMPTY_STRING).trim();
    if (!normalizedRunId) {
      throw new Error(ADMIN_TEST_ERROR_MSG.RUN_NOT_FOUND);
    }

    const activeRun = this.runs.get(normalizedRunId);
    if (activeRun && isRunStatusActive(activeRun.status)) {
      throw new Error(ADMIN_TEST_ERROR_MSG.RUN_DELETE_ACTIVE);
    }

    const runRecord = await this.getRun(normalizedRunId);
    if (!runRecord) {
      throw new Error(ADMIN_TEST_ERROR_MSG.RUN_NOT_FOUND);
    }

    const metadataPath = this.resolveMetadataFilePath(normalizedRunId);
    const reportPath = runRecord.outputReportPath ?
      resolve(this.workspaceRoot, runRecord.outputReportPath) :
      resolve(
        this.workspaceRoot,
        join(
          ADMIN_TEST_RUN_PATH.OUTPUT_DIR,
          `${normalizedRunId}${ADMIN_TEST_DEFAULT.REPORT_EXTENSION}`,
        ),
      );
    const playbackRunDir = resolve(
      this.workspaceRoot,
      this.buildRunPlaybackOutputDir(normalizedRunId),
    );

    const removed = {
      metadata: await this.removeFileIfExists(metadataPath, this.metadataDir),
      report: await this.removeFileIfExists(reportPath, this.outputDir),
      playback: await this.removeDirectoryIfExists(playbackRunDir, this.outputDir),
    };

    this.runs.delete(normalizedRunId);

    return {
      runId: normalizedRunId,
      deleted: true,
      removed,
    };
  },

  /**
   * Load archived log lines for a completed run.
   * @param {Object} runRecord
   * @return {Promise<Array<Object>>}
   * @private
   */
  async loadArchivedLogs(runRecord) {
    const scenario = runRecord?.scenario;
    if (!scenario) {
      return [];
    }

    const timelinePaths = this.buildArchivedTimelineCandidates(runRecord);
    for (const timelinePath of timelinePaths) {
      if (!timelinePath || !isPathInside(this.outputDir, timelinePath)) {
        continue;
      }

      let fileStats = null;
      try {
        fileStats = await stat(timelinePath);
      } catch {
        fileStats = null;
      }
      if (!fileStats || !fileStats.isFile()) {
        continue;
      }

      let tailLines = [];
      try {
        tailLines = await this.readTailLines(
          timelinePath,
          ADMIN_TEST_DEFAULT.ARCHIVE_LOG_LINE_LIMIT,
        );
      } catch {
        tailLines = [];
      }
      if (tailLines.length === LOCAL_NUM_ZERO) {
        continue;
      }

      return tailLines.map((line) => this.buildArchivedLogEntry(line, runRecord));
    }

    return [];
  },

  /**
   * Read only the tail lines from a text file.
   * @param {string} filePath
   * @param {number} maxLines
   * @return {Promise<Array<string>>}
   * @private
   */
  async readTailLines(filePath, maxLines) {
    const fileHandle = await openFile(filePath, 'r');
    try {
      const stats = await fileHandle.stat();
      let position = Number(stats.size || REPORT_TIMESTAMP_FALLBACK_MS);
      let combined = EMPTY_STRING;
      let splitLines = [];

      while (position > REPORT_TIMESTAMP_FALLBACK_MS &&
        splitLines.length <= maxLines) {
        const chunkSize = Math.min(FILE_READ_BYTES_PER_CHUNK, position);
        position -= chunkSize;
        const buffer = Buffer.alloc(chunkSize);
        await fileHandle.read(buffer, REPORT_TIMESTAMP_FALLBACK_MS, chunkSize, position);
        combined = buffer.toString(BUFFER_ENCODING) + combined;
        splitLines = combined.split(CLEAN_LINE_BREAK_REGEX);
      }

      const normalized = splitLines
        .map((line) => line.trim())
        .filter((line) => Boolean(line));
      if (normalized.length <= maxLines) {
        return normalized;
      }
      return normalized.slice(normalized.length - maxLines);
    } finally {
      await fileHandle.close();
    }
  },

  /**
   * Convert one archived text line into UI log entry shape.
   * @param {string} line
   * @param {Object} runRecord
   * @return {Object}
   * @private
   */
  buildArchivedLogEntry(line, runRecord) {
    const firstToken = line.split(FIRST_SPACE_REGEX, 1)[0] || EMPTY_STRING;
    const timestamp = ISO_TIMESTAMP_PREFIX_REGEX.test(firstToken) ?
      firstToken :
      (runRecord.endedAt || runRecord.startedAt || new Date(this.now()).toISOString());

    return {
      timestamp,
      stream: ADMIN_TEST_LOG_STREAM.ARCHIVE,
      line,
    };
  },

  /**
   * Build timeline path candidates for archived run logs.
   * @param {Object} runRecord
   * @return {Array<string>}
   * @private
   */
  buildArchivedTimelineCandidates(runRecord) {
    return buildArchivedTimelineCandidates(
      runRecord, this.outputDir, this.workspaceRoot,
    );
  },

  /**
   * Collect run entries from report files.
   * @return {Promise<Array<Object>>}
   * @private
   */
  async listRunsFromReports() {
    const entries = await this.tryReadDirectory(this.outputDir);
    const reportFiles = entries
      .filter((entry) => entry.isFile() &&
        entry.name.endsWith(ADMIN_TEST_DEFAULT.REPORT_EXTENSION))
      .map((entry) => entry.name);

    const runs = [];
    for (const reportFile of reportFiles) {
      const fullPath = resolve(this.outputDir, reportFile);
      const report = await tryReadJson(fullPath);
      if (!report || typeof report !== LOCAL_STR_OBJECT) {
        continue;
      }

      const runId = basename(
        reportFile,
        ADMIN_TEST_DEFAULT.REPORT_EXTENSION,
      );
      const reportStat = await stat(fullPath);
      const reportSummary = this.extractReportSummary(
        report,
        runId,
        reportStat,
      );
      runs.push(reportSummary);
    }
    return runs;
  },

  /**
   * Collect run entries from metadata files.
   * @return {Promise<Array<Object>>}
   * @private
   */
  async listRunsFromMetadata() {
    const entries = await this.tryReadDirectory(this.metadataDir);
    const files = entries
      .filter((entry) => entry.isFile() &&
        extname(entry.name) === METADATA_FILE_EXTENSION);

    const runs = [];
    for (const fileEntry of files) {
      const metadataPath = resolve(this.metadataDir, fileEntry.name);
      const metadata = await tryReadJson(metadataPath);
      if (!metadata || !metadata.runId) {
        continue;
      }
      const reportData = await this.getReportSummary(
        metadata.outputReportPath || null,
        metadata.runId,
      );
      runs.push(this.mergeRunRecord(metadata, reportData));
    }
    return runs;
  },

  /**
   * Return report-derived summary for one run.
   * @param {string|null} outputReportPath
   * @param {string} runId
   * @return {Promise<Object>}
   * @private
   */
  async getReportSummary(outputReportPath, runId) {
    if (!outputReportPath) {
      return {runId};
    }
    const reportPath = resolve(this.workspaceRoot, outputReportPath);
    const report = await tryReadJson(reportPath);
    if (!report || typeof report !== LOCAL_STR_OBJECT) {
      return {runId};
    }
    let reportStats = null;
    try {
      reportStats = await stat(reportPath);
    } catch {
      reportStats = null;
    }
    return this.extractReportSummary(report, runId, reportStats);
  },

  /**
   * Load run details directly from report file when metadata is missing.
   * @param {string} runId
   * @return {Promise<Object|null>}
   * @private
   */
  async getReportOnlyRun(runId) {
    const outputReportPath = join(
      ADMIN_TEST_RUN_PATH.OUTPUT_DIR,
      `${runId}${ADMIN_TEST_DEFAULT.REPORT_EXTENSION}`,
    );
    const reportPath = resolve(this.workspaceRoot, outputReportPath);
    const report = await tryReadJson(reportPath);
    if (!report || typeof report !== LOCAL_STR_OBJECT) {
      return null;
    }

    let reportStats = null;
    try {
      reportStats = await stat(reportPath);
    } catch {
      reportStats = null;
    }
    return this.extractReportSummary(report, runId, reportStats);
  },

  /**
   * Parse report JSON into run summary.
   * @param {Object} report
   * @param {string} runId
   * @param {Object|null} reportStats
   * @return {Object}
   * @private
   */
  extractReportSummary(report, runId, reportStats) {
    return extractReportSummary(
      report, runId, reportStats,
      this.outputDir, this.workspaceRoot, this.now,
    );
  },

  /**
   * Merge two run records, preferring defined values from right.
   * @param {Object} left
   * @param {Object} right
   * @return {Object}
   * @private
   */
  mergeRunRecord(left, right) {
    return mergeRunRecord(
      left, right,
      this.outputDir, this.workspaceRoot,
      (input) => this.buildProgressPayload(input),
    );
  },

  /**
   * Remove one file only if it exists under basePath.
   * @param {string} filePath
   * @param {string} basePath
   * @return {Promise<boolean>}
   * @private
   */
  async removeFileIfExists(filePath, basePath) {
    if (!filePath || !basePath) {
      return false;
    }
    const absoluteFilePath = resolve(filePath);
    if (!isPathInside(basePath, absoluteFilePath)) {
      return false;
    }
    try {
      const fileStats = await stat(absoluteFilePath);
      if (!fileStats.isFile()) {
        return false;
      }
      await removePath(absoluteFilePath, {force: true});
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Remove one directory recursively if it exists under basePath.
   * @param {string} directoryPath
   * @param {string} basePath
   * @return {Promise<boolean>}
   * @private
   */
  async removeDirectoryIfExists(directoryPath, basePath) {
    if (!directoryPath || !basePath) {
      return false;
    }
    const absoluteDirectoryPath = resolve(directoryPath);
    if (!isPathInside(basePath, absoluteDirectoryPath)) {
      return false;
    }
    try {
      const directoryStats = await stat(absoluteDirectoryPath);
      if (!directoryStats.isDirectory()) {
        return false;
      }
      await removePath(absoluteDirectoryPath, {
        recursive: true,
        force: true,
      });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Build per-run playback output root.
   * @param {string|null} runId
   * @return {string}
   * @private
   */
  buildRunPlaybackOutputDir(runId) {
    return buildRunPlaybackOutputDir(runId);
  },

  /**
   * Build scenario output directory.
   * @param {string|null} scenarioName
   * @param {string|null} runId
   * @return {string|null}
   * @private
   */
  buildScenarioOutputDir(scenarioName, runId = null) {
    return buildScenarioOutputDir(scenarioName, runId);
  },

  /**
   * Build standard playback file paths for a scenario.
   * @param {string|null} scenarioName
   * @param {string|null} runId
   * @return {{
   *   eventsPath: string,
   *   samplesPath: string,
   *   snapshotsPath: string,
   *   manifestPath: string,
   * }|null}
   * @private
   */
  buildScenarioPlaybackPaths(scenarioName, runId = null) {
    return buildScenarioPlaybackPaths(scenarioName, runId);
  },

  /**
   * Build playback viewer URL for live follow mode.
   * @param {Object} payload
   * @param {Object} [options]
   * @return {string|null}
   * @private
   */
  buildLivePlaybackViewerUrl(payload, options = {}) {
    return buildLivePlaybackViewerUrl(payload, options);
  },

  /**
   * Build metadata file path for one run.
   * @param {string} runId
   * @return {string}
   * @private
   */
  resolveMetadataFilePath(runId) {
    return resolve(
      this.metadataDir,
      `${METADATA_FILENAME_PREFIX}${runId}${METADATA_FILE_EXTENSION}`,
    );
  },

  /**
   * Convert internal run object into API shape.
   * @param {Object} run
   * @param {Object} [options]
   * @param {boolean} [options.includeLogs]
   * @return {Object}
   * @private
   */
  serializeRun(run, options = {}) {
    return serializeRun(
      run, options, this.outputDir, this.workspaceRoot,
    );
  },

  /**
   * Normalize a workspace-relative path and ensure it is under output dir.
   * @param {string|null} maybePath
   * @return {string|null}
   * @private
   */
  normalizeWorkspaceRelativePath(maybePath) {
    return normalizeWorkspaceRelativePath(
      maybePath, this.outputDir, this.workspaceRoot,
    );
  },

  /**
   * Build playback viewer URL for a manifest path.
   * @param {string} manifestPath
   * @return {string}
   * @private
   */
  buildPlaybackViewerUrl(manifestPath) {
    return buildPlaybackViewerUrl(
      manifestPath, this.outputDir, this.workspaceRoot,
    );
  },

  /**
   * Convert output-relative path to HTTP URL path.
   * @param {string|null} outputRelativePath
   * @return {string|null}
   * @private
   */
  toOutputWebPath(outputRelativePath) {
    return toOutputWebPath(
      outputRelativePath, this.outputDir, this.workspaceRoot,
    );
  },
});

export {adminTestRunInventoryMethods};
