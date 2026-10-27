// Keep fault writes on the isolated node's own admin ingress. An observation
// timeout does not cancel server work or prove that the intent was refused.
import {ADMIN_OWNER_OPERATION_ERROR_CODE, ADMIN_OWNER_OPERATION_PATH} from
  '../../../src/admin/admin-owner-operations.js';
import {LOG_MARKER_ERROR_CODE, LOG_MARKER_STATE, diagnosticMarkerLogId} from
  '../../../src/control-plane/owners/log-diagnostic-marker-contract.js';
import {TIMEOUTS} from '../harness/constants.js';

const LOCAL_MARKER_URL = 'http://localhost:8081' + ADMIN_OWNER_OPERATION_PATH.logMarker;
const RESULT_TYPE = 'diagnostic_marker_result';
const MARKER_WRITE_STATUS = Object.freeze({ACKED: 'acked', REFUSED: 'refused', UNKNOWN: 'unknown'});
const PRE_MUTATION_REFUSALS = new Set([
  ADMIN_OWNER_OPERATION_ERROR_CODE.OWNER_NOT_READY,
  LOG_MARKER_ERROR_CODE.REQUEST_INVALID,
]);

function markerStatus(answer) {
  if (answer?.success === true && answer.markerState === LOG_MARKER_STATE.RECORDED) {
    return MARKER_WRITE_STATUS.ACKED;
  }
  // Only these explicit pre-owner/pre-mutation answers prove this attempt
  // was not admitted. General owner failure and 503 do not carry that proof.
  if (answer?.success === false && PRE_MUTATION_REFUSALS.has(answer.errorCode)) {
    return MARKER_WRITE_STATUS.REFUSED;
  }
  return MARKER_WRITE_STATUS.UNKNOWN;
}

function parseLocalMarkerResponse(stdout) {
  for (const line of String(stdout || '').split(/\r?\n/).reverse()) {
    try {
      const parsed = JSON.parse(line);
      if (parsed?.type === RESULT_TYPE) return parsed.answer;
    } catch {/* Retain container startup noise outside the result. */}
  }
  throw new Error('No diagnostic marker result from isolated admin ingress');
}

async function requestLocalMarker(node, marker) {
  if (!node._dockerProvider) return node.appendDiagnosticMarker(marker);
  // The scenario owns the overall bounded observation. The former 5 s SQL
  // client timeout was shorter than the owner's 30 s retry loop; it cannot
  // terminate an in-flight native attempt. This cap uses the existing
  // scenario bound and never alters a production deadline.
  const code = `
    const response = await fetch(${JSON.stringify(LOCAL_MARKER_URL)}, {
      method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify(${JSON.stringify(marker)}),
      signal: AbortSignal.timeout(${TIMEOUTS.SCENARIO_DEFAULT})
    });
    const answer = {...await response.json(), status: response.status};
    console.log(JSON.stringify({type: ${JSON.stringify(RESULT_TYPE)}, answer}));
    process.exit(0);
  `;
  const result = await node._dockerProvider.execInContainer(node.containerId,
    ['node', '--input-type=module', '-e', code]);
  if (result.exitCode !== 0) {
    throw new Error('Isolated marker observation failed: ' + (result.stderr || result.stdout));
  }
  return parseLocalMarkerResponse(result.stdout);
}

async function attemptDiagnosticMarker(node, markerId) {
  const marker = Object.freeze({markerId, message: 'split-brain-' + markerId});
  const startedAtMs = Date.now();
  try {
    const answer = await requestLocalMarker(node, marker);
    return Object.freeze({status: markerStatus(answer), logId: diagnosticMarkerLogId(markerId),
      nodeId: String(node.id), marker, startedAtMs, completedAtMs: Date.now(), answer});
  } catch (error) {
    return Object.freeze({status: MARKER_WRITE_STATUS.UNKNOWN,
      logId: diagnosticMarkerLogId(markerId),
      nodeId: String(node.id), marker, startedAtMs, completedAtMs: Date.now(),
      error: error.message, errorCode: error.code ?? null});
  }
}

export {attemptDiagnosticMarker, MARKER_WRITE_STATUS};
