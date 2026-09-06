---
id: golden-capability-gold-plating
status: done
proof: deterministic
legacy: true
roadmapRow: null
graduatesTo: null
quests:
  - bootstrap-mode-routing-property-repair
  - failed-authoritative-read-admission-invariant
  - model-tlc-mode-selection
  - planner-retention-admission-hold-model
  - priority-partition-census-artifact-identity-closure
  - priority-recovery-census-diagnostic-pass-through
  - priority-service-publication-census-model
  - priority-spread-cold-boot-dt
  - reservation-reconcile-query-operation-binding
  - service-init-cli-scaffold-contract-repair
  - solver-operator-workflow-land-regressions-v2
  - solver-operator-workflow-land-regressions
authorizes: []
legacyStatus: resolved
---

# Epic: gold-plate the once-achieved capabilities (stop the flip-flop tax)

Status: CLOSED (2026-08-13). Opened as a decision memo on 2026-08-11. Source: full-history archaeology sweep
after the three 2026-08-11 landings (`ed0ad3643` binding-digest restamp,
`60b8d0b6b` marker-clear integrity, `d999ca2d4` spread-cure hold exemption),
prompted by the maintainer's question: "have these symptoms been fixed before;
is there hidden flip-flopping; how do we protect the functioning parts?"

## The evidence (verified, cited in the sweep report)

- **One symptom, nine fixes.** "Joiner priority replica invisible to the spread
  census" has 6 distinct fixes at the strict class (CL-016 `13b61f81a` →
  CL-021(A) `137512e42` → corrections `7b99e8056` → raft_role preservation
  `701db25fa` → CL-035 `e76f0ac09` → `60b8d0b6b`), 9 counting adjacent
  row-publication defects. The unconditional marker-clear stood 61 days.
- **One property, ~21 mechanisms.** "Spread converges on a cold boot" has
  accumulated ≈21 distinct mechanisms since June, 2 fully reverted
  (`dd8c0be1c` reverting `c98faf4b1` + `d2bce970c`), and **nine
  escapes/exemptions on one admission path** — three of them successive
  widenings of the same escape (ledger-only → all priority partitions → past
  the over-target hold).
