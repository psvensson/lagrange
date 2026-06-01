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
export const EVENT_ATTEMPT = 'attempt';
export const EVENT_SOLVED = 'solved';
export const EVENT_PARK = 'park';
export const EVENT_QUEST = 'quest';
export const EVENT_VIOLATION = 'violation';
// A durable, append-only knowledge note bound to a frontier: what was learned, the
// evidence, and (optionally) which approach it rules out. Not a gate — it is replayed
// into the rung dossier so a redirected/re-picked frontier never re-tries dead ends.
export const EVENT_FINDING = 'finding';

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

export const FIRST_RUNG_INDEX = 0;
