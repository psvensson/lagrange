# canonical-authority alignment notes (append-only)

Merge of the owner's canonical-authority epic branch
`origin/work/canonical-authority-epic-20261110` (367b64fdc) into the
code-navigability stream head 8d792cca5
(`origin/work/code-navigability-fallback-census-20261108`). Branch
`work/code-navigability-align-canonical-20261110`, worktree
`lagrange-nav-align-canonical-20261110`. Merge base 5c6fe7db5.

Rule (lead, 2026-11-10): the owner landed the canonical epic deliberately;
where it settles the same thing as this stream (census witness accounting,
budget script semantics, baselines, src fixes) the canonical version is
authoritative. This epic's invariants still hold where the canonical epic did
not decide otherwise. A canonical re-introduction of a removed pattern is
re-expressed only when behaviour is identical; otherwise it is a finding.

## Commits

| sha | what |
| --- | --- |
| de5df2fb1 | `git merge --no-ff origin/work/canonical-authority-epic-20261110` (hook on, `LAGRANGE_SOLVER_LANDING=1`) |
| 9f880a321 | follow-up: defaults-stream-merge-notes.md (from 9c4f00afa), serve-eligibility-owner.js import moved below its header comment (from the defaults-merge WIP a0874b9cf), regenerated impact-graph seal, owner-debt inventory, `src/control-plane/INDEX.md` |
| (this commit) | these notes |

## Conflicts and resolutions

None. The stream had exactly one commit after the merge base (8d792cca5,
quest record for `priority-recovery-owner-read-snapshot-await`), and the
canonical side's 748d97338 applies the same patch: the two
`solve/quests/priority-recovery-owner-read-snapshot-await/quest.json` blobs
are identical (`git diff 748d97338 8d792cca5 -- <quest.json>` is empty). No
seal-related field was dropped, so there was nothing to keep from our side.
Every other path is canonical-only, so the merged tree equals 367b64fdc plus
the two follow-ups above.

Follow-ups applied:

- `defaults-stream-merge-notes.md` brought in verbatim from 9c4f00afa (not on
  the canonical side; 6606cd9df was its last commit there).
- `src/control-plane/serve-eligibility-owner.js`: the canonical side still had
  the `state-field-read` import on line 1 above the header comment, so the
  source owner index described the module as "No leading comment". The one-line
  move from the defaults-merge worktree's uncommitted WIP (a0874b9cf) is
  re-applied; the INDEX entry now reads the header again. Before the move the
  budget row `stale_owner_indexes` was `null` (outstanding) on both 8d792cca5
  and 367b64fdc; after it is 0.

## What the canonical epic superseded in this epic

- Epic text (94d898253): "Coverage decides what is dead" became "Coverage
  locates candidates"; the done-statement no longer claims every census-dead
  branch is retired; step 6 overlap rules; decision-log entry 2026-11-10.
  Repository-wide legacy/fallback closure belongs to Q11
  `repository-legacy-fallback-closure` in
  `operation-integrity-and-reliable-formation.md`.
- `dead-fallback-retirement` quest (unsealed proposal): probe changed from the
  budget metric (never / fallback-only rows = 0) to a test-receipt with five
  receipts (reachability + semantic dispositions, caller migration, alternate
  implementations deleted, refusal/recovery/cleanup, independent verification);
  invariants `coverage-is-not-semantic-proof` and
  `bounded-work-and-global-closure` added.
- `live-dual-path-classification`: probe unchanged (budget metric
  `fallback_sites_unclassified`), invariants re-expressed.
- Census (947fbe658): `fallback-branch-census*.js` rewritten (five-lane
  completeness, participant roster, witness accounting, pre-kill flush helper
  `scripts/checks/census-pre-kill-flush.js`), `data/fallback-census/census.json`
  regenerated. The budget script now marks the four census rows outstanding
  unless all five lanes are present with valid run metadata and complete
  witness accounting, and prints the "accounted for, never zero fallback logic"
  note. This supersedes the census-collection-notes.md accounting design.
