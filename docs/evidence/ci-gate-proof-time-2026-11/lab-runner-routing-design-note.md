---
audience: evidence
recorded: 2026-11-02
quest: ci-gate-proof-time-and-lab-runner-routing
---

# Attempt 2 design: pull-request gates on the lab's self-hosted runners

Disposition (2026-11-02): the lead accepted the recommendation in section 0
and the owner did not ask for routing; pull-request gates stay on the hosted
runner by owner policy (home-lab.md). This note is retained, unchanged below,
as evidence for a future owner decision. Attempt 1 (the 360-minute gate) landed
as PR #188, merged at main 6d58fdba1.

Quest `ci-gate-proof-time-and-lab-runner-routing`, attempt 2. Status: **design
only, awaiting the lead's decision**. No workflow, runner or repository setting
has been changed. Measured at origin/main `b3b366573` on 2026-11-02.

## 0. Summary and recommendation

**Recommendation: do not route pull-request gates to the lab now. Land
attempt 1 (360-minute job limit), let the hosted gate prove PR #184 and the
serve-eligibility PRs, and treat a lab route as a separate owner decision.**
If the owner wants the speed anyway, route **only tv-dator** (and optionally
carinas-windows) with the narrow design in sections 2-3 below.

Reasons, all measured or read from owners:

1. **Attempt 1 alone is sufficient for completion.** PR #184's 1892-file
   proof needed ~120 min of lanes plus 30 unrun exclusive files; the modelled
   whole corpus is ~135-145 min hosted (section 4). Both fit 360 with more than
   2x margin.
2. **A single lab host is only modestly faster.** The proof's dominant lane is
   the serial exclusive lane, which is latency/timer bound: hosted ran it at
   1.9x the controller, and four of the five lab hosts measure 1.44x-1.95x
   the controller. Only tv-dator (1.29x) is clearly faster than hosted
   (estimate ~80 min corpus vs ~140 min hosted). The laptops are no faster
   than hosted.
3. **The documented owner forbids it today.** `docs/development/home-lab.md`,
   "Native GitHub runners": *"Do not attach trusted home machines to
   pull-request workflows in the public Lagrange repository."* and the
   ci.yml header: *"Pull requests always run GitHub-hosted regardless of any
   marker, because fork code on a public repo must never reach a self-hosted
   runner."* and the hardening contract
   (`test/release/project-hardening-contracts.test.js`) asserts
   `runs-on` contains `github.event_name == 'push'` with the message
   "pull requests can carry fork code and must never reach self-hosted".
   Changing this is a policy change the owner (Peter) must make explicitly
   (R26), not a CI fix.
4. **A queued job on an absent label waits silently** (section 2c), and
   every lab host is already a shared, heavily used placement/harness target
   (three of five were held by `claude:group-a-serve-eligibility` at the
   inventory probe). A PR gate holding a host's machine lock for 80-120 min
   removes it from placement for every other agent.

## 1. (a) Which hosts, labels, commands, service and coexistence

### Hosts (inventory `~/.config/lagrange/lab/inventory.json`, probed 2026-11-02)

All five lab nodes are `os: linux`, `arch: x64`, roles
`harness,k3s,runner`, Node v22.23.2, every gate tool present
(git, docker, helm, wasm-tools, psql, g++, java, rg, jq), MovieLens digest
present. `carinas-windows` is a Linux host despite its name.

| Host | cores | mem | thermal | speed vs controller | suitable for a PR gate |
| --- | --- | --- | --- | --- | --- |
| tv-dator | 12 | 16 GB | measured | x1.29 | **yes** (fastest; storage-ssd) |
| carinas-windows | 12 | 7.8 GB | **unmeasurable** | x1.44 | conditional: low memory, and the classified runner proceeds ungated when no sensor answers |
| adams-gamla | 4 | 16 GB | measured | x1.84 | no: ordinary lane runs jobs=4 on 4 cores; slower than hosted |
| adam-laptop | 8 | 16 GB | measured | x1.89 | no: no faster than hosted |
| lenovo-laptop | 8 | 16 GB | measured | x1.95 | no: no faster than hosted |

Speed is `cpuSampleMs / controller cpuSampleMs (177)`, the factor
`lab fleet` prints (`scripts/lab/probe.js` `formatFleet`). The samples for
tv-dator, adam-laptop and adams-gamla were taken while those hosts were held
by another agent's placed shards, so they may overstate those hosts' slowness.

### Labels

