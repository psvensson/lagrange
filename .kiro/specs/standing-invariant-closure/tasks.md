# Standing Invariant Closure — Tasks

Phases are sequential by dependency but each is independently shippable behind the
default-off `LAGRANGE_STANDING_INVARIANTS` flag. Each phase's `doneWhen` is its
closure condition. See `design.md` for rationale and `requirements.md` for the
SHALL contract.

WS0 is a **hard gate**: it answers the binding open question (predicate
expressibility) on a known-regressible invariant before any machinery is built. No
phase past WS0 starts until WS0 has a written PASS.

---

## WS0 — Expressibility gate (HARD GATE, the falsifiable first increment) — ✅ DONE, VERDICT: PASS

**Outcome (2026-06-26):** see `ws0-expressibility-audit.md`. CL-041 (raft vote double-vote
TOCTOU) is expressible as a **cheap** (~1 s) re-entrant live-evidence predicate
(`npm run repro -- CL-041` exits 0). Added registry entry
`raft-election-safety-one-vote-per-term` to `architecture/contracts/invariants.json` with an
additive `liveEvidence` block (closed a real raft-invariant gap). Round-trip proven: HELD on
fixed HEAD `f95e53c3` (exit 0), BREACHED on a faithful serialization-revert in an isolated
worktree (exit 1). `npm run model:invariants` + `model:contract-records` green. **WS1 unblocked.**

Original checklist (completed):

- [x] Choose a closed CL with a deterministic repro — **CL-041** (vote double-vote
      TOCTOU, `npm run repro -- CL-041`) or **CL-042** (empty-log-term masquerade).
- [x] Identify its invariant in `architecture/contracts/invariants.json` (e.g. a
      raft election-safety / leader-completeness entry); if none exists, ADD the entry
      (id + statement + `formalPredicate` + `contractRef`) — this also closes a real
      registry gap. Confirm `npm run model:invariants` still validates.
- [x] Draft the additive `liveEvidence.holdsWhen` predicate over the event log / repro.
      Classify its cost (cheap fold vs requires-harness-run). → **cheap**
- [x] **Falsifier:** on a throwaway branch, revert the original fix; confirm the
      candidate predicate FAILS (would-be BREACHED). Restore the fix; confirm it
      PASSES (would-be HELD). Record the round-trip evidence in this spec dir as
      `ws0-expressibility-audit.md`.
- [x] Record which trigger policy (§5) the predicate's cost permits. → `on-quest-closure` ok (cheap)

**doneWhen:** a written audit (`ws0-expressibility-audit.md`) shows, for a chosen
closed CL bound to an `invariants.json` entry, that a `liveEvidence.holdsWhen`
predicate exists, is classified cheap/expensive, and that a reverted fix demonstrably
fails it while the restored fix passes it — proven against the existing repro — with
`npm run model:invariants` still green. If no closed CL can be expressed as a
re-entrant predicate, STOP and record why the standing-invariant form is not viable.

## WS1 — Invariant declaration + status fold (Option C: detect & report only) — ✅ DONE

**Outcome (2026-06-26, commit `62d7eeff`):** `scripts/solve/invariant-liveness.js` evaluates an
invariant's `liveEvidence` predicate and derives `UNGUARDED/HELD/BREACHED` as a fold over the
Solver event log (via `store.appendEvent`/`readLog`; stream id `invariant-<id>`). New `solve
invariants [--evaluate] [--json]` subcommand. Validator extended for the optional block. Behind
default-off `LAGRANGE_STANDING_INVARIANTS`. **Live proof:** flag-on `--evaluate` → raft invariant
**HELD** on clean HEAD; **BREACHED** end-to-end in an isolated worktree with the CL-041
serialization reverted; flag-off inert. Unit 25/25, model:invariants + lint:scripts + cli +
list-commands green.

- [x] Add the additive `liveEvidence` block to the WS0 invariant's entry (done in WS0); extend
      the `model:invariants` validator to validate the optional block's shape.
- [x] Implement `liveEvidence.holdsWhen` evaluation reusing the `doneWhen` evaluator for the
      `probe` kind; `repro`/`command` kinds run the referenced command (the WS0 evidence type).
- [x] Implement status as a **fold over the Solver event log** — `UNGUARDED/HELD/BREACHED`, no
      new store (status never persisted on the entry).
- [x] Add the registry view: `solve invariants` (chose a dedicated subcommand over overloading
      `status --invariants`, since invariants are not quest-scoped).
- [x] **Granularity decision:** per-invariant (= per durable property, anchored to a CL/ADR),
      NOT per-owner-boundary — keeps each `holdsWhen` sharp and falsifiable; the registry already
      groups by `owner`/`boundary` for rollups. **Altitude-review unification:** deferred to a
      WS4 follow-up — the live tier is the mechanical substrate the standing altitude review
      (`architecture-altitude-review.md`) can later consume, but wiring it is out of WS1 scope.