- Baselines (947fbe658): eight navigability baselines regenerated. Every one is
  non-increasing against the merge base, and no (file, function) entry count
  increased in any of them (checked over all baseline files).

## Budget (node scripts/checks/code-navigability-budget.js)

| Row | stream 8d792cca5 | canonical 367b64fdc | merged 9f880a321 | cap/target |
| --- | --- | --- | --- | --- |
| navigability_patterns_without_ratchet | 0 | 0 | 0 | 0 |
| owner_port_feature_detection | 2041 | 2038 | 2038 | 2130 |
| owner_port_feature_detection_pilot_owners | 59 | 59 | 59 | 0 |
| identity_keyed_module_state | 87 | 87 | 87 | 87 |
| identity_keyed_module_state_admission_path | 3 | 3 | 3 | 0 |
| prototype_copy_bags | 59 | 59 | 59 | 59 |
| prototype_copy_bags_partition_service | 12 | 12 | 12 | 0 |
| inheritance_depth_over_two | 58 | 58 | 58 | 65 |
| inheritance_depth_over_two_readiness | 0 | 0 | 0 | 0 |
| row_field_alias_reads | 736 | 687 | 687 | 745 |
| formation_system_tables_without_decoder | 3 | 3 | 3 | 0 |
| state_read_defaults | 413 | 0 | 0 | 0 |
| value_or_promise_then_checks | 0 | 0 | 0 | 0 |
| source_directories_over_cap | 4 | 4 | 4 | 0 |
| stale_owner_indexes | null | null | 0 | 0 |
| failure_bundle_log_windows_without_coverage | 0 | 0 | 0 | 0 |
| two_source_fallback_reads | 1788 | 1694 | 1694 | 1789 |
| typeof_dual_paths | 604 | 603 | 603 | 627 |
| catch_returns_default | 387 | 386 | 386 | 387 |
| reexport_only_modules | 34 | 34 | 34 | 35 |
| alias_exports | 38 | 38 | 38 | 0 |
| legacy_term_identifiers | 2900 | 2865 | 2865 | 2924 |
| fallback_sites_uncensused | 120 | 0 | 0 | 0 |
| fallback_branches_never_taken | 147 | 147 | 147 | 0 |
| fallback_branches_only_fallback_taken | 37 | 34 | 34 | 0 |
| fallback_sites_unclassified | 1324 | 1352 | 1352 | 0 |

No capped row is over its cap. state_read_defaults 413 -> 0 is the defaults
merge (daab6792c), which reached this branch through the canonical side.
Merged-tree note line: 2683 fallback logic sites detected in src (censused
2683, uncensused 0). Outstanding rows (OVER) are the epic's open work, as
before.

## Checks (merged tree, niced, one at a time)

- `npx eslint src`: clean (exit 0).
- `npm run audit:guideline:navigability`: 0 violations, 8515 inherited
  baseline matches, no tighten hint.
