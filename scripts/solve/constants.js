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
