---
epicContractVersion: 2
id: dead-base-attempt-disposition
roadmapRow: null
graduatesTo: null
---

# Disposition of attempts whose workspace base commit is unreachable

## Intent (why now)

Fourteen of the nineteen open Quests cannot reach verification. Each has at
least one recorded attempt whose `workspaceBaseCommit` names a commit that does
not exist in this clone and is not on the remote. The Solver recomputes the
approval fingerprint by diffing that base against the working tree, so when the
base is gone the receipt can never be reproduced, the obligation can never be
discharged, and the Quest is stuck. Parking does not release it: five of the
fourteen already carry `park kind=exhausted` and remain open. This is the
single largest blocker on open work, and the decision it turns on — may a dead
base be re-pointed, or must such an attempt terminate — is a change to Quest
canon that every terminal Quest was closed under. That makes it a cross-Quest
framing decision rather than something to settle inside one Quest.

## Options under discussion

- **Option A — substitution.** Re-point a dead base to a reachable commit that
  reproduces the attempt's recorded `changeRefIdentity.sha256`, recorded in an
  appended side manifest with the historical field preserved. Trade-off: it
  keeps the original approval intact and needs no fresh evidence, but it cannot
  identify a base — measurement found 823 of 2926 reachable commits (28% of
  history) reproduce the fingerprint for one sampled attempt, so the criterion
  certifies an equivalence class, not provenance. It also expires: the
  fingerprint is computed against the live working tree, so the first commit
  touching a recorded path invalidates the entry. Reach is small — 3 of 43
  affected attempts, and only 2 Quests where the blocking attempt is covered.

- **Option B — typed termination.** An attempt whose base is unreachable is
  classified with a typed code, excluded from live replacement and checkpoint
  obligations instead of being pinned by a fail-closed ancestry probe, never
  counted as approval, and the frontier proceeds with a fresh attempt at a live
  base or an explicit park. Trade-off: it covers all 43 attempts across all 14
  Quests uniformly and claims nothing it cannot prove, but it discards the 3
  reproducible approvals and requires fresh evidence for work that in a few
  cases is provably unchanged in the tree.

## Measured basis

Probes run 2026-07-25 at HEAD `6ca31dd5`, read-only:

| Measurement | Result |
| --- | --- |
| Distinct recorded base commits that no longer resolve | 217 of 233 |
| Dead-base attempts / open Quests affected | 43 / 14 |
| Attempts with a reachable base reproducing the fingerprint | 3 |
| Quests whose *blocking* attempt is reproducible | 2 |
| Attempts whose recorded change is still present in the tree | 9 |
| Attempts whose change is absent and does not apply cleanly | 34 |
| Commits reproducing one sampled attempt's fingerprint | 823 of 2926 |

For the 34 absent-from-tree attempts the negative result is provable rather than
search-limited: if the changes are not in HEAD, no base can produce a diff to
HEAD containing them. Uncertainty is confined to 6 attempts.

Cause, established from committer dates: zero of 2926 commits have an author
date differing from its committer date, so no rebase, amend, or filter-branch
ever touched this history. The dead bases were local commits that were never
pushed, discarded when the working copy was re-cloned on 2026-07-23. They are
not recoverable from the remote.

## Open questions

- Should the 3 reproducible approvals be salvaged by a narrow tree-anchored
  criterion — the artifacts' recorded pre-image blobs plus an explicit ancestry
  constraint — layered on top of the chosen mechanism, or written off? Carrying
  two mechanisms to release two Quests may not pay for itself.
- What prevents recurrence? Recording an attempt while HEAD is ahead of every
  remote-tracking ref is the mechanism that produced all 217 dead bases. A
  record-time warning is cheap; whether it should ever hard-fail is unsettled,
  because that would block legitimate offline work.
- How are the 6 uncertain attempts classified if a wider search later finds a
  reproducing base for them?

## Decision log

- 2026-07-25 — Measured the population and the two options (table above).
  Established that no history rewrite occurred and that the dead bases are
  unpushed local commits lost in the 2026-07-23 re-clone.
- 2026-07-25 — Rejected the framing that the recorded changes are lost. The
  approval fingerprint is stored as `changeRefIdentity.sha256` and the change
  artifacts survive; what is lost is the git anchor, and for 34 of 43 attempts
  the tree has moved past them regardless.
- 2026-07-25 — Rejected Option A as the primary mechanism. Exact fingerprint
  reproduction is 823-fold ambiguous and therefore cannot establish provenance;
  the anchor is computed against the live working tree and expires on the first
  commit touching a recorded path, so the mechanism would break on the first
  use it enables.
- 2026-07-25 — **Selected Option B, typed termination.** Chosen for reach (43
  attempts and 14 Quests rather than 3 and 2) and for honesty: it never reports
  an unverifiable attempt as approved. Accepted cost: the 3 reproducible
  approvals are written off unless the first open question is later answered.
- 2026-07-25 — Recorded that this graduates to one executable Quest, and that
  the Quest must also change the same-base rule in
  `docs/steering/workflow-guidelines/solver-quests.md` and regenerate the
  steering packs, because that rule is Level-2 authority rather than
  implementation detail.
