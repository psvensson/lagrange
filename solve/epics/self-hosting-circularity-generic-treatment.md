---
id: self-hosting-circularity-generic-treatment
roadmapRow: null
status: graduated
graduatesTo: voter-readiness-visibility-single-owner-table
---

# Self-hosting circularity: one declared contract instead of N rediscovered patches

## Intent (why now)

Everything about this system is stored in the system itself (membership, placement,
operation progress, publications). That makes one bug CLASS recur: a steady-state
invariant "you need X to do Y" goes circular during formation/recovery because Y is
what produces X. The class is already named and censused (external memory
`circular-dependency-class-formation-vs-steady-state`: five cycles A–E found
2026-06-09), and the repository has paid for it repeatedly — the formation-ledger
lineage (the ledger self-move persists its own progress THROUGH the ledger being
moved), the spread-target-derived-from-current-readiness deadlock, the
CLUSTER_MEMBER_HEALTHY join cycle, the admission-gate mesh livelock. Each instance
was solved locally, expensively, and the solutions themselves have converged on a
small mechanism family that was never declared as THE generic treatment. The user
directive (2026-07-13): handle the class centrally/generically so future instances
are either impossible or have a well-known recipe.

## What the repo has ALREADY converged on (undeclared generic mechanisms)

The point fixes are not random — they are five recurring escape shapes:

1. **Owner-local durable establishment + later supersession** — the proven core
   primitive: when the self-hosted durable write cannot land, the OWNER seeds its
   locally-decided row (LWW + tombstone fence) and the still-retrying durable write
   supersedes it. Instances: bootstrap mode direct writes
   (`cdc-integration-service-lifecycle.js` `setBootstrapMode`), lever-(a)
   `applyLocalPriorityOperationProgressRow` (64a18b76), the drain extension
   (bb2a6ca2), the join deferred-seed (L-write increments 1+2a). See
   `solve/epics/control-plane-write-wedge-leader-local-establishment.md`.
2. **Exemption classes for availability-critical operations** — the cure must stay
   admissible through the hold it cures: CL-013 (ledger spread ADDs exempt from the
   self-move interlock), emergency quorum-restore ADD exemption
   (`rebalance-coordinator-ledger-interlock-admission.js:136-141`).
3. **Freshness escapes** — cache-bypassing owner-RPC reads at decision points whose
   inputs the hold itself staleness-poisons (c7a3bf19 ghost re-verify;
   the active-gate durable-revision fence).
4. **Staleness bounds** — a wedged holder is a reaper candidate, not a serialization
   holder (CL-043 step-timeout exclusion).
5. **Intent-derived targets, not readiness-derived targets** — derive goals from
   intended membership/replication factor, not from the readiness the goal is
   supposed to produce (the spread-target fix 14bbe56a; the concentration
   predicate's `totalVoters<=2 ⇒ always concentrated` is an open violation of this
   rule, live in the 2026-07-13 probe tail).

## Options under discussion

- **Option 1 — Declare the availability dependency order and make it checkable.**
  A short steering contract: system resources form a partial order (L0
  transport/raft → L1 operation ledger + publications → L2 other system tables →
  L3 user tables/services); *no operation on the availability-critical path of a
  resource may hard-require that resource's own availability* — it must use one of
  the five escape shapes above, by name. Add an analyzer/audit (grep-able seams:
  who writes to `replica_operations` during a `replica_operations`
  reconfiguration; which planning gates read the readiness they produce) that
  flags new violations. Cheapest; turns the class into a reviewable rule.
- **Option 2 — Promote owner-local establishment from opt-in call sites to the
  gateway.** Today lever-(a) coverage is per-call-site (CREATING, drain ACTIVE/
  REMOVED, join tables). Move the decision into the control-plane gateway: any
  priority-partition write whose target partition is the writer's own subject (or
  currently under reconfiguration) automatically takes the owner-local durable
  journal + CDC supersession path. One owner, no per-instance rediscovery.
  Trade-off: the L-write epic's history shows per-table safety fences
  (B4/`control_plane_publications` single-leader) — the gateway must consult an
  explicit fence table; higher blast radius than Option 1.
