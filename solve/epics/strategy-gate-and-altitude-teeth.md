# Epic: Strategy gate + altitude teeth — make high-level thinking gate behavior

Status: discussing

## Intent

Three autonomous runs on `rolling-restart-core-stability` independently reached the
same high-level verdict — *"this is a coupled churn/settle root; point-fixes bounce;
the real lever is the structural membership-single-owner cutover (user-gated)"* — and
each time the loop spent ~7–10h re-deriving it tactically before declaring EXHAUSTED.

The defect is **not** missing strategic insight. The altitude-reflection mechanism
(`scripts/solve/reflection.js`) already generates it. The defect is that the insight:
1. arrives **late** (organically at ~hour 7, not at entry), and
2. does **not gate behaviour** — the tactical loop runs regardless of what the
   reflection concluded, and regardless of what *prior* runs/epics already concluded.

This epic makes high-level conclusions *change what happens next*, in **all execution
paths** (supervised `step`, autonomous `run`, and read-only `status`/`report`), by
hooking the **shared advisory + continuation layer** rather than the autonomous-only
loop.

## Design principle (the load-bearing decision)

- `scripts/solve/advisories.js :: buildAdvisories` and `scripts/solve/continuation.js
  :: continuationFromHealth` are surfaced by `status`, `step`, `report`, and `health`
  — i.e. **every** driver, human or agent, supervised or autonomous, sees them.
- `scripts/solve/loop.js` (`maybeRunReflection`, `resolveGateDecision`) is
  **autonomous-only**.
- Therefore: a gate that must fire "whenever it is useful, not just in autonomous
  runs" MUST live in the advisory layer (the universal *nudge*) and, for teeth, the
  continuation layer (the universal *block*). `loop.js` only needs to *honour* the
  shared decision, not own it.
- Non-negotiable invariants preserved: the strategy gate never *closes* a quest, never
  fakes EXHAUSTED, and is always overridable with a recorded falsifiable reason (it
  redirects attention; it does not move goalposts).

---

## Item 1 — Strategy gate (UNIVERSAL entry check)

**Problem.** Nothing checks, *before* re-entering the tactical loop, whether this exact
frontier was already declared coupled / exhausted by a prior run, reflection, or epic.
A fresh run starts with `attemptsSinceAltitudeReflection = 0` and won't trip the
cadence/oscillation trigger until it has *rebuilt* the oscillation from scratch.

**Mechanism.** New health signal `strategy-prior-exhaustion` + new advisory
`strategy-gate` + (teeth) new continuation code `CONTINUATION_BLOCKED_STRATEGY`.

**What it checks (cheap, log-local — no gate run).** PRIMARY signal, using machinery
that fully exists today: prior `EVENT_REFLECTION` notes on **this quest's own
append-only log** with `kind === 'altitude'` and `trigger`/note = `oscillation` (the
"already concluded coupled" marker). The log persists across runs
(`solve/log/<id>.ndjson`), so run-1/run-2 altitude reflections are already present.
- SECONDARY (follow-on, NOT load-bearing): a linked `solve/epics/` entry tagged as a
  structural/user-gated lever. **VERIFIER CORRECTION:** this does not work as written —
  `trace`/`links` (`solve.js:625-700`) never reads epic *content*, epics carry no such
  tag, `links` only holds `roadmapRow/specRef/closesCL/parentQuest/planDoc`, and the
  live quest's `planDoc` points at `topology-convergence-hardening.md`, not the
  membership-cutover epic. So the epic-join needs NEW machinery + a tagging convention
  + a corrected link. Defer it; ship Item 1 on the prior-altitude-reflection signal
  alone, which needs no new machinery.
- CAVEAT (verifier): the oldest reflections in the live log have `kind=undefined`
  (pre-tagging). A detector keyed on `kind === 'altitude'` silently misses them, so the
  unit harness must synthesize `kind`-tagged events and the run-3-replay falsifier will
  under-count pre-tagging history. Acceptable; note it in the test.

**Behaviour.**
- *Advisory (always):* surface `strategy-gate` in `status`/`step`/`report` —
  "this frontier was declared coupled/exhausted at <ref>; the default move is to
  produce a decision memo and escalate, not re-enter the tactical loop."
- *Teeth (autonomous + step):* `continuationFromHealth` returns
  `CONTINUATION_BLOCKED_STRATEGY` on the *first* attempt of a session against a
  prior-exhausted frontier. Overridable (soft guard, like theory/scope) — the agent
  proceeds only by recording **why this entry differs** from the prior exhaustion
  (new evidence, a now-tractable sub-head, a changed goal), or by escalating.

**Seam.** `health.js` (emit signal) → `continuation.js` (new code + disposition) →
`advisories.js` (new advisory) → `loop.js` honours the block via existing
`resolveGateDecision`/continuation path.

