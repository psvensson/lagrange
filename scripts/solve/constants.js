// Shared constants for the minimal autonomy-first solver.
// Kept in one place so the loop, store, scheduler and honesty checker agree.

export const SOLVE_DATA_DIR = 'solve';
export const QUESTS_SUBDIR = 'quests';
export const LOG_SUBDIR = 'log';
export const STATE_SUBDIR = 'state';
export const REPORT_SUBDIR = 'report';
export const CONFIG_FILE = 'config.json';
export const RETREAD_LOOKBACK_DAYS = 45;
export const REPRO_ON_HEAD_FINDING_KIND = 'repro-on-head';

// Event types written to the append-only log.
export const EVENT_QUEST_DECLARED = 'quest-declared';
export const EVENT_QUEST_UPGRADED = 'quest-upgraded';
export const EVENT_ATTEMPT = 'attempt';
// Honest harness runs that cannot produce a trustworthy metric. Kept separate
// from EVENT_ATTEMPT so they consume the bounded measurement retry budget but
// cannot advance a rung, resolve a theory, or terminalize a Quest.
export const EVENT_NON_MEASUREMENT = 'non-measurement';
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
// Records the graded decision a guard/continuation gate took (advisory/reroute/explore/
// park-resumable/terminal) together with the actionable next command. Append-only and
// non-gating: it makes the previously-silent "why did the loop stop here" decision
// auditable, and lets the explore budget (EXPLORE_BUDGET) be derived from the log.
export const EVENT_GATE_DECISION = 'gate-decision';
// Records that a driver (human or agent) consciously OVERRODE a soft, overridable guard
// for one frontier, supplying a falsifiable reason. Append-only and auditable: it is the
// "escape hatch for judgment the rule-author did not anticipate". An override authorizes
// exactly ONE subsequent bypass of the named guard (it is consumed by the next matching
// gate decision) and is reset by honest progress, so it can never silently disable a guard.
// Only OVERRIDABLE heuristic guards (a theory/explore or scope reroute) accept an override;
// the honesty/integrity invariants (regression, unrecorded-evidence, metric-projection,
// measurement, and any terminal/precondition error) refuse it.
export const EVENT_GUARD_OVERRIDE = 'guard-override';
// A mandatory step-back reflection turn: the agent reads the whole history and records a
// free-form reframing. It is a pure THINK turn — no gate may fire during it — so the loop
// is periodically forced to re-examine its approach instead of grinding one rung. Recorded
// append-only; it carries the trigger (cadence/oscillation/scope-pressure) and the note.
export const EVENT_REFLECTION = 'reflection';

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

// Convergence guards: generic Solver detectors that keep an autonomous Quest from
// spinning on a coupled-invariant oscillation (one invariant family is fixed while a
// definitionally-coupled family re-breaks, ad infinitum). Each guard keys off real
// recorded events only, is advisory-then-terminal (it raises a health signal before it
// gates a step), and is independently switchable here so a guard can be disabled or
// retuned without editing detection logic. The master map is the single on/off surface;
// the numeric thresholds below tune each guard. Flipping a flag to false fully reverts
// that guard to the pre-guard behaviour, which keeps the change reversible.
export const CONVERGENCE_GUARDS = Object.freeze({
  // rr-A: per-invariant green/red ledger projection. Foundation for the gates below;
  // when false the ledger is still computable but the gates that consume it stand down.
  invariantLedger: true,
  // rr-C: a measured regression pins the next move to restore-or-explain.
  regressionRestoreGate: true,
  // rr-D: an A/B invariant swap escalates to a whole-system theory + model discriminator.
  coupledOscillation: true,
  // rr-F: a detected coupling pins the next move to an atomic cross-owner reconcile and
  // denies progress credit to single-owner local fixes until every coupled family is green
  // together (or a finding accepts the coupling). Builds on coupledOscillation's detection.
  couplingReconcile: true,
  // rr-E: scope-pressure crossing the file limit becomes a terminal (gating) bound.
  scopeTerminal: true,
  // rr-B: a frontier may refine its search gradient (e.g. priority -> distance) without
  // tripping the goalpost seal, as long as the sealed doneWhen closure is untouched.
  gradientRefinement: true,
  // rr-G: a run of consecutive non-measuring samples (dead/disconnected harness) routes the
  // frontier to a resumable measurement park ("fix the harness") instead of chasing the
  // noise those runs emit. Stands down when false (the detector still computes).
  harnessMeasurementGate: true,
});

