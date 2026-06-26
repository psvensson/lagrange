---
id: quest-standing-invariants
roadmapRow: null
status: graduated
graduatesTo: standing-invariant-closure
---

# Standing Invariants: evolving Quest closure from terminal to maintained

## Intent (why now)

The Quest workflow is best-in-class at **episodic, evidence-gated convergence**: seal a
`doneWhen`, drive it to a terminal, prove it against live evidence (SOLVED/EXHAUSTED). A
2026-06-23 deep-research scan (`continuous-ai-workflow-landscape.md`) confirmed that *no*
OSS or commercial system models this evidence-gated closure / parked-frontier capability
better — so the evolution path is not "adopt a foreign system," it is "generalize the
machinery we already own along the one axis where we are uniquely strong."

That axis is **time**. A Quest assumes a SOLVED result *stays* solved. Long-horizon
architecture violates exactly this: invariants erode. The raft-safety fixes (CL-040/041/042)
could silently regress; "membership truth has a single owner" can drift back toward the
7-source `resolveActiveNodeViews()` merge. The goal-drift literature (Apollo arXiv:2505.02709
+ ~6 corroborating sources) names erosion as *the* long-horizon failure mode, and our closure
ledger today is a graveyard of *closed* records, not a set of *live guards*. The two patterns
the scan found **nothing** in the field covers — agent-driven **ADR tracking** and
**architectural drift/erosion detection** — are precisely the two that fall out of fixing this.

This epic proposes the abstraction that fixes it, at minimum cost, reusing the existing
event-sourced Solver, closure grammar, frontier/falsifier vocabulary, and steering files.

## Thesis

**Closure is currently a terminal state. Make it a *maintained* state.** Lift the `doneWhen`
evaluator out of the Quest's one-time termination check and turn it into a standing,
re-entrant **evidence gate**. A Quest *reaches* a goal once; an **Invariant** asserts a goal
*continues to hold* and is re-verified on a trigger. They are duals over the identical
predicate-vs-live-evidence core already built.

## The abstraction: one evaluator, two primitives

Both primitives share the same core — a declarative predicate folded over the event log.
They differ only in **when** it runs and **what the verdict does**.

| | **Quest** (exists) | **Invariant** (new) |
|---|---|---|
| Modality | Episodic — *reach* X | Standing — X *continues to hold* |
| Predicate | `doneWhen` | `holdsWhen` (same evaluator) |
| Evaluated | Once, to decide termination | Recurrently, on a trigger, to decide status |
| Verdict | PASS → SOLVED / park → EXHAUSTED | HELD / BREACHED |
| On failure | Open a frontier | Auto-spawn a restoration Quest, linked |
| Lifetime | Closes | Never closes — it is re-gated forever |

The compact framing: **an Invariant is a closure-ledger entry that never closes.** A CL today
is a tombstone ("CL-041 closed"); its standing form stays live and re-gated. Quest and
Invariant are the episodic/standing duals over the same closure core.

### Invariant state machine

- **UNGUARDED** — declared (architectural intent asserted), no passing evidence yet.
- **HELD** — `holdsWhen` passed at last evaluation; carries `{ at, evidenceRef }`.
- **BREACHED** — `holdsWhen` failed; carries the **falsifier** (existing vocabulary) and links
  the restoration Quest.

Transitions:

- `UNGUARDED → HELD` — first passing evidence (the invariant is established).
- `HELD → BREACHED` — **this transition IS drift/erosion detection.** No separate detector.
- `BREACHED → HELD` — the linked restoration Quest reached SOLVED and re-verification passes.

### The two uncovered gaps fall out for free

- **ADR tracking** — every Invariant is *anchored by a decision*: the choice + rationale + the
  `holdsWhen` predicate that operationalizes it + current status. ADRs stop being write-once
  markdown and become **continuously checked claims**. The decision record and its verification
  become one object, not two that drift apart.
- **Drift/erosion detection** — the recurrent `holdsWhen` evaluation. Drift = an Invariant
  going `HELD → BREACHED` with a falsifier attached. Nothing new to build beyond the fold.

## Critical constraint: a projection, not new storage

The Invariant registry MUST be **derived from the existing event log + closure ledger** — the
same way `status` and `report` are derived today — **not** a new store. Two reasons, both
rooted in this project's own scar tissue:

1. It avoids the secondary/tertiary cache the operator has explicitly ruled out
   (`avoid-secondary-tertiary-caches`).
2. It avoids the "projection-of-a-projection" antipattern that produced the active-node merge
   mess (`membership-single-owner-cutover-plan`).

Single source of truth stays the event log; an Invariant's status is a **fold** over it, plus
a sealed declaration file analogous to `solve/quests/<id>.json`.

## The one genuinely new mechanism: a trigger policy

A Quest is evaluated on demand; an Invariant needs a *when-to-re-check* policy. Ordered by
cost:

- **on relevant Quest closure** — cheap; the default. When a Quest touching owner/subsystem S
  closes, re-evaluate Invariants scoped to S.
- **on touched owner/file** — wire to the owner-boundary map (`architecture/current-owner-maps.md`).
- **on cadence** — a gate run / CI tick. This is the research's "Continuous AI" pattern, but
  pointed at *invariant re-verification* and gated by **evidence**, not rules.
- **on explicit re-check** — operator-invoked.

The trigger policy and the `BREACHED → restoration-Quest` auto-link are the only genuinely new
control flow. Everything else is existing machinery re-pointed.

## Where the (optional, later) graftable pieces plug in

From the landscape scan — neither is on the critical path:

- **Memory layer (Letta/Mem0)** sits *under* the Solver, carrying Invariant status + rationale
  across sessions so they are re-read at decision points — the goal-drift mitigation, automated.
