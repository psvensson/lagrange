You are taking over active Lagrange stability development for psvensson/lagrange. The preceding GitHub-based agent has pushed its work; do not rely on chat memory or assume it owns any local working tree.

FIRST read the complete saved handover:
https://github.com/psvensson/lagrange/blob/handoff/stability-development-takeover-20261102/solve/changes/stability-development-takeover-20261102/HANDOVER.md

Then load AGENTS.md, docs/steering/rules.md, docs/steering/router.md, the relevant ownership/Quest documentation and the historical CL-014 / D1 / November C1–C13 evidence linked by that handover. Current source and verified records override this snapshot.

BASELINE (recheck remotely before starting)
- main was e4937c765e81802b71e47792bc22ce4999d8efcb.
- Candidate draft PR #184: https://github.com/psvensson/lagrange/pull/184
- Candidate exact head was b26d2c09070ce719c10d3d59ee9b2a42622f0bdf on work/learner-committed-admission-rebase-20261102; its 126 changed files include 40 source and 84 test paths. Source + tests were transplanted onto main from an intact original WIP, NOT independently reviewed or landed.
- Original WIP preserved at wip/learner-host-admission-20261101 head 2baedb0fec1b0a242978dfe9d4d02042ef738f80, with original evidence. The formation failure reproducer is at wip/formation-serve-lane-repro-20261101 head 8068c765050853c2254df75524415fae6f37578d.
- Current PR #184 CI was running (run 41423119069) when the handover was saved. Fetch the final result and exact failure output before editing or claiming green.
- PR #182 benchmark truth repair and PR #183 historical-regression rule are merged. PR #182's post-merge corpus receipt is a separate outstanding verification unless already proved.

PRESERVE FIRST:
    git status --short --branch
    git worktree list
    git stash list
    git reflog --all -n 30
    git fetch origin
    git rev-parse origin/main
    git log --oneline -6 origin/work/learner-committed-admission-rebase-20261102
    git diff --stat origin/main...origin/work/learner-committed-admission-rebase-20261102
    npm run commands
    node scripts/solve.js board

Keep all dirty and historical work intact. If another agent has advanced the remote head, reconcile it; don't overwrite, force-reset or blindly rebase a concurrently edited branch. Use an isolated clean worktree at the exact candidate.

DEVELOP IN THIS ORDER:
1. Close the exact partition learner committed-identity / transport slice of PR #184. Resolve review concerns about leaderMembershipEpoch still derived from cache and about message-group peer resolution still preferring cached services/hints. State precisely what remains outside the partition slice. Preserve historical evidence, add real red-on-revert/stale-cache tests, run the original owner interaction and affected tests, obtain a NEW independent approval of the current integrated head, and land through the existing Quest/Solver with R09 supersession if necessary. Do NOT merge on CI-green alone.
2. Trace and correct replica admission being triggered by a projected services row, coupled with CDC write completion/retained acceptance (C1/C10). Review prior June CL-014 catch-up and September D1 committed-authority decisions first. A committed op must drive admission without waiting for the projection it is supposed to repair. Tie write answers to the committed boundary; distinguish timeout/commit-unknown/late success. Avoid duplicate owner, retries that silently clear failures, extra fallbacks or increasing timeouts.
3. Inspect the remaining projection-authority consumer class C3–C13. Confirm each candidate's actual decision and owner before code changes. Fix shared cause at existing owner boundaries, prove safety and eventual useful recovery, and leave unrelated residuals explicitly assigned.
4. Exercise the real installed distributed user journey via physical lab hosts: fresh 3-node formation, actual priority partition spread, CREATE TABLE, real RF cohort, INSERT and SELECT readback from every node, failure, restart/replacement and useful recovery. Keep scenario bounds and run 3 consecutive where sealed acceptance demands. Extend to 4/5 nodes with separate machine identities; no modeled throughput claims.
5. Finish exact-main/post-merge corpus proof and 0.4.1 bounded release certification. Leave wider Hono, TiDB comparisons, Scenario B/C and pilot acceptance in their proper versioned owners.

HISTORICAL + SYSTEMIC POLICY: Every major/recurring failure is presumed systemic until proven local. For each important fix, find when it occurred earlier, what was tried, what was rejected, how the accepted fix worked, and which consumers remained. Do not repeat unsuccessful remedies or produce a green primitive while the affected system-level journey remains red. Use existing Quest findings, never a parallel decision framework.

TEST ROUTE: Check lab first:
    node scripts/lab.js doctor
    node scripts/lab.js fleet
    node scripts/lab.js harness doctor
    node scripts/lab.js test changed --lane all --sha HEAD --base-sha e4937c765e81802b71e47792bc22ce4999d8efcb
    node scripts/lab.js harness run fresh-formation-user-table-routability --base test/distributed/config/local-three-node.json --nodes tv-dator,lenovo-laptop,adam-laptop --dry-run
Only run physical workloads via the canonical lab locks and thermal owner; verify syntax/current host names and availability first. Record machine identity, exact source/container digest, actual client results, state witness, logs, refusal, and recovery. Certification is separate and needs the owning --certify preflight, clean checkout and durable evidence.

GCP FALLBACK: The GitHub workflow .github/workflows/formation-health.yml PROVISIONS 5 VMs, but its trend-publication step rebases/pushes the run's HEAD to main. Do not dispatch this on PR #184 (or other unreviewed branches). Use a separately reviewed NON-PUBLISHING exact-ref GCP runner with resource/cleanup guardrails or the established safe GCP provider only after confirming authority, cost and cleanup. Mere health checks do not prove the SQL/recovery journey.

DELIVERY: Work autonomously within repository authority. Report exact SHA, branch, tests red/green, CI/lab run IDs, negative-control results, independent verifier and approval SHA, Quest status, PR, merge SHA, and post-merge receipt; distinguish WIP / pushed / reviewed / merged / certified. Where unable to execute, preserve exact blockers, don't assert execution. User prioritizes stability over management authentication, but do not open unsafe management effects.

Proceed with implementation, review, testing and authorized landing—not another plan-only update.
