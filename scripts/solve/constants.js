// Shared constants for the minimal autonomy-first solver.
// Kept in one place so the loop, store, scheduler and honesty checker agree.

export const SOLVE_DATA_DIR = 'solve';
export const QUESTS_SUBDIR = 'quests';
export const LOG_SUBDIR = 'log';
export const STATE_SUBDIR = 'state';
export const REPORT_SUBDIR = 'report';
export const CONFIG_FILE = 'config.json';

// Event types written to the append-only log.
export const EVENT_QUEST_DECLARED = 'quest-declared';
export const EVENT_QUEST_UPGRADED = 'quest-upgraded';
export const EVENT_ATTEMPT = 'attempt';
export const EVENT_SOLVED = 'solved';
export const EVENT_PARK = 'park';
// Reopens a parked frontier when its exhaustion verdict was driven by non-measuring
// (invalid) samples and therefore cannot be trusted. Append-only and evidence-gated:
// the park event stays in the log; the reopen resets the frontier to the first rung so
// the Solver can take fresh, honestly-measured attempts.
export const EVENT_FRONTIER_REOPENED = 'frontier-reopened';
export const EVENT_QUEST = 'quest';
export const EVENT_VIOLATION = 'violation';
// A durable, append-only knowledge note bound to a frontier: what was learned, the
// evidence, and (optionally) which approach it rules out. Not a gate — it is replayed
// into the rung dossier so a redirected/re-picked frontier never re-tries dead ends.
export const EVENT_FINDING = 'finding';
export const EVENT_THEORY_SYSTEM_DECLARED = 'theory-system-declared';
export const EVENT_THEORY_OPTION_DECLARED = 'theory-option-declared';
export const EVENT_THEORY_SELECTED = 'theory-selected';
export const EVENT_THEORY_RESULT = 'theory-result';
export const EVENT_THEORY_SUPERSEDED = 'theory-superseded';
export const EVENT_EVIDENCE_INGESTED = 'evidence-ingested';

// Frontier / quest status values.
export const STATUS_OPEN = 'open';
export const STATUS_SOLVED = 'solved';
export const STATUS_PARKED = 'parked';
export const STATUS_EXHAUSTED = 'exhausted';

// The finite strategy ladder. Rung index === position in this list.
// `observe` is the first rung: before changing code, instrument the frontier and run a
// discriminator that confirms or refutes the selected theory. A confirmed/refuted
// discrimination is honest investigative progress (it holds the rung) even when the
// product metric does not move — see decideAndRecord + INVESTIGATION_BUDGET below.
export const RUNG_OBSERVE = 'observe';
export const RUNG_LOCAL_FIX = 'local-fix';
export const RUNG_WIDEN_SCOPE = 'widen-scope';
export const RUNG_MODEL = 'model';
export const RUNG_CHANGE_APPROACH = 'change-approach';
export const RUNG_PARK = 'park';

export const THEORY_SCOPE_SYSTEM = 'system';
export const THEORY_SCOPE_FRONTIER = 'frontier';

export const THEORY_LAYER_PROTOCOL = 'protocol';
export const THEORY_LAYER_SCHEDULING = 'scheduling';
export const THEORY_LAYER_OWNERSHIP = 'ownership';
export const THEORY_LAYER_OBSERVATION = 'observation';
export const THEORY_LAYER_TOPOLOGY = 'topology';
export const THEORY_LAYER_MODEL = 'model';

export const THEORY_LAYERS = Object.freeze([
  THEORY_LAYER_PROTOCOL,
  THEORY_LAYER_SCHEDULING,
  THEORY_LAYER_OWNERSHIP,
  THEORY_LAYER_OBSERVATION,
  THEORY_LAYER_TOPOLOGY,
  THEORY_LAYER_MODEL,
]);

export const THEORY_RESULT_ACTIVE = 'active';
export const THEORY_RESULT_SUPPORTED = 'supported';
export const THEORY_RESULT_FALSIFIED = 'falsified';
export const THEORY_RESULT_SUPERSEDED = 'superseded';
export const THEORY_RESULT_AVOIDED = 'avoided';
export const THEORY_RESULT_STALE = 'stale';
export const THEORY_RESULT_NEEDS_RERUN = 'needs-rerun';

export const THEORY_RESULTS = Object.freeze([
  THEORY_RESULT_ACTIVE,
  THEORY_RESULT_SUPPORTED,
  THEORY_RESULT_FALSIFIED,
  THEORY_RESULT_SUPERSEDED,
  THEORY_RESULT_AVOIDED,
  THEORY_RESULT_STALE,
  THEORY_RESULT_NEEDS_RERUN,
]);

export const LADDER = Object.freeze([
  RUNG_OBSERVE,
  RUNG_LOCAL_FIX,
  RUNG_WIDEN_SCOPE,
  RUNG_MODEL,
  RUNG_CHANGE_APPROACH,
  RUNG_PARK,
]);

// Index of the terminal rung (park). Reaching it parks the frontier.
export const PARK_RUNG_INDEX = LADDER.length - 1;

