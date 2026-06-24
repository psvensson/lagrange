# Requirements Document: Standing Invariant Closure

## Introduction

This spec graduates the epic `quest-standing-invariants.md` (rationale and the
build-vs-adopt evidence live there and in `continuous-ai-workflow-landscape.md`).

The Quest workflow proves a sealed `doneWhen` against live evidence and then
**terminates** (SOLVED/EXHAUSTED). Closure is a one-shot, absorbing state. That is
correct for episodic goals and wrong for architecture over time: a result, once
SOLVED, is assumed to stay solved, but architectural invariants **erode** — the
raft-safety fixes (CL-040/041/042) can regress, "membership truth has one owner"
can drift back toward the multi-source merge. The closure ledger today is a
registry of *closed* records (tombstones), not *live guards*.

This spec adds a second, standing primitive — an **Invariant** — that is the
episodic/standing dual of a Quest over the *same* predicate-vs-live-evidence core.
An Invariant asserts that a property **continues to hold** and is re-verified on a
trigger; a regression is detected as a state transition and drives a restoration
Quest. This is the in-house generalization of the project's distinctive
evidence-gated-closure capability — the deep-research scan found nothing OSS or
commercial that models it better, so the evolution is to extend it, not replace it.

The two patterns the scan found **nothing** in the field covers — agent-driven
**architectural-decision-record (ADR) tracking** and **architectural drift/erosion
detection** — both fall out of this primitive and are in scope as consequences, not
as separate machinery.

## Problem Statement

1. A SOLVED Quest carries no obligation to *stay* solved; nothing re-verifies it.
2. The closure ledger records closure as terminal; it cannot represent a closed
   property that has since regressed.
3. Architectural decisions (ADRs) and their verification live in separate
   artifacts that drift apart — a decision can be silently violated with no signal.
4. Drift/erosion is detected today only by a human noticing a re-failing gate, not
   by the workflow itself.

These are one design gap: **closure has no maintained form.**

## Architectural Thesis

Lift the `doneWhen` evaluator out of the Quest terminal check into a standing,
re-entrant **evidence gate**. The system then has two primitives over one shared
core (a declarative predicate folded over the event log):

1. **Quest** (exists) — episodic. `doneWhen`, evaluated once to decide termination.
2. **Invariant** (new) — standing. `holdsWhen`, evaluated recurrently on a trigger to
   decide status; never closes. An Invariant is *a closure-ledger entry that never
   closes.*

**There is no new invariant registry.** The project already owns the declarative
half: `architecture/contracts/invariants.json` (`invariant-registry-v1`) holds
owner-scoped safety/liveness invariants (id, owner, boundary, kind, statement,
`formalPredicate`, `modelRef`, `contractRef`), verified today against *formal models*
via `npm run model:contracts` / `model:invariants`. This spec adds a **second
verification tier — against live evidence** — by attaching a `liveEvidence` predicate
to existing entries (cited by id) and deriving status as a **projection** over the
event log, exactly as `status` and `report` are derived today.

## Glossary

- **Invariant**: An existing `architecture/contracts/invariants.json` entry, extended
  with a live-evidence `holdsWhen` predicate so it becomes a standing assertion verified
  against the running system, with a derived status. The standing dual of a Quest. The
  entry's `contractRef` is its anchoring decision (its ADR).
- **Tier 1 / Tier 2 verification**: Tier 1 (exists) verifies an invariant's
  `formalPredicate` against formal models (Alloy/TLA+/statechart) via `model:contracts`.
  Tier 2 (this spec) verifies its `liveEvidence.holdsWhen` against the event log. Same
  id, complementary tiers.
- **`holdsWhen`**: The Invariant's sealed predicate, evaluated as a fold over live
  evidence (the event log / a deterministic repro), reusing the `doneWhen` evaluator.
- **Invariant status**: One of `UNGUARDED` (declared, no passing evidence yet),
  `HELD` (passed at last evaluation), `BREACHED` (failed at last evaluation).
- **Breach falsifier**: The recorded evidence of a `HELD → BREACHED` transition,
  using the existing falsifier vocabulary.
- **Restoration Quest**: A Quest auto-spawned and linked when an Invariant becomes
  `BREACHED`, whose `doneWhen` is "the breached Invariant returns to HELD."
