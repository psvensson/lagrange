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

The only durable artifact is the sealed declaration (analogous to a Quest JSON):

```jsonc
// solve/invariants/<id>.json   (sealed; status is NOT stored here)
{
  "id": "INV-raft-election-safety",
  "decision": "At most one leader per term (Raft Election Safety).",
  "rationale": "CL-041 closed a vote double-vote TOCTOU; the property must not regress.",
  "anchors": ["CL-041", "CL-042"],          // closed CLs / ADRs this guards
  "holdsWhen": { /* sealed predicate, same grammar as doneWhen */ },
  "evidence": { "kind": "repro", "ref": "npm run repro -- CL-041" },
  "trigger": { "policy": "on-quest-closure", "scope": "owner:raft", "cost": "cheap" },
  "restoration": { "autoSpawn": false }      // Option C first; flip on at WS3
}
```

Everything else — current status, breach history, linked restoration Quests — is a
**fold over the Solver event log** (Requirement 2). The registry view
(`status --invariants`) is derived exactly like `report` is today. No new
authoritative store; this is the explicit guard against the active-node
projection-of-a-projection antipattern and the avoid-secondary-caches directive.

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

## 8. What this is NOT

- Not a new event log or store — a projection over the existing one.
- Not a fork of the Solver — the restoration path is a normal Quest.
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
