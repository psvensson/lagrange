// A real run captures every node's full output under
// {outputDir}/.full-logs/{scenario}/{nodeId}.log.gz (full-node-log-capture.js),
// the capture owner judges each capture at teardown
// (assessCaptureCompleteness), and the runner carries that verdict into the
// report entry (captureCompletenessByNodeId). The failure bundle measures its
// log-window coverage against the capture and consumes the verdict.
//
// A fixture that models a run whose evidence is complete writes a non-empty,
// stamped capture spanning the run (a boot line before any divergence, the
// node's curated sample when the fixture has one, a teardown line after the
// failure) AND records the owner's complete verdict on the entry. A fixture
// that omits either models missing or unjudged evidence, which makes the
// bundle non-measuring; pass captureCompleteness to model another owner
// verdict (an incomplete one, or one judged to another quiet bound).
import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import {basename, dirname, join, resolve} from 'node:path';
import {gzipSync} from 'node:zlib';
import {
  assessCaptureCompleteness,
  fullLogDestPath,
} from '../full-node-log-capture.js';
import {resolveCaptureQuietBound} from '../capture-quiet-bound.js';
import {writeFailureBundlesForReport} from '../failure-bundle.js';
import {
  isRecord,
  sanitizePathSegment,
} from '../failure-bundle-artifact-foundation.js';
import {PLAYBACK_EVENT_TYPE, OUTPUT} from '../constants.js';
import {SCENARIO_OUTCOME, scenarioOutcomeOf} from '../scenario-outcome.js';

const UTF8 = 'utf8';
const stringSplit = Function.call.bind(String.prototype.split);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const BOOT_TIME = new Date(0).toISOString();

// The owner's verdict for a capture that drained to teardown, from the owner.
const FIXTURE_TEARDOWN_MS = Date.parse('2026-11-06T19:00:00.000Z');
export const COMPLETE_CAPTURE = Object.freeze(assessCaptureCompleteness({
  lastLineWallMs: FIXTURE_TEARDOWN_MS,
  lineCount: 1,
  quietBound: resolveCaptureQuietBound({teardownWallMs: FIXTURE_TEARDOWN_MS}),
}));

function pinoLine(time, message) {
  return JSON.stringify({level: 30, time, msg: message});
}

async function readCuratedSample(scenarioDir, nodeId) {
  try {
    return await readFile(join(scenarioDir, `${nodeId}.log`), UTF8);
  } catch (_error) {
    // A fixture without a curated sample for this node: the capture holds
    // only the node's boot and teardown lines.
    return '';
  }
}

// Boot (before any divergence), the curated sample (drawn from the full
// output), teardown (after the failure, stamped when the capture is written).
async function spanningCapture(scenarioDir, nodeId) {
  const curated = await readCuratedSample(scenarioDir, nodeId);
  return [
    pinoLine(BOOT_TIME, `${nodeId} boot`),
    ...arrayFilter(stringSplit(curated, '\n'), (line) => line.length > 0),
    pinoLine(new Date().toISOString(), `${nodeId} teardown`),
  ].join('\n') + '\n';
}

/**
 * Write the full-log capture of each node of a fixture run and record the
 * capture owner's verdict for it on the scenario entry.
 * @param {string} scenarioDir {outputDir}/{scenario}.
 * @param {Object} entry The scenario report entry the bundle is written for.
 * @param {Array<string>} nodeIds
 * @param {{content?: string, captureCompleteness?: Object}} [options]
 *   content defaults to a capture spanning the run; captureCompleteness to
 *   the owner's complete verdict.
 * @return {Promise<void>}
 */
export async function writeRunFullNodeLogs(scenarioDir, entry, nodeIds, {
  content = null,
  captureCompleteness = COMPLETE_CAPTURE,
} = {}) {
  entry.captureCompletenessByNodeId = {...entry.captureCompletenessByNodeId};
  for (const nodeId of nodeIds) {
    const gzPath = fullLogDestPath(
      dirname(scenarioDir), basename(scenarioDir), nodeId);
    await mkdir(dirname(gzPath), {recursive: true});
    const capture = content ?? await spanningCapture(scenarioDir, nodeId);
    await writeFile(gzPath, gzipSync(Buffer.from(capture, UTF8)));
    entry.captureCompletenessByNodeId[nodeId] = {...captureCompleteness};
  }
}

// The node a fixture run without its own event stream created.
export const FIXTURE_RUN_NODE_ID = 'node-1';

async function hasEventStream(scenarioDir) {
  try {
    await access(join(scenarioDir, OUTPUT.PLAYBACK_EVENTS_FILENAME));
    return true;
  } catch (_error) {
    // No event stream: the fixture models none of the run's own facts.
    return false;
  }
}

/**
 * writeFailureBundlesForReport for fixtures whose subject is classification,
 * not log coverage: each failing scenario without its own event stream is
 * first given the evidence of a run whose node-log capture is complete (an
 * event stream that created FIXTURE_RUN_NODE_ID, its spanning capture and the
 * owner's complete verdict). Without it the bundle names no node log and is,
 * correctly, non-measuring (LOG_WINDOW_COVERAGE.NO_NODES_NAMED).
 * @param {Object} params As writeFailureBundlesForReport.
 * @return {Promise<Object>}
 */
export async function writeFailureBundlesForCompleteRun(params) {
  const outputDir = resolve(String(params.outputDir || '.'));
  for (const entry of Array.isArray(params.scenarios) ? params.scenarios : []) {
    if (!entry || entry.passed === true ||
        scenarioOutcomeOf(entry) === SCENARIO_OUTCOME.REFUSED) {
      continue;
    }
    const scenarioDir = join(outputDir,
      sanitizePathSegment(entry.scenario, 'scenario'));
    // A fixture that wrote its own event stream or capture models its run.
    if (isRecord(entry.captureCompletenessByNodeId) ||
        await hasEventStream(scenarioDir)) {
      continue;
    }
    await mkdir(scenarioDir, {recursive: true});
    await writeFile(join(scenarioDir, OUTPUT.PLAYBACK_EVENTS_FILENAME),
      JSON.stringify({type: PLAYBACK_EVENT_TYPE.NODE_CREATED,
        entityId: FIXTURE_RUN_NODE_ID, timestamp: 0, details: {}}) + '\n');
    await writeRunFullNodeLogs(scenarioDir, entry, [FIXTURE_RUN_NODE_ID]);
  }
  return writeFailureBundlesForReport(params);
}