- **Trigger policy**: The declared rule for *when* an Invariant is re-evaluated
  (on relevant Quest closure / on touched owner / on cadence / on explicit re-check).
- **Anchoring decision (ADR)**: The decision + rationale an Invariant operationalizes;
  the Invariant record IS the living, continuously-checked form of that ADR.

## Requirements

### Requirement 1: A Standing Invariant Primitive

**User Story:** As a maintainer, I want to declare that an architectural property
must continuously hold, so that a regression is a detected event, not a surprise.

**Rationale:** Closure today is terminal; architecture needs a maintained form.

#### Acceptance Criteria

1. THE system SHALL define an `Invariant` as a sealed declaration carrying a
   `holdsWhen` predicate, an anchoring decision, and a trigger policy.
2. THE Invariant SHALL reuse the existing `doneWhen` predicate evaluator for
   `holdsWhen`; it SHALL NOT introduce a second, divergent evaluation path.
3. An Invariant SHALL have exactly one status in `{UNGUARDED, HELD, BREACHED}` at
   any time, derived from its last evaluation against live evidence.
4. An Invariant SHALL NOT have a terminal/absorbing state; it remains re-gateable
   for its lifetime.

### Requirement 2: Invariant Status Is A Projection, Not New Storage

**User Story:** As a maintainer scarred by projection-of-a-projection and
secondary-cache bugs, I want Invariant status derived from the single source of
truth, not stored in a parallel place that can drift.

**Rationale:** The active-node-merge mess and the avoid-secondary-caches directive
both forbid a new authoritative store for derived state.

#### Acceptance Criteria

1. Invariant status SHALL be computed as a fold over the existing Solver event log
   (and, where a predicate requires it, a deterministic repro), not read from a new
   authoritative store.
2. THE only durable Invariant declaration SHALL be its existing
   `architecture/contracts/invariants.json` entry (plus the additive `liveEvidence`
   block); status and history SHALL be derived, not stored on the entry.
3. No runtime path SHALL treat a cached Invariant status as authoritative over the
   event-log-derived value.

### Requirement 3: Drift Detection Is The HELD→BREACHED Transition

**User Story:** As a maintainer, I want erosion detected by the workflow itself, so
a regressed fix surfaces without a human re-noticing a failing gate.

**Rationale:** Drift/erosion detection is a pattern the field does not cover; here
it is a consequence of re-evaluation, requiring no separate detector.

#### Acceptance Criteria

1. WHEN a re-evaluation of a `HELD` Invariant fails, THE system SHALL transition it
   to `BREACHED` and record a breach falsifier with the failing evidence.
2. WHEN a re-evaluation of a `BREACHED` Invariant passes, THE system SHALL
   transition it to `HELD`.
3. THE system SHALL NOT require a dedicated drift detector separate from the
   `holdsWhen` re-evaluation.

### Requirement 4: An Invariant Anchors A Living ADR

**User Story:** As a maintainer, I want each architectural decision to carry the
predicate that verifies it, so decisions cannot be silently violated.

**Rationale:** ADR tracking is uncovered by the field; an Invariant unifies the
decision and its verification into one continuously-checked object.

#### Acceptance Criteria

1. THE Invariant declaration SHALL carry its anchoring decision and rationale.
2. THE Invariant's current status SHALL be readable as the live verification state
   of that decision.
3. Closing the loop, a closed CL that expresses a durable property SHALL be
   promotable to a standing Invariant without re-deriving its evidence model.

### Requirement 5: Breach Drives Restoration Under The Existing Reopen Budgets

**User Story:** As an operator, I want a breach to drive repair to closure, but
without auto-spawn storms.

**Rationale:** Detecting drift without driving restoration loses the point; an
unbounded auto-spawn re-creates oscillation thrash.

#### Acceptance Criteria

1. WHEN an Invariant transitions to `BREACHED`, THE system SHALL link (and, when
   enabled, auto-spawn) a restoration Quest whose `doneWhen` is the Invariant
   returning to `HELD`.
2. Invariant-driven restoration Quests SHALL be subject to the existing
   oscillation/reopen budgets (`OSCILLATION_REOPEN_BUDGET`).
