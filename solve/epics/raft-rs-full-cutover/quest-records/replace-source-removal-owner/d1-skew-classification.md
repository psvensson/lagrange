# D1 skew classification (owner directive 2026-09-25)

Measured on worktree `replace-d1` at HEAD a201874ea, which contains the D1 fix a13bb03cd. No src was changed. Scratch probes only:
- `probe.mjs`, with output in `probe-output.txt`;
- `diag-run.mjs`, with output in `diag-output.txt`.

Everything is in this directory.

**Setup**
- Real `PartitionService` replicas on rs-raft, each with its own SQLite file, on a loopback transport. Per-sender delivery filters provide partitions.
- The target's bootstrap goes through the production chain:
  1. `createOperationRecordInternal` stamps the operation from the services rows given to it (cache and services-owner read both served those rows);
  2. the target-node `ReplicaHandler.resolveReplicaContext` resolves the stamp over a target cache with no rows for the partition;
  3. `PartitionService` builds the replica with the rs-raft port.
- Verdicts come from each replica's `readStatus()` (role, term, commitIndex, confState), from the durable `_raft_rs_log` read on an independent read-only connection, and from the applied table rows.
- Timing: heartbeat 20 ms, election 150-300 ms. Pre-vote and check-quorum are off, which is the production tuning (`RAFT_RS_GROUP_TUNING`).

**Status wording (directive):** "concrete REPLACE bootstrap safety repair complete; authoritative remote-membership sourcing still under classification". The classification below settles the second half.

---

## Case 1: missing committed voter (the rows omit a committed voter)

**Verdict: SAFETY VIOLATION.** By the decision rule, the authoritative committed-membership read becomes a pre-publish blocker. The membership/replica owner owns it, and ADD, REPLACE and formation share it.

### M: k = 1, RF 3 (founders a, s, b; the rows given to target t omit s)
**Bootstrap.**
- Committed configuration: {a,b,s}.
- Stamp: {a,b,t}. Resolved list and the target's ConfState: {a,b,t}.

**Before admission.**
- The target's log is empty. A single campaign went from term 0 to 1, which equals the group's term, so it was rejected.
- The target never leads, is never asked for a vote and holds no entries. The unadmitted churn in case 2 applies here too.