// rr-D tuning: the minimum number of disjoint-cluster transitions in a frontier's
// regression history that count as a coupled oscillation. Two transitions means a full
// A -> B -> A round trip (one invariant family re-breaks after the other was "fixed"),
// which is the signature of a definitional coupling rather than a one-off whack-a-mole.
export const COUPLED_OSC_SWAP_THRESHOLD = 2;

// rr-E tuning: changed-file count across recorded attempts above which scope pressure is
// treated as terminal (the Solver must split/reduce scope before more edits land). Set
// above the advisory large-diff signal (LARGE_DIFF_FILE_LIMIT=10 / BROAD_OWNER_AREA_LIMIT=2)
// so the agent is first advised to split, then HARD-gated, before a blast radius runs away.
// Lowered from 60 after a 9h run accumulated a 50-file stack that sailed under the old
// bound (see solver oscillation post-mortem): 25 forces the split the advisory only suggested.
export const SCOPE_PRESSURE_FILE_LIMIT = 25;

// rr-B: frontier gradient metric kinds that are interchangeable refinements of one
// another for the SAME probe+scenario. Swapping among these sharpens the search gradient
// without weakening the sealed closure (doneWhen stays byte-identical), so it is exempt
// from the goalpost-immutability check when gradientRefinement is enabled.
export const GRADIENT_REFINEMENT_METRICS = Object.freeze([
  'priority',
  'distance',
  'failed',
]);

// Run-level terminal outcomes.
export const OUTCOME_SOLVED = 'solved';
export const OUTCOME_EXHAUSTED = 'exhausted';
export const OUTCOME_MAX_CYCLES = 'max-cycles';
export const OUTCOME_THEORY_REQUIRED = 'theory-required';
// A recoverable gate (scope/regression/measurement/unrecorded-evidence/metric-projection)
// asked the loop to stop and take a concrete next action. Like THEORY_REQUIRED it is a
// NON-terminal stop: the quest stays resumable and is never closed by it. It replaces the
// old behaviour where these gates threw and crashed an autonomous run.
export const OUTCOME_BLOCKED = 'blocked';
// Soft-first (P5): a recoverable inferential gate that, on its first corroborating
// occurrence(s), was downgraded to an ADVISORY annotation rather than a stop. The loop
// keeps working (runs the harness / makes an attempt) and only escalates to the real
// disposition once a quorum of advisories has accrued. Never a terminal; callers treat it
// as "continue".
export const OUTCOME_CONTINUE = 'continue';

// Supervisor (keep-alive) outcomes. runSupervised wraps runLoop and re-invokes it across
// NON-terminal stops so an autonomous quest keeps contributing to its append-only memory
// instead of dying when one driver session ends. These outcomes are all NON-terminal — they
// never close a quest (only SOLVED / honest EXHAUSTED do) — and exist so the operator/agent
// can see WHY the supervisor stepped back rather than silently looping.
//   supervisor-paused-measurement a measurement gate (dead/disconnected harness) was hit;
//                                 re-running cannot help until the harness is repaired.
//   supervisor-stalled            restarts stopped producing durable progress (a hot spin
//                                 guard); a human/agent should reassess.
//   supervisor-budget             the supervisor's own restart/cycle budget was exhausted.
export const OUTCOME_SUPERVISOR_PAUSED_MEASUREMENT = 'supervisor-paused-measurement';
export const OUTCOME_SUPERVISOR_STALLED = 'supervisor-stalled';
export const OUTCOME_SUPERVISOR_BUDGET = 'supervisor-budget';

