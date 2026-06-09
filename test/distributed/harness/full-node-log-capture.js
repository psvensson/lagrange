// Persist the FULL stdout/stderr of a node container to disk, gzipped.
//
// Why this exists: the harness's primary log channel is a LIVE SELECT on the
// cluster's own `logs` table — which is itself dead during exactly the failures
// worth investigating (a control-plane/publication stall stalls the very write
// path the logs table rides on) — and the curated playback bundle samples most
// lines out. Raw container stdout is the only channel that contains every pino
// line a node ever wrote, regardless of cluster health. We capture it before the
// container is destroyed so it survives the run.
//
// The raw `docker logs` stream is Docker's multiplexed 8-byte-header frame
// format, so we decode it with the harness's existing frame decoder
// (extractContainerLogLines) rather than gzipping the binary frames verbatim.

import {gzip as gzipCallback, createGzip} from 'node:zlib';
import {promisify} from 'node:util';
import {mkdir, writeFile} from 'node:fs/promises';
import {createWriteStream, createReadStream} from 'node:fs';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {dirname, join} from 'node:path';
import {extractContainerLogLines} from './log-collector.js';

const gzip = promisify(gzipCallback);
const NEWLINE = '\n';
const UTF8 = 'utf8';
const GZIP_SUFFIX = '.log.gz';
const DEFAULT_REATTACH_DELAY_MS = 1000;
// If a node's last captured line predates teardown by more than this, the
// capture is treated as suspect (the streaming reader was not draining — e.g. the
// daemon json-file stall that silently truncated a busy node). Nodes log far more
// frequently than this in the convergence scenarios, so a gap this large is a
// reliable "incomplete capture" signal rather than a quiet node.
const STALE_CAPTURE_GAP_MS = 60000;

// Run-scoped subtree of the output dir holding the uncurated per-node logs,
// kept distinct from the curated {scenario}/{nodeId}.log the LogCollector writes.
const FULL_LOGS_DIRNAME = '.full-logs';

// File-based logging (non-perturbing observability): the node writes pino output
// to a bind-mounted FILE instead of stdout, avoiding the stdout-pipe-backpressure
// that can stall a busy node under heavy debug volume. The harness sets
// NODE_LOG_FILE_ENV_VAR to the in-container path and bind-mounts NODE_LOG_DIR_HOST
// → NODE_LOG_DIR_CONTAINER so the file lands directly on the host.
const NODE_LOG_FILE_ENV_VAR = 'LAGRANGE_LOG_FILE';
const NODE_LOG_DIR_CONTAINER = '/harness-logs';
const NODE_LOG_FILENAME = 'node.ndjson';

// Host dir bind-mounted into a node for file-based logging, and the in-container
// path the node writes to.
function nodeLogHostDir(outputDir, scenarioName, nodeId) {
  return join(outputDir, FULL_LOGS_DIRNAME, scenarioName, nodeId);
}
function nodeLogHostFile(outputDir, scenarioName, nodeId) {
  return join(nodeLogHostDir(outputDir, scenarioName, nodeId), NODE_LOG_FILENAME);
}
function nodeLogContainerFilePath() {
  return NODE_LOG_DIR_CONTAINER + '/' + NODE_LOG_FILENAME;
}

function fullLogDestPath(outputDir, scenarioName, nodeId) {
  return join(outputDir, FULL_LOGS_DIRNAME, scenarioName, nodeId + GZIP_SUFFIX);
}

// Recover the node's boot source-fingerprint self-check from its captured log.
// The entrypoint's STARTING line is the only one carrying srcFingerprintMatches,
// so we match on that field rather than on pino's message formatting. The LAST
// such line wins — it reflects the process actually running at teardown. Returns
// null when the node never logged a boot line (e.g. it was killed before
// startup, or its stdout was lost), which is inconclusive, NOT a stale signal.
function findBootSourceProvenance(lines) {
  let provenance = null;
  for (const line of lines) {
    let parsed = null;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      Object.prototype.hasOwnProperty.call(parsed, 'srcFingerprintMatches')
    ) {
      provenance = {
        srcFingerprintMatches: parsed.srcFingerprintMatches,
        bootedSrcFingerprint: parsed.bootedSrcFingerprint ?? null,
        expectedSrcFingerprint: parsed.expectedSrcFingerprint ?? null,
      };
    }
  }
  return provenance;
}

