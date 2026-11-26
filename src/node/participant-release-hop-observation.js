// Invocation-local observations. No transport result is interpreted as release authority.
import {releaseDiagnosticText} from './participant-release-diagnostic-observation.js';
import {PARTICIPANT_CUTOVER_BOUND, PARTICIPANT_RELEASE_ACTION as ACTION} from
  '../partition/partition-participant-transaction-cutover-constants.js';

const traces = new WeakMap();

export function bindReleaseTrace(key, trace) {
  if (trace) traces.set(key, trace);
}

export function releaseTrace(key) {
  return traces.get(key);
}

export function recordReleaseHop(trace, phase, hop) {
  if (!trace) return;
  const group = trace.hops[phase] ??= {count: 0, slowest: null, last: null};
  group.count++;
  if (!group.slowest || hop.elapsedMs > group.slowest.elapsedMs) group.slowest = hop;
  group.last = hop;
}

export async function observeReleaseReceiver(handler, envelope, request, execute) {
  const action = request.action;
  if (![ACTION.RELEASE, ACTION.INSPECT, ACTION.RESUME].includes(action)) return execute();
  const start = performance.now();
  const trace = {messageId: envelope.messageId ?? null, hops: {}};
  if (action === ACTION.RELEASE) bindReleaseTrace(request, trace);
  let answer;
  try {
    answer = await execute();
    return answer;
  } finally {
    const elapsedMs = performance.now() - start;
    if (elapsedMs >= PARTICIPANT_CUTOVER_BOUND.REQUEST_TIMEOUT_MS) {
      handler.logger?.info?.('Slow participant release response', {
        partitionId: request.partitionId, sourceNodeId: envelope.sourceNodeId,
        operationId: releaseDiagnosticText(request.createAdmissionIdentity, 'operationId'),
        attemptToken: releaseDiagnosticText(request.createAdmissionIdentity, 'attemptToken'),
        action, elapsedMs, outcome: releaseDiagnosticText(answer, 'outcome'), ...trace,
      });
    }
  }
}