// Shared, renumber-safe rung indices. Computed from LADDER so inserting/reordering
// rungs (e.g. the leading `observe` rung) never leaves a hard-coded threshold behind.
export const RUNG_INDEX_OBSERVE = LADDER.indexOf(RUNG_OBSERVE);
export const RUNG_INDEX_LOCAL_FIX = LADDER.indexOf(RUNG_LOCAL_FIX);
export const RUNG_INDEX_WIDEN_SCOPE = LADDER.indexOf(RUNG_WIDEN_SCOPE);
export const RUNG_INDEX_MODEL = LADDER.indexOf(RUNG_MODEL);

// Discrimination outcomes an attempt may report. An attempt that instruments the
// frontier and runs the selected theory's discriminator reports whether the theory was
// confirmed or refuted; either is a real result that earns investigative progress
// credit (see INVESTIGATION_BUDGET). `null`/none means the attempt made no
// discrimination claim and is scored purely on the metric, as before.
export const DISCRIMINATION_CONFIRMED = 'confirmed';
export const DISCRIMINATION_REFUTED = 'refuted';
export const DISCRIMINATIONS = Object.freeze([
  DISCRIMINATION_CONFIRMED,
  DISCRIMINATION_REFUTED,
]);

// Per-frontier ceiling on investigative-progress credits. A confirmed/refuted
// discrimination on a not-yet-credited theory HOLDS the rung instead of climbing toward
// park — but only this many times per frontier. Once the budget is spent, a
// non-metric-moving attempt climbs the ladder as usual, so the loop still terminates
// (EXHAUSTED) even if every discrimination is honest. Each credit also consumes a
// distinct theory (a refuted theory is forced to be reselected), so investigation can
// never farm a single hypothesis.
export const INVESTIGATION_BUDGET = 3;

// Number of same-frontier no-progress attempts that force a whole-system theory. This
// tracks the depth of the model rung (you have stalled enough to reach it), preserving
// the original semantics after the leading `observe` rung shifted the ladder by one.
export const SYSTEM_THEORY_STALL_THRESHOLD = RUNG_INDEX_MODEL;

// Run-level terminal outcomes.
export const OUTCOME_SOLVED = 'solved';
export const OUTCOME_EXHAUSTED = 'exhausted';
export const OUTCOME_MAX_CYCLES = 'max-cycles';
export const OUTCOME_THEORY_REQUIRED = 'theory-required';

export const FIRST_RUNG_INDEX = 0;

// Harness verdicts/reasons that mean a run did NOT actually measure the metric
// (it was blocked or aborted before producing trustworthy numbers). Such a sample
// must never be read as metric progress: an incomplete run that reports "0 priority
// items" only did so because it never got far enough to find any. These are shared so
// the scenario-harness probe (metric validity) and evidence ingestion (theory rerun)
// agree on the same signal instead of duplicating string literals.
export const VERDICT_BLOCK_EVIDENCE_INCOMPLETE = 'BLOCK_EVIDENCE_INCOMPLETE';
export const VERDICT_REASON_EXECUTION_INCOMPLETE =
  'execution_incomplete_or_metrics_missing';

// The precise discriminator for an invalid metric sample is the reason code (the
// metric itself is missing/untrustworthy), not the verdict alone: a completed-but-
// failing run can carry an incomplete-ish verdict yet still report a trustworthy
// outstanding-item count.
export const NON_MEASURING_VERDICT_REASONS = Object.freeze([
  VERDICT_REASON_EXECUTION_INCOMPLETE,
]);

// Park provenance — WHY a frontier reached the terminal park rung.
//   EXHAUSTED:      the frontier was genuinely measured and the finite ladder ran out
//                   of honest moves. This is real solution-space exhaustion.
//   CANNOT_MEASURE: no attempt on the frontier ever produced a trustworthy sample, so
//                   "no metric movement" is not evidence of exhaustion — it is an
//                   artifact of a measurement infrastructure (harness) failure. The
//                   honest next step is to fix the harness, not to declare the work
//                   impossible. Keeping these distinct stops a broken harness from
//                   masquerading as a solved-or-impossible verdict, and lets `reopen`
//                   bound itself so it cannot oscillate against a never-measuring park.
export const PARK_KIND_EXHAUSTED = 'exhausted';
export const PARK_KIND_CANNOT_MEASURE = 'cannot_measure';
export const PARK_REASON_EXHAUSTED = 'ladder exhausted without metric movement';
export const PARK_REASON_CANNOT_MEASURE =
  'measurement unavailable: no attempt produced a trustworthy sample';

// Quest classification: product goals must be measured against real artifacts;
// process goals are scaffolding/decision records (often oracle-backed).
export const QUEST_CLASS_PRODUCT = 'product';
export const QUEST_CLASS_PROCESS = 'process';
export const QUEST_CLASSES = Object.freeze([
  QUEST_CLASS_PRODUCT,
  QUEST_CLASS_PROCESS,
]);

// Closure provenance — how a SOLVED verdict was established.
export const CLOSURE_MEASURED = 'MEASURED'; // real artifact probe (e.g. scenario-harness)
export const CLOSURE_DECISION = 'DECISION'; // hand-authored oracle file
export const DECISION_PROBES = Object.freeze(['oracle']);