- pre-commit hook with `LAGRANGE_SOLVER_LANDING=1` on both commits: pass
  (scoped complexity is advisory; the merge commit's list is pre-existing).
- `npm run test:duplication`: OK, src+scripts 35/35 groups 1109/1109 lines;
  test 623/623 groups 23339/23339 lines.
- `npm run audit:file-size`: pass.
- `node scripts/check-fast-static.js --base 8d792cca5`: ok.
- Regenerated: test:metadata:refresh (seal changed only by the import move),
  generate-global-owner-debt-inventory (input/source digests only),
  generate:source-owner-index (one entry), steering:generate (no change).

## Tests (merged tree, scripts/run-test-files.js --jobs 2)

Quest witnesses, 11/11 pass (189 assertions):
control-plane-readiness-service-construction, utils/state-field-read,
scripts/state-read-named-defaults, rebalancer/operation-record-step-shape,
scripts/eslint-value-or-promise-selector, raft/raft-rs-turn-answer,
scripts/code-navigability-budget, scripts/code-navigability-detectors,
scripts/check-guideline-navigability, scripts/fallback-branch-census,
scripts/fallback-branch-census-launch-coordinators.

Tests of the src files 947fbe658 changed (every test file importing one of
its 72 src files by basename, plus every test file it changed): 387 files in
ten batches, 383 pass, 4 red. Re-run of the 4 alone on the merged tree and on
367b64fdc in a throwaway worktree, same conditions:

| test | batch run | merged re-run | canonical 367b64fdc |
| --- | --- | --- | --- |
| bootstrap/fresh-join-registration-runtime-replacement.integration | red (node B joins: node-state publication did not reach its durable owner) | pass | pass |
| integration/fresh-formation-without-admin-polling.integration | red (SELECT COUNT: DISTRIBUTED_PARTICIPANT_FAILURE) | pass | pass |
| integration/node-join-convergence-slo.integration | red (subtests 8, 9: join/ready) | red | red, same subtests |
| integration/cdc-group-boundary-handoff.integration | red (W-D4b subtest 6) | red | red, same subtest |

None is merge-caused: two are load-sensitive under the batch and pass alone;
two are red on the canonical head itself with the same failing subtests.

## Impact on in-flight quests

Trial merges (`git merge --no-commit`, then abort) in a throwaway worktree, of
the new head 9f880a321 and, for comparison, the old stream head 8d792cca5.

| quest (candidate) | conflicts with 8d792cca5 | conflicts with 9f880a321 | new conflicts caused by |
| --- | --- | --- | --- |
| partition-service-constructor-injection (c73a2a797, origin/wip/handover-20261110/nav-partition-20261108) | 37 | 37, the same list | none |
| system-table-row-decoders (731fc4977, origin/wip/handover-20261110/nav-decoders-20261108) | 42 | 51 | 9: `scripts/checks/code-navigability-budget.js`, three tests and `test/simulation/formation-sim-runner.js` (947fbe658); `move-planner-move-calculation-methods.js`, `operation-workflow-owner-ports.js`, `priority-recovery-visibility-decision.js`, `unified-rebalancer-budget-planning.js`, `unified-rebalancer-control-plane-readiness-methods.js` (state-read-named-defaults f7fe3d297 / daab6792c, already expected from the defaults merge) |
| priority-recovery-owner-read-snapshot-await (a061bab65, origin/wip/handover-20261110/nav-prfix-20261108) | 0 | 4 | `scripts/check-duplication.js`, owner_port_feature_detection and typeof_dual_paths baselines (regenerate, take the lower), `test/rebalancer/rebalance-coordinator-outcome-routing.test.js` (947fbe658) |

Partition conflict list: check-duplication.js, four baselines
(identity_keyed_module_state, owner_port_feature_detection,
prototype_copy_bags, typeof_dual_paths), 16 `partition-service-*.js`,
`raft-rs-group-membership-admission.js`, 16 tests and fixtures.
The candidates are the WIP handover snapshots; each worktree's HEAD is that
snapshot and has no staged or unstaged changes, so no stash was needed.

Does 947fbe658 already do part of the quest's work?

- partition: no. Its partition edits are managed-split, overlap guard,
  replica admission, raft-lifecycle wiring (CONF_CHANGE_APPLIED subscription)
  and a strict `=== true` in remote-query. The pilot rows
  (prototype_copy_bags_partition_service 12, owner_port pilot 59,
  identity_keyed admission path 3) are unchanged. Small adjacency:
  `partition-replica-admission.js` replaced a `readOwnRaftStatus?.()` probe with
  the committed-membership reader.
- decoders: no. formation_system_tables_without_decoder stays 3; no
  `<table>-row-decoder.js` module was added. Its
  `replica-operation-repository-observation-methods.js` (+222) and
  system-row-normalizers changes touch the same raw-column reads, and the
  canonical epic's Q5 (`canonical-replica-completion-observation`) says to
  coordinate with system-table-row-decoders before changing their shared
  boundary.
- prfix: no. The BestEffort alias family is 15 occurrences in src on both the
  merge base and the merged tree (7 on the candidate). The readiness edits in
  947fbe658 add a `READINESS_INTERNAL` read purpose to the node/service row
  reads, which the candidate auto-merges with.
- alias_exports (38) and typeof probes in the pilot owners are unchanged by
  947fbe658. Its owner_port drops are cdc routing (1), managed-split adapter
  (1) and recovery drain (1); typeof_dual_paths cdc routing (1);
  catch_returns_default recovery drain (1).

## Findings for the lead (not changed here)

1. Detector blind spot, new canonical code. `src/bootstrap/owners/partition-quorum-authority.js`
   (new, 759 lines) feature-detects collaborator ports through a local
   `isCallable(value)` wrapper (`isCallable(authoritativeView.readReadinessOwnerRows)`,
   `isCallable(localService[GET_STATUS])`) and optional calls
   (`authoritativeView.canRead?.()`, `owner?.getPartitionServices?.()`,
   `owner?.getReplicaHandler?.()`, `owner?.getSeedNodeId?.()`,
   `owner?.resolveReadyNodeIdsFromRows?.(...)`). `bootstrap-cluster-view-owner.js`
   adds `this.delegates.getX?.() ?? null` (three) and `table-policy-resolution.js`
   `service?.isStaleAgainstCommittedPolicyFence?.(...)`. None is counted by
   `owner_port_feature_detection` (it needs a direct `typeof <member>`) and none
   is in a pilot owner, so the budget is unaffected. Behaviour is not
   identical under a rewrite to required collaborators (an absent port is
   answered as unavailable today), so nothing was re-expressed. Route to Q11
   or the readiness/partition owners: either the detector learns wrapper and
   optional-call probes, or these become required, validated collaborators.
2. The owner's local `work/canonical-authority-epic-20261110` (primary
   checkout) is 17 commits ahead of origin (unpushed: Q11
   repository-legacy-fallback-closure, node-startup-natural-shutdown,
   management-action-authority, cache-replica-incarnation-coherence and others,
   51 src files) plus uncommitted src edits. This alignment is against origin
   367b64fdc only; another alignment is due once those are pushed. They change no
   navigability baseline, the budget script or the census.
