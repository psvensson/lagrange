// Leaf module: derive an architecture invariant's standing status as a FOLD over
// the Solver event log. Kept dependency-light (store.js only) so a probe can import
// it without a cycle through invariant-liveness.js / probe.js.

import {readLog} from './store.js';

export const STATUS = Object.freeze({
  UNGUARDED: 'UNGUARDED',
  HELD: 'HELD',
  BREACHED: 'BREACHED',
});
export const EVAL_EVENT = 'invariant.evaluated';

// The event-log stream id for an invariant. Reuses the Solver store; the
// `invariant-` prefix namespaces these streams away from quest streams.
export function invariantStreamId(invariantId) {
  return `invariant-${invariantId}`;
}

// Status is the latest evaluation verdict folded from the log; none => UNGUARDED.
// It is never stored on the registry entry — the fold is the single source.
export function deriveStatus(root, invariant) {
  const log = readLog(root, invariantStreamId(invariant.id));
  const evaluations = log.filter((event) => event && event.type === EVAL_EVENT);
  if (evaluations.length === 0) {
    return {
      id: invariant.id, status: STATUS.UNGUARDED, at: null, verdict: null,
      evidenceRef: null, evaluations: 0,
    };
  }
  const last = evaluations[evaluations.length - 1];
  return {
    id: invariant.id,
    status: last.verdict === 'pass' ? STATUS.HELD : STATUS.BREACHED,
    at: last.ts || null,
    verdict: last.verdict,
    evidenceRef: last.evidenceRef || null,
    evaluations: evaluations.length,
  };
}
