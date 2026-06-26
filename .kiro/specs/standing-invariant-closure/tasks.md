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

Wire automatic re-evaluation on the cheap default trigger.

- [ ] Implement the trigger policy field and the `on-quest-closure` evaluator hook:
      when a Quest whose scope intersects an invariant reaches a terminal,
      re-evaluate that invariant.
- [ ] Enforce the cost guard: an `expensive` predicate MAY NOT bind to a per-event
      trigger; it binds to `on-cadence` only (Requirement 6.3).
- [ ] (Optional, if cheap) wire `on-touched-owner` via the owner-boundary map.

**doneWhen:** with the flag on, closing a Quest in the invariant's scope triggers a
re-evaluation that records the resulting status transition to the event log, and an
`expensive`-classified predicate is rejected from per-event triggers. Flag off =
no triggers fire.

## WS3 — Breach → restoration Quest auto-link (Option A control flow)

Close the erosion→restoration loop, bounded by the existing reopen budget.

- [ ] On `HELD → BREACHED`, record the breach falsifier and **link** a restoration
      Quest whose `doneWhen` is "the invariant returns to HELD."
- [ ] Gate auto-spawn behind `restoration.autoSpawn`; when enabled, spawn subject to
      `OSCILLATION_REOPEN_BUDGET` (Requirement 5.2).
- [ ] Enforce Requirement 5.3: a SOLVED restoration Quest does NOT directly set HELD;
      only a passing re-evaluation does.

**doneWhen:** with the flag on and `autoSpawn` enabled, reverting the WS0 fix flips
the invariant to BREACHED, records a falsifier, and auto-links a restoration Quest
under the reopen budget; restoring the fix and re-evaluating returns it to HELD —
demonstrated against live evidence. Storm test: a broad breach does not exceed the
reopen budget.

## WS4 — Generalize + validation hooks (after WS0–WS3 prove out)

- [ ] Add a `liveEvidence` tier to a second, structurally different existing registry
      entry (e.g. `single-semantic-owner` or `published-subset-covered`) to validate
      the abstraction beyond raft-safety.
- [ ] Exercise the doc-amendment breach resolution (Requirement 9.2b): drive a breach
      whose honest fix is to amend the contract/`invariants.json`/owner map, and confirm
      the formal tier (`model:contracts`) stays green afterward.
- [ ] Document the live-evidence tier as a binding/probe in the affected contract
      records' `metrics` so the new capability is described alongside Tier-1 gates.
- [ ] (Optional/out-of-spec) wire the EvoClaw/SWE-EVO external scoring and/or a
      memory-layer graft as separate, later efforts (epic-tracked, not gated here).

**doneWhen:** at least two structurally distinct invariant classes are HELD on clean
code and BREACHED-on-regression proven, with the registry rendering both and no new
authoritative store introduced.

---

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
  HELD (clean) / BREACHED (reverted worktree) proven end-to-end. NEXT = WS2 (on-quest-closure
  trigger + cost guard).
