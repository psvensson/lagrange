# Round 2 units: common rules (read fully before anything else)

Repository: Lagrange, a distributed SQL database in Node.js. You work ALONE and SERIALLY in
the one git worktree your brief names (`/mnt/data/peter/projects/lagrange-unit-<x>`, branch
`unit/round2-<x>-20261111`, base `f11410ef7`; `node_modules` is a symlink). Never edit any
other checkout (`/mnt/data/peter/projects/lagrange`, other `lagrange-unit-*`,
`lagrange-wip-lab`, `lagrange-checkpoint-epoch`); you may read them. Do not split yourself
into sub-agents or forks.

## Context
The base is a work-in-progress branch: a day of formation-stability repairs (typed
outcomes, deletion of fallback logic, guarded writes) plus one round of test triage. The
full suite on four lab machines on exactly this commit: 2,763 files, 2,749 pass, 14 fail.
- Lab log: `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/a72adb86-b330-4c2f-8a5a-17ddde9202f7/scratchpad/lab-run3.out`
  (lines are prefixed `[host]`; grep by test file name, then read that host's lines).
- Per-file results: `/mnt/data/peter/projects/lagrange-wip-lab/test-output/reports/test-results-*.ndjson`.
- What changed today and why: the tail of
  `solve/quests/fresh-formation-user-table-routability/log.ndjson` in the PRIMARY checkout
  `/mnt/data/peter/projects/lagrange` (it has entries newer than your worktree's copy), and
  `solve/epics/operation-integrity-and-reliable-formation/*2026-11-11*.md`.
- Read `CLAUDE.md` and `docs/steering/rules.md` in your worktree first.

## Owner's standing directives (binding)
- Every bug is systemic unless proven local: find the first causal divergence, census the
  other consumers of the same contract, repair at the owner. Check git history for earlier
  occurrences of the same class.
- No legacy or fallback logic anywhere: no aliases, compatibility paths, catch-and-default,
  feature detection of an owner's port, text matching on errors. One version of any logic.
- Always remove unused code and paths you find or create.
- Never weaken an assertion to get green; never raise a ratchet baseline or a budget; never
  edit a pin, receipt or sealed quest text. Tighten a baseline when its checker prints the hint.
- A product change needs a witness that is RED first, from the production entry point, and
  mutation-checked (reverting the fix turns it red for the right reason).
- Fakes never hand-copy production logic: use the real producer or the shared fixture.

## Testing
One test file per command, thermally gated and serialised with other agents, from YOUR
worktree root:
`node /mnt/data/peter/projects/lagrange/scripts/checks/wait-for-thermal-headroom.js && flock /tmp/lagrange-local-test.lock nice -n 15 node scripts/run-test-files.js --jobs 1 <file>`
One lock acquisition per file. Never a multi-file loop under one lock, never hold the lock
while waiting on the thermal gate, never queue many background test commands. Run only the
files your work touches and their direct neighbours. Never `npm test`, never a broad suite,
never a cluster or lab run, never ssh writes to lab hosts (read-only ssh inspection is
allowed). Never search from a repository root (it walks worktrees and `node_modules` and
hangs): always name `src/ test/ scripts/ docs/ solve/ architecture/ vendor/ charts/`.

## Git (your worktree only)
Commit on your unit branch: small commits, one per cause, message prefix
`wip(round2-<x>): `, with `LAGRANGE_SKIP_PRECOMMIT=1 git commit` (the hook's documented WIP
bypass; these are WIP unit commits, not landings). Stage only files you changed
(`git add <paths>`, never `-A`). No push, rebase, amend, reset, stash or branch switching.
Do not regenerate generated artifacts (`test/shards/*`, `INDEX.md`, tools index) unless
your brief says so; list added or deleted files for the lead.

## Report (your final message; you cannot write report files)
What you established (cause with file:line and the event sequence, measured versus
inferred), what you changed, red-first and mutation evidence, exact test counts, your
commits (`git log --oneline f11410ef7..HEAD`), what is still red and why, what needs an
owner decision (with your recommendation), and doubts. Be exact; say what you did not run.