**doneWhen:** with the flag on, the WS0 invariant declares and evaluates to HELD on
clean code and BREACHED on the reverted-fix branch, with status computed as an
event-log fold and no new persistent store added; `--invariants` renders it. Flag
off = zero behavior change (verified). ✓ ALL MET.

## WS2 — Trigger policy (`on-quest-closure` default)

Wire automatic re-evaluation on the cheap default trigger. — ✅ DONE (commit `87bd09af`)

**Outcome (2026-06-26):** `triggerOnQuestClosure(root, {scopes})` evaluates + records every
`on-quest-closure` invariant whose `trigger.scope` matches the closing quest's scopes (derived
by `questScopes()` from owner + `touchesInvariantScopes`), returning `{from,to}` transitions.
Wired into `loop.js` `recordQuestSolvedIfDone` as a flag-gated, fail-safe (try/catch) hook that
fires once on the SOLVED transition. Cost guard (Req 6.3) enforced both at runtime
(`triggerCostViolation` skips expensive per-event) and at declaration (validator rejects it).

- [x] Implement the `on-quest-closure` evaluator hook (fires on the SOLVED terminal).
- [x] Enforce the cost guard: expensive predicates cannot bind to a per-event trigger.
- [ ] (Optional, if cheap) wire `on-touched-owner` via the owner-boundary map. → deferred
      (scope matching already supports `owner:` tokens; the file→owner mapping is the only
      missing piece and is not needed for the cheap default path).

**doneWhen:** with the flag on, closing a Quest in the invariant's scope triggers a
re-evaluation that records the resulting status transition to the event log, and an
`expensive`-classified predicate is rejected from per-event triggers. Flag off =
no triggers fire. ✓ MET (unit 36/36; loop 52/52 unbroken).

## WS3 — Breach → restoration Quest auto-link (Option A control flow) — ✅ DONE (commit `ce3f3b34`)

**Outcome (2026-06-26):** `evaluateAndRecord` detects `HELD → BREACHED` and `reactToBreach`
records a breach falsifier (`invariant.breach`), then auto-links a restoration Quest (doneWhen =
new `invariantHeld` probe) when `restoration.autoSpawn` is set and `shouldSpawnRestoration` allows
(skip when one is already open or `OSCILLATION_REOPEN_BUDGET` lifetime links reached). Req 5.3 is
structural: status folds only evaluation events, so a SOLVED restoration Quest never sets HELD —
re-evaluation does. Extracted `invariant-status.js` (leaf) to avoid a probe↔liveness import cycle.

- [x] On `HELD → BREACHED`, record the breach falsifier and link a restoration Quest whose
      `doneWhen` is "the invariant returns to HELD" (the `invariantHeld` probe).
- [x] Gate auto-spawn behind `restoration.autoSpawn`; spawn subject to `OSCILLATION_REOPEN_BUDGET`
      and a single-open guard.
- [x] Enforce Req 5.3: a SOLVED restoration Quest does NOT set HELD; only a passing re-eval does.

**doneWhen:** with the flag on and `autoSpawn` enabled, reverting the WS0 fix flips
the invariant to BREACHED, records a falsifier, and auto-links a restoration Quest
under the reopen budget; restoring the fix and re-evaluating returns it to HELD —
demonstrated against live evidence. Storm test: a broad breach does not exceed the
reopen budget. ✓ MET — proven end-to-end in an isolated worktree (BREACHED +
`restore-raft-…` Quest auto-created + falsifier; restore → re-eval → HELD); budget +
single-open guards unit-tested.

## WS4 — Generalize + validation hooks (after WS0–WS3 prove out) — ✅ DONE

**Outcome (2026-06-26):** see `ws4-generalization-note.md`. Added a second, structurally distinct
invariant — `raft-log-matching-committed-entry-identity` (Raft §5.3 Log Matching; boundary
`log_replication`, evidence `npm run repro -- CL-040`). Both invariants HELD on clean code;
reverting the CL-040 fix in an isolated worktree gives a **selective** BREACH (log-matching
BREACHED + restoration Quest auto-created; election-safety stays HELD).

- [x] Add a `liveEvidence` tier to a second, structurally different invariant (Log Matching;
      a cross-owner one — rebalancer CL-038 / control-plane CL-001 — noted as the next addition).
- [x] Doc-amendment breach resolution (Req 9.2b): documented as a supported resolution path;
      `model:invariants` + `model:contract-records` stay green across registry edits. A forced
      synthetic breach-by-restatement is left as an operational example (needs a real property
      change = its own Quest).