3. `node-join-convergence-slo.integration` and
   `cdc-group-boundary-handoff.integration` are red on 367b64fdc itself (see
   Tests). They belong to the canonical branch's owners.
4. The defaults-merge WIP's INDEX fix was never on the canonical side, so
   `stale_owner_indexes` is outstanding (null) on 367b64fdc. It is fixed here
   (9f880a321).

## Verifier's checklist

- `git diff 748d97338 8d792cca5 -- solve/quests/priority-recovery-owner-read-snapshot-await/quest.json` is empty.
- `git diff 367b64fdc 9f880a321 --stat` lists only the follow-up files
  (notes, serve-eligibility-owner.js, control-plane INDEX.md, inventory.json,
  impact-graph-seal.json).
- `node scripts/checks/code-navigability-budget.js`: no capped row over its cap.
  The rows match the merged column above.
- `npx eslint src`, `npm run audit:guideline:navigability`,
  `npm run test:duplication`, `npm run audit:file-size`,
  `node scripts/check-fast-static.js --base 8d792cca5` all exit 0.
- The 11 witnesses pass. The two canonical-red integration tests fail the
  same subtests on 367b64fdc.
- Baseline monotonicity: for each `scripts/check-guideline-navigability-baseline-*.json`,
  no (filePath, functionName) count is higher at 9f880a321 than at 5c6fe7db5.
