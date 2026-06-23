# Standing Invariant Closure — Tasks

Phases are sequential by dependency but each is independently shippable behind the
default-off `LAGRANGE_STANDING_INVARIANTS` flag. Each phase's `doneWhen` is its
closure condition. See `design.md` for rationale and `requirements.md` for the
SHALL contract.

WS0 is a **hard gate**: it answers the binding open question (predicate
expressibility) on a known-regressible invariant before any machinery is built. No
phase past WS0 starts until WS0 has a written PASS.

---

## WS0 — Expressibility gate (HARD GATE, the falsifiable first increment)

Prove that an already-closed, deterministically-reproducible CL can be expressed as
a cheap, re-entrant `holdsWhen` over live evidence, and that reverting its fix is
*detectable*. This is done by hand/inspection — no new runtime wiring yet.

- [ ] Choose a closed CL with a deterministic repro — **CL-041** (vote double-vote
      TOCTOU, `npm run repro -- CL-041`) or **CL-042** (empty-log-term masquerade).
- [ ] Re-express its `doneWhen` as a candidate `holdsWhen` predicate over the event
      log / repro. Classify its cost (cheap fold vs requires-harness-run).
- [ ] **Falsifier:** on a throwaway branch, revert the original fix; confirm the
      candidate predicate FAILS (would-be BREACHED). Restore the fix; confirm it
      PASSES (would-be HELD). Record the round-trip evidence in this spec dir as
      `ws0-expressibility-audit.md`.
- [ ] Record which trigger policy (§5) the predicate's cost permits.

**doneWhen:** a written audit (`ws0-expressibility-audit.md`) shows, for a chosen
closed CL, that a `holdsWhen` predicate exists, is classified cheap/expensive, and
that a reverted fix demonstrably fails it while the restored fix passes it — proven
against the existing repro. If no closed CL can be expressed as a re-entrant
predicate, STOP and record why the standing-invariant form is not viable as designed.

## WS1 — Invariant declaration + status fold (Option C: detect & report only)

Introduce the sealed `Invariant` declaration and the derived status projection. No
auto-spawn, no triggers beyond explicit re-check. Read-only output.

- [ ] Define the sealed declaration schema and `solve/invariants/<id>.json`
      (shape per design §4). Author the WS0 invariant as the first instance.
- [ ] Implement `holdsWhen` evaluation by **reusing the existing `doneWhen`
      evaluator** (Requirement 1.2) — no second evaluation path.
- [ ] Implement status as a **fold over the Solver event log** (Requirement 2) —
      `UNGUARDED/HELD/BREACHED`. No new authoritative store.
- [ ] Add `solve.js status --invariants` (and/or a registry view) deriving status
      like `report` does.
- [ ] Decide granularity (per-CL vs per-owner-boundary) against the real predicate;
      record the decision. Resolve the altitude-review unification question (§7).

**doneWhen:** with the flag on, the WS0 invariant declares and evaluates to HELD on
clean code and BREACHED on the reverted-fix branch, with status computed as an
event-log fold and no new persistent store added; `--invariants` renders it. Flag
off = zero behavior change (verified).

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

- [ ] Promote a second, structurally different invariant class (e.g. an owner-boundary
      invariant: "membership active-set has one authority") to validate the
      abstraction beyond raft-safety.
- [ ] Promote selected closed CLs that express durable properties to standing
      invariants (Requirement 4.3).
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