/**
 * Capture one node's full decoded stdout/stderr and gzip it to destPath.
 * Takes a readLogs function rather than a concrete node handle so both the
 * teardown path (node.getLogs) and the signal/exception cleanup path
 * (provider.getContainerLogs by id) can reuse it.
 * @param {Object} params
 * @param {(options: Object) => Promise<Buffer|string>} params.readLogs
 *   Fetches the raw container log stream; called with {rawBuffer: true}.
 * @param {string} params.destPath Absolute path of the .log.gz to write.
 * @return {Promise<{destPath: string, lineCount: number, byteSize: number}>}
 */
async function captureFullNodeLog({readLogs, destPath}) {
  const raw = await readLogs({rawBuffer: true});
  const lines = extractContainerLogLines(raw);
  const text = lines.length > 0 ? lines.join(NEWLINE) + NEWLINE : '';
  const compressed = await gzip(Buffer.from(text, UTF8));
  await mkdir(dirname(destPath), {recursive: true});
  await writeFile(destPath, compressed);
  return {
    destPath,
    lineCount: lines.length,
    byteSize: compressed.length,
    bootSourceProvenance: findBootSourceProvenance(lines),
  };
}

// Continuously stream a node's logs to a gzip file for the node's whole life.
// This is the PRIMARY capture: a live follower drains the container's stdout pipe
// throughout the run, which is what prevents the Docker json-file daemon stall
// that silently truncates busy nodes (a one-shot `docker logs` at teardown can
// only ever return what the daemon retained). On a container restart the follow
// stream ends; we re-attach with `since` set to the last line's Docker timestamp,
// so capture continues across restarts with at most negligible boundary overlap.
// Each line's leading Docker timestamp is stripped before writing, so the file
// stays clean app log (e.g. pino JSON per line); the timestamp is retained only
// as the `since` cursor and the last-activity signal for the completeness check.
//
// nowMs is injectable for tests. Date.now is fine here (harness host, not a
// workflow script).
function createNodeLogStreamer({
  provider,
  containerId,
  destPath,
  reattachDelayMs = DEFAULT_REATTACH_DELAY_MS,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  nowMs = () => Date.now(),
}) {
  const gzipStream = createGzip();
  let fileOut = null;
  let lineCount = 0;
  let lastLineWallMs = 0;
  let lastDockerTs = '';
  let stopped = false;
  let gzipEnded = false;
  let currentHandle = null;
  let reattachTimer = null;
  // After a re-attach, Docker's `since` filter is INCLUSIVE (and historically
  // second-granular), so it re-delivers lines we already captured. Drop any line
  // whose timestamp is <= the cursor until the first genuinely-new line, which
  // dedups the restart boundary without losing post-restart output.
  let dedupUntilTs = null;

  // gzip 'error' (e.g. a stray write racing teardown) must never crash the run.
  gzipStream.on('error', () => {});

  const ready = (async () => {
    await mkdir(dirname(destPath), {recursive: true});
    fileOut = createWriteStream(destPath);
    fileOut.on('error', () => {});
    gzipStream.pipe(fileOut);
  })();

  const onLine = (rfc3339, payload) => {
    // Never write after the gzip stream has been ended at stop() — an in-flight
    // demux 'data' event could otherwise trigger ERR_STREAM_WRITE_AFTER_END.
    if (gzipEnded) {
      return;
    }
    if (dedupUntilTs !== null && rfc3339) {
      if (rfc3339 <= dedupUntilTs) {
        return;
      }
      dedupUntilTs = null;
    }
    if (rfc3339) {
      lastDockerTs = rfc3339;
    }
    lineCount += 1;
    lastLineWallMs = nowMs();
    // Backpressure is intentionally not propagated to the source socket here: the
    // convergence scenarios emit modest volume (hundreds of small JSON lines/sec)
    // that gzip+disk absorb easily, so the gzip internal queue stays bounded. If a
    // far higher-volume scenario is ever captured, honor write()'s return value by
    // pausing the demux source until 'drain'.
    gzipStream.write(payload + NEWLINE);
  };

  const scheduleReattach = () => {
    if (stopped) {
      return;
    }
    reattachTimer = setTimeoutFn(attach, reattachDelayMs);
    // Don't let a pending re-attach keep the process alive if teardown is skipped
    // on an error path (real timers only; injected test timers return numbers).
    if (reattachTimer && typeof reattachTimer.unref === 'function') {
      reattachTimer.unref();
    }
  };

  function attach() {
    if (stopped) {
      return;
    }
    // Resume from the last captured timestamp and dedup the inclusive boundary.
    dedupUntilTs = lastDockerTs || null;
    currentHandle = provider.followContainerLogStream(containerId, {
      since: lastDockerTs || undefined,
      onLine,
      onEnd: scheduleReattach,
      onError: scheduleReattach,
    });
  }

  ready.then(() => {
    if (!stopped) {
      attach();
    }
  });

  return {
    async stop() {
      stopped = true;
      if (reattachTimer) {
        clearTimeoutFn(reattachTimer);
      }
      if (currentHandle) {
        currentHandle.stop();
      }
      await ready;
      // Mark ended BEFORE end() so any straggler onLine drops its write instead
      // of throwing; we accept losing at most a final in-flight line over a crash.
      gzipEnded = true;
      gzipStream.end();
      if (fileOut) {
        await once(fileOut, 'finish');
      }
      return {lineCount, lastLineWallMs, lastDockerTs};
    },
    getStatus() {
      return {lineCount, lastLineWallMs, lastDockerTs};
    },
  };
}