> **MECHANICAL MUST-FIX (verifier, applies to Items 1 & 2).** A new continuation code
> is NOT free: `dispositionForContinuation` falls back to `DISPOSITION_TERMINAL` for any
> unmapped code (`continuation.js:165`) and `resolveGateDecision` *throws* on TERMINAL
> (`gate.js:199-201`). Every new soft-overridable code MUST be registered in **four**
> maps or the loop crashes / the `override` command rejects the guard:
> `CONTINUATION_DISPOSITIONS` (`continuation.js:45`), `OVERRIDABLE_CODES`
> (`continuation.js:28`), `OVERRIDE_GUARD_LABELS` (`advisories.js:38`), and
> `OVERRIDE_GUARD_ALIASES` (`solve.js:396`).

**Falsifier (below-gate, unit).** Construct a quest log with a recorded altitude
reflection naming frontier F as coupled + a linked epic; assert `buildAdvisories`
emits `strategy-gate` and `continuationFromHealth` returns
`CONTINUATION_BLOCKED_STRATEGY`; assert a recorded override clears it; assert a quest
with NO prior exhaustion emits neither. Red-on-revert.

**Blast radius.** Advisory + one soft overridable continuation code. No gate, no
src-under-test, no termination semantics. Low.

---

## Item 2 — Altitude reflection WITH TEETH

**Problem.** The altitude reflection runs a think-turn but nothing blocks *continued
tactical work* if the reframe didn't actually change course. Oscillation can persist
across many attempts after a reflection was already recorded — the reflection becomes
a logged note, not a redirect.

