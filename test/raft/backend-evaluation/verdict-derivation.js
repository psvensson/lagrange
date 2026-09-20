// The verdict derivation, as a PURE function over named boolean inputs.
//
// Round 1 of this evaluation computed the verdicts inline in the document
// generator, so the receipt that checked them could only check their shape:
// the verifier set every input to false in a copy of the JSON, left
// `value: viable` alone, and the derivation test stayed green. Separating the
// rule from the measurement is what makes falsification possible - the test
// can now feed this function each input false in turn and see the value move.
//
// Severity is not invented here. It is read off the owner's own acceptance
// sentence and the verdict-derivation item of the decision record:
//
//   "Can raft-rs/WASM make Raft membership a replicated fact which remains
//    correct despite divergent Lagrange metadata caches, crash/restart and
//    concurrent configuration-change attempts, at an acceptable Multi-Raft
//    cost?"
//   (owner-decision-raft-backend-evaluation-2026-09-20.md, first addendum)
//
// The four things that sentence names are DECISIVE: if one of them is false
// the core does not answer the question, and the verdict is `not-viable`.
// The two replacement styles are explicitly NOT decisive - "The evaluation
// says what each costs and what semantics it provides; it does not decide
// which Lagrange uses" (item 6) - so a failure there is a named gap.

const VERDICT = Object.freeze({
  VIABLE: 'viable',
  WITH_GAPS: 'viable-with-named-gaps',
  NOT_VIABLE: 'not-viable',
  UNDETERMINED: 'undetermined-needs-integration-stage',
});

const SEVERITY = Object.freeze({DECISIVE: 'decisive', NAMED_GAP: 'named-gap'});

// Each input, the severity of its failure, and the authority that fixes it.
const CONSENSUS_INPUTS = Object.freeze({
  replicatedMembership: {
    severity: SEVERITY.DECISIVE,
    because: 'the owner\'s question is whether membership is a REPLICATED ' +
      'fact; a group that does not agree on one configuration answers no',
  },
  learnerAndPromotion: {
    severity: SEVERITY.NAMED_GAP,
    because: 'the sequential style is one of two the evaluation reports; ' +
      'the owner does not ask this quest to choose between them (item 6)',
  },
  replacement: {
    severity: SEVERITY.NAMED_GAP,
    because: 'the joint style is the other; same reason',
  },
  pendingChangeSemantics: {
    severity: SEVERITY.DECISIVE,
    because: '"concurrent configuration-change attempts" is named in the ' +
      'acceptance sentence',
  },
  restartCorrectness: {
    severity: SEVERITY.DECISIVE,
    because: '"crash/restart" is named in the acceptance sentence, and the ' +
      'second addendum makes the restart matrix the acceptance surface',
  },
  convergenceIndependentOfCaches: {
    severity: SEVERITY.DECISIVE,
    because: '"despite divergent Lagrange metadata caches" is named in the ' +
      'acceptance sentence',
  },
  mutantsKilled: {
    severity: SEVERITY.DECISIVE,
    because: 'second addendum item 4: "the adapter must be unable to ' +
      'implement one by accident". A host ordering that passes silently ' +
      'means the restart evidence rests on an accident',
  },
});

// The WASM/backend boundary criteria, from item 12 of the decision record:
// "full RawNode lifecycle exposure; correct persistence/restore; ConfState
// restore; correct u64 identity; acceptable handle hosting; no missing
// primitive forcing consensus semantics back into JavaScript."
const WASM_INPUTS = Object.freeze({
  readyLifecycleExposed: {severity: SEVERITY.DECISIVE,
    because: 'item 12 names the RawNode lifecycle first. Named for what was ' +
      'actually driven: the Ready/persistence lifecycle. Snapshot and ' +
      'compaction are NOT exposed by the binding and are a named gap.'},
  correctPersistenceAndRestore: {severity: SEVERITY.DECISIVE,
    because: 'item 12; and the second addendum makes it the acceptance ' +
      'surface'},
  confStateRestore: {severity: SEVERITY.DECISIVE, because: 'item 12'},
  u64IdentityHandling: {severity: SEVERITY.DECISIVE,
    because: 'item 5: an arbitrary u64 does not pass safely through a ' +
      'JavaScript Number'},
  acceptableHandleHosting: {severity: SEVERITY.DECISIVE,
    because: 'item 12; and item 8 asks what architecture to build'},
  noConsensusLogicInJavaScript: {severity: SEVERITY.DECISIVE,
    because: 'item 12: no missing primitive may force consensus semantics ' +
      'back into JavaScript'},
});

