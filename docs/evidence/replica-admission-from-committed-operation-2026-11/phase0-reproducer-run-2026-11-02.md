---
audience: evidence
recorded: 2026-11-02
quest: replica-admission-from-committed-operation
---

# Phase 0: reproducer run on the candidate (first-divergence witness)

## Run identity

| Field | Value |
| --- | --- |
| Scenario | `fresh-formation-user-table-routability`, base `test/distributed/config/local-three-node.json`, bounds unchanged (formation 420000 ms) |
| Command | `LAGRANGE_LAB_AGENT=claude:stream-b-replica-admission node scripts/lab.js harness run fresh-formation-user-table-routability --base test/distributed/config/local-three-node.json --nodes tv-dator,lenovo-laptop,adams-gamla` |
| Source | `b26d2c09070ce719c10d3d59ee9b2a42622f0bdf` (origin/work/learner-committed-admission-rebase-20261102, PR #184 head: main + the learner fix). `gitDirty: true` only because of this quest's untracked `quest.json`; `src/` is unchanged. Harness `srcFingerprint` `ff546c0909c13e9c` (sha256-content-v1). |
| Hosts | seed `f596f072` on tv-dator (192.168.86.32:8080); joiner `b53aae47` on lenovo-laptop (192.168.86.27:8090); joiner `ff632e49` on adams-gamla (192.168.86.41:8100). One node per machine. |
| Window | harness start 2026-11-02T10:26:07.168Z; seed first log 10:28:09.551Z; report 10:38:51.407Z |
| Verdict | **RED**: `Run: 0/1 passed`. First unmet predicate `a-serve-lane-open` (`serve_ineligible`, `serve_lane_priority_recovery_active`, `serve_lane_publication_stream_not_ready` on 180/180 polls); also unmet `b`, `c`, `d`, `g`. time-to-serve-lane: never. |
| Earlier attempt | 10:21:35Z on tv-dator, lenovo-laptop, adam-laptop: image build failed on adam-laptop with `no space left on device` (its root filesystem was 100% full, 30G). That was an infrastructure refusal, not a product sample. adam-laptop was replaced by adams-gamla, and nothing was pruned on the shared host. |

Retained (outside the repo, 256 MiB): `/mnt/data/peter/projects/lagrange-evidence-store/replica-admission-phase0-20261102T102607Z/`
(`report.json`, `.playback/report/**`, both console logs `phase0-run.log` and `phase0-run2.log`). Full node logs are in
`.playback/report/.full-logs/fresh-formation-user-table-routability/`, with these sha256 digests:

- `f596f072...log.gz` `08bbf159daae4721e3321f6064e33f09598a0dfd54702b5d5054ffae2ed6c6f9`
- `b53aae47...log.gz` `08f86f71c3be4df0874371972612c6c1460d907b45ac81421e6a7b6d6cd1f9d4`
- `ff632e49...log.gz` `e31a9dcca60db4958185724457fd24b00ec721c79349756109d75fef4e8ec579`

Their relocation (`solve evidence relocate`) is the lead's decision.

## Timestamps (all from node logs, UTC)

| Event | First | Count |
| --- | --- | --- |
| `cdc_committed_acceptance_unknown` hold (`CDC obligation delivery held by a subscriber`) | 10:28:35.174 seed, `partitions-p1` | 6684, all on the seed. By partition: services-p1 2240, partitions-p1 2022, nodes-p1 1238, control_plane_publications-p1 593, storage_reservations-p1 276, other 315. The last was at 10:38:30.237, so holds lasted the whole run. |
| `CACHE_WAIT_TIMEOUT_MS` spend | 10:28:35.979 seed (`services` `mg-1-r1`); first on joiners at 10:28:57.752 b53a (`services` of its learner `replace-replica-804a...`) and 10:29:13.285 ff63 (`replica_operations`) | seed 3, b53a 18, ff63 17 |
| `node_ready_lease_incomplete` | 10:28:47.684 seed | seed 804, ff63 113 |
| Leader refusal `not_in_configuration` (the learner asks before the leader admitted it) | 10:28:56.346 seed, `replica_operations-p1` | 205, all on the seed. No `learner_address_unresolvable`: the learner fix holds. |
| `Failed to apply committed entry`: `UNIQUE constraint failed: services.service_id` | 10:29:57.616 seed, `services-p1` | 69 |
| First create failure | 10:29:57.228 b53a, `sql_transactions-p1-r4`: `CREATE admission read deferred for c44b07a7...` | 23 distinct replicas failed: 14 on b53a and 9 on ff63 (`stage=failed`) |

## Admission per joiner replica (seed is leader of every priority partition)

Admission is not logged at info level (`recordAdmission` uses the debug level, `src/raft/raft-rs-group-membership-admission.js:100`).
The witness for each joiner replica is therefore indirect:

- the learner start, logged on the joiner;
- the run of `not_in_configuration` refusals: the leader has not yet admitted the learner;
- the first `Learner promotion proof granted by leader`.

**Admission did happen for every joiner replica in this run.** Two examples:

- `control_plane_publications-p1-r4` (ff63): learner at 10:29:16.157, 22 refusals until 10:29:41.027, granted at 10:29:42.305, about 26 s.
- `replace-replica-94e0...` (b53a, sql_transaction_participants-p1): learner at 10:33:28.364, 24 refusals until 10:33:55.065, granted at 10:33:58.064.

Measured as learner start to grant, the gap was 0 to about 30 s. The full table is reproducible with the timeline script described in the "Method" section.

Only 3 creates completed:

- `replace-replica-804a...` and `replace-replica-2bd7...` (replica_operations-p1);
- `control_plane_publications-p1-r4`.

23 creates of the priority partitions `sql_transactions`, `sql_transaction_participants`, `sql_write_operations`, `schema_operations` and `control_plane_publications` failed after their grant. The playback shows 40 replicas created and 38 removed.

## First divergence on this run (owner chain in transition.md §1-2)

1. **First failed create.** At 10:29:57.228, b53a `sql_transactions-p1-r4` (ADD, operation `c44b07a7`) had already been admitted. It was promoted at 10:29:57.126 (`Replica reached voter-ready activation state` at 10:29:57.144). In `releaseFreshCreate`, `authorizeFreshCreate` then failed: `replica-handler-release-recovery.js:259` -> `participant-release-authorization-owner.js:25` -> `replica-create-admission-owner.js:383-384` -> `readOperation` `:347-379`.
   - The authoritative read of the committed `replica_operations` row answered `success !== true`, which the code types as `CREATE admission read deferred`.
   - That deferral is terminal for the create: the replica service was shut down at 10:29:57.194, after it had become a voter of `sql_transactions-p1`.
   - Within the same second, the joiner's lifecycle write for the same replica produced a `services` INSERT. It failed `UNIQUE` at apply on the seed's `services-p1`, logged as `Failed to apply committed entry` (69 in total).
2. **Every later create fails.** From 10:30:54, every fresh create fails in `releaseFreshCreate` with `release_fact_unavailable`: either `missingFact replica_release_reply` (owner seed) or `current_control_owner_fact`.
   - The control release of `sql_transactions-p1` is refused with `controlMissingFact: hosted_replica`, 32 times.
   - On the seed, `sql_transactions-p1` participant release logs `missingFact: hosted_replica` from 10:31:13.612 onward.
   - Each failed create is removed and re-planned: the REMOVE/ADD churn, `priority_recovery_rebalancer_handoff_stalled`, and serve lane closed on every node for all 180 polls.

**Reading.** The terminal link on this candidate is the fresh-create participant-release chain, the C13 class of the systemic analysis. It starts from a create that failed after its admission and promotion had committed. That is hypothesis H3' below.

The C1/C10 instance is present but was not terminal in this run:

- the seed's CDC holds ran for the whole run;
- admission lagged 0 to 30 s behind the learner;
- 205 `not_in_configuration` refusals were logged.

This differs from the learner quest's run (`2efddc37d`, 2 machines), where admission never happened within 420 s.

**H3' (unproven).** `sql_transactions-p1`'s committed configuration retains the dead voter `sql_transactions-p1-r4`, so its release cohort can never clear `hosted_replica`. The single settling observation: at a `hosted_replica` refusal instant, compare `READ_COMMITTED_MEMBERSHIP` of `sql_transactions-p1` on the seed against the hosted replicas on b53a. This run did not take it, and no info-level log names the blocked replica (`blockedReplicaId: null`). Status: **unknown**.

## H1 settling observation

The scenario does not take a `cache_dump`, and the cluster was torn down before an admin read could be made. The product's own reconciliation diagnostics nevertheless compare the authoritative row with the cache at an instant (`Cache/authoritative divergence detected during reconciliation`, `Diagnosed cache visibility gap from authoritative system table read`):

- **seed:** `replica_operations` cache_missing 43 (first 10:28:51.095) and field_mismatch 86 (first 10:29:17.152). For example, at 10:28:51.095 the authoritative `replace-op-b0b98821...` row existed (`status pending`) while the cache had `null`. `services` cache_missing 1 (10:28:44.089).
- **b53a:** `services` cache_missing 14. At 10:28:57.923 the authority held `raft_role learner`, while the cache still held `raft_role follower` for the same `status syncing` row; this was the instant its `CACHE_WAIT_TIMEOUT_MS` was spent.
- **ff63:** `services` 12 and `replica_operations` 24.

**H1 status.** H1 is confirmed in kind: the seed's cache ran behind committed `replica_operations` rows while `cdc_committed_acceptance_unknown` holds were continuous. It is not confirmed at the exact instant of a `not_in_configuration` refusal for that learner's `services` row; that observation remains **unknown**.

## Method

- **Timeline script** (scratch, not committed): it parses the three full logs and groups `Starting as learner`, `Learner promotion proof request refused by leader` (`reason`) and `...granted by leader` by replica id.
- **Message counts:** `zcat <log> | grep -o '"msg":"[^"]*"' | sort | uniq -c`.
- **Integrity:** the harness issued no repair writes, restarts or cache refreshes; it only observed.
