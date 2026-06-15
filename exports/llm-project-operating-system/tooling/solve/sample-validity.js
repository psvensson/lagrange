// Shared definition of "was this attempt a non-measuring (invalid) sample?".
//
// Several honesty-sensitive callers need the same answer: the park classifier (is a
// park genuine exhaustion or a measurement failure?), the reopen gate (was the park
// driven by untrustworthy samples?), and the reopen bound (has anything changed since
// the last reopen?). Keeping the definition here means they can never drift apart.
//
// The rule mirrors the scenario-harness probe (Concern 1): a post-fix attempt carries
// `invalidSample` directly; a pre-fix attempt is re-classified by reading its recorded
// evidence report through the shared harness classifier, so historical attempts are
// judged by today's honest definition rather than the heuristic that produced them.

import path from 'node:path';

import {reportSampleIsNonMeasuring} from './probes/scenario-harness.js';

// Map a frontier definition to the scenario-harness args needed to re-classify its
// evidence reports. Non-harness metrics return null: we only know how to re-derive
// validity for scenario-harness samples, so other probes are left to their recorded
// `invalidSample` flag alone.
export function harnessArgs(frontierDef) {
  const metric = frontierDef && frontierDef.metric;
  if (!metric || metric.probe !== 'scenario-harness') return null;
  return metric.args || {};
}

// True when one recorded attempt was a non-measuring (invalid) sample.
export function attemptIsNonMeasuring(root, attempt, frontierDef) {
  if (!attempt) return false;
  if (attempt.invalidSample === true) return true;
  const args = harnessArgs(frontierDef);
  if (!args || !attempt.evidence) return false;
  return reportSampleIsNonMeasuring(path.join(root, attempt.evidence), args);
}

// True when the frontier has at least one trustworthy (measuring) attempt on record.
// A frontier that never produced a single valid sample cannot honestly be called
// "exhausted" — the harness simply never measured it.
export function frontierHasValidSample(root, attempts, frontierDef) {
  return attempts.some((attempt) => !attemptIsNonMeasuring(root, attempt, frontierDef));
}
