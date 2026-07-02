/**
 * CL-030 step (a): unexpected-node-exit sweep.
 *
 * Invariant (closure-ledger/CL-030.md, first violated invariant): any cluster
 * node exiting unexpectedly mid-scenario must fail the scenario AT THAT NODE
 * with its exit evidence (the docker stdout carries the crash dump), not as
 * a downstream readiness timeout on a different node — the 145024Z-run2
 * seed OOM was misattributed to the restartee for exactly this gap.
 *
 * Design (ledger note): a failure-time container-state sweep beats a
 * steady-state watcher loop for blast radius — the sweep runs once when a
 * scenario fails, while containers are still alive, and reattributes the
 * failure if a non-expected-down node's container has exited.
 */

import {extractContainerLogLines} from './log-collector.js';

const UNEXPECTED_NODE_EXIT_CLASSIFICATION = 'unexpected_node_exit';
const EXIT_EVIDENCE_TAIL_LINES = 80;
const EXIT_EVIDENCE_TAIL_MAX_CHARS = 8192;
const EXIT_SWEEP_PER_NODE_TIMEOUT_MS = 5000;
const CONTAINER_STATUS_EXITED = 'exited';
const CONTAINER_STATUS_DEAD = 'dead';
const ZERO = 0;

// Native crash markers worth surfacing verbatim (heap OOM is the CL-030
// secondary; the other patterns cover abort/segfault-shaped exits).
const FATAL_LINE_PATTERN =
  /FATAL ERROR|Reached heap limit|JavaScript heap out of memory|Segmentation fault|Aborted \(core dumped\)/;

function isExitedContainerStatus(status) {
  return status === CONTAINER_STATUS_EXITED ||
    status === CONTAINER_STATUS_DEAD;
}

// docker logs returns a MULTIPLEXED stream whose 8-byte frame headers
// survive a plain toString() (observed verbatim in gate 212016Z-run3:
// '\x02\x00...RFATAL ERROR: ...'). extractContainerLogLines demuxes the
// frames (with raw fallback for non-framed strings); the control-byte strip
// covers the fallback path.
// eslint-disable-next-line no-control-regex
const CONTROL_BYTES_PATTERN = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

function decodeExitEvidenceLines(logTail) {
  if (typeof logTail !== 'string' || logTail.length === ZERO) {
    return [];
  }
  return extractContainerLogLines(logTail)
    .map((line) => line.replace(CONTROL_BYTES_PATTERN, ''));
}

function extractFatalLines(logTail) {
  return decodeExitEvidenceLines(logTail)
    .filter((line) => FATAL_LINE_PATTERN.test(line))
    .map((line) => line.trim());
}

function boundExitEvidenceTail(logTail) {
  if (typeof logTail !== 'string') {
    return null;
  }
  const decoded = decodeExitEvidenceLines(logTail).join('\n');
  return decoded.length > EXIT_EVIDENCE_TAIL_MAX_CHARS ?
    decoded.slice(decoded.length - EXIT_EVIDENCE_TAIL_MAX_CHARS) :
    decoded;
}

function withSweepTimeout(promise, timeoutMs, label) {
  let timeoutId = null;
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(label + ' timed out after ' + timeoutMs + 'ms')),
        timeoutMs,
      );
      if (typeof timeoutId.unref === 'function') {
        timeoutId.unref();
      }
    }),
  ]).finally(() => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  });
}

/**
 * Sweep every node's container state; report nodes whose container has
 * EXITED without being expected down (killed/stopped/paused/mid-restart by
 * the scenario). Best-effort: per-node failures are recorded as
 * inspect errors, never thrown — the sweep must not mask the original
 * scenario failure.
 *
 * @param {Iterable<Object>} nodes - NodeHandle instances (entries lacking
 *   inspectContainerState — e.g. unit-test stubs — are skipped).
 * @param {(nodeId: string) => boolean} isNodeExpectedDown
 * @returns {Promise<Array<Object>>} unexpected-exit entries
 */
async function sweepUnexpectedNodeExits(nodes, isNodeExpectedDown) {
  const exits = [];
  for (const node of nodes) {
    if (!node || typeof node.inspectContainerState !== 'function') {
      continue;
    }
    if (isNodeExpectedDown(String(node.id))) {
      continue;
    }
    let state;
    try {
      state = await withSweepTimeout(
        node.inspectContainerState(),
        EXIT_SWEEP_PER_NODE_TIMEOUT_MS,
        'Container inspect for node ' + node.id,
      );
    } catch (_error) {
      continue;
    }
    if (!state || state.error || !isExitedContainerStatus(state.status)) {
      continue;
    }
    let stdoutTail = null;
    try {
      stdoutTail = boundExitEvidenceTail(await withSweepTimeout(
        node.getLogs({tail: EXIT_EVIDENCE_TAIL_LINES}),
        EXIT_SWEEP_PER_NODE_TIMEOUT_MS,
        'Exit-evidence log tail for node ' + node.id,
      ));
    } catch (_logError) {
      // Exit evidence is best-effort; the exit fact itself stands.
    }
    exits.push({
      nodeId: String(node.id),
      role: node.role || null,
      containerStatus: state.status,
      exitCode: state.exitCode,
      oomKilled: state.oomKilled === true,
      finishedAt: state.finishedAt || null,
      fatalLines: extractFatalLines(stdoutTail),
      stdoutTail,
    });
  }
  return exits;
}

/**
 * Reattribute a scenario failure to the unexpected exit(s): the exit leads
 * the message with its evidence; the original surface is kept as the
 * (possibly downstream) tail.
 */
function buildUnexpectedNodeExitFailure(exits, originalMessage) {
  const summaries = exits.map((exit) => {
    const fatal = exit.fatalLines.length > ZERO ?
      ' fatal: ' + exit.fatalLines[ZERO] :
      ' (no fatal marker in stdout tail)';
    return exit.nodeId +
      ' (' + String(exit.role || 'unknown-role') +
      ', status=' + exit.containerStatus +
      ', exitCode=' + String(exit.exitCode) +
      ', oomKilled=' + String(exit.oomKilled) +
      ', finishedAt=' + String(exit.finishedAt) + ')' +
      fatal;
  });
  return {
    classification: UNEXPECTED_NODE_EXIT_CLASSIFICATION,
    message:
      'Unexpected node exit (classification=' +
      UNEXPECTED_NODE_EXIT_CLASSIFICATION +
      '): ' +
      summaries.join('; ') +
      '. The scenario failure below is possibly downstream of this death ' +
      '(CL-030). Downstream surface: ' +
      String(originalMessage),
  };
}

export {
  UNEXPECTED_NODE_EXIT_CLASSIFICATION,
  buildUnexpectedNodeExitFailure,
  extractFatalLines,
  sweepUnexpectedNodeExits,
};
