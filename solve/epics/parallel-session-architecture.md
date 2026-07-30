---
epicContractVersion: 2
id: parallel-session-architecture
roadmapRow: null
graduatesTo: quests
---

# Parallel sessions without interference

## Problem

On 2026-07-28/29 two sessions (a human-driven quest session and an agent
session) shared the main checkout and collided repeatedly: pushes blocked by
the other session's untracked mid-refactor files, a commit blocked by the
other session's tree growth, a tracked generated file polluted by a regen in
the dirty tree, an index/stash near-miss, and an active edit race inside one
fixture. Every incident is a shared-mutable-state failure. The repo already
documents measured index-lock contention from concurrent sessions in one
checkout (handoff.js, 15/60 failures).

All designs below were adversarially verified against the code on
2026-07-29; refuted variants are recorded so they are not re-proposed.

## Architecture

**1. One agent, one worktree, one branch; the main checkout is
integration-only.** Solver state is per-quest disjoint files and the tooling
is root-parameterized (verified), so worktrees work. Mechanics that make it
real: hooks installed with a RELATIVE core.hooksPath (each worktree runs its
own hook copies at its own commit — landed 2026-07-29 via
install-git-hooks.js); per-worktree eslint cache in the private git dir
(landed 2026-07-29); copy the gitignored `solve/config.json` (and any `.env*`)
into each new worktree or executor runs silently disable; agents work on
`agent/<name>/<quest-id>` branches, never detached (a landing on detached
HEAD commits unreachable garbage — all 8 stale /tmp worktrees are detached).

