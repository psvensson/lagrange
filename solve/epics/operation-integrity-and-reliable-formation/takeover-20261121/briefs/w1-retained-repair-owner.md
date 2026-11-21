# W1 — retained placement repair owner: publication and continuation contract

You are the single writer for the retained placement repair owner. Lead: the
Claude session that briefed you (plans, reviews, verifies, integrates).

## Where
- Worktree: `/mnt/data/peter/projects/.worktrees/retained-ledger-observation-repair-20261121`
- Branch: `work/retained-ledger-observation-repair-20261121`, tip `0993265e5` (pushed).
  The 14 commits `812dd3a1b..0993265e5` are UNVERIFIED WIP by a previous agent
  (Codex). Nothing in them has been executed. Treat them as a draft you own now:
  keep what is right, correct what is wrong, delete what is unnecessary.
- Read first: `docs/steering/rules.md`, `architecture/contracts/authority-and-recovery.md`,
  `docs/steering/workflow-guidelines/solver-quests.md` (section "Contract-first owner work"),
  `test/guidelines/INDEX.md` (what you need for writing tests).
- Owning quest for records: `fresh-formation-user-table-routability`
  (epic `operation-integrity-and-reliable-formation`). Do NOT run `solve.js land`,
  `evidence add`, `npm run publish` or anything that pushes to main. The lead records.

## The shared definition (acceptance bar)
"A publication change is a hint to reconsider the current canonical binding.
A failed authority read leaves reconsideration owed. A durable outcome settles
only the exact entry it proves."

## Production facts you must build on (verified by census, re-verify what you rely on)
- Partition SERVICES rows NEVER carry raft_role=leader: every partition writer
  collapses leader to follower (`queueRoleUpdate`, `src/partition/partition-service-metadata-delivery-methods.js:28-32`;
  `partition-service-row-owner.js:87-102`). No exception for the ledger partition.
  Decision table: `docs/specs/decision-tables/leadership-authority-projection.json`
  (owner decision 2026-08-23).
- Leader identity is published through PARTITIONS `leader_node_id`
  (`queueLeaderNodeUpdate`, same file :38-41); `applyReplicaLeadership`
  (`src/raft/replica-leadership-state.js:62-80`) drives both lanes.
- The coordinator already forwards PARTITIONS and SERVICES cache changes to the
  repository (`src/rebalancer/rebalance-coordinator-lifecycle.js:540-546`), on a
  deferred channel: the notified row can lag the cache.
- `src/partition/group-retirement-redrive.js:455-461` (`announcesLeader`) is an
  existing consumer with the correct shape.
- Canonical route: `resolvePlacementLedgerRoute` in
  `src/rebalancer/replica-placement-owner-transport.js` (PARTITIONS leader through the
  canonical observation + exactly one ACTIVE identity-bound SERVICES endpoint, else null).

## Required corrections (independent review of a046d5495 + the two direction commits)
Verify each finding in the code before acting; if one is wrong, say so with evidence.

A. Leadership handoff
 A1. Wake/rebind must derive from the CURRENT canonical route in the cache, never
     from the notified row (delayed B notification after cache advanced A→B→A must
     not move the attempt to B). d8f033497/0993265e5 start this; finish and prove it.
     The route port must be REQUIRED: a default `() => null` that silently disables
     route observation is a forbidden silent fallback.
 A2. HANDOFF currently reads SUBJECT scope (own id only) and, when the row is
     absent, proposes without evaluating known blockers. On the ledger leader this
     commits one redundant BUSY refusal per route flap. HANDOFF must use the same
     contention evaluation as RETRY. Unchanged BUSY ⇒ zero native proposals.
 A3. Custody has no tenure identity. A receiver's no-custody `unavailableReply`
     (not leader / shutting down) leaves the sender's `delegated` set and its own
     retry skipped; a receiver restart on the same node/replica/address leaves the
     route tuple unchanged ⇒ no wake source ⇒ obligation stuck. Bind custody to the
     receiver's tenure (term and/or boot incarnation; use the identity the existing
     owners already carry, do not invent one) and clear delegation when the receiver
     disclaims.
 A5. No mutation of `expectedOwner` inside a classifier while a decision may be in
     flight unless you can show the serialization that makes it safe; prefer queueing
     the observation and applying the rebind inside the serialized decision.

