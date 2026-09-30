# Owner decisions O1, O2, O4 (2026-09-26, binding release decisions)

Recorded verbatim in substance from the owner's directive after the session restart. Settled decisions (seed parity, F1, lease verdict, readiness wake-up, D1, D2) are not reopened unless a current challenger produces a genuine contradictory falsifier.

## O1: committed-membership read plus participation gate, now

Implement the smallest general membership-owner boundary that removes services rows as consensus authority during replica startup. The semantic split:

- services/placement rows = discovery / desired topology;
- committed Raft membership = consensus participation authority.

A starting or rejoining replica may use topology rows to discover where and how to contact the group. It must not gain voting, campaign, leadership or write authority from those rows.

Required shape:
- one authoritative operation for reading the current committed membership through the existing operation-only Raft boundary;
- no RawNode, store, lifecycle object or mutable membership structure exposed;
- immutable membership data: voters, outgoing voters / joint state where applicable, learners, and a configuration identity or version if the Raft layer exposes one safely;
- reused for ADD, REPLACE and formation wherever they bootstrap consensus authority from projected rows; no REPLACE-only remote read.

Participation gate: until committed membership is resolved and the replica has established its legitimate role it fails closed for consensus participation. At minimum it may not campaign, vote as a member, become leader, commit writes, or claim authoritative quorum membership. Only the minimum receive/replay behaviour needed to catch up and discover its state is permitted. The gate answers with a typed "not admitted / membership unresolved" result, never a generic unavailability. This protects against missing committed voters in rows, phantom rows, stale desired topology, and an unadmitted replica repeatedly raising terms.

Bootstrap sequencing: (1) discover group/contact information; (2) obtain authoritative committed membership from an existing authoritative member; (3) establish local bootstrap/replay state; (4) prove this replica's current membership role; (5) only then enable normal participation. If log replay must precede step 4, the gate stays closed during replay. The "genesis entirely in the replicated log" architecture is NOT this release; it is recorded as the later R2 simplification target.

## O2: do not exclude the joiner itself now

The rule on whether a new replica includes itself in its initial local bootstrap representation is unchanged this release unless the committed-read implementation proves it unsafe. The release goal is: no projected row set can grant consensus authority before committed membership establishes it. If a challenger shows that including self before admission can bypass the participation gate, fix the gate / role establishment, not the bootstrap membership convention.

## O4: rejoin without durable membership evidence refuses

A replica claiming to rejoin with neither a durable local membership/history record sufficient for recovery nor authoritative committed membership proving its role must not reconstruct consensus membership from services rows. It returns a typed refusal from an existing error family if one fits (the repository's equivalent of `membership-history-unavailable` / `reseed-required`), distinguishable from temporary remote-member unavailability, ordinary learner / not-yet-admitted state, and permanent membership exclusion. Under the hard cutover: fail closed and reseed rather than guess.

## Challenger requirements before O1 implementation

Both challenger reports are merged into one amendment before evidence is written, answering explicitly: (1) which call sites turn services rows into Raft authority; (2) the earliest point a new replica can campaign, vote, raise term, lead or accept a proposal; (3) which of those precede known committed membership; (4) whether a nonmember can make a legitimate leader step down; (5) whether raft-rs rejects such traffic or the runtime owner must gate it; (6) ADD, REPLACE, formation, restart, rejoin, RF=1; (7) joint configuration; (8) read failure/staleness and fail-closed behaviour; (9) the membership/communication cycle; (10) the minimal discovery channel that breaks it without granting authority. The challengers do not turn this into a membership rewrite.

## Evidence model for O1 (semantic properties)

- M1 projected topology cannot grant participation: rows claim membership, committed membership excludes the replica: no campaign, no valid vote, no leadership, no commit authority.
- M2 a missing projected row cannot erase committed membership: committed voter A omitted from rows: a bootstrapping replica still converges on membership containing A before participating (closes the D1 residual gap).
- M3 authoritative admission enables participation: once committed membership includes the replica in its role and local recovery reaches the required point, the gate opens; legitimate joins are never permanently locked out.
- M4 restart/rejoin equivalence: valid durable history converges to the same membership/role as an uninterrupted replica; insufficient history refuses/reseeds.
- M5 unadmitted traffic cannot destabilize authority: an unadmitted replica in projected topology that knows peer addresses cannot repeatedly disrupt the group; if that needs inbound filtering by committed membership, it lives at the authoritative Raft ingress, not scattered among campaign callers.

## Merge order (unless a challenger proves a dependency)

1. finish/commit the current REPLACE production checkpoint; 2. verify its focused gates; 3. merge the D1 bootstrap safety repair; 4. integrate the O1 committed-read / participation-gate work; 5. evidence-only commits separately; 6. mechanically verify production SHA versus evidence SHA; 7. fresh verifier; 8. one A2 gate. Trial-merge before expensive verification while several production branches remain.

## Process points

- The current single REPLACE implementer finishes its owner work (four guideline hits, membership-change wake-up, durable removal-intent boundary, D2 timeout removal, bounded re-drive, completion by committed membership, planner exclusion, handoff-attempt identity, restart/recovery, preserved readiness wake-up) before unrelated membership-owner changes enter its worktree. The D1 planner witness is reused, not duplicated.
- Lab execution needs committed SHAs: clearly marked checkpoint commits are allowed. Changed-file selection compares against an explicit SHA (production corrective vs its parent; evidence-only vs the frozen production_sha; final A2 = full corpus); parameterize the existing lab owner, never a second selector.
- The seven convergence reds are classified load-sensitive flakes for this checkpoint; reopen only if they recur under controlled conditions with a materially changed rate or mechanism.
- The four staged guideline hits are ordinary blockers fixed at their intended abstractions; no checker suppression, no baseline growth, no new verification round unless behaviour changes.
- Restart discipline: checkpoint first; verify branch/HEAD/worktree map and origin; check agent outputs; rerun only the smallest witnesses; resume roles; no expensive re-gates for a restart alone. The checkpoint names production SHA, evidence SHA, open findings, agent/worktree ownership, next semantic action, last expensive gate completed, merge order.

## Stop conditions (owner escalation)

- the committed-membership read cannot be obtained without first granting the unauthorised replica consensus participation;
- enforcing the gate requires turning the public operation-only seam into an object/handle seam;
- RF=1 becomes impossible under the decided semantics;
- a challenger proves the hard-cutover/reseed model insufficient for safe recovery;
- a new safety property forces a choice between incompatible product contracts.

Merge conflicts, test failures, guideline failures, evidence fixes and lab placement are not owner decisions.
