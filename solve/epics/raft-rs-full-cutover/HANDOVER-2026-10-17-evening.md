# Handover: rs-raft creation lane, 2026-10-17 ~20:00Z

Written by the lead (Fable) when the Fable usage limit was reached; the owner
asked to commit, push and hand over. Read this, then
`closeout-plan-2026-10-17.md` (append-only tracking, newest lines last), then
the quest log `solve/quests/wasm-creation-genesis/log.ndjson`.

## Where things are

| Thing | Location / SHA |
|---|---|
| Lane branch (PR #134, draft) | `work/rs-raft-event-reconciliation-20261016`, worktree `/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016`; this commit = stage 1c landed (`381750de2`) + recovery design + UNVERIFIED recovery unit 1 |
| Composed candidate | `integration/rs-raft-candidate-20261017` @ `e7a3525a5` (pushed), worktree `.worktrees/compose-20261017`; APPROVED composition at `1efdfc723` + owner decisions 4 (`68de6d1f6`) and 5 (`e7a3525a5`, docs/test-only, not yet re-verified) |
| Primary checkout | `/mnt/data/peter/projects/lagrange` = ANOTHER AGENT's branch `integrate/rs-raft-2026-09-30` with 18 staged paths. NEVER touch it, never run git push from it (an up-to-date push there fail-closes into a full gate of its HEAD; memory `pre-push-up-to-date-push-gates-head`) |
| Verifier worktree | `.worktrees/verify-1c` (detached, scratch only; safe to remove) |

## Done today (all independently verified unless marked)

1. Stage 1 + 1b (publication/retirement, bounded owner-side re-decide A2): landed earlier, lab-accepted.
2. Composition of #73 + contract-first + the 2026-10-11 candidate (option A): APPROVED `1efdfc723`.
3. Owner's seven decisions (all = recommendations) recorded: quest log, activation charter, plan.
4. Stage 1c (node-side bound routes, discovery rows, PRESENT by token, wake consumer, memo custody table Revision 7): seven verification rounds, APPROVED; committed `381750de2`, pushed; acceptance record `ACTIVATION-DISCOVERY-STAGE1C-ACCEPTANCE-20261017.md` (+ Addendum A). LAB CLASSIFICATION STILL PENDING.
5. Recovery stage design `RECOVERY-DESIGN-20261017.md` (draft + Revisions 1-5): six vet rounds, APPROVED; quest-log decision written.
6. Recovery UNIT 1 implemented by Opus (report `evidence/recovery-20261017/unit1/implementer-recovery-u1-report.md`; snapshot `d55cb368d` = `wip/rs-raft-recovery-u1-1`; 15 restart witnesses red first, 29 mutations, statics = base). **NOT VERIFIED**: the verifier died on the Fable limit before starting. It is included in this commit only because the owner asked to commit everything; treat it as unverified source.

## Next steps, in order

1. **Verify recovery unit 1** independently (a fresh agent that did not write it), brief `evidence/recovery-20261017/briefs/verifier-recovery-u1.md` (worktree, subject = `git diff 381750de2 <this commit> -- src test`, measure list, mutation list). Fix findings at owners; then a quest-log attempt + verification entry.
2. **Recovery unit 2** (unconfirmed grant / GRANT_UNCONFIRMED, K-th bound, C9 child process): brief `evidence/recovery-20261017/briefs/implementer-recovery-unit2.md`; then verify.
3. **Lab**: blocked since 17:50Z by the owner's own lab job #160 marked UNCERTAIN (v0.1.6 TAP-count bug, lab issue #165). Owner action: `~/.local/bin/lagrange-lab reconcile 7fe5fca662d2737e8f8e7911db1f072f`. Queued and valid (12 h expiry, ~05:50Z): stage-1c proof at `381750de2` = #173-#176 (89 files; requests 5722a13b…, 1a33808e…, b31267fc…, e8fe2b74…); recovery unit 1 at `d55cb368d` = #183/#184; bisections #177/#178. Classify into the stage-1c acceptance record (expected base reds listed there). Results land in `~/.local/state/lagrange-lab/runs/<request_id>/`.
4. **Lane regressions (closeout step 3, owner decision 7)**: 12 files red since between `e7c89f4b5` and `e6d43bc1a` (150 commits), 3 more between `d35d8828c` and `c6006c745`. Bisection script `evidence/recovery-20261017/bisect-lab-v3.sh.txt` (file lists beside it); the scripts running in this session die with it: re-run them (from the LANE worktree; `REUSE_good=<request_id>` reuses a queued job). Then repair at owners on the candidate.
5. Then: activation quest (charter `activation-quest-charter-2026-10-17.md`, items incl. 13 = production wiring of the restart scan), step 4 certification formations, step 5 closeout report, step 6 merge/publish (`npm run publish`).

## Rules that bit today

- Pre-commit silent-catch check fires on inherited hits in any staged file; fix at the owner, never in a baseline; a raw `null` state is a decision-boundary hit (use a named record).
- Lab requests must use full 40-hex SHAs and only files present at that SHA; the bridge holds ALL jobs behind any UNCERTAIN job.
- Owner preferences: Opus implements, an independent agent verifies; push incrementally; never touch other agents' work or main.
