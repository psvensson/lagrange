// Closure provenance — how strong is a SOLVED verdict?
//
// A quest can close two ways and a reader must be able to tell them apart:
//   MEASURED  the done_when predicate read a real artifact probe (e.g.
//             scenario-harness over distributed harness reports) — convergence
//             was observed against external evidence.
//   DECISION  the done_when predicate read a hand-authored oracle file — the
//             closure is a recorded decision/process judgement, not a measurement.
//
// Neither is forbidden; oracle-backed process quests are legitimate. But conflating
// them hides closure strength, so this is surfaced in reports and audited: a
// product-class quest that closes on a DECISION is a closure-strength mismatch.

import {
  CLOSURE_MEASURED,
  CLOSURE_DECISION,
  DECISION_PROBES,
  EVENT_QUEST_DECLARED,
  QUEST_CLASS_PRODUCT,
  QUEST_CLASS_PROCESS,
  QUEST_CLASSES,
} from './constants.js';

export function questClass(quest) {
  return quest && quest.class === QUEST_CLASS_PROCESS ?
    QUEST_CLASS_PROCESS :
    QUEST_CLASS_PRODUCT;
}

export function isKnownQuestClass(value) {
  return QUEST_CLASSES.includes(value);
}

function sealedDoneWhen(quest, log) {
  const declared = Array.isArray(log) ?
    log.find((event) => event.type === EVENT_QUEST_DECLARED) :
    null;
  return declared?.sealed?.doneWhen || quest?.doneWhen || null;
}

// Closure kind is derived purely from the sealed done_when probe, so it can never
// be asserted independently of the predicate that actually closed the quest.
export function closureKind(quest, log = []) {
  const probe = sealedDoneWhen(quest, log)?.probe;
  return DECISION_PROBES.includes(probe) ? CLOSURE_DECISION : CLOSURE_MEASURED;
}

export function isDecisionClosure(quest, log = []) {
  return closureKind(quest, log) === CLOSURE_DECISION;
}