- **Option 3 — Formation-progress watchdog (cycle detector).** Systemic handler #5
  from the class memory: detect "no progress + mutually blocked" (two holds each
  sustaining the other's input) and surface the cycle with owners named, instead
  of a silent 300s timeout. Complements 1/2; does not itself fix anything.
- **Option 4 — Separate metadata quorum (KRaft/PD-style), i.e. stop self-hosting
  the bootstrap-critical spine.** The industry answer (CockroachDB gossips system
  config out-of-band; Kafka KRaft runs a dedicated controller quorum; TiKV puts
  placement in PD; FDB has coordinators). Named for completeness: it is a
  re-architecture, contradicts the single-substrate design premise, and the five
  escape shapes exist precisely to avoid it. Not proposed.
- **Option 5 — Centralize the semantics as data-driven decision tables (user
  directive 2026-07-13: "these central and important features should not be left
  to the periphery of parts of the system to misinterpret").** The recurring
  failure SHAPE behind CL-029/CL-035 and the 2026-07-13 fixes is peripheral code
  re-deriving a central semantic from raw rows with its own scoping: the CL-035
  seed was priority-scoped while the gate consuming it was not; the remove-safety
  gate read row `raft_role` while the promotion truth lived in the raft tracker;
  the concentration predicate conflated under-replication with placement skew;
  the deferred-local-progress coverage enumerated steps ad hoc. The codebase
  already practices the cure in places (style rule "decision tables or state
  models instead of nested independent ifs"; `OPERATION_TERMINAL_STATUSES_BY_TYPE`
  and the workflow-step progression maps in `replica-operation-progress.js`; the
  planning-gate state table; the graded-guard gate machinery; the TLC-modeled
  bounded-re-entry rule table). The option: promote the formation-critical
  semantics — voter-readiness visibility, workflow-step/persistence coverage,
  hold engagement, cure typing — into single-owner declared tables that gates and
  seeds CONSUME (one row per (semantic, partition-class, step) with the escape
  shape named), so scoping mismatches like CL-035's become impossible to express.
  Composes with Options 1-2: the availability order (1) says what may depend on
  what; the tables (5) say what each decision means; the gateway (2) enforces the
  write-path escape. Trade-off: a migration of ~5 decision sites, each currently
  working-but-idiomatic; best done one semantic per quest with red-on-revert
  pins, not as a big-bang rewrite.

## Graduation ladder (Option 5, one semantic per quest — sealed 2026-07-13)

Code census (two subagent sweeps, 2026-07-13) sized the migration surface and
found the house table idiom already normative (four-part frozen
STATE/ACTION/STATE_TABLE/ACTION_BY_STATE shape, `decision-table-v1` JSON +
`npm run model:decision-tables` cartesian-exhaustiveness, AST ratchet
`audit:guideline:decision-boundaries`, rule ARCH-0013). Ladder, in order:

1. **`voter-readiness-visibility-single-owner-table`** — LANDED 2026-07-13.
   Owner: `src/raft/replica-voter-readiness.js` (named rows: quorum_voter incl.
   candidate / load_routable excl. candidate / repair_only / catchup_learner;
   fail-closed predicates; guard test dt:prove-proven). Census analyzer
   `npm run audit:voter-readiness-owner` (alias-aware) went 15→7→0; four
   role-set declarations and both laundered learner aliases deleted; adversarial
   verifier TRUSTED-WITH-NOTES (its enum-alias refutation surfaced 9 further
   sites, migrated). Execution note: the scope-pressure precommit (6-owner-area
   quest-lifetime cap) forced the split into three bounded `process`-class child
   quests (`…-raft-node-admin`, `…-rebalancer-batch2`,
   `…-partition-raft-aliases`, `…-critical-partition-set-home`, each
   `links.parentQuest`) while the parent kept the census oracle doneWhen —
   reuse this shape for rungs 2–5, but land a checkpoint commit after EVERY
   attempt (interleaved uncommitted attempts across siblings break the
   verification exactness contract). The three local
   `CRITICAL_SYSTEM_PARTITION_IDS` re-derivations were also deleted
   (single home: `system-partition-classification.js`); rung 5 still owns the
   remaining 119-site critical→priority→default ladder.
2. **Workflow-step persistence coverage** — LANDED 2026-07-13 (quest
   `step-coverage-single-owner-table` + 2 bounded children). Owner:
   `src/rebalancer/replica-operation-step-policy.js` (30+ named coverage rows
   side by side; the CL-029 wake-preempt row and the incident-per-row
   deferred-local-progress table are now single declarations; the triplicated
   COMPLETION_STEPS unified). Census `npm run audit:step-coverage-owner`
   52→0 (7 reasoned exclusions: budget scalars deferred to their own rung,
   bookkeeping/action-routing/forensic non-coverage piles). Guard test
   dt:prove-proven; adversarial verifier TRUSTED-WITH-NOTES. Deferred:
   step→timeout/budget scalars (rung 2b candidate); dead COMPLETION_STEPS
   wrapper exports (cleanup finding).
3. **Hold engagement** — LANDED 2026-07-13 (quest
   `hold-engagement-single-owner-table`, single quest, no children needed).
   Owner: `src/rebalancer/operation-ledger-hold-policy.js` (the
   (hold × move class) → {exempt | idle_only | defer} relation; named rows:
   disruptive self-move {REPLACE,REMOVE} with the CL-013 ADD omission made
   explicit, emergency quorum-restore ADD exemption declared once instead of
   twice, quorum-spread cure REPLACE; move classifier; fail-closed DEFER).
   `operation-ledger-quorum-concentration.js` stays the policy-free
   hold-state owner. Census `npm run audit:hold-engagement-owner` 10→0
   (4 AST kinds: ledger conjuncts, emergency exemption reads, raw hold-state
   reads, cure classifiers; 7 sibling-admission-hold sites are committed
   reasoned exclusions). Guard test dt:prove-proven; `decision-table-v1` row
   spec `docs/specs/decision-tables/operation-ledger-hold-engagement.json`;
   adversarial verifier TRUSTED-WITH-NOTES (notes: owner ingress
   case-normalization is a strict superset only on production-unreachable
   inputs, CL-013 precedent; analyzer escapes need deliberate evasion).
   Follow-up seeded for rung 4 / a 3b batch: the censused sibling-hold
   exempt rows (priority-budget lanes C1-C5, pressure holds E1-E2, ordinary
   serial gate F1, serial-wait lane G1-G3) share the defect shape.
4. **Cure typing** — LANDED 2026-07-13 (quest `cure-typing-single-owner-table`
   + 2 bounded children `…-move-minters` / `…-admission-lanes`). Owner:
   `src/rebalancer/replica-placement-cure-policy.js` (condition → {moveType,
   moveReason} rows: under_representation ADD, failed_replica / node_not_in_target /
   over_representation REMOVE, paired_relocation / unhealthy_source_at_target
   REPLACE; the 2b5875b0 follow-up conjunct owned as
   `classifyPriorityRecoveryFollowUpCureCondition`; cure budget-scope rows +
   plan-aware resolver; ordinary-serial-lane cure move membership; fail-closed
   null — no row, no mint) with the admission partition-class classifier
   `classifyPriorityRecoveryAdmissionPartitionClass` living in
   `priority-recovery-admission-constants.js` (the lane vocabulary home —
   importing it into the rebalancer owner from inside
   `rebalance-coordinator-shared`'s import tree was proven a TDZ cycle and
   `CONCURRENT_CREATE_BUDGET_SCOPE` moved to `rebalancer-constants.js`), and
   the admission-plan owner's `getPartitionClass` delegating to it. Census
   `npm run audit:cure-typing-owner` 15→8→0 (7 cure_move_type_mint across
   calculateMoves + buildPriorityRecoveryFollowUpMove; 8 admission_lane_conjunct
   across 6 budget/admission helpers; 3 schema-provisioning intent-derived
   exclusions). Guard test dt:prove-proven; two `decision-table-v1` specs
   (replica-placement-cure-condition, placement-cure-admission-lane).
   Adversarial verifiers: owner TRUSTED-WITH-NOTES, minters TRUSTED, lanes
   TRUSTED-WITH-NOTES (differential truth-table harness, 0 reachable
   divergences; notes: whitespace-only budget partition_id and lowercase
   scope-seam move types are unreachable-today divergences, the latter closing
   a CL-013-style case fail-open). No typing GAP found during migration.
5. **Partition-class ladder sweep** — LANDED 2026-07-13 (quest
   `partition-class-ladder-single-owner-table` plus bounded owner-area,
   analyzer-hardening, evidence, and integrity-migration children). Owner:
   `src/bootstrap/system-partition-classification.js`, whose frozen ordered
   decision table and `classifySystemPartition` outcome preserve the deliberate
   critical/priority overlap while emitting one canonical ordered class. The
   contract-v3 census `npm run audit:partition-class-owner` reconciles the epic
   baseline as 122 predicate edges + 3 direct critical-set memberships - 6
   duplicated two-edge OR ladders = 119 decision sites; bounded migrations moved
   the parent census 119→114→105→103→0, with the final 30 owner-execution sites
   landed in `929fc05b` and the committed parent oracle persisted at raw /
   collapsed 0/0 in `2bfa1cdb`. No classification GAP or behavior change was
   found. Rejected analyzer receipts drove a fail-closed AST/data-flow hardening
   sweep (renamed/member/parameter aliases, destructuring and object rest,
   rebuilt/spread/copied Sets, static snapshots/overrides, templates/concat and
   nested flow); the final source checkpoint `f41bb40f` keeps all five analyzer
   modules below 800 lines and passed 63 reconstructed adversarial cases, 123
   focused assertions (68 analyzer + 55 owner), lint, zero dependency
   violations, cycle ratchet 0/0, model contracts, and the live gated 0/0 census
   under independent isolated verification. The legacy pre-v2 parent trail and
   stabilized model receipt were preserved through bounded archives
   `390b79b8` / `cd67cb90` and the clean replacement handoff authority
   `partition-class-ladder-single-owner-table-integrity-migration`
   (`18f91194`). The remaining legacy census-proof child was superseded by the
   same independently approved stable aggregate and closed under its bounded
   integrity migration in `fe1f3def`.

Each quest carries red-on-revert pins; behavior changes only with their own pin
+ finding. Options 1 (availability order + analyzer) and 2 (gateway
establishment) graduate separately after ladder rung 1 seeds the evidence.

## Open questions

- Which of Options 1–3 graduate to a spec first? (Recommendation: 1 now — it is a
  steering+analyzer change; 2 after the current formation-ledger quest closes, so
  its evidence seeds the fence table; 3 opportunistically.)
- Option 1's order: is L1 `operation ledger + publications` one layer or two
  (B4 single-leader publications may need to sit above the ledger)?
- The concentration predicate's `totalVoters<=2` unconditional-concentration is a
  live Option-1 violation (readiness-derived target). Fix inside the current quest
  lineage or as the first Option-1 enforcement case?
- What is the minimal analyzer that catches cycle-shaped regressions without a
  full dependency-graph extraction (candidate: assert-at-runtime "hold X engaged
  for >T while the operation class that clears X is deferred BY X" — the
  self-sustaining-hold detector)?

## Decision log

- 2026-07-13 — Epic authored on user directive after the formation-ledger dig
  re-hit the class (ledger self-move progress writes through the mid-reconfig
  ledger; hold predicate unsatisfiable at ≤2 voters). Inventory of the five
  in-repo escape shapes compiled from the class memory, the L-write epic, and the
  interlock/quorum-concentration source.
- 2026-07-13 (rung 3) — `hold-engagement-single-owner-table` SOLVED same-day:
  census analyzer committed first (baseline 10), owner module + three
  consumer migrations landed as one verified attempt (TRUSTED-WITH-NOTES),
  handoff commit `943b6993` + companion `33ec0cd4` (the handoff's path list
  missed the attempt's NEW untracked files — owner, guard test, spec, oracle;
  process note for rung 4: verify the handoff commit includes created files).
- 2026-07-13 (rung 4) — `cure-typing-single-owner-table` SOLVED same-day with
  the rung-1 parent/children shape: census analyzer committed first (baseline
  15, commit `691a7565`), parent authored the owner + guard test + specs
  (verifier TRUSTED-WITH-NOTES), children migrated the 7 move mints and the
  8 lane conjuncts (verifiers TRUSTED / TRUSTED-WITH-NOTES via a differential
  truth-table harness). Process notes: trap-6 (checkpoint missing NEW files)
  recurred on all three quests — companion commits landed each time; the
  shared-first import-order TDZ smoke (`node -e "await import(...shared...)"`)
  is now a standing check for any new owner module that reads the
  `REBALANCE_COORDINATOR_SHARED` aggregate.
- 2026-07-13 (rung 5) — `partition-class-ladder-single-owner-table` completed
  the Option-5 ladder: all 119 peripheral critical→priority→default decisions
  now consume the ordered system-partition classification owner, and the
  contract-v3 parent census is committed at raw/collapsed 0/0. Independent
  adversarial review repeatedly rejected incomplete census receipts, producing
  the final split analyzer and 63-case historical attack corpus rather than a
  weak zero. Final source/evidence commits are `f41bb40f` / `2bfa1cdb`;
  same-base attempt 8 was verified without allowing report-producing gates to
  mutate the reviewed worktree. Because the original parent contained pre-v2
  integrity history and cumulative scope, attempts 1–8 were archived in two
  bounded Quests (`390b79b8`, `cd67cb90`) and a new clean migration Quest
  committed the parent declaration/log/report plus stabilized model evidence
  (`18f91194`). The final legacy census-proof child and its rejected predecessor
  receipt were preserved and superseded under a bounded integrity migration
  (`fe1f3def`). Option 5 is complete; future partition-class derivations are
  enforced by `audit:partition-class-owner`.
- 2026-07-13 (later) — GRADUATED on user directive ("pick up the quest(s) that
  generalize the logic to be data-driven; don't finish the formation-ledger
  lineage the old way"). Two code-census sweeps sized the surface (see
  "Graduation ladder"); first quest
  `voter-readiness-visibility-single-owner-table` authored with an
  oracle-probe doneWhen (committed census analyzer counts independent
  derivations outside the owner; done at 0). The open formation-ledger quest
  stays open with a pivot finding; its residual (load-phase schema-job op
  confirmation) is not chased as point fixes while the ladder runs.
- 2026-07-28 — `audit:guideline:literals` baseline upward re-anchor (silently-red
  exception, release-gate.md "one-way ratchet"). The required CI gate had been
  red at `audit:current-capabilities` (stale generated capabilities doc plus
  outdated architecture-evidence anchors) for the recent push range, so the
  literal-guideline audit never ran on those pushes and 499 non-baseline
  violations landed unmeasured on top of the 2006 inherited ones (top sources:
  recent solver/quest tooling under `scripts/solve/` and owner-census
  analyzers). Baseline re-anchored at measured reality via
  `node scripts/check-guideline-literals.js --update-baseline` run in a clean
  worktree at the re-anchor commit (so concurrent in-flight session files
  could not leak in); dated in-code comment at the baseline constant in
  `scripts/check-guideline-literals.js` names the measured value and keeps the
  refactor target (hoist raw literals into named constant owners). One-time
  exception for this gate; future increases fail the audit again.
- 2026-07-28 (same sweep) — `audit:guideline:decision-boundaries` baseline
  upward re-anchor under the same silently-red exception and with the same
  clean-worktree procedure as the literals re-anchor above: 42 non-baseline
  violations (top sources: snapshot-install/bootstrap-owner work and recent
  solver tooling) on top of 813 inherited; re-anchored at measured 855. Dated
  in-code comment at the baseline constant in
  `scripts/check-guideline-decision-boundaries.js`. Also fixed in the same
  sweep rather than re-anchored: `audit:doc-audience` (two architecture docs
  embedded Solver spec paths; reworded to plain provenance) and
  `steering:check` (regenerated packs/indexes after the post-push gate npm
  scripts were added).
