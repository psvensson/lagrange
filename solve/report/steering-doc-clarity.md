# Solve report: steering-doc-clarity

**Goal:** The 17 audited steering-doc clarity issues are resolved (or explicitly deferred): packs are labeled as priority subsets, core.md is self-sufficient for first-read vocabulary, stop-conditions/ladder/ownership are stated once, dangling refs and reworded duplicates are fixed; steering:check regenerates green, no GOV/ARCH/TEST id remaps without citation updates, and the diff is subagent-verified.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/steering-doc-clarity.json

**Attempts:** 0

## Links
- plan: .kiro/epics/steering-doc-clarity.md

## Current Blocker
- Frontier: mechanical-fixes
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for mechanical-fixes

## Continuation
- Status: allowed
- Next action: continue supervised step for ownership-map
- Blocker: none

## Scope Pressure
- Changed files: 0
- Owner areas: none
- Categories: none
- Signals: none

## Frontiers
- **mechanical-fixes** [open] rung 0, attempts 0, metric ? -> ?
- **pack-hygiene** [open] rung 0, attempts 0, metric ? -> ?
- **framing-and-vocab** [open] rung 0, attempts 0, metric ? -> ?
- **ownership-map** [open] rung 0, attempts 0, metric ? -> ?

## Findings
- **mechanical-fixes**: Batch 1 mechanical fixes landed (no pack regen needed): WP-C runbook strategy ladder now matches solver-quests.md (observe rung added, docs/solver-runbook.md:26-33); WP-E2 boot.md notes --yes only auto-advances non-terminal gates, not the autonomy stop-triggers; WP-H#15 operational-ground-truth.md split 'Two standing defaults' into research-first + subagent-verify bullets and AGENTS.md parenthetical aligned to 7 traps. [docs/solver-runbook.md; .kiro/steering/llm/boot.md; .kiro/steering/operational-ground-truth.md; AGENTS.md]
- **pack-hygiene**: WP-G#10 fixed: generator stripInlineMarkdown italic-underscore regex now uses word-boundary lookaround so snake_case (MAX_CYCLES, THEORY_REQUIRED) is preserved; GOV-0047/0048 render correctly. Verified zero ID renumbering (ID set identical to baseline; 6 text lines changed) and regen is idempotent. [scripts/generate-steering-llm-pack.js:226-229; .kiro/steering/llm/rules-index.md:211-212]
- **pack-hygiene**: WP-G#11 REVISED by investigation: TEST-0035/TEST-0036 are NOT true duplicates but two distinct remediation steps (harness.md:58 'identify root cause' / :59 'resolve'); the generator prepends the full normative preamble (harness.md:56) to each child bullet, so each rule body repeats the preamble and the rules-index leading-text summary shows them as identical. Fix is a design choice (generator child-bullet handling vs source restructure vs index-summary distinguishability) with TEST ID renumbering risk — needs decision before implementing. [rules.json TEST-0035 len539 / TEST-0036 len552 share preamble prefix; harness.md:54-59]
- **pack-hygiene**: WP-G + testing-domain WP-H complete. #11 resolved via source restructure (harness.md duration steps demoted to prose; identical-summary TEST dup gone). #13 thresholds explicit (2s/30s, no 'couple of seconds'). #12 ruleAliases populated for 4 pairs (canonical_of verified: ARCH-0006/0007->STYLE, ARCH-0047->ARCH-0026, TEST-0030->STYLE-0007). #14 regression-policy §1.10->§9, §1.13->§11. #17 'enough times'/'semantic boundary'/'classification-only all of'/'task list' tightened. Regen idempotent; GOV/ARCH id->text stable except intended #10 snake_case renders; ARCH-0091 stable. [.kiro/steering/testing-guidelines/{harness,regression-policy,proof-ladders,release-gate}.md; .kiro/steering/llm-pack.config.json; scripts/generate-steering-llm-pack.js]
- **framing-and-vocab**: Batch 3 complete. WP-A: each generated domain pack now emits a 'Priority subset / Complete pack' header (generator renderPackMarkdown + domainTotal); renderReadme 'canonical execution-time surface' softened to priority-subset and bogus 'lane vocabulary aliases' fixed to 'Quest vocabulary pointer'; AGENTS.md + core.md note packs are a capped subset. WP-B: canonical first-read glossary added to core.md (Quest/doneWhen/frontier/attempt/finding/theory/park/owner/sealed/proof-ladder/subagent/probe/gate-states), boot.md vocab now points to it, solver-quests.md contract points to glossary. WP-D: solver-quests stop-triggers reworded to the four named core.md conditions (GOV-0074 stable, no remap). WP-E: core.md goalpost must-not carves out gradient refinement. WP-H#16: solver-quests links full CLI (frontier/trace/promote-finding/ingest-evidence/step phases). Regen idempotent; GOV/ARCH IDs stable; aliases still suppressed. [scripts/generate-steering-llm-pack.js; .kiro/steering/llm/{core,boot}.md; AGENTS.md; .kiro/steering/workflow-guidelines/solver-quests.md]
- **ownership-map**: WP-F complete (research-backed via Explore subagent against architecture/INDEX.md + src). Found architecture/current-owner-maps.md + control-plane.md ALREADY are the authoritative owner matrix, so runtime-contracts.md now adds a compact 'Canonical writers' table that DEFERS to them (no duplicated truth): NodeStatePublicationOwner(node_state), ReplicaStateMachine(services lifecycle), PartitionService/MessageGroupService(raft_role+identity), MembershipPublicationCoordinator(control_plane_publications). Honestly flags partitions/message_groups.leader_node_id as having NO single named writer (contested) rather than inventing one. Unified snapshot/watch/readiness owner = ControlPlaneReadinessService (one component). Clarified DurableWorkflowCoordinator vs DistributedTransactionCoordinator (two, DTC builds on DWC). Added services field-owner example + retry-is-not-fallback rule (ARCH-0089). ID-stability handled: +2 ARCH rules remapped ARCH-0091->ARCH-0093 (no-parallel-caches); updated docs/autonomy-and-parallel-defaults-plan.md citations; degraded-evidence alias canonical ref updated 281->312, canonical_of=4. Idempotent. [.kiro/steering/runtime-contracts.md; architecture/current-owner-maps.md; .kiro/steering/llm-pack.config.json; docs/autonomy-and-parallel-defaults-plan.md; subagent:ownership-research]
- **ownership-map**: Final-verifier (subagent:a7005486284e26186) found 2 WP-F fabrications; both FIXED against real code. (1) ControlPlaneReadinessService is NOT also the snapshot/watch owner — ControlPlaneSnapshotOwner (src/control-plane/control-plane-snapshot-owner.js:253) is a distinct component; runtime-contracts.md now names both distinctly (resolves the #4 ambiguity honestly: they ARE separate). (2) nodes.node_state owner per architecture/current-owner-maps.md:48 is NodeLifecycleStateMachine (NodeStatePublicationOwner is the publication path); writers table now matches the deferred-to map. Re-regen idempotent; ARCH settled: no-parallel-caches rule = ARCH-0094, plan-doc citation re-pinned. All other 15 findings + regression checks CONFIRMED by the verifier. [subagent:a7005486284e26186; .kiro/steering/runtime-contracts.md:171,317-321; architecture/current-owner-maps.md:48; src/control-plane/control-plane-snapshot-owner.js:253]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