**Admission and replay.**
- The leader admits t, and t replays the whole log (commit 2 of 2).
- The leader's ConfState is {a,b,s,t}. **The target's ConfState after full replay is still {a,b,t}: never corrected.** s is a founding voter, so no ConfChange in the log names it.
- A voter omitted from the rows is corrected by replay only if some committed ConfChange names it:
  - a joiner is corrected when its AddNode applies (in the first probe version, a target bootstrapped from rows {a,b} showed {a,b,t1,t2} after replaying t2's AddNode);
  - a founder is corrected by nothing, until a ConfChange that removes it commits.

**Minority of the authoritative configuration alive (t and a: 2 of 4).**
- **The target became leader** at term 1 to 2, counting a quorum of 2 over its view {a,b,t}.
- **It committed its term-2 entry at index 3**: its commitIndex is 3, a's commitIndex is 3, and the durable tail is `{3, term 2}`.
- This is a leader under a wrong voter set, and a commit whose quorum (2 of 4) is invalid under the authoritative membership.

**Arithmetic.** For one omitted voter in an authoritative set of n, the target's majority is floor((n-1)/2)+1. Against the true majority floor(n/2)+1 the sum is n+1, so the two quorums always intersect: k = 1 alone gives an invalid quorum and an invalid leader, but no split. For k ≥ 2 missing voters with odd n, the sum can equal n, and quorums can be disjoint.

### D: k = 2, the decisive split brain (founders a, b, s1, s2; the rows given to t omit s1 and s2)
- Target view after admission and full replay: {a,b,t}. Authoritative: {a,b,s1,s2,t}.
- Partitioned {t,a} | {s1,s2,b}:
  - **t leads term 2** on {t,a}: 2 of 3 in its view, 2 of 5 authoritative;
  - **s1 also leads term 2** on {s1,s2,b}: 3 of 5, valid.
  - That is two leaders in the same term, which breaks Raft election safety.
- One write through the partition's own write path (`insertData`) on each side:
  - **both are acknowledged**, and both sides commit index 4 (t, a, s1, b all at commitIndex 4);
  - the durable log holds **two different entries at index 4 with the same term 2** (different payloads on the two sides);
  - the applied table rows are `a: [101]` and `b: [202]`.
- The committed history diverged under one (index, term) identity. Raft's log matching can never detect or repair this: permanent, silent data divergence.

### Exposure on the fixed path
D1 removed the one **deterministic** source of this skew: the REPLACE creation stamp subtracted every REPLACE's own source. The red-first witness showed a target elected under {a,b,t} with committed voter s missing; that is exactly case M. But the bootstrap is still row-derived. Any services-row skew that omits a committed voter reproduces M or D on a13bb03cd. The probes above ran on the fixed code.

Row paths that can omit a committed voter. These are from reading the code, not measured in production:
- **Stamp null.** For partitions, `buildOperationBootstrapTopology` returns null when the rows are empty, when ≤ 1 replica id remains, or when an address is missing. The target then resolves from its own cache or hydration.
- **Viability filter.** For priority control-plane partitions, `resolveReplicaContext` drops cache peers on non-viable nodes. A committed voter on a node that looks non-viable is then left out whenever the stamp does not carry it.
- **Rows removed ahead of the ConfChange.** A row can be deleted, or left behind, before a RemoveNode commits. The REMOVE/cleanup paths do this, and the DELETE-driven REMOVE_PEER is usually skipped because address resolution fails (challenger A10 caveat). Such a voter stays committed with no row.
- **Durable-rejoin restore planner.** It keeps only ACTIVE rows. This matters only when the replica has no durable record.

**k ≥ 2 reachability.** Two committed voters must be missing from the rows given to one new replica, with an odd authoritative size once it is admitted. Examples: RF 4, or RF 3 with a second concurrent ADD. Any of the mechanisms above can remove two voters, for example two non-viable nodes on a priority partition while the stamp is null. The k = 1 invalid-leader/invalid-commit case needs only one.

**Required boundary (per the directive; not implemented here).** The bootstrap membership of every new replica (ADD, REPLACE, formation joiners) must come from the group's authoritative committed configuration, read from a current member through the membership/replica owner. There must be no REPLACE-only RPC.

---

## Case 1b: phantom voter (the rows include X, which is not a member)

**Verdict: FAIL-CLOSED (liveness only). Next membership-owner quest.**

- **Bootstrap.** The resolved list is {t,a,s,b,X}, so the target's ConfState has 5 voters.
- **Before admission.** Same as the other cases: empty log, no leadership (term 1 to 1).
- **After admission and full replay.** Authoritative {a,b,s,t}; target view {a,b,s,t,X}. X is never corrected, because no ConfChange names X and the leader never proposes removing a non-member.
- **With b and s down** (t and a alive: 2 of 4 authoritative, 2 of 5 in its view), the target **cannot lead** (it stays a candidate) and commits nothing.
- **Arithmetic.** With phantoms, the target's majority floor((n+p)/2)+1 ≥ floor(n/2)+1 counted over real members. The target is only ever stricter than the authoritative quorum: never an invalid leader or commit, only a lost quorum it should have had. The phantom is permanent, which inflates the target's quorum denominator: a liveness defect.

---

## Case 2: the not-yet-admitted voter (correct bootstrap, not yet admitted)

**Verdict: AVAILABILITY DEFECT (no safety break). Next membership-owner quest; it can be operationally blocking.**

Target t has the correct D1 bootstrap {a,s,b,t}, and its row never reaches the members, so the group never admits it. Its own tick timers run (`startElection`).

**Over 3 s** (`diag-output.txt`, 100 ms samples):
- the target's term rises 1 → 15;
- **every member steps down at each new term**;
- the leader is re-elected at terms 1, 7, 9, 11 and 13;
- the group is **leaderless in most samples** (`f,f,f`).

**What t never does:**
- **never becomes leader**: its log stays empty (0 entries, commitIndex 0), so no member grants it a vote;
- **never votes**: the members do not count it and never send it a vote request, because it is not in their configuration;
- **never commits**, and never produces a second quorum view;
- **causes no divergence**: the members' ConfState stays {a,b,s} and their commits stay consistent (commit 6 on all three).

**Mechanism.** Pre-vote and check-quorum are off. Any higher-term vote request, including one from a non-member, forces the leader and followers to step down (raft-rs `step`: `in_lease` is false without check-quorum).

A single explicit campaign from a fresh replica is harmless: term 0 goes to 1, which the group already has. The churn starts at the replica's second election timeout.

**Operational risk to the join SLO and release gates (argued, not measured):**
- Leadership churns every target election timeout for as long as admission is pending.
- Admission is row-driven only at initialization and on services-cache changes (`partition-service-core-base.js:840-858`), never on leadership gain.
- A new leader drops conf changes until it has applied up to `pending_conf_index`.
- So an admission lost to the churn is not re-driven until the next cache change. The RF = 1 stall observed during the D1 work (8 s with no admission) was this mechanism.
- It can break join/formation SLO gates for voter-mode joiners, whose timers start at initialization. Deferred-election joiners are exposed from `startElection` onward.
- By the directive this is availability. It becomes a blocker only if a release gate trips on it.

---

## Decision summary

| Case | Can it participate with the wrong bootstrap before correction? | Replay corrects? | Class |
|---|---|---|---|
| Missing committed voter, k = 1 | After admission: **leads with 2 of 4 authoritative, commits its term entry**. Before admission: no leadership (empty log) | Only for voters that a later ConfChange names; never for founders | **Safety: pre-publish blocker** |
| Missing committed voters, k = 2, odd n | **Two leaders in term 2; divergent acknowledged writes at the same (index, term)** | No | **Safety: pre-publish blocker** |
| Phantom voter | Never an invalid leader or commit; quorum is stricter | Never removes the phantom | Fail-closed, liveness: next quest |
| Not yet admitted (correct bootstrap) | Deposes leaders on every election timeout; never leads, votes or commits | n/a | Availability: next quest; may be operationally blocking (join SLO) |

Per the owner's rule, the authoritative committed-membership read for bootstrap (shared by ADD, REPLACE and formation, owned by the membership/replica owner) is a **pre-publish blocker**. The phantom and not-yet-admitted findings belong to the post-publish membership-owner packet, together with CA3 (directive §8).

---

## Lab run note (the D1 commit a13bb03cd, stopped when the classification took priority)

**Plan.** `lab.js` has no `--base` flag. I used the selector's own environment equivalent, `LAGRANGE_CHECK_BASE=7c489da2f`, which gave the same 1009-file plan as `select-change-tests --list --base 7c489da2f --head a13bb03cd`. Placement:
- tv-dator: exclusive lane, 31 files;
- controller: ordinary, external-toolchain and bootstrap lanes, 978 files.

**Result before the stop.** 476 ok and 2 red. tv-dator ran 8 files, all green. I then stopped the run with SIGTERM to its PID; the lab aborts every shard, and `lab fleet` showed every host free.

**Reds:**
- `test/rebalancer/replace-replica-workflow.test.js`: **D1**. The test asserts the old REPLACE stamp without the source (`:297`, `:302`), and it passes 239/239 on 7c489da2f. It needs its expectation updated to the D1 contract; this is a test-only change.
- `test/config/system-cache-write-callsite-guardrails.test.js`: **pre-existing**. It fails identically on 7c489da2f: unsanctioned `applySystemTableChange` at `src/cdc/cdc-integration-service-cache-visibility-authority.js:173`, from 55a42ef57. D1 touches neither src/cdc nor test/config.