// Decide whether a streamed capture looks complete: it is suspect if the node
// went quiet well before teardown (the streaming reader stopped draining). Pure
// function for testability.
function assessCaptureCompleteness({
  lastLineWallMs,
  teardownWallMs,
  lineCount,
  gapThresholdMs = STALE_CAPTURE_GAP_MS,
}) {
  if (!lineCount || lineCount <= 0) {
    return {complete: false, reason: 'no-lines-captured'};
  }
  const gapMs = teardownWallMs - lastLineWallMs;
  if (gapMs > gapThresholdMs) {
    return {complete: false, reason: 'stale-tail', gapMs};
  }
  return {complete: true, gapMs};
}

// Finalize a file-based capture: the node wrote pino NDJSON directly to a
// bind-mounted host file, so there is nothing to stream — we gzip it to the
// standard dest, and assess completeness against the APP's own timestamps (the
// `time` field), which fixes the streaming check's blind spot (it could only see
// Docker-receipt time, which lags when stdout backs up). Returns the same shape
// as the streaming finalize plus boot provenance.
async function finalizeFileBasedCapture({
  hostFilePath,
  destGzPath,
  teardownWallMs,
  gapThresholdMs = STALE_CAPTURE_GAP_MS,
  parseTimeMs = (s) => Date.parse(s),
}) {
  let lineCount = 0;
  let lastAppTimeMs = 0;
  let provenance = null;
  await mkdir(dirname(destGzPath), {recursive: true});
  const out = createWriteStream(destGzPath);
  const gz = createGzip();
  gz.pipe(out);
  const source = createReadStream(hostFilePath);
  source.on('error', () => {});
  const rl = createInterface({input: source, crlfDelay: Infinity});
  try {
    for await (const line of rl) {
      gz.write(line + NEWLINE);
      lineCount += 1;
      let parsed = null;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.time === 'string') {
          const t = parseTimeMs(parsed.time);
          if (Number.isFinite(t)) {
            lastAppTimeMs = t;
          }
        }
        if (Object.prototype.hasOwnProperty.call(parsed, 'srcFingerprintMatches')) {
          provenance = {
            srcFingerprintMatches: parsed.srcFingerprintMatches,
            bootedSrcFingerprint: parsed.bootedSrcFingerprint ?? null,
            expectedSrcFingerprint: parsed.expectedSrcFingerprint ?? null,
          };
        }
      }
    }
  } catch {
    // Missing/partial host file — fall through to the completeness verdict.
  } finally {
    rl.close();
    source.destroy();
  }
  gz.end();
  await once(out, 'finish');
  const completeness = assessCaptureCompleteness({
    lastLineWallMs: lastAppTimeMs,
    teardownWallMs,
    lineCount,
    gapThresholdMs,
  });
  return {lineCount, completeness, bootSourceProvenance: provenance};
}

export {
  captureFullNodeLog,
  createNodeLogStreamer,
  assessCaptureCompleteness,
  finalizeFileBasedCapture,
  findBootSourceProvenance,
  fullLogDestPath,
  nodeLogHostDir,
  nodeLogHostFile,
  nodeLogContainerFilePath,
  NODE_LOG_FILE_ENV_VAR,
  NODE_LOG_DIR_CONTAINER,
  FULL_LOGS_DIRNAME,
  STALE_CAPTURE_GAP_MS,
};