- **EvoClaw / SWE-EVO** become an *external* harness that scores whether standing Invariants
  measurably reduce the continuous-setting collapse (>80% isolated → ≤38%/≤25% continuous).
  That score is the falsifier for this entire epic.

## Minimal first increment (the falsifiable proof, in-house style)

Do **not** build the registry first. Pick **one already-closed CL that can regress** — a
raft-safety one (CL-041 or CL-042) is ideal because it has a deterministic repro
(`npm run repro -- CL-041`) — and:

1. Re-express its `doneWhen` as a standing `holdsWhen` predicate over the event log / repro.
2. Add the HELD/BREACHED fold + exactly one trigger (`on-Quest-closure`).
3. **Prove it**: on a throwaway branch, revert the original fix → the Invariant MUST flip to
   BREACHED and auto-link a restoration Quest; restore the fix → it returns to HELD.

If that round-trips, the abstraction is real and we generalize. If a CL *cannot* be expressed
as a cheap re-entrant predicate, we have learned the boundary cheaply (see open questions).

This increment is itself a Quest. Proposed sealed result:

> **doneWhen**: For a chosen closed CL, reverting its fix on a branch flips its declared
> Invariant from HELD to BREACHED and auto-links a restoration Quest, and restoring the fix
> returns it to HELD — demonstrated against live evidence (the existing repro), with the
> Invariant status computed as a fold over the event log and no new persistent store added.

## Options under discussion

- **Option A — Invariant as a first-class sibling of Quest** (recommended). New sealed
  declaration type + status fold + trigger policy. Highest fidelity; reuses the Solver event
  log directly. Trade-off: new control flow (trigger policy, auto-link) is real scope.
- **Option B — Invariant as a recurring "self-reopening" Quest.** Model a standing invariant
  as a Quest whose terminal is non-absorbing — on trigger it reopens if `doneWhen` regresses.
  Smaller surface (no new primitive). Trade-off: muddies the SOLVED/EXHAUSTED terminal
  semantics the workflow depends on; "a SOLVED Quest that silently reopens" is a footgun for
  every consumer of terminal state.
- **Option C — registry-only, no auto-Quest.** Track HELD/BREACHED + falsifier as a derived
  report; a human/loop decides whether to open a restoration Quest. Cheapest; defers the auto
  control flow. Trade-off: drift is *detected* but not *driven to closure* — loses the
  end-to-end "erosion → restoration" loop that is the point.

Lean: **A** for the model, but ship the **first increment as C's mechanics** (detect +
report) and add the auto-link (A) once the predicate-expressibility question is answered.

## Open questions

- **Predicate cost vs fidelity** — the hardest constraint. Some invariants may only be
  faithfully checkable by a full gate run (minutes), bounding how "continuous" re-verification
  can be. Which invariants have a *cheap* `holdsWhen` (event-log fold) vs require an expensive
  harness run? This determines the viable trigger cadence per invariant and may force a
  two-tier policy (cheap-on-closure vs expensive-on-cadence).
- **Granularity** — is an Invariant per-CL, per-owner-boundary, or per-architectural-tenet?
  Per-CL is the cheapest start but risks a sprawling registry; per-owner-boundary aligns with
  the owner map but each predicate gets broader/weaker.
- **Relationship to the altitude review** — `architecture-altitude-review.md` is a *standing*
  epic that asks framing questions on a cadence. Is the Invariant registry the *mechanical*
  substrate that standing epic has been missing (turning its hand-run questions into
  evidence-gated guards)? Likely yes — worth unifying rather than running two standing loops.
- **Reopen storms** — if a broad invariant flips BREACHED, it could auto-spawn many restoration
  Quests at once. Need the existing oscillation/reopen budgets (`OSCILLATION_REOPEN_BUDGET`)
  to apply to invariant-driven Quests too.
- **Does Option B's footgun actually bite?** — if the terminal-state consumers can tolerate a
  "reopened" signal cleanly, B is dramatically cheaper. Worth a quick audit of who reads
  terminal state before discarding it.

## Decision log

- 2026-06-23 — Landscape scan (`continuous-ai-workflow-landscape.md`) established the
  build-vs-adopt verdict: nothing OSS does evidence-gated closure better; evolve in-house.
  ADR tracking + drift detection identified as the two uncovered gaps.
- 2026-06-23 — Drafted this abstraction: lift `doneWhen` into a standing `holdsWhen` gate;
  Invariant = "closure-ledger entry that never closes," the episodic/standing dual of a Quest.
  Recommended Option A model + Option C first increment, proven by a revert-a-closed-CL test.
  Open questions seeded.
- 2026-06-23 — **Graduated to spec** `.kiro/specs/standing-invariant-closure/`
  (requirements.md + design.md + tasks.md). Operator bought the direction. Status → graduated.
  WS0 (expressibility hard gate on CL-041/042) is the next action and blocks all later phases.
- 2026-06-24 — **Correction (operator: architecture docs must reflect current state).** The
  project ALREADY owns the declarative registry: `architecture/contracts/invariants.json`
  (`invariant-registry-v1`) + `system-contract-v1` records, verified against *formal models*
  via `model:contracts`/`model:invariants`. The spec must NOT build a parallel
  `solve/invariants/` store (collision / avoid-secondary-store). Reframed as a **second
  verification tier**: an additive `liveEvidence` block on existing entries (cited by id),
  verified against *live evidence*; a BREACH = "the architecture doc no longer reflects the
  system," resolved by either fixing the runtime or amending the contract/registry/owner map.
  Spec requirements/design/tasks revised accordingly (Reqs 8–9, design §2.5/§4/§7.5).