3. WHEN a restoration Quest reaches SOLVED, re-evaluation SHALL be the sole arbiter
   of the Invariant returning to `HELD` (a SOLVED Quest SHALL NOT directly set
   `HELD` without passing `holdsWhen`).

### Requirement 6: Trigger Policy Is Declared And Cost-Bounded

**User Story:** As a maintainer, I want re-evaluation cadence matched to predicate
cost, so cheap invariants check often and expensive ones do not dominate a gate.

**Rationale:** The binding constraint is that some predicates only check faithfully
via a full gate run; the trigger policy must be explicit, not implicit.

#### Acceptance Criteria

1. EACH Invariant SHALL declare a trigger policy drawn from {on relevant Quest
   closure, on touched owner/file, on cadence, on explicit re-check}.
2. THE system SHALL support at minimum the `on-Quest-closure` trigger as the
   default, cheap path.
3. WHERE a `holdsWhen` requires an expensive harness run, THE Invariant SHALL
   declare that cost so its trigger is bounded to a cadence rather than every event.

### Requirement 7: Default-Off, Hard-Gated Rollout

**User Story:** As an operator, I want this introduced safely behind a flag and
proven on a known-regressible invariant before generalizing.

**Rationale:** New control flow (trigger policy + auto-link) is real scope; it must
land default-off and be falsifier-proven.

#### Acceptance Criteria

1. THE standing-invariant machinery SHALL be gated behind a default-off flag
   (`LAGRANGE_STANDING_INVARIANTS`).
2. THE first proof SHALL be a revert round-trip on an already-closed,
   deterministically-reproducible CL (e.g. CL-041/042): reverting the fix flips the
   Invariant to `BREACHED`; restoring it returns it to `HELD`.
3. Generalization beyond the first invariant SHALL NOT proceed until the
   expressibility gate (Task WS0) has a written PASS.

### Requirement 8: Extends The Architecture Invariant Registry, Not A Parallel One

**User Story:** As a maintainer who has been burned by parallel authorities, I want
the live tier to reuse the existing invariant registry, so there is one place an
invariant is declared.

**Rationale:** `architecture/contracts/invariants.json` already exists and is cited
by id from contract records and Quest theory metadata. A second registry would
collide with it (the membership-merge / avoid-secondary-store lesson).

#### Acceptance Criteria

1. A live-verified invariant SHALL be an existing `invariants.json` entry extended
   with an additive `liveEvidence` block; THE system SHALL NOT introduce a separate
   invariant registry.
2. THE live tier SHALL reference invariants by their existing `id`; restoration
   Quests SHALL link through the entry's existing `questRefs`.
3. `npm run model:invariants` SHALL continue to validate the registry with the
   `liveEvidence` block present (the block is additive and optional per entry).
4. THE live-evidence tier SHALL be complementary to the formal-model gates
   (`model:contracts` / `model:invariants`), not a replacement for them.

### Requirement 9: Breach Means The Architecture Doc No Longer Reflects Reality

**User Story:** As a maintainer, I want architecture docs to *always* reflect the
current system, enforced mechanically rather than by vigilance.

**Rationale:** `model:contracts` enforces doc↔model coherence; nothing enforces
doc↔running-system coherence over time. A BREACHED live invariant is precisely that
missing signal.

#### Acceptance Criteria

1. WHEN a live invariant is `BREACHED`, THE system SHALL treat it as evidence that
   the architecture doc/contract no longer reflects the running system.
2. THE restoration Quest SHALL resolve a breach by exactly one of: (a) restoring the
   runtime so the invariant holds, or (b) amending the contract record,
   `invariants.json` entry, and owner map so the docs match the changed reality.
3. WHEN a breach is resolved by doc amendment (b), THE change SHALL keep the formal
   tier (`model:contracts`) green so the model and doc stay aligned.

## Out Of Scope (this spec)

- Grafting an external memory layer (Letta/Mem0) under the Solver — tracked as a
  later, optional graft in the epic; not required for the core primitive.
- Adopting EvoClaw/SWE-EVO as an external scoring harness — a validation activity,
  not part of building the primitive.
- Replacing or re-platforming the Solver onto LangGraph or any external orchestrator
  — explicitly rejected by the landscape scan.