- [x] Document the live-evidence tier alongside Tier-1 gates → `architecture/INDEX.md`.
- [ ] (Optional/out-of-spec) EvoClaw/SWE-EVO scoring, memory-layer graft — epic-tracked.

**doneWhen:** at least two structurally distinct invariant classes are HELD on clean
code and BREACHED-on-regression proven, with the registry rendering both and no new
authoritative store introduced. ✓ MET.

---

## Follow-ons (post-WS4, all DONE 2026-06-26)

The five optional items beyond the core WS0–WS4, in the recommended order:

- [x] **#1 Cross-owner invariant** (`c91eb38a`) — `rebalancer-surplus-drain-handoff-terminalizes`
  (operation_workflow_owner, CL-038). Selective BREACH proven (rebalancer breaches, Raft stays HELD).
- [x] **#2 Altitude-review unification** (`2f7db15c`) — `altitudeInvariantDigest` surfaces non-HELD
  drift into the altitude reflection; documented partial (cheap-predicate subset) in the epic.
- [x] **#3 on-touched-owner trigger** (`3fb4a528`) — `trigger.paths` + `triggerOnTouchedOwner` +
  `invariants --changed/--since`; validator requires paths for the policy.
- [x] **#4 Local EvoClaw-style scorer** (`70711e73`) — `invariants --score`: coverage (guarded
  repro-backed CLs) + coherence (HELD fraction) + worklist. NOT the external benchmark (out of
  scope — needs an agent-eval harness). Live: 3/8 coverage, 3/3 coherence.
- [x] **#5 Memory graft (honest form)** (`e6ef9708`) — `invariants --export` durable status board
  (projection) + documented Letta/Mem0 seam; external service integration declined on purpose
  (`memory-graft-note.md`).

Regression sweep after all five: full `test/solve/` 889/889, repros CL-038/040/041 green,
`model:contract-records` + `model:invariants` + `lint:scripts` green.

## Closure records

Closure for this spec is tracked in the project closure ledger
(`closure-ledger/CL-###.md`). New CLs opened by this work (e.g. the expressibility
boundary, the auto-spawn-budget interaction) are recorded there, not in this file.

## Status

- 2026-06-23 — Spec created by graduating `quest-standing-invariants.md`. No phase
  started. WS0 is the next action and the hard gate for everything after it.
- 2026-06-26 — **WS0 PASS** (`ws0-expressibility-audit.md`). Added registry entry
  `raft-election-safety-one-vote-per-term` + `liveEvidence` block; CL-041 round-trip proven
  (HELD exit 0 / BREACHED exit 1) in an isolated worktree; `model:invariants` green. WS1
  unblocked (build the event-log fold + `status --invariants`, behind
  `LAGRANGE_STANDING_INVARIANTS`).
- 2026-06-26 — **WS1 DONE** (commit `62d7eeff`). `invariant-liveness.js` + `solve invariants`
  subcommand + validator extension; HELD/BREACHED fold over the event log, default-off. Live
  HELD (clean) / BREACHED (reverted worktree) proven end-to-end.
- 2026-06-26 — **WS2 DONE** (commit `87bd09af`). on-quest-closure trigger (loop.js hook,
  fail-safe) + cost guard (Req 6.3, runtime + validator).
- 2026-06-26 — **WS3 DONE** (commit `ce3f3b34`). Breach falsifier + reopen-budget-bounded
  restoration Quest auto-link (`invariantHeld` doneWhen; Req 5.3 structural). Proven end-to-end.
- 2026-06-26 — **WS4 DONE** (`ws4-generalization-note.md`). Second class
  `raft-log-matching-committed-entry-identity` (Log Matching) added; selective BREACH proven
  (CL-040 revert → log-matching BREACHED, election-safety stays HELD). Tier documented in
  `architecture/INDEX.md`. **WS0–WS4 all complete.** Remaining = optional/epic-tracked
  (cross-owner invariant, `on-touched-owner`, EvoClaw scoring, memory graft, altitude-review
  unification).
- 2026-06-26 — **FLAG PROMOTED to default-ON.** `isStandingInvariantsEnabled` flipped
  `=== 'true'` → `!== 'false'` (`invariant-liveness.js`), matching the early-admin-SQL-engine
  precedent. Quest-closures now auto-evaluate in-scope invariants and auto-spawn a reopen-budget-
  bounded restoration Quest on a real HELD→BREACHED regression. Justified: all 3 live predicates
  are cheap, the loop hook is fail-safe (try/catch), and auto-spawn is single-open + budget bounded.
  Opt out with `LAGRANGE_STANDING_INVARIANTS=false`. Validated: solve suite 890/890 at the default
  flag state (gate test updated to the default-ON contract), `model:invariants` + `lint:scripts`
  green; 3 invariants evaluate HELD by default.