`node scripts/lab.js runner configure` takes no label argument: labels come
from inventory (`scripts/lab/runner.js` `runnerLabels`): `home`, `lagrange`,
the os and arch, `role-<role>` per role, and `key-value` per inventory label;
GitHub adds `self-hosted`, `Linux`, `X64`. For tv-dator that is
`self-hosted, Linux, X64, home, lagrange, linux, x64, role-harness, role-k3s,
role-runner, storage-ssd`. A `lab` label does not exist; the routing label set
should be the existing `[self-hosted, home, linux]`. A dedicated label (for
example to mark "may serve PR gates") needs an inventory `labels` entry, e.g.
`labels: {"gate": "pr"}` producing `gate-pr` - that is an inventory edit the
lead can make with the lab CLI, not a code change.

### Commands (the lead runs them; I registered nothing)

```sh
# read-only pre-checks, per host
node scripts/lab.js runner labels tv-dator
ssh peter@192.168.86.32 'sudo -n true && echo passwordless-sudo || echo no-passwordless-sudo'
ssh peter@192.168.86.32 'test -f ~/.lagrange-actions-runner/.runner && cat ~/.lagrange-actions-runner/.runner || echo no-runner'

# registration against THIS repository (not the private control repo)
node scripts/lab.js runner configure tv-dator --repo psvensson/lagrange [--service]
```

- `--service` runs `sudo -n ./svc.sh install "$(id -un)" && sudo -n ./svc.sh
  start` on the host. It needs passwordless sudo **on the host**, not on the
  controller, so "the lead cannot sudo" does not by itself rule it out; whether
  each host's `peter` has `sudo -n` is **unknown** (I did not touch the lab).
  Without it: configure without `--service`, then start
  `~/.lagrange-actions-runner/run.sh` by hand (for example in a `systemd
  --user` unit with `loginctl enable-linger peter`, which needs no sudo if
  linger is already enabled, or a tmux session). A hand-started runner dies
  with the session or a reboot, which is exactly the "absent label" hazard of
  section 2c.
- The install script refuses when `~/.lagrange-actions-runner/.runner` exists
  ("runner already configured; refusing to overwrite local identity"). One
  host can therefore carry one runner registered by this CLI. Today none
  exists on any control repo (`psvensson/lagrange-lab` and
  `psvensson/harnessd-control` list zero runners), so there is no conflict,
  but registering for `psvensson/lagrange` uses up the slot the home-lab doc
  reserves for the private control repository.

### Coexistence with lab harness runs, placement and other projects

