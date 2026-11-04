# Stability development — local-agent takeover (2026-11-02)

**Purpose:** preserve the exact remote development state, known causal evidence, unresolved review findings and safe execution path for the next local coding agent. This is a dated **handover**, not a new epic, certified result, landing receipt or permission to bypass the existing Quest workflow. Start with the current [AGENTS.md](../../../AGENTS.md), [rules](../../../docs/steering/rules.md) and [router](../../../docs/steering/router.md); re-check all refs because the repository may move after this handover.

## 1. What is pushed and where

| Item | Exact ref at last observation | Status |
| --- | --- | --- |
| Current `main` | `e4937c765e81802b71e47792bc22ce4999d8efcb` | PR #183 (historical precedence rule) merged; PR #182 (comparative benchmark evidence repair) merged earlier at `32079ff9ba8be6a5cff82f4262b4aeaa6767001d`. |
| [Draft PR #184](https://github.com/psvensson/lagrange/pull/184) | `work/learner-committed-admission-rebase-20261102` at `b26d2c09070ce719c10d3d59ee9b2a42622f0bdf` | **WIP, unmerged, not independently certified**. Two commits atop main: `a3e2dfef79dcc82f74093b8bbdba6c9333f3c4fe` (source and regression transplant), `b26d2c09070ce719c10d3d59ee9b2a42622f0bdf` (exact generated impact metadata repair). 126 paths: 40 `src/`, 84 `test/`, architecture contract and duplication check. |
| Original development WIP | `wip/learner-host-admission-20261101` at `2baedb0fec1b0a242978dfe9d4d02042ef738f80` | **Preserved untouched**; historical source, full original work and relocated lab-evidence inventories. Diff against current main includes unrelated, superseded benchmark Quest data: do **not** merge the full branch. |
| Original failure reproducer | `wip/formation-serve-lane-repro-20261101` at `8068c765050853c2254df75524415fae6f37578d` | Preserved red multi-host scenario proof. Current main also carries indexed / relocated evidence and the still-red `fresh-formation-user-table-routability` Quest. |
| Earlier handover | [verification-trust handover](../verification-trust-handover-20261102/HANDOVER.md), merged by PR #181 | Prior broad defects and next release roadmap; some ref snapshots are now superseded by this file. |
| Documentation-only precedent rule | [PR #183](https://github.com/psvensson/lagrange/pull/183), merged at `e4937c765e81802b71e47792bc22ce4999d8efcb` | Significant defects: presume systemic until proven local; search earlier failures, fixes, rejected workarounds and unresolved consumers before coding. |

No unpushed source bytes in *this GitHub-only session* are known. This handover does not assert that a separate local agent has no dirty worktree or unpublished branches. Inspect its working tree, stashes, reflogs and other worktrees before altering anything.

## 2. PR #184 integration and exact verification status

The copied source edits implement the **partition** slice of committed learner identity, leader promotion proof and peer transport. They commit `{replicaIdentity, peerId, nodeId}` in Raft ADD conf-change context, make the committed membership read carry nodeId, stop depending on the CDC services cache for the corrected partition decisions, and delete the old peer-address resolver/reassert wake.

- The original WIP reported **21/21** focused Quest tests and **11/11** proof-channel-wake tests; learner-address-unresolvable refusals were **18 → 0** on a 3-node live reproducer. These are historical bounded results, **not tests of the transplanted current-main candidate**.
- Its original larger lab cone recorded **1854/1863** tests with mixed base reds/flakes, local passes and slow-host timeout; this is not green certification.
- First candidate CI rejected stale generated source impact metadata. Commit `b26d2c09070ce719c10d3d59ee9b2a42622f0bdf` refreshed the exact generated metadata rather than weakening the guard.
- Last observed Actions run: [change-gate: 184/merge, run 41423119069](https://github.com/psvensson/lagrange/actions/runs/41423119069) on `b26d2c09070ce719c10d3d59ee9b2a42622f0bdf`. **In progress** at handover. Read the final conclusion and actual failures; do not infer green from the runner beginning.
- PR #184 is a **draft**, even if GitHub metadata says mergeable. The current Quest's acceptance is still red and there is no independent approval of the integrated exact head. Do not merge prematurely.

**Outstanding source-level PR #184 review findings (read its two comments):**
1. `src/message-group/message-group-service-peer-resolution.js` is unchanged and still prioritizes `services` cache and bootstrap hints. C3 message-group transport is NOT closed. It needs a separate owner-boundary decision, test and correction if confirmed; do not misrepresent this partition slice as full message-group repair.
2. `src/partition/partition-service-learner-promotion-proof-methods.js` still derives `leaderMembershipEpoch` from `buildSnapshotCatchupIdentityFromCache`. Trace whether this is only a conservative freshness check or whether stale projected input can grant authority; test stale/fresh/late epochs and the actual consumer. Do not sign off C2 until the decision boundary is proven.
3. Verify the exact copied source and 84 test paths have no broken source owner interactions, deleted tests without equivalent regression, or newly introduced fallback.
4. Resolve the Quest acceptance scope under the existing [R09 supersession](../../../docs/steering/workflow-guidelines/solver-quests.md) rather than editing a sealed doneWhen to make it green. Keep broader formation acceptance red until it passes independently.

## 3. First causal history to read before another patch

- [June 11 — CL-014 CDC fan-out targetability catch-up](https://github.com/psvensson/lagrange/blob/main/solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-014.md). Point-in-time CDC fan-out dropped events before joiners became targetable. The systemic repair hydrates **all** CDC-propagated tables after subscriptions arm; rejected a spurious REPLACE/subscriber-loss diagnosis. Residuals included deletions in the gap, stale follower reads, and the subsequent priority-spread/voter-ready issue. Do not reintroduce a table-specific poll workaround.
- [September 25/26 — D1 committed membership authority](https://github.com/psvensson/lagrange/blob/main/solve/epics/raft-rs-full-cutover/design-committed-membership-bootstrap-read-2026-09-25.md). A replica bootstrapping from services rows could use the WRONG Raft quorum. Correct solution: use current committed membership through the single owner and treat membership events as wake-ups, never authority. No synthetic events, row-based bootstrap or REPLACE-only special case.
- [November 1 — projection-gated serve-lane systemic analysis](https://github.com/psvensson/lagrange/blob/main/docs/evidence/comparative-benchmark-evidence-repair-2026-11/systemic-analysis-serve-lane-2026-11-01.md). C1–C13 catalog candidates where cached/projected state authorizes a decision, completion or retained-work release. The entire class must be inspected, not declared local on one green test.
- [First-divergence evidence](https://github.com/psvensson/lagrange/blob/main/docs/evidence/comparative-benchmark-evidence-repair-2026-11/product-blocker-first-divergence-2026-11-01-summary.md). At 19:50:58.093Z on November 1, seed visibility crossed the predeclared 750 ms bound, then `cdc_committed_acceptance_unknown` and stale readiness blocked progress. Preserve uncertainty where the causal hypothesis is not fully proven.
- [Learner original log](https://github.com/psvensson/lagrange/blob/main/solve/quests/learner-host-from-committed-admission/log.ndjson). Original repaired learner refusals but cluster **still did not open its serve lane within 420 s**; admission was triggered by projected services rows that never appeared; `cdc_committed_acceptance_unknown` 6771 observations, `node_ready_lease_incomplete` 296. The original Quest's full scenario-level green is NOT attained.

## 4. The one ordered implementation path

**Priority A: finish PR #184 bounded partition learner correction.**
Read CI, update only proven failing owner paths, obtain focused red-on-revert tests, independent reviewer approval newer than final source attempt, accepted scoped Quest, the required published proof and only then merge. Do not silently widen the Quest into full fresh formation.

**Priority B: replica admission from a committed operation, coupled to C1/C10.**
Trace the actual owner end-to-end (replica_operations / REPLACE dispatch, Raft admission, CDC acknowledgment and cache) and prove that the trigger does not depend on the very services-row visibility it must restore. A write outcome should be tied to committed position, not to CDC projection lag; preserve ambiguous client answers, and do not reinterpret a late commit as an on-time success. Use the original first-divergence witness, distinguish CDC delivery obligation liveness from authoritative write completion, and choose one causal owner interaction.

**Priority C: source-census the remaining instances C3–C13.**
Close message-group peer addressing, serve eligibility C5, CREATE TABLE cohort C6, rebalancer C7, voter-ready C8, pipeline readiness C9, operation-source duality C11, overflow decisions C12, participant-cutover retained obligations C13 as confirmed by evidence. Each significant bug: historical precedent → first-failing observation → common cause → one owner repair → negative control and pressure/recovery test → independent approval. Do not add timers, cache/SQL dual paths, synthetic success or special-case fallbacks.

**Priority D: public product journey, not just non-refusal.**
Use current [fresh-formation routability Quest](https://github.com/psvensson/lagrange/blob/main/solve/quests/fresh-formation-user-table-routability/quest.json) and fixed preregistered timeout gates. On actually separate Linux Docker machines, a fresh 3-node cluster must open all serve lanes, settle priority partitions and replica operations, accept `CREATE TABLE`, correctly place RF replicas, complete INSERT and independent readback from every node. Then fault + recovery, repeat three consecutive as sealed; extend to 4/5-node scenarios with their respective declared topology. Never count 3 containers on one kernel as 3 physical hosts.

**Priority E: exact-main and release acceptance.**
PR #182 at merge `32079ff9ba8be6a5cff82f4262b4aeaa6767001d` requires post-merge whole-corpus proof unless already attached; verify exact receipt. Post-merge current main changes may need their own applicable checks. 0.4.1 owns bounded correctness and honest capability claims; full 0.5 pilot, services and measured performance are wider independent journeys. Management security and unsupported backup/upgrade success remain important but are not the stability lead; keep exposed operations restricted rather than presenting fake capability.

## 5. Execution environment: lab first, GCP safely second

This GitHub connector can review/push repository source and read Actions logs but **does not provide direct local SSH/lab execution or GitHub workflow_dispatch**. No new multi-machine test has been run by this session. New local agent should run the canonical commands in [home-lab.md](../../../docs/development/home-lab.md), respecting shared locks and the thermal guard:

```bash
node scripts/lab.js doctor
node scripts/lab.js fleet
node scripts/lab.js harness doctor
node scripts/lab.js test changed --lane all --sha HEAD --base-sha e4937c765e81802b71e47792bc22ce4999d8efcb
node scripts/lab.js harness run fresh-formation-user-table-routability \
  --base test/distributed/config/local-three-node.json \
  --nodes tv-dator,lenovo-laptop,adam-laptop --dry-run
```

Verify command/config support in current `npm run commands` and the CLI help before using. For actual run, remove `--dry-run` only after host readiness and locks; record run identity, every node's host boot id, installed source/artifact digest, original terminal client response, independent state and later recovery. The lab CLI owns machine locks: do NOT execute distributed loads by ad-hoc SSH. For a scenario specifically declaring `--certify`, use the documentation's exact-source clean-checkout preflight and retained evidence; a routine diagnostic run is not certification.

GCP: `.github/workflows/formation-health.yml` provisions separate VMs via the existing self-hosted GCP runner, BUT its `Commit the trend record to main` step runs `git pull --rebase origin main && git push origin HEAD:main`. **Never workflow_dispatch this unreviewed feature branch through it.** First independently review a no-source-publish, exact-ref GCP test workflow or invoke a safe canonical GCP provider path on an authorized runner; bound spending, ensure cleanup even on failure, retain run IDs/digests and test failures. A health-only GCP run does not prove user SQL or recovery, and GCP is not a replacement for causal tests.

No special additional user approval is needed for ordinary agent implementation and the existing budgeted lab tests; if new paid infrastructure/resource authorization is required, follow [action-authority](../../../docs/steering/rules.md) and request it.

## 6. Resume and delivery contract

```bash
git status --short --branch
git worktree list
git stash list
git reflog --all -n 30
git fetch origin
git rev-parse origin/main
git log --oneline --decorate -6 origin/work/learner-committed-admission-rebase-20261102
git diff --stat origin/main...origin/work/learner-committed-admission-rebase-20261102
npm run commands
node scripts/solve.js board
```

Preserve any local work before switching; do not force-reset, discard a worktree, or overwrite source/evidence. Start a clean dedicated worktree for PR #184 at its exact verified ref. Use [solver runbook](../../../docs/development/solver-runbook.md) for `solve start/note/probe/land`, independent verification and `npm run publish`. Merge source only with current exact-head approval; document-only work has documentation checks, not whole-system proof.

At each handover/update, report each unit separately as **reproduced / implemented / focused-tested / lab-tested / independently verified / Quest landed / pushed / merged / post-merge certified**, with exact full SHA, command/result, refusal or observed client operation, reviewer identity, PR URL and durable evidence. Red and unknown remain red and unknown; retries and missing execution cannot erase them.

This handover does not assert that current source is production stable, that PR #184 is approved, or that any physical formation succeeded on the rebased candidate.
