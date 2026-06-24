# Standing Invariant Closure — Design

**Status:** graduated from `quest-standing-invariants.md` 2026-06-23. Not yet
started; WS0 (expressibility gate) is the first and blocking work.
**Sources:** `continuous-ai-workflow-landscape.md` (build-vs-adopt scan),
`quest-standing-invariants.md` (the abstraction).

---

## 1. Motivation

The Quest workflow evaluates a sealed `doneWhen` against live evidence and
terminates. Closure is absorbing. Architecture is not: invariants erode, and a
SOLVED result silently becomes false. A 2026-06-23 deep-research scan confirmed
that the project's evidence-gated closure / parked-frontier model is unmatched in
OSS or commercial tooling, and that the *one* axis it does not cover is **time** —
the maintained, re-verified form of closure. The same scan found that agent-driven
**ADR tracking** and **architectural drift detection** are uncovered by the entire
field; both are direct consequences of adding a maintained closure form.

The empirical case for doing this is in the scan: frontier agents collapse from
>80% on isolated tasks to ≤38% (EvoClaw) / ≤25% (SWE-EVO) in continuous,
persistent-repository settings. Models cannot self-sustain architectural coherence
over long horizons; an evidence-gated, falsifier-recording, drift-detecting harness
is the mitigation, and the goal-drift literature (Apollo arXiv:2505.02709)
independently endorses externalized, re-read goals as the necessary technique.

## 2. The core idea: one evaluator, two primitives

Both primitives are the same fold over the event log; they differ in *when* it runs
and *what the verdict does*.

```
                 ┌─────────────────────── shared core ───────────────────────┐
                 │  predicate(P) evaluated against live evidence (event log)  │
                 └────────────────────────────┬───────────────────────────────┘
                                               │
              ┌────────────────────────────────┴────────────────────────────────┐
              ▼                                                                   ▼
   QUEST (episodic, exists)                                   INVARIANT (standing, new)
   P = doneWhen                                               P = holdsWhen  (same evaluator)
   evaluated once → terminate                                 evaluated on trigger → status
   PASS → SOLVED / park → EXHAUSTED                           PASS → HELD / FAIL → BREACHED
   closes                                                     never closes; re-gated forever
                                                              BREACHED → links restoration Quest
```

**An Invariant is a closure-ledger entry that never closes.** A CL today is a
tombstone; its standing form stays live and is re-gated.

## 2.5 This EXTENDS the existing architecture invariant registry (do not fork it)

The project already owns the *declarative* half of this. `architecture/contracts/invariants.json`
(`invariant-registry-v1`) is a machine-readable registry of owner-scoped safety/liveness
invariants — each with `id`, `owner`, `boundary`, `kind`, `statement`, `formalPredicate`,
`coupledWith`, `modelRef`, `contractRef`. The `system-contract-v1` records cite these by id and
bind them to models, probes (`npm run model:contracts` / `model:invariants`), `questRefs`, and
FMEA/STPA. There is **no parallel `solve/invariants/` registry** — that would collide with this
one and violate the avoid-secondary-store / don't-build-parallel directives.

What exists is **Tier 1 verification: against formal models** (Alloy SAT/UNSAT, TLA+, statecharts,
decision tables, owner traces) — *does the abstraction satisfy the property*. What this spec adds
is **Tier 2 verification: against live evidence** (the Solver event log / a deterministic repro) —
*does the running system still satisfy the property, now and over time*. Same invariant `id`, two
predicates:

| | Tier 1 (exists) | Tier 2 (this spec) |
|---|---|---|
| Predicate | `formalPredicate` (TLA+/Alloy) | `liveEvidence.holdsWhen` (event-log fold) |
| Verifies | model coherence | running-system conformance over time |
| Gate | `npm run model:contracts` / `model:invariants` | event-log fold on a trigger |
| Verdict | gate pass/fail (static) | HELD / BREACHED (standing) |

Tier 2 is **complementary, not a replacement**: the formal gates still guard model↔doc coherence;
the live tier guards doc↔running-system coherence. An invariant gains a Tier-2 predicate by adding
a `liveEvidence` block to its existing `invariants.json` entry (see §4).

## 3. Invariant state machine

```
        declare
   ─────────────────▶  UNGUARDED
                          │  first holdsWhen PASS
                          ▼
                        HELD  ◀───────────────┐
                          │                   │ restoration Quest SOLVED
        holdsWhen FAIL    │                   │  AND holdsWhen re-PASS
        (= drift/erosion) ▼                   │
                       BREACHED ──────────────┘
                          │  (records breach falsifier;
                          │   links/auto-spawns restoration Quest)
```

- `HELD → BREACHED` **is** drift/erosion detection. There is no separate detector.
- `BREACHED → HELD` requires a passing re-evaluation — a SOLVED restoration Quest is
  necessary but not sufficient (Requirement 5.3). This prevents "the Quest says
  done" from masking a still-failing predicate.

## 4. Data shape

No new registry. A Tier-2 predicate is an **added `liveEvidence` block on the existing
`architecture/contracts/invariants.json` entry**, cited by the entry's `id` (the same way
contract records and Quest theory metadata already cite invariants by id):

