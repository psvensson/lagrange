# Local agent prompt: complete verification-trust implementation and certification

You are the Lagrange implementation/integration agent. Continue the user-approved 0.4.1 correctness and verification-trust repairs until each supported bounded unit is implemented, independently verified, certified at its actual evidence ceiling, and merged into main. Keep all work and evidence durably recorded on GitHub; do not imply a future/background process if one has not actually been submitted.

First read:
1. AGENTS.md, docs/steering/rules.md and docs/steering/router.md from the current repository checkout.
2. solve/changes/verification-trust-handover-20261102/HANDOVER.md from branch handoff/verification-trust-20261102.
3. The linked current 0.4.1 owners, Quest records, verified evidence and active WIP branches. The handover is a dated snapshot, never more authoritative than current source and owners.

Initial inspection, without resetting or modifying unrelated work:

    git status --short --branch
    git worktree list
    git branch --all --list '*verification*' '*benchmark*' '*learner*' '*formation*'
    git stash list
    git reflog --all -n 30
    git fetch origin
    git rev-parse origin/main
    npm run commands
    node scripts/solve.js board

Preserve or recover local branch fix/verification-trust-20261102 if it actually exists. Do not assume it was pushed or that the earlier local management/proof edits passed exact-candidate independent review. Benchmark, learner and formation branches ARE persisted; inspect their actual HEAD, sealed acceptance, raw logs, receipts, current reviewers, uncommitted changes and divergences before cherry-picking, rebasing or recreating code. Never overwrite the original WIP or historical evidence.

Execution order:
(A) P0 management safety: authorize admin ingress before owner effects, refuse missing cluster identity and unsupported backup/restore/upgrade/decommission when physical dependencies are absent, preserve identity after restore/restart, and prove negative cases via real Fastify/public route and production wiring. Do not implement pretend backup capability.
(B) P0 proof authority: enumerate trusted receipt producers and validate complete exact-candidate execution evidence, not merely SHA and asserted PASS; test forged, partial, missing, wrong-SHA, skipped and failed observations. Preserve legitimate proof compatibility and append-only history.
(C) P0 benchmark WIP integration: reuse existing candidate, negative controls, typed outcomes, native clients, actual workload parity, original responses, per-host digests, observed phase metrics only, independent final-state oracles, append-only raw/invalidated records, and full offline publication recomputation. Resolve the recorded red/invalid items, including TiDB semantic smoke; do not re-run broad unchanged scenarios for hope.
(D) P1 committed authority: carry forward learner candidate and finish original owner-boundary repairs for admission trigger, serve eligibility, provisioning, leader/write addressing and other confirmed CDC-projection authority consumers. Prove fresh 3/4/5-node public PG-wire user journeys, refusal under fault and useful recovery afterward. No timer/default/fallback patching as an alternative to committed authority.
(E) Reconcile invalid published claims and exact release evidence; source tests cannot be advertised as installed/physical benchmarks. Keep wider Scenario B/C, pilot and measured-comparison acceptance in 0.5 unless a current owner explicitly reallocates scope.

For each bounded repair: reproduce original causal failure; seal a precise Quest doneWhen; write the smallest one-owner fix; test red-on-revert at the real behavior; run focused and affected integration gates; have a different independent verifier approve the exact last attempt; let Solver land; publish the exact commit; verify PR/main head and, for GitHub merges that bypassed local publisher, obtain required post-merge corpus proof. A known-bad harness must go red for the intended reason, not a setup failure. Preserve product/fixture/verifier/infrastructure distinctions, all first failures, and commit-unknown outcomes. Do not use --no-verify, weakened acceptance, bypass checks, faked receipts, or unreviewed main changes. Documentation-only work has documentation-only checks.

Progress reporting should name exact branch/commit, changed owner, test command, number of passed/failed/invalid outcomes, independent reviewer and evidence, PR link, merged SHA, post-merge proof if required, plus remaining blocker and next action. Do not claim full release readiness from a bounded repair. Decide routine implementation autonomously; request a user decision only if the existing contracts truly lack authority for the chosen behavior.

Important: PR #180 merged ONLY R19 and release-gate policy, NOT executable source fixes. Until source repairs are verified, say so. Full context and exact preserved branch pointers are in HANDOVER.md.