The lab's single lock is `${LAB_LOCK_DIR:-$HOME/.lab}/machine.lock` with a
`machine.holder.json` record beside it (home-lab.md, "Sharing the lab between
agents and projects"); `lab fleet`, placement and `lab harness run` read it.
A PR gate on a lab host must take that lock for the whole heavy step.

PR #118's adapter (`scripts/ci/run-with-shared-thermal-guard.sh`):
**adapt, do not adopt as-is.**

Keep from it:
- `flock` on `$LAB_LOCK_DIR/machine.lock` (default `$HOME/.lab`) with a
  bounded wait, and a typed exit when the wait is spent (it uses 98, the same
  code the home-lab convention uses for "held").
- Pass-through on GitHub-hosted runners (`runner.environment`).

Change:
1. **Drop the external thermal guard.** `~/.lab/runner-thermal-guard.mjs`
   (pinned blob `1a745134`) is installed only on the controller box, where it
   serves a `psvensson/spelunk` runner (`~/actions-runners/spelunk`); it is
   not on any lab host as far as anything here shows, so the adapter would
   refuse (exit 97) on every lab runner. More importantly it is a second
   thermal policy (78/70 C, cgroup kill) beside the repository's one thermal
   owner, `scripts/checks/wait-for-thermal-headroom.js`, which the classified
   runner already applies before every lane batch on every host
   (solver-runbook, thermal section). Two thermal authorities violate R01 and
   R11; the PR body itself says "Never copy or reimplement the CPU/SSD sensor
   policy inside Lagrange", and Lagrange already has its own.
2. **Write the holder record** the convention requires (project `lagrange`,
   agent `ci:<run_id>`, controller `github-actions`, purpose
   `test:pr-gate`, sha, startedAt, expectedMinutes, pid) and remove it on
   exit, so `lab fleet` and placement see who holds the host. PR #118 takes
   the lock without a record: invisible to every other agent.
3. **Lock once around the heavy step** (`npm run check`), not separately
   around `npm ci`, the MovieLens fetch and metadata refresh: separate
   acquisitions let a formation interleave between steps of one proof.
4. **Pin placement local**: set `LAGRANGE_PLACEMENT=local` for the proof, so a
   PR gate never tries to place shards onto other lab hosts (that would need
   the runner user's ssh keys and the lab inventory, i.e. PR code driving the
   whole lab). On a lab host the inventory is normally absent so placement is
   already local, but the env makes it explicit.
5. Wait budget: the holder record carries `expectedMinutes`; a gate should
   wait at most the remaining job budget minus the expected proof time, then
   fail with the typed `lab-host-busy` (exit 98) message naming the holder.
   With a 360-minute job and a ~80-120 min proof, ~120 min is a reasonable
   bound (PR #118 used 60).

## 2. (b) Workflow routing

Proposed single expression (owned by `test/manifests/ci-resource-plan.json`,
which the budget row `ci_resources_not_plan_driven` compares literally):

```yaml
runs-on: ${{ fromJSON(
  (github.event_name == 'pull_request'
    && github.event.pull_request.head.repo.full_name == github.repository
    && vars.LAGRANGE_PR_GATE_RUNS_ON)
  || ((github.event_name == 'push' && contains(github.event.head_commit.message, '[ci:self-hosted]')) && '"self-hosted"')
  || '"ubuntu-24.04"') }}
```

with the repository variable `LAGRANGE_PR_GATE_RUNS_ON` set to
`["self-hosted","home","linux"]` (or a dedicated `gate-pr` label set).

- **Same-repository PRs only** route to the lab. A fork PR keeps hosted. Note
  this is hygiene, not a security boundary: a fork PR's `pull_request` run uses
  the workflow file from the PR's merge ref, so a hostile fork can rewrite
  `runs-on`. The boundary is section 3.
- **The variable is CI configuration, not a product fallback.** Unset = every
  PR gate is hosted (today's behaviour); set = every same-repo PR gate goes to
  the lab label. There is exactly one route per configuration, never "try the
  lab then hosted". It must be documented next to the `[ci:self-hosted]`
  routing in the solver runbook and home-lab.md.
- Pushes without the marker stay hosted; pushes to main stay hosted (the
  publisher's exact-sha proof).

### (c-routing) An absent lab runner

GitHub queues a job whose labels match no online runner; it does not fail.
A repository-level job waits up to 24 hours in `queued` and is then
cancelled. Operators see it as:

- PR checks: `gate` "Queued - Waiting for a runner to pick up this job";
- `gh run list --workflow ci.yml --status queued`, and
  `gh api repos/psvensson/lagrange/actions/runners --jq '.runners[]|{name,status,busy}'`
  showing the labelled runners `offline`.

Typed answer: the outcome is `lab-runner-absent` (the gate never started),
not red and not green. The operator's two actions, both explicit: start or
re-register the runner (`node scripts/lab.js runner configure ...` /
`run.sh`), or unset `LAGRANGE_PR_GATE_RUNS_ON` and re-run the job (it then
runs hosted). There must be no automatic in-workflow fallback to hosted (R11).
Optionally a small hosted pre-job could call the runners API and fail fast
with `lab-runner-absent` naming the label set; that needs a token with
`administration:read`, which the default `GITHUB_TOKEN` lacks, so I recommend
not building it until the variable is actually used.

Concurrency: `cancel-in-progress` for pull_request still applies; a cancelled
self-hosted job kills the step's process tree, and `flock` releases the lock
on exit, so a superseded PR push does not leave a host held.

## 3. (c) Security (finding for the owner)

- `psvensson/lagrange` is **public**, owned by a **User** account. User-owned
  repositories have no runner groups, so a repository runner is eligible for
  any workflow in the repository whose labels match, including workflows
  from fork PRs (whose YAML the fork controls).
- The only GitHub control is the fork PR approval policy. Measured:
  `GET repos/psvensson/lagrange/actions/permissions/fork-pr-contributor-approval`
  returns `{"approval_policy":"all_external_contributors"}` - **already the
  strictest setting**. It must stay so. Approving a fork run is then
  equivalent to running that fork's code as `peter` on a home host with that
  user's ssh keys, `gh` login (`~/.config/lagrange/lab/github-token` exists on
  the controller; whether lab hosts hold tokens is unknown) and LAN access to
  every other lab host. Reviewers must never approve a fork run while the
  variable routes PRs to the lab, or must unset the variable first.
- Collaborators: only `psvensson`. Same-repo branches are pushed only by the
  owner and his agents, which is the trust assumption the design rests on.
- `actions/permissions`: `allowed_actions: all`, `sha_pinning_required: false`.
  The workflows pin by SHA (the hardening contract checks it); setting
  `sha_pinning_required: true` would make that a repository rule too.
- `pull_request_target` must never be added with a lab runs-on.
- Runner hygiene: the runner user should not hold publish credentials
  (Docker Hub, npm, GitHub tokens with write) on hosts that run PR code.

## 4. (d) Proof time estimates

Inputs: per-file last green durations on the controller (the classified
runner's own `lastResultsRoots` + `estimateFileCosts`), lane jobs from
`RESOURCE_CLASS_JOBS` (ordinary 4, bootstrap 2, external-toolchain 1,
exclusive 1); lane wall = sum(ms)/jobs. Lab = controller x speed factor;
hosted = per-lane ratios measured from run 41431327759 (ordinary 2.5x,
external-toolchain 2.2x, bootstrap 2.0x, exclusive 1.9x the controller).
Setup (checkout, npm ci, MovieLens, metadata refresh, fast-static) adds ~2-4
min everywhere and is excluded.

Controller model, whole corpus (2554 census files; the brief's 2551 is the
current local corpus run): ordinary 2197 files 17.7 min, external-toolchain 14
files 3.5 min, bootstrap 218 files 6.2 min, exclusive 125 files 35.8 min:
**63.2 min**. PR #184 plan (1892 per the gate log, not the brief's 1306; 1860
of its files have a controller duration): **55.9 min** plus the 30 exclusive
files that never ran (~3-5 min).

| Runner | whole corpus | PR #184 plan |
| --- | --- | --- |
| hosted ubuntu-24.04 (measured ratios) | ~132 min | measured 118 min of lanes before the kill + ~8-12 min = ~130 min |
| tv-dator x1.29 | ~82 min | ~77 min |
| carinas-windows x1.44 | ~91 min | ~86 min |
| adams-gamla x1.84 (4 cores, ordinary oversubscribed) | ~116+ min | ~110+ min |
| adam-laptop x1.89 | ~119 min | ~113 min |
| lenovo-laptop x1.95 | ~123 min | ~117 min |

Caveats: the speed factor is a single-thread CPU sample, while the exclusive
lane (more than half the wall time) is dominated by timers and fixed waits,
which do not scale with CPU; real lab gains on that lane are likely smaller
than the table. Retries (`LAGRANGE_RETRY_FAILED_ONCE`, cap 5 files) add up to
5 extra file runs. Thermal holds on a lab host add 30 s per poll. The hosted
vCPU count is not printed in the job log; the workflow comments say 2.

## 5. (e) Sequence for PR #184 and the other product PRs

1. Owner merges the attempt-1 PR (360-minute gate). Its own gate is small
   (workflow, one manifest, one test, CHANGELOG, quest records).
2. Correction to the brief: a `pull_request` run evaluates the workflow file
   of the PR's **merge commit** (`refs/pull/N/merge`, `GITHUB_SHA`), which is
   base `main` plus the PR head, not the PR head's own file. A PR that does
   not itself edit `.github/workflows/ci.yml` therefore picks up the
   360-minute limit on its **next pull_request event** without merging main.
   What does not pick it up: "Re-run jobs" on an old run (it reuses that
   run's original merge sha) and a PR whose merge ref cannot be built
   (conflicts: no run at all). The gate's checkout and proof range are still
   the PR head (`ref: pull_request.head.sha`, base `pull_request.base.sha`).
   So for each open product PR: if it conflicts with main or edits ci.yml,
   merge main (then `npm run -s test:metadata:refresh` and commit the four
   derived artifacts, since the gate fails on a stale seal); otherwise any new
   push (or close/reopen) triggers a run under the new limit. Merging main is
   still the simplest uniform instruction and is harmless.
3. Push the new head (a branch push skips the local gate; that is a
   preservation push, not proof). The PR's gate then runs hosted with the
   360-minute limit; expect ~2h10-2h30 for #184.
4. PR #184's killed run already showed 23 red files (for example
   `single-path-partition-cutover`, `message-group-native-provisional-route`,
   `seed-release-failure-custody`, `q10-postgres-compatibility-certification-matrix`);
   attempt 1 lets the gate reach a verdict, it will not make #184 green.
   Those are #184's owner's (R17).
5. After each merge to main, the publisher's post-merge arm
   (`npm run publish -- --post-merge <sha>`) still owes the whole-corpus
   receipt (solver-runbook); unchanged by this quest.
6. Only if the owner decides for lab routing: register tv-dator (section 1),
   land the adapted lock adapter + routing expression + manifest + contract
   change (which must replace the "must never reach self-hosted" assertion
   and the home-lab.md sentence, i.e. an explicit policy change), set the
   variable, and verify with one same-repo PR.

## Unknowns

- Whether any lab host's `peter` has passwordless sudo (`--service`).
- Whether the lab hosts carry any GitHub or registry credentials a PR could
  read.
- Real lab exclusive-lane times (the table scales a CPU sample).
- The hosted runner's vCPU count for this public repository.
- Whether the 30 unrun exclusive files of #184 would add retries.