**2. Serial integration that regenerates, never merges.**
`solve/FRONTIER.generated.md` (and the spec ladder on SOLVED landings) is
tracked and rewritten inside every landing commit, so two agents' landings
always conflict on it. Integration happens serially in the main checkout:
merge/cherry-pick the agent branch, then REGENERATE the board rather than
resolving it. Pushes to main stay serial and human-authorized ("the Solver
never pushes" is unchanged).

**3. Session registry with quest leases, in the shared git common dir.**
`solve/state/` is gitignored and gitignored means per-worktree — invisible
to exactly the sessions it should coordinate. The registry lives under
`$(git rev-parse --git-common-dir)/lagrange-sessions/`: one file per live
session (agent, worktree path, branch, quest id, claimed scope, heartbeat).
It must ENFORCE quest→session exclusivity — nothing today stops two
sessions opening the same quest and forking its append-only log, whose
divergent merge is undefined. Stale entries are GC'd against
`git worktree list` (tmp worktrees vanish on reboot).

**4. Machine-level evidence mutex.** Worktrees do not isolate the machine,
and this workflow's currency is measured evidence: quests run docker,
Postgres, systemd units, and capacity benchmarks with --jobs=8. Two
concurrent benchmark runs do not merely flake — they corrupt each other's
capacity measurements, which the Solver then seals as durable evidence. Any
live/benchmark scenario acquires a machine lock (a lock dir in the git
common dir beside the registry) before running; deterministic in-process
tests stay unlocked. This outranks every convenience item above.

**5. Scope-overlap advisory fed by the registry.** The per-quest changed-path
union already exists (scope-pressure attemptInspections) and cross-quest
enumeration costs ~2.7s over 490 quests — already paid by the frontier
board; `emitRetreadWarnings` is the model. But under worktrees a peer's
in-flight scope is invisible to local `solve/` scans, so the advisory reads
claimed scopes from the registry (item 3), falling back to landed scope.

**6. Gates measure the commit where it still matters.** Adopting item 1
makes most tree-scoped gate misfires moot. Where a whole-corpus ratchet
must judge a push (duplication, file-size), subset/staged flag modes are
REFUTED — corpus baselines make subset runs vacuously pass. The honest form
materializes the pushed tree into a throwaway worktree (session-worktree.js
is reusable; the duplication baseline itself was "measured in a clean
worktree") and runs there.

**7. Red-main guard: scoped and attributable.** The guard now fires only on
pushes that update refs/heads/main (landed 2026-07-29), so agent branch
pushes are never hostage to main's state. Optional follow-up: a
known-attributed-red exemption — acknowledge a specific failing run's
headSha in the registry dir so unrelated main pushes stop needing
LAGRANGE_PUSH_ON_RED while a fix is in flight.

## Refuted / deferred

- Blanket "generators refuse dirty trees": REFUTED — every landing
  deliberately regenerates the frontier board on a dirty tree, and
  steering:check runs inside test:static locally. Scoped variant only:
  refuse when the generator's OWN output paths carry foreign modifications.
- Branch-CI + merge queue: deferred until a third concurrent agent exists.
  Branch pushes get no CI today (push triggers are main-only; PRs are
  cloud-only for fork safety), there is no merge_group wiring, and the gate
  topology assumes trunk pushes. Revisit with runner-trust explicitly
  decided.

## Open questions

- Registry/lease implementation: plain files + flock, or a solve subcommand
  (`solve session claim/release`) so leases appear in solve status output?
- Should the evidence mutex be advisory (warn) or mandatory (block) for
  scenario-harness live probes on first rollout?
- Integration cadence: land agent branches one-at-a-time on demand, or a
  scheduled sweep?

## Decision log

- 2026-07-29 — Epic drafted from the two-session interference incidents and
  adversarial verification. Landed the enabling direct work: relative
  hooksPath, per-worktree eslint cache, red-main guard scoped to main
  pushes. Next quests to author: session registry + quest leases (item 3),
  evidence mutex (item 4), registry-fed scope advisory (item 5).
- 2026-07-29 (later) — Items 3-5 implemented and quest drafts authored
  ([mutex](../quests/parallel-evidence-machine-mutex.json),
  [leases](../quests/parallel-session-quest-leases.json),
  [advisory](../quests/parallel-session-scope-advisory.json)). Open
  questions resolved: leases are a solve-integrated claim (enforced at
  `solve start`/`continue`, CLI for manual claim/release); the evidence
  mutex is MANDATORY with a loud bypass env var, not advisory — corrupted
  sealed evidence outranks a wait; integration cadence stays on-demand.
- 2026-07-30 — Item 1 bootstrap tooling landed: `scripts/worktree-setup.sh`
  creates `agent/<name>/<quest-id>` + a sibling worktree, installs the
  relative hooksPath, copies gitignored `solve/config.json`/`.env*`, and
  symlinks `node_modules` (the pre-commit eslint cache already lives in the
  worktree-private git dir, so no cache sharing results). Refuses to reuse an
  existing branch or path. Replaces a broken symlink to an external template
  the file previously was.
- 2026-07-30 — Item 6 landed: whole-corpus gates now measure the tree being
  PUSHED. `scripts/checks/push-gate-corpus-worktree.js` materializes the
  pushed tree into a throwaway worktree via `session-worktree.js` (the exact
  `--ref <local-sha>` when the pre-push hook captured one, else the live
  working-tree state) and runs `test:duplication` + `check-file-size-
  thresholds` there; pre-push captures the first pushed local-sha and calls
  it instead of running those two against the working tree. The eslint leg
  stays tracked-only in the working tree (already correct without a
  snapshot). Verified: passes on HEAD, `--ref HEAD` excludes foreign
  untracked files, working-tree mode includes them.
- 2026-07-30 — Item 7 follow-up landed: known-attributed-red exemption.
  `scripts/solve/red-main-exemption.js` (ack/clear/list/is-exempt) records a
  red CI run's exact headSha under the shared `lagrange-sessions/` dir; the
  red-main guard now reads `headSha` alongside `conclusion` and exempts a
  main push only while the current red head is acknowledged — a red at any
  other head is a new signal and still blocks. Verified: block unattributed →
  proceed when acked → block on a new head. Items 3-5 quests remain
  open/unsealed; items 2 (integration cadence) is process-only.
- 2026-07-30 — Items 3-5 quests CANNOT be sealed in their current form.
  Their doneWhen probes read scenario-harness reports; the runner
  (`scripts/checks/run-parallel-session-scenarios.js`) now produces them and
  each probe reports done:true at consecutive=3. But the Solver seal flow has
  NO no-change attempt path: every terminal attempt must seal a non-empty
  `diff:` artifact, and the verifier fingerprint is `git diff <base> --
  <paths>` recomputed LIVE from the working tree at land time. Every corpus
  precedent (benchmark-semantic-parity, -v2, opportunity-calculator) sealed
  with its change still UNCOMMITTED in the working tree; the land's
  autoCommitQuest committed it afterward. Items 3-5's implementation was
  committed at authoring time (9b2a111c, c5ee327e), so at HEAD their diff is
  empty and no verifier fingerprint can reproduce. A "retroactive" artifact
  would be a hand-written diff claiming content the tree does not hold —
  fabrication the canonicalization machinery exists to reject. Resolution is
  one of: (a) a Solver measurement-only/repro-on-HEAD attempt path for
  already-committed process quests (a Solver feature, itself a quest); or
  (b) re-authoring the three quests around a real future change. Do NOT
  hand-author attempt.diff.json for already-committed code.
