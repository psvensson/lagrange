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
  RUNG_LOCAL_FIX,
  RUNG_WIDEN_SCOPE,
  RUNG_MODEL,
  RUNG_CHANGE_APPROACH,
  RUNG_PARK,
]);

// Index of the terminal rung (park). Reaching it parks the frontier.
export const PARK_RUNG_INDEX = LADDER.length - 1;

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
