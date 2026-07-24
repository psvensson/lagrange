// Precondition/engagement witness advisory for `step --commit`.
//
// Steering (solver-quests.md "Evidence And Change References") requires that a
// source-changing attempt whose proof depends on a live/distributed
// precondition carry a precondition/engagement witness BEFORE commit: an
// engagement analysis, a red-on-revert directed test through the real seam, or
// a live trace proving the changed code is reached. Two wrong legs on this
// repo (fba0b477/96a0917f, a9344058/066bf78d) shipped on green DTs whose
// precondition never occurs live and were committed, then reverted.
//
// The mechanical scope proxy mirrors the steering exemption ("pure refactors
// and building-block DTs without a live-precondition theory are exempt"): the
// advisory fires only when the attempt BOTH changes src/ AND commits under an
// effective theory — a causal claim about live behavior. It is satisfied by
// any witness-kind finding recorded since the previous attempt on the same
// frontier. Advisory only: it never blocks the commit, matching the graded
// soft-first guard policy.

import {EVENT_ATTEMPT, EVENT_FINDING} from './constants.js';

// Finding kinds that constitute an engagement/precondition witness. Grounded
// in the corpus: deterministic-engagement (red-on-green through the real
// seam), live-validation / live-evidence / live-measurement (live run proof),
// repro-on-head (sealed symptom reproduced on current HEAD).
export const ENGAGEMENT_WITNESS_FINDING_KINDS = Object.freeze([
  'deterministic-engagement',
  'live-validation',
  'live-evidence',
  'live-measurement',
  'repro-on-head',
]);

const SOURCE_PATH_PREFIX = 'src/';

export function engagementWitnessAdvisory({log, frontierId, changedPaths, theoryRef}) {
  if (!theoryRef) return null;
  const sourceChanging = (changedPaths || []).some(
    (changedPath) => changedPath.startsWith(SOURCE_PATH_PREFIX));
  if (!sourceChanging) return null;
  let windowStart = 0;
  for (let index = 0; index < log.length; index += 1) {
    const event = log[index];
    if (event.type === EVENT_ATTEMPT && event.frontier === frontierId) {
      windowStart = index + 1;
    }
  }
  const witness = log.slice(windowStart).find((event) =>
    event.type === EVENT_FINDING &&
    ENGAGEMENT_WITNESS_FINDING_KINDS.includes(event.kind) &&
    (!event.frontier || event.frontier === frontierId));
  if (witness) {
    return {
      satisfied: true,
      kind: witness.kind,
      evidence: witness.evidence || null,
    };
  }
  return {
    satisfied: false,
    message:
      'engagement-witness advisory: this source-changing attempt commits ' +
      `under theory ${theoryRef} but no precondition/engagement witness ` +
      'finding was recorded since the previous attempt ' +
      `(kinds: ${ENGAGEMENT_WITNESS_FINDING_KINDS.join(', ')}). ` +
      'A green DT on an injected seam is not sufficient on its own — record ' +
      'a witness proving the live path reaches the changed code before ' +
      'checkpointing, or record why this attempt is exempt (pure refactor / ' +
      'building-block DT).',
  };
}