- **FF-1, the decisive flip-flop:** `814f547e0` (06-28) shipped the over-target
  hold with a written, verified safety proof ("REMOVE always proceeds → the
  hold is transient, never a deadlock"). `6a67d26c3` (08-10), a planner change
  in a different file, deleted that premise (yields the REMOVE, retains one
  cure ADD). Static deadlock; production spread pinned at 2/3; nothing in the
  system noticed for 44 days. `d999ca2d4` is the counter-carve.
- **FF-2:** a 2026-06-12 gate verdict inferred "the durable rows EXIST" from
  log-absence (forbidden by the census epic's own guardrail #1), which
  disarmed the CL-021 reconcile mechanism for 61 days.
- **G1, the amplifier:** the DT added alongside `6a67d26c3`
  (`test/rebalancer/critical-spread-terminal-stall-repro.test.js:310`) asserts
  the retained cure ADD "must be ADMITTED" — and passed while production
  deadlocked, because its fixture makes every authoritative services read
  unavailable and the hold **fails open** on exactly that. GOV-0053's failure
  mode, inverted, one day after GOV-0053's precedents were re-cited.
- **The model that predicted it sat unused:** `CoupledAdmission.tla` proved in
  June that single-owner patches bounce on coupled invariants; neither of
  today's two coupled pairs (publication↔census, planner-retention↔admission-
  hold) is registered as a model rung. Registration is optional (G8).

## Diagnosis

The *diagnostic* discipline is genuine layer peeling (surfaces move forward and
never return; mechanistic deltas, honest records). The *fix architecture* is
whack-a-mole, and the boundary is precise: every flip-flop happened where a
local invariant's premise is an **unowned cross-module fact**:

1. "the planner will emit a REMOVE" (FF-1)
2. "a non-throwing write is a durable write" (FF-2 / G2)
3. "the later guard will re-check this" (G3 — caller ordering unasserted)
4. "a green DT means the live path is covered" (G1 — fixture-blinded gate)

Prose steering did not and cannot hold these; only machine checks held today
(Solver refusals, ratchets, lint). Rule: **a steering rule protecting a
critical invariant is real only if it has an enforcing command** (the Canonical
Guardrail Command Map is the pattern; the verification-templates anti-theater
rule is the precedent).

## Candidate quests, ranked by leverage (each bounded)

- **GP-1 (G1, trivial):** add an over-target variant to
  `critical-spread-terminal-stall-repro.test.js` with the authoritative read
  AVAILABLE, so the admit-through-the-real-hold path is red-on-revert. One
  fixture change; would have caught F3 a day early.
- **GP-2 (G3):** structural assertion that `ensureCriticalPartitionCreateLaneAvailable`
  precedes `ensureCreateTopologyGuardAllowed` (the exemption's safety premise),
  plus a target-node-alive conjunct or an explicit deferral note.
- **GP-3 (G2):** single owner for "did this mutation apply" over the frozen
  7-value outcome enum + exhaustiveness test; today four classifiers disagree
  (`didDurableServiceRowWriteApply`, `didConfigSeedInsertApply`,
  join-admission outcomes, raft mutation vocabulary).
- **GP-4 (G4):** census emits `expectedReplicaCount` + a `row_absent`
  pseudo-reason so absent-row blindness is self-diagnosing (empty
  `exclusionReasonCounts` cost a full live-run forensic).
- **GP-5 (G5):** a cold-boot spread-convergence DT on the virtual-network
  substrate — the end-state "priority partitions reach 3 distinct nodes from a
  cold 3-node boot", deterministic, in the push gate. Today this exists only
  as live runs.
- **GP-6 (G8, governance):** any fix whose safety argument names another
  module's behaviour MUST register the coupled pair as a model rung or a
  cross-module guard test — enforced at `land` (Solver check), not prose.
- **GP-7 (G7):** wire the guard-scenario runners (76 exist; 0 in CI) into a
  gate tier; backfill runners for CL-016/021/035/038/043 and `814f547e0`.
- **GP-8 (G9):** state the read-availability invariant: what admission may
  conclude from a failed authoritative read (fail-open holds are the common
  denominator under this family).

## Decision and closure (2026-08-13)

The maintainer authorized this epic ahead of the public-path streak. All eight
gold-plating outcomes are now represented by terminal Quest evidence:

- **GP-1:** `priority-spread-cure-available-read-guard` is SOLVED.
- **GP-2:** `priority-spread-cure-guard-ordering-contract` is SOLVED.
- **GP-3:** the mutation-outcome owner and consumer chain is SOLVED, including
  `raft-authoritative-row-mutation-outcome-classifier`,
  `bootstrap-join-admission-mutation-outcome-consumer`,
  `control-plane-mutation-apply-classifier`, and
  `control-plane-mutation-aggregate-guard`. Superseded broad parent frames are
  EXHAUSTED rather than falsely landed.
- **GP-4:** the census self-diagnosis work is present at the exact, independently
  approved 11-path fingerprint landed by
  `priority-partition-census-artifact-identity-closure`. Its rejected and
  superseded parent frames are EXHAUSTED with decomposition provenance.
- **GP-5:** `priority-spread-cold-boot-dt` is SOLVED and its deterministic guard
  is part of the push-gate corpus.
- **GP-6:** the governance choice is **yes**: coupled safety premises are
  registered and enforced at Solver landing by the solved coupled-pair registry,
  witness, proof-cone, and landing-enforcement chain. Narrow superseded proof-cone
  parent frames are EXHAUSTED; the runnable consumer and emitted-module successor
  closures are SOLVED.
- **GP-7:** `golden-capability-guard-scenario-gate-wiring` is SOLVED. Its single
  runner covers the named CL-016/021/035/038/043 and `814f547e0` witnesses and is
  wired into both project-hardening proof manifests.
- **GP-8:** `failed-authoritative-read-admission-invariant` is SOLVED with the
  machine-readable availability verdict contract and red-on-revert witnesses.

Two incidental pre-push drafts were also resolved: the reservation reconcile
and monotonic-drain fixtures were repaired under
`reservation-reconcile-query-operation-binding`, while
`service-init-cli-scaffold-contract-repair` closed without a patch because three
fresh runs proved its sealed mismatch absent on current HEAD.

No product work remains in this epic. Future regressions belong in a new Quest
linked to the specific guard or owner contract that failed, not by reopening a
superseded parent frame.