**Mechanism.** Extend the existing altitude path: when `coupled-invariant-oscillation`
**persists for K attempts AFTER an altitude reflection was already recorded** (the
reframe didn't take), escalate from advisory to a continuation block
`CONTINUATION_BLOCKED_ALTITUDE_UNREFRAMED`.

**Behaviour.** A normal altitude reflection (note recorded) still clears the cadence as
today. But if oscillation *re-arms* within K attempts of that note, the next
continuation is BLOCKED until the agent lands a **durable artifact that changes the
plan** — a new finding with `rulesOut`, an epic update, or a goal-calibration
escalation (Item 4). Recording another bare reflection note does NOT clear this block
(prevents "reflect to satisfy the cadence, then resume the same loop").

**Cap.** New constant `MAX_TACTICAL_ATTEMPTS_UNDER_OSCILLATION` (proposed `K = 3`;
tune). Counts attempts since the last altitude reflection while oscillation stays hot.

**Seam.** `constants.js` (K) → `reflection.js` (helper:
`oscillationReArmedSinceAltitudeReflection(log, K)`) → `continuation.js` (new code +
disposition) → `advisories.js` (escalate the `altitude-reflection-due` advisory to the
blocking variant) → `loop.js` honours it.

**Falsifier (below-gate, unit).** Log with oscillation + an altitude reflection +
K subsequent oscillating attempts and no durable artifact → assert
`CONTINUATION_BLOCKED_ALTITUDE_UNREFRAMED`; assert a finding/epic event clears it;
assert a bare reflection note does NOT clear it. Red-on-revert.

**Blast radius.** One continuation code + one constant + one reflection helper. Low.

---

## Item 3 — Time-box low-EV heads

**Problem.** A frontier head known to be low-frequency (`~14%` in the run) was still
worked with a full gate cycle (~10–12min × N) under an active oscillation/bounce
regime, against the synthesis's own prediction.

**Mechanism.** New advisory `low-ev-head` (gate-economy family, alongside the existing
`single-sample-gate`). Fires when BOTH: (a) the picked head's observed gate frequency
is below `LOW_EV_HEAD_FREQUENCY` (proposed `0.20`), AND (b) a
`coupled-invariant-oscillation` signal is active (the point-fixes-bounce regime).

**Frequency source. VERIFIER CORRECTION — the plan cited the wrong artifact.** The
hand-authored `test-output/latent-blocker-census-*.json` is QUALITATIVE (prose
`survivors[].mechanism` + a ranked frontier; no numeric per-reason frequency). The
numbers come from `scripts/analyze-latent-blockers.js --json` →
`reasons[].dominantCount` + top-level `gateCount`; frequency = `dominantCount /
gateCount` (`analyze-latent-blockers.js:206-253`). Repoint the seam there. The reason
*class* vocabulary (`replica_operations_in_flight`, etc.) matches frontier-head names,
so the join is feasible, but the head-id ↔ reason-class mapping is **not 1:1 and must be
built** — specify it as part of this item. Read the precomputed artifact first; do not
re-run a gate to compute frequency.

**Behaviour.** Advisory-only (NOT a hard block): "head <id> is <freq> under an active
bounce regime; a full gate cycle has low expected value — log it as a deferred head and
spend the cycle on the strategy escalation instead." It informs the
smallest-first/most-frequent pick already in the per-turn loop; it does not forbid the
work, because a low-freq head can still be the right *cheap below-gate* fix.

**Seam.** `health.js` (emit `frontier-head-frequency` from census artifact) →
`advisories.js` (new `low-ev-head` advisory) → `constants.js` (threshold).

**Falsifier (below-gate, unit).** Health with oscillation + a head at freq 0.14 →
assert `low-ev-head` advisory; head at 0.5 OR no oscillation → assert absent.
Red-on-revert.

**Blast radius.** One advisory + one read-only signal. No block, no gate. Lowest.

---

## Item 4 — Escalate goal (doneWhen) calibration as a USER decision

**Problem.** When the safety invariant holds on 100% of runs and every `doneWhen`
failure is an end-of-run settle-time / budget read (real settle ~150s vs a 120s
budget), the sharp question — *is the goal calibrated tighter than physical reality?* —
is a **user decision**, but the loop self-vetoes it internally as "goalpost-moving" and
re-litigates it every session.

**Mechanism.** New health signal `goal-calibration-suspect` + advisory
`goal-calibration-escalation`. This is the recognised legitimate **hard-stop** for
autonomous runs ("goalpost ambiguity a subagent cannot resolve") — see the autonomous
mandate in `solve/autonomous/rolling-restart-autorun.md` and `core.md` stop conditions.

**Detection (conservative — must avoid false escalation).** Fires only when, across the
recent gate corpus: (a) the safety/SAFE invariant passed on **every** run (0 corrupt /
breach / divergence), AND (b) **every** `doneWhen` failure is a settle/budget/oracle
class (not a divergence/safety class), AND (c) this pattern has held across **≥2 prior
sessions**.

> **VERIFIER CORRECTION — no session-boundary primitive exists.** The `EVENT_*`
> vocabulary (`constants.js:12-52`) has no `EVENT_RUN_STARTED`/session marker; the loop
> appends none. So "≥2 prior sessions" is NOT directly detectable. Pick one before
> building: (i) **add an `EVENT_RUN_STARTED` marker** the loop appends at `runLoop`
> entry (cleanest; also gives Item 1 a clean entry hook) — recommended; or (ii) define a
> proxy and state it explicitly (count of prior terminal/park states, or attempt
> timestamp-gap > threshold). The plan previously glossed this — it must be resolved in
> the implementation, not assumed.

Conditions (a)/(b) are computable from the report corpus + prior reflection notes with
no new gate; condition (c) depends on the session primitive above.

**Behaviour.**
- *Autonomous:* HARD-STOP (a sanctioned terminal pause, not EXHAUSTED) and emit a
  decision memo to `solve/epics/` framing the either/or for the user:
  *recalibrate the budget/oracle to the system's real settle envelope* vs
  *invest in convergence-speed/structural work*. Does not decide; escalates.
- *Supervised:* surface the `goal-calibration-escalation` advisory with the same memo
  command.

**Seam.** `health.js` (emit signal from corpus + prior-session notes) →
`advisories.js` (advisory) → `loop.js` (treat as a sanctioned stop, distinct from
EXHAUSTED, that writes the memo) → `solver-quests.md` / `core.md` (document the new
stop condition).

**Falsifier (below-gate, unit).** Corpus where SAFE=100% + all failures settle-class +
≥2 prior sessions → assert `goal-calibration-suspect` + autonomous stop disposition;
any divergence/safety failure present → assert absent (never escalate a real bug as a
goal problem). Red-on-revert.

**Blast radius.** One signal + one advisory + one new *stop* disposition in the loop
(additive; does not change EXHAUSTED/SOLVED semantics). Medium (touches loop
termination) — land last, with the heaviest verification.

---

## Sequencing

0. **Prerequisite (verifier):** add an `EVENT_RUN_STARTED` marker the loop appends at
   `runLoop` entry. Cheap, additive, and unblocks both Item 1's clean entry hook and
   Item 4's session-durability count. Do this first.
1. Item 3 (lowest blast, pure advisory, validates the census→signal→advisory pipe;
   repointed to `analyze-latent-blockers.js --json`).
2. Item 1 (strategy gate — advisory + soft overridable block; the headline universal
   gate; ship on the prior-altitude-reflection signal, defer the epic-tag join).
3. Item 2 (altitude teeth — reuses Item 1's continuation pattern; register the new
   code in all four maps).
4. Item 4 (goal escalation — touches loop termination; verify heaviest).

After all: `npm run steering:llm:pack` (regenerate packs); update
`solver-quests.md`, `core.md`, `operational-ground-truth.md` to document the gate +
the new stop condition; `npm run test:static` / `steering:check` green.

## Open questions (for the user — do not self-resolve)

- **OQ1 (goal calibration).** Is `doneWhen = 3 consecutive scenario-PASS` against the
  current 120s budget the intended bar, given SAFE holds 100% and real settle is
  ~150s? This is exactly the Item-4 escalation; the gate surfaces it but you decide.
- **OQ2 (thresholds).** `K=3` (oscillation re-arm), `0.20` (low-EV head),
  `≥2 sessions` (calibration durability) are proposed defaults — confirm or tune.
- **OQ3 (block vs nudge for Item 1).** Should the strategy gate be a *hard* override-
  required block on the first attempt, or an advisory-only nudge with no teeth?
  (Plan proposes: soft overridable block — teeth, but never a dead-end.)

## Falsifiable success criterion for the epic itself

A *fresh* autonomous run launched against a prior-exhausted frontier must, **on its
first attempt** (not hour 7), either (a) be blocked by `strategy-gate` and produce a
decision memo / escalation, or (b) record an explicit override stating why this entry
differs. Demonstrated by a unit harness replaying the run-3 log as prior history.