const MISSING = 'input not recorded: ';

// CEILINGS, enforced by the function itself. Two independent verifiers have
// measured the substance; this evaluation may not claim more than they
// found, however its inputs come out.
const CEILING = Object.freeze({
  consensusCore: VERDICT.VIABLE,
  wasmBoundary: VERDICT.WITH_GAPS,
  lagrangeMigration: VERDICT.UNDETERMINED,
});

// The named gaps the WASM-boundary verdict must carry. A verdict that does
// not name them is not the verdict this evaluation measured.
const REQUIRED_WASM_GAPS = Object.freeze([
  'runtime-recovery-after-a-fatal-or-trap',
  'election-rng-cannot-be-seeded-through-the-binding',
  'the-unstable-log-is-not-observable-through-the-binding',
  'snapshot-and-compaction-surface-is-incomplete',
  'remotely-triggerable-fatals-need-host-side-ingress-validation',
]);

const ORDER = Object.freeze([VERDICT.NOT_VIABLE, VERDICT.WITH_GAPS,
  VERDICT.VIABLE]);

function atMost(value, ceiling) {
  const at = ORDER.indexOf(value);
  const limit = ORDER.indexOf(ceiling);
  if (at < 0 || limit < 0) {
    return ceiling;
  }
  return at > limit ? ceiling : value;
}

function failures(table, inputs) {
  const decisive = [];
  const gaps = [];
  for (const [name, rule] of Object.entries(table)) {
    if (!Object.hasOwn(inputs, name)) {
      decisive.push(`${MISSING}${name}`);
      continue;
    }
    if (inputs[name] === true) {
      continue;
    }
    (rule.severity === SEVERITY.DECISIVE ? decisive : gaps).push(name);
  }
  return {decisive, gaps};
}

/**
 * The value of a verdict, given its named inputs and the open gaps attributed
 * to the thing being judged.
 * @param {Object} table the input table (severity per input)
 * @param {Object} inputs the measured booleans
 * @param {Array<string>} openGaps ids of open gaps attributed here
 * @return {{value: string, decisiveFailures: Array<string>,
 *   namedGapFailures: Array<string>, openGaps: Array<string>}}
 */
function verdictFrom(table, inputs, openGaps = []) {
  const {decisive, gaps} = failures(table, inputs);
  const value = decisive.length > 0 ? VERDICT.NOT_VIABLE :
    (gaps.length > 0 || openGaps.length > 0 ? VERDICT.WITH_GAPS :
      VERDICT.VIABLE);
  return {value, decisiveFailures: decisive, namedGapFailures: gaps, openGaps};
}

/**
 * The consensus-core verdict.
 * @param {Object} inputs
 * @param {Array<string>} [openGaps]
 * @return {Object}
 */
function consensusVerdict(inputs, openGaps = []) {
  const derived = verdictFrom(CONSENSUS_INPUTS, inputs, openGaps);
  return {...derived,
    ceiling: CEILING.consensusCore,
    value: atMost(derived.value, CEILING.consensusCore)};
}

/**
 * The WASM-boundary verdict.
 * @param {Object} inputs
 * @param {Array<string>} [openGaps]
 * @return {Object}
 */
function wasmVerdict(inputs, openGaps = []) {
  const derived = verdictFrom(WASM_INPUTS, inputs, openGaps);
  // The boundary carries named gaps two verifiers measured, so it can never
  // be more than `viable-with-named-gaps` however the inputs come out.
  const missingGaps = REQUIRED_WASM_GAPS
    .filter((gap) => !openGaps.includes(gap));
  return {...derived,
    ceiling: CEILING.wasmBoundary,
    requiredGaps: [...REQUIRED_WASM_GAPS],
    missingRequiredGaps: missingGaps,
    value: missingGaps.length > 0 ? VERDICT.NOT_VIABLE :
      atMost(derived.value, CEILING.wasmBoundary)};
}

export {
  CEILING,
  CONSENSUS_INPUTS,
  REQUIRED_WASM_GAPS,
  SEVERITY,
  VERDICT,
  WASM_INPUTS,
  consensusVerdict,
  wasmVerdict,
};