```jsonc
// architecture/contracts/invariants.json — an existing entry, with the NEW liveEvidence block
{
  "id": "single-semantic-owner",                 // existing id, owner, boundary, kind, statement,
  "owner": "architecture_owner",                 // formalPredicate, modelRef, contractRef … unchanged
  "boundary": "core_system_logic",
  "kind": "safety",
  "statement": "Every state transition … has exactly one semantic owner.",
  "formalPredicate": "Cardinality(SemanticOwner(concern)) = 1",   // Tier 1 (model)
  "modelRef": "architecture/models/alloy/core-system-logic.als",
  "contractRef": "architecture/contracts/core-system-logic.md",

  "liveEvidence": {                              // ← NEW (Tier 2): optional, additive
    "holdsWhen": { /* predicate, same grammar as doneWhen, folded over the event log */ },
    "evidence": { "kind": "repro", "ref": "npm run repro -- CL-041" },
    "trigger": { "policy": "on-quest-closure", "scope": "owner:raft", "cost": "cheap" },
    "restoration": { "autoSpawn": false }        // Option C first; flip on at WS3
  }
}
```

Status (`UNGUARDED/HELD/BREACHED`), breach history, and linked restoration Quests are NOT stored
on the entry — they are a **fold over the Solver event log** (Requirement 2). Restoration Quests
link through the entry's existing `questRefs`. `npm run model:invariants` continues to validate
the registry; a new live-tier evaluator reads the `liveEvidence` block and folds the event log.
This is the explicit guard against a second authoritative store, the projection-of-a-projection
antipattern, and the avoid-secondary-caches directive.

## 5. Evaluation and the trigger policy

The only genuinely new control flow is *when* `holdsWhen` runs and the breach
auto-link. Trigger policies, by cost:

| Policy | Cost | When |
|---|---|---|
| `on-quest-closure` | cheap | a Quest touching the invariant's scope reaches a terminal — **default** |
| `on-touched-owner` | cheap | a change touches an owner/file in scope (owner-boundary map) |
| `on-cadence` | expensive | a gate / CI tick — for predicates only checkable by a full run |
| `on-explicit` | n/a | operator-invoked re-check |

This is the research's "Continuous AI" pattern, but pointed at *invariant
re-verification* and gated by **evidence**, not rules. The cost field is mandatory
so an expensive predicate cannot be wired to a per-event trigger (Requirement 6.3).

## 6. Breach → restoration

On `HELD → BREACHED`:

1. Record the breach falsifier (existing vocabulary) with the failing evidence.
2. Link a restoration Quest whose sealed `doneWhen` is "INV-x returns to HELD."
3. When `restoration.autoSpawn` is enabled (WS3), spawn it automatically, subject to
   `OSCILLATION_REOPEN_BUDGET` so a broad breach cannot storm-spawn Quests.

The restoration Quest is an ordinary Quest — it uses the full existing Solver
machinery (frontiers, falsifiers, attempts). The Invariant is its sealed target.

## 7. Relationship to the standing altitude review

`architecture-altitude-review.md` is a *standing* epic that runs framing questions
on a cadence by hand. This spec is plausibly the **mechanical substrate that
standing review has lacked**: it turns "is the owner boundary still single?" from a
hand-run reflection into an evidence-gated Invariant that trips automatically. The
two should be unified rather than run as two standing loops; tracked as an open
question, resolved during WS1.

## 7.5 Keeping architecture docs true to the running system

Architecture docs and contracts are required to reflect the *current* state of the system. Today
`model:contracts` enforces doc↔model coherence; nothing enforces doc↔running-system coherence over
time, so a contract can stay green while the runtime has drifted out from under it. The Tier-2
live evidence closes that loop: **a BREACHED invariant is a signal that the architecture doc/contract
no longer reflects reality.** It has exactly two honest resolutions, and the restoration Quest
chooses between them:

- **the code regressed** → restore the invariant (fix the runtime), or
- **the doc was aspirational / the boundary legitimately moved** → amend the contract record,
  `invariants.json` entry, and owner map so the docs match reality again.

Either way the doc is brought back into correspondence with the system, and the closure is recorded.
This makes "architecture docs always reflect current state" a *checked* property rather than a hope.
When the machinery lands, the live-evidence tier itself is documented as a new binding in the
relevant contract records (a new probe under each contract's `metrics`), so the capability is
described where the rest of the verification tiers are.

## 8. What this is NOT

- **Not a parallel invariant registry** — it extends `architecture/contracts/invariants.json` by
  id, adding a `liveEvidence` tier. No `solve/invariants/` store.
- Not a new event log or store — status is a projection over the existing event log.
- Not a fork of the Solver — the restoration path is a normal Quest.
- Not a replacement for the formal gates — Tier 2 is complementary to `model:contracts` Tier 1.
- Not Option B (a "self-reopening Quest") — that muddies the SOLVED/EXHAUSTED
  terminal that every consumer of terminal state depends on. Invariant is a distinct
  primitive precisely to keep Quest terminals absorbing.
- Not LangGraph/foreign-orchestrator adoption — rejected by the scan.

## 9. Build order (see tasks.md)

WS0 (expressibility hard gate, the falsifiable first increment) → WS1 (declaration
+ status fold, detect-and-report only, Option C) → WS2 (trigger policy) → WS3
(auto-link + reopen budget, Option A) → WS4 (generalize to a second invariant
class; validation hooks). Each phase ships behind `LAGRANGE_STANDING_INVARIANTS`
and has its own `doneWhen`.

## 10. Risks

- **Predicate cost vs fidelity (binding).** Some invariants are only faithfully
  checkable by a full gate run, bounding cadence. WS0 exists to discover this before
  any building; if the chosen CL's `doneWhen` cannot be expressed as a cheap
  re-entrant predicate, that is a learned boundary, not a failure.
- **Registry sprawl.** Per-CL granularity is the cheapest start but could sprawl;
  per-owner-boundary is coarser/weaker. Granularity decided at WS1 against real
  predicates.
- **Auto-spawn thrash.** Mitigated by reusing `OSCILLATION_REOPEN_BUDGET`; auto-spawn
  stays default-off until WS3.