// runSupervised bounds: at most this many runLoop restarts, and a stall window of this many
// consecutive restarts with no new durable-progress event before it steps back. Conservative
// so a transient blip does not end the supervisor while genuine slow progress continues.
export const SUPERVISOR_MAX_RESTARTS = 100;
export const SUPERVISOR_STALL_WINDOW = 3;
// theory gate resolves to exactly one of these. Only `terminal` may CLOSE a quest, and
// (per the two-terminal contract in AGENTS.md) only as SOLVED or honest EXHAUSTED.
//   advisory       annotate (finding/health signal) and continue.
//   reroute        force a specific kind of next move (reduce scope, restore invariant,
//                  ingest evidence) and continue.
//   explore        open a bounded free-explore rung: lift the metric-movement
//                  requirement but exit only on an artifact (a falsifiable theory, a
//                  confirmed/refuted discrimination, or a cross-owner reconcile plan).
//   park-resumable park ONE frontier (e.g. cannot-measure); the quest stays resumable and
//                  auto-reopens on fresh evidence; it NEVER counts as exhaustion.
//   terminal       reserved for solved / honestly exhausted only.
// The continuation-code -> disposition mapping lives in continuation.js
// (CONTINUATION_DISPOSITIONS) and is reversible: flip any code back to `terminal` to
// restore the pre-graded "guard -> stop" behaviour for that code.
export const DISPOSITION_ADVISORY = 'advisory';
export const DISPOSITION_REROUTE = 'reroute';
export const DISPOSITION_EXPLORE = 'explore';
export const DISPOSITION_PARK_RESUMABLE = 'park-resumable';
export const DISPOSITION_TERMINAL = 'terminal';
export const DISPOSITIONS = Object.freeze([
  DISPOSITION_ADVISORY,
  DISPOSITION_REROUTE,
  DISPOSITION_EXPLORE,
  DISPOSITION_PARK_RESUMABLE,
  DISPOSITION_TERMINAL,
]);

// Per-frontier ceiling on bounded free-explore rungs opened by a theory/explore gate.
// While a frontier still has explore budget, a theory-required gate keeps the quest in an
// explore disposition (think unconstrained, but boxed: it must produce an artifact). Once
// the budget is spent the gate parks that single frontier as resumable instead of looping
// forever, so the quest still converges without ever silently terminating.
export const EXPLORE_BUDGET = 3;

// Soft-first / quorum (P5): how many corroborating occurrences of an INFERENTIAL theory
// gate (a plain "produce a theory artifact" block) are absorbed as ADVISORY — recorded,
// and the loop keeps working (runs the harness / makes a real attempt) — before the gate
// escalates to its hard (explore) disposition. Counted per frontier since the last metric
// progress, so an honest improvement resets the ramp. This is strictly a soft-first DELAY
// in front of the existing explore->park ladder: it never closes a quest and never defers
// a CONVERGENCE-FORCING gate (coupled-invariant oscillation/reconcile, system-theory-
// after-stall, regression-restore, scope, measurement, data-integrity) — those are
// excluded so rr-C/rr-D/rr-F still pin their corrective move immediately. Reversible:
// set to 0 to restore immediate hard escalation on the first occurrence.
export const GUARD_QUORUM = 2;

// Mandatory step-back reflection cadence: the number of measured/recorded attempts the
// loop may take since its last reflection (or last reflection request) before a reflection
// turn is forced. Oscillation and runaway scope pressure force a reflection immediately,
// regardless of this cadence. Set to 0 to disable the cadence trigger (the oscillation /
// scope triggers still fire). The reflection turn only runs when the configured executor
// can satisfy it (exposes a reflect() entry point); otherwise it is surfaced as advice via
// the status/step/report/health advisories (see solve/advisories.js) so a supervised driver
// is still nudged to take the reflection turn.
export const REFLECTION_INTERVAL = 5;