B. Unavailable authority read
 B1. Decide, in the transition record, whether the continuation reuses the
     workflow owner's per-operation fenced, deadline-bearing retry entry introduced
     for the same bug class (commits 29cd457e5 → 953d705f8,
     `operation-workflow-observed-progress-retention.js`, `operation-workflow-owner.js`)
     or whether the repository must own its own. One mechanism per concern (R01/R11):
     if a second one is justified, state why the first cannot serve. Carry the real
     read failure reason; do not synthesize `{retryAfterMs}`.
 B2. A read failure must not overwrite the blocker condition. `clearingTrigger` is
     still set to LEADERSHIP_START on read failure in `settleRetainedRepairDecision`
     and `consumeRetainedRepairObservation` (three paths). Keep "revalidation owed" as
     its own named field; the blocker's clearing trigger stays what the committed
     refusal said.
 B3. A successful read must clear only the retry bits that read satisfied. A LEADER
     observation diverted during backoff must still have its effect.
 B4. Permanent failure is explicit and bounded: READ_FAILED / UNQUALIFIED /
     INVALID_ROW must not all collapse into "retry every second forever". Name the
     outcomes; a malformed row is a typed refusal that keeps the obligation, authorizes
     no proposal, and is visible. State the bound.
 B5. Retirement (including deletion without a read), replacement and shutdown cancel
     the continuation and reset backoff. No activity after shutdown.
 Not acceptable: re-inserting the observation into the current drain (spin);
 persistently caching UNAVAILABLE.

C. Read-count witnesses and decision reuse
 C1. Remove UNAVAILABLE from reusable decisions. Reuse is allowed only for an
     explicitly identified OVERLAPPING turn (a request that joined a decision that was
     in flight when it arrived). A later request after settlement starts a bounded
     fresh decision with a fresh qualified read.
 C4. A joiner may inherit only a decision whose mode covered proposing; never answer
     ABSENT without either a proposal or a queued owner retry. Check PENDING reuse
     after an uncommitted native answer (BACKPRESSURE/RESERVED) on an idle ledger, and
     the delegated JOIN after a committed refusal that finds ABSENT.
 Tests: replace the four `reads === 1` invalid-census cases with two schedules on
 the virtual time source (no wall-clock 100 ms race; a test must fail with a message,
 never hang to the timeout):
   - overlapping arrivals: one owned decision, one qualified read;
   - sequential arrivals: a bounded later decision, no concurrent duplicate, fresh read.
 Every case must reach: invalid authority ⇒ no proposal, no replacement of the
 retained identity, no retirement of debt; recovery ⇒ a later legitimate trigger
 obtains fresh authority after an earlier unavailable result. Do not make a count
 assertion the first assertion that prevents the safety assertions from running.

Record shape (R07): declare `delegated`, `nativeService`, `nativeAnswerPromise` in
the record with named initial states; replace `null`-means-something sentinels
(`blockers: null`, `clearingTrigger: null`, `expectedOwner: null`,
`retainedPlacementRepairReleaseSequence ?? 0`) with named states.

Fixtures (producer fidelity): the leadership fixture must drive the REAL publishers
(`applyReplicaLeadership` → `queueRoleUpdate`/`queueLeaderNodeUpdate`) into the
coordinator's cache through real cache admission, and the remote sender through real
CDC delivery, not hand-built rows and hand-called `observeRetainedPlacementRepairCommit`.
"Endpoint not arrived" = the row is missing (not a wrong-address row). No fixture may
write raft_role=leader on a partition SERVICES row.

## Required witnesses (the decisive ones)
 1. A→B→A with a delayed stale B notification; unresolved entry id, exact body,
    operation identity and minimum term/index preserved; no other caller.
 2. PARTITIONS-first and endpoint-first publication orders; endpoint truly missing;
    two ACTIVE endpoints for the leader node (ambiguous) ⇒ obligation retained,
    later publication makes reconsideration reachable.
 3. Origin node becomes ledger leader with unchanged BUSY ⇒ count of native
    proposals is exactly zero (count them; `messages.some` is not a count).
 4. A visible committed winner needs no new proposal.
 5. Receiver restart / not-leader disclaim with unchanged route tuple ⇒ sender resumes.
 6. One real release, one transient read failure, same-provider recovery in the same
    term, NO other caller/row/leadership/cache event ⇒ the original repair completes
    exactly once. Permanent failure ⇒ bounded, obligation kept, zero proposals.
 7. Read failure on the ingress, consume and post-resolution paths ⇒ blocker trigger
    unchanged; a real release commit during the outage is not dropped.
 8. Retirement/shutdown with an armed continuation ⇒ nothing fires afterwards.
 9. Queued LEADER observation joins an in-flight decision before being consumed.
Each witness must be shown RED on the predecessor it claims to fix (state which
commit) and GREEN on your candidate. Mutation by mechanism: for each of
{lost wake, stale custody, blind handoff proposal, reused unavailable, overwritten
trigger, uncancelled timer} show one mutant the suite kills.

## OUT of scope here (another writer owns them — do not edit)
- `src/partition/partition-placement-admission*.js` (NULL-fingerprint outcome format
  and the pause/replay ordering): owned by W1b in another worktree.
- The other ~18 SERVICES raft_role readers found by the census (W3).
- Canonical mutation port / route branch composition (W2).
If you find a defect outside scope, report it; do not fix it.

## How to work
Stage 1 (then STOP and report to the lead): 
  a. A contract-first transition record for the retained owner (the 8-item checklist
     in solver-quests.md: producer/consumer symbols, owner-defined shape, identity and
     generation, ordering, absent vs unavailable, durable commit, retained
     obligations, canonical wake and cleanup), written to
     `/mnt/data/peter/projects/lagrange-takeover-20261121/reports/w1-transition-record.md`.
     Include the B1 decision and a state/event table: states of a retained attempt ×
     events (own-row commit, blocker clear, capacity release, route change, route
     unavailable, read ok, read unavailable, read invalid, native answer kinds,
     disclaim, retirement, shutdown) → next state, effect, continuation owner.
     Every cell filled or marked impossible with the reason.
  b. The red witnesses above, committed and pushed, executed on the lab (below) with
     the red results retained.
Stage 2 (after the lead answers): implement, iterate to green, mutation table.

## Hard rules
- No legacy, compatibility or fallback logic of any kind; one version of any logic;
  unavailability is a typed outcome. Do not add capability probes
  (`typeof port === 'function'`) or optional ports with silent defaults.
- Systemic first: when you find a defect, look for its siblings in this owner before
  patching the instance.
- Tests run on the lab, not locally. Local: only eslint on changed files and
  single node-free unit files, under `nice -n 19 ionice -c3`, one at a time.
  Lab: commit, `git push origin work/retained-ledger-observation-repair-20261121`, then
  `LAGRANGE_LAB_AGENT=claude:w1-retained node /mnt/data/peter/projects/lagrange-takeover-20261121/tools/focused.mjs <full sha> tv-dator 0dbed1718c2d07c1fcb8bbe56b87ac41763c262c /mnt/data/peter/projects/lagrange-takeover-20261121/lab/w1-<label> <test files...>`
  (your assigned host is `tv-dator`; if it is busy the run reports host-busy: wait
  and retry, do not switch hosts on your own). Keep every output directory; the first
  failure of a run is its result and is never overwritten.
- Git: commit small, push after every commit (plain branch push). FORBIDDEN:
  `git reset --hard`, `git checkout -- <path>`, `git clean`, `git rebase`,
  `git commit --amend`, `git stash`, force-push, `--no-verify` unless the hook fails
  for a reason you report. Never touch other worktrees.
- Commit trailer:
  `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`
- Report honestly: what was executed where with which sha and result, what was only
  read, what is unverified, what you could not do. Unverified claims are labelled.