// Altitude (framing) reflection cadence: a deliberately COARSE beat for the higher-altitude
// step-back that questions the FRAME itself — is this Quest at the right altitude, are the
// formal models / harness pulling their weight, is the code arranged to be reasoned about,
// should this Quest continue or honestly EXHAUST and pivot? It is rarer than the micro
// REFLECTION_INTERVAL above. Coupled-invariant oscillation forces an altitude reflection
// immediately, regardless of this cadence (a bouncing coupling is the canonical "the frame,
// not the next fix, is wrong" signal). Set to 0 to disable the cadence trigger (the
// oscillation and on-demand `reflect --altitude` triggers still fire).
export const ALTITUDE_REFLECTION_INTERVAL = 20;

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
// A run whose harness could not connect to / reach the cluster (admin API timeouts,
// EHOSTUNREACH, WebSocket closed before established, cluster readiness never stabilized)
// did not measure the scenario at all: any metric it emits is an artifact of a broken
// harness, not of the system under test. It must be treated exactly like an incomplete
// run — invalid sample, metric null — so a dead harness can never be read as progress and
// the frontier is honestly routed to "fix the harness" instead of chasing the noise.
export const VERDICT_REASON_HARNESS_CONNECTIVITY =
  'harness_connectivity_or_system_failure';

// The precise discriminator for an invalid metric sample is the reason code (the
// metric itself is missing/untrustworthy), not the verdict alone: a completed-but-
// failing run can carry an incomplete-ish verdict yet still report a trustworthy
// outstanding-item count.
export const NON_MEASURING_VERDICT_REASONS = Object.freeze([
  VERDICT_REASON_EXECUTION_INCOMPLETE,
  VERDICT_REASON_HARNESS_CONNECTIVITY,
]);

// rr-G: how many consecutive trailing non-measuring frontier samples mark the harness
// itself (not the system under test) as broken. At/after this many, the frontier is routed
// to a resumable measurement park ("fix the harness") instead of crediting or chasing the
// noise those runs emit. Three keeps a single transient connectivity blip from parking the
// frontier while catching a genuinely dead harness quickly.
export const HARNESS_NONMEASURING_PARK_THRESHOLD = 3;

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
export const PARK_PROVENANCE_OPERATOR = 'operator';

// Non-measuring-sample retry bound. A positively-classified non-measuring sample
// (invalidSample === true) is not evidence of a stall: the harness produced no
// trustworthy metric, so the rung is HELD and retried rather than climbed toward an
// `exhausted` park it never earned. The retry is finite — once this many consecutive
// samples on a frontier fail to measure, the frontier parks as CANNOT_MEASURE (pointing
// the operator at the harness), never as EXHAUSTED. This preserves termination while
// keeping a flaky harness from manufacturing a false exhaustion verdict.
export const CANNOT_MEASURE_RETRY_BUDGET = 3;
export const PARK_REASON_EXHAUSTED = 'ladder exhausted without metric movement';
export const PARK_REASON_CANNOT_MEASURE =
  'measurement unavailable: no attempt produced a trustworthy sample';

// Oscillation reopen budget: how many times a frontier may auto-reopen (a previously
// SOLVED frontier re-fails on fresh measured evidence) before the Solver stops chasing
// the flap. A frontier whose gradient hits zero but cannot hold the quest's stricter
// consecutive-pass bar will solve↔reopen indefinitely; capping the auto-reopens leaves the
// frontier SOLVED so the scheduler runs out of open frontiers and terminalizes the quest as
// EXHAUSTED (an honest "the goal is reachable but not reliably holdable" verdict) instead of
// looping forever. Recovery is quest-level, not a per-frontier reopen: the loop re-checks
// doneWhen every cycle, so a later run that genuinely holds the consecutive bar still closes
// it, and an EXHAUSTED quest can be re-run once the underlying blocker changes.
export const OSCILLATION_REOPEN_BUDGET = 8;

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
