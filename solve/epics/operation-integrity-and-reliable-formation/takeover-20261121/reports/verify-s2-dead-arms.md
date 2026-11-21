# Verification: S2 dead leader-role arms (`work/leader-role-dead-arms-20261121`)

Subject: 316671f87..e1e239d30 (65ca4c2c3 tests, 4adfe1a42 deletions, e1e239d30 message-group case).
Method: read-only source reads at 65ca4c2c3 (pre-deletion) and e1e239d30, retained lab outputs under `lab/s2-*`. Nothing was run.
Line numbers are for 65ca4c2c3 unless a ref is given.

## Overall verdict: APPROVE-WITH-CONDITIONS

No reachable counterexample was found for any deleted arm. One author claim is false (pre-deletion green), one deletion (#6) removes a diagnostic without an owner ruling, and the work has no proof on its own record for N2.

Conditions before merging e1e239d30 into the integration branch:

1. **Correct the record for N2.** The N2 necessity witness was RED on 65ca4c2c3 (below). Either run the final-form witness on pre-deletion source (one file, a proof-only commit as was done for N1), or record that the red output's actual values are accepted as the proof.
2. **Owner or lead ruling on #6**: is a "bootstrap snapshot names no partition leader" diagnostic still wanted, re-keyed on `partitions.leader_node_id`? The witness proves the old warning carried no information, not that the capability is unneeded.
3. **Give the proof commits a ref.** 26012f39e and its parent bb1c3b78e are on no branch and will be collected.

Not blocking, but to be owned: the seven pre-existing reds in `replace-named-handoff-attempt.test.js`, the message-group contract divergence under the kept arm, and the missing Quest record for a `src/` change (the diff touches no `solve/quests/`).

## Per arm

| Arm | Verdict | Why |
| --- | --- | --- |
| S2a: source role early return and fallback, replacement role arm, co-located sibling conjunct, five helpers, `currentVoterReadyRows` option | APPROVE | Decision-dead whatever any producer emits |
| S2a: `observedSourceRoleState`, `replacementRoleState`, `coLocatedLeaderSiblingObserved` snapshot and debug fields | APPROVE | No reader anywhere at e1e239d30 |
| S2c #6: bootstrap "No partition leaders found" warning and two contract keys | APPROVE-WITH-CONDITIONS | Noise today, no consumer; capability not ruled on |
| N1: SERVICES arm of `announcesLeader` | APPROVE | Chose a log label only |
| N2: row arm of `publishCanonicalLeaderNodeId` | APPROVE-WITH-CONDITIONS | Sound by writer census; executed proof was red |
| S2b kept: move planner row-role arm | APPROVE (keep) | Message-group planner's only leader evidence, and it moves the decision |

### S2a (VERIFIED by read)

- The only caller of `evaluatePriorityPublicationLeaderRemoveSafety` in `src/` is `operation-workflow-remove-safety-evaluator.js:676`. Before it, `:446` requires a canonical entity type and `:502` returns for every non-partition entity. So the operation reaching the gate always has `entityType === 'partition'`.
- `priority-publication-handoff.js:101-112` (e1e239d30): NOT_APPLICABLE returns null; any partition REPLACE not in a publication wait goes to `evaluateReplaceNamedHandoffSafety`. SAFE and LEADERSHIP_PENDING therefore reach the same code. The two publication-wait states depend only on the partition id and publication status.
- The deleted arms fed only `sourceRemovalLeadershipSafe`, hence only SAFE versus LEADERSHIP_PENDING, the debug trace and the snapshot fields. A leader row from any source (durable, overlay, seed) could not change the evaluation.
- Row source: `priority-publication-safety-rows.js` `getCriticalReplicaRowsForSafety` is an authoritative read with `service_type = ? AND partition_id = ?` (`operation-workflow-owner-shared.js:406-407`), no cache merge. The query-engine routing overlay rows (`sql-query-engine-routing-metadata-methods.js:440-487`, raw live role) do not feed it.
- Requirement served: the co-located sibling evidence (935ae0756, 2026-07-16, quest `movielens-colocated-follower-remove-safety`) avoided an unneeded target election for a follower source. It needed an explicit leader row, which the collapse removed. It and the "source released" state are superseded by the named handoff: `operation-workflow-replace-handoff-attempt.js:218-224` authorizes removal only when the witness's `leaderReplicaId` is the target, at replica granularity, from the target's own port (`operation-workflow-replace-witness.js`, no row or cache). Leader-source protection is stricter than before. The election-avoidance optimization was already unreachable on the base; this deletion does not remove it.
- Behaviour change to note: the snapshot's `state` and `sourceRoleState` now differ for some inputs (follower row, null `leader_node_id`, completion safe: SAFE before, LEADERSHIP_PENDING after) and the debug trace fires more often. Neither is consumed.

### S2c #6

- VERIFIED: the filter was `service_type === partition` (`bootstrap-topology-snapshot-owner-published-views.js:197`), so message-group and wasm leader rows never counted. With partition writers collapsing leader, it warned on every envelope.
- VERIFIED: no test, script, doc or harness reads the message or keys at e1e239d30.
- NOT CONFIRMED: the original requirement (introduced in refactor 18dbdbe7f, history uninformative), and whether another diagnostic covers a snapshot whose partitions name no leader.

### N1 (VERIFIED by read)

- `group-retirement-redrive.js:432-450`: a services row yields a non-null trigger either way; whether a step re-runs is `entryMatchesRow`, which never sees the trigger. Every redrive callback is a zero-argument closure (`managed-split-workflow-dissolution-methods.js:387,492`, `managed-merge-workflow-dissolution-methods.js:242,400`); `group-retirement-resume.js:208` only logs it.
- "Group gained a leader" still wakes through the PARTITIONS arm.
- The arm was introduced 2026-10-27 (54dd2d7ce), after the collapse: it never fired for partition rows.

### N2

- VERIFIED: every in-tree writer of a partition services role collapses leader (`partition-service-row-owner.js:87-103,219`; `partition-service-metadata-mutation-helpers.js:53`; `partition-service-core-base.js:364`; `replica-handler-class.js:95-104`; `replica-handler-create-status-methods.js:579,682`; the lifecycle upsert rejects a cached leader, `replica-state-machine-lifecycle-observation.js:421-427`). No partition caller passes `extraFields`.
- VERIFIED: the one in-tree sender of `/register-service` builds message-group rows (`create-message-group-phase.js:381-394`). The server does persist a client-supplied role verbatim (`bootstrap-api-registration-methods.js:128`).
- VERIFIED: the activation caller passes the live service (`partition-service-activation.js:299-303`), so a live leader is still published. Registration is born STOPPED and publishes nothing.
- The production row is the registration evidence or the durable row from an authoritative read (`replica-state-machine-registered-activation.js`, `activateRegisteredReplicaInLane`). A durable leader stamp (older version, foreign writer) would, before the deletion, publish `leader_node_id` for a replica that does not lead. Decision table `leadership-authority-projection.json:56` asks for exactly this re-key. The deletion is the safer direction.
- Weakness: the witness stubs `activateRegisteredReplica` with a row built by the owner itself, so it cannot observe the durable-row case. The proof for that case is the writer census above, not the test.

### S2b kept arm

- VERIFIED: `move-planner-move-calculation-methods.js:380-383` (e1e239d30) reads the row role; `message-group-service-row-owner.js:74-86` publishes leader (`collapseLeaderToFollower: false`); the witness shows the role moves the REPLACE source for a message-group planner.
- Flag: the decision table rule `message-group-leader-collapses` says message-group rows publish follower, and the other message-group writers do collapse (`message-group-service-metadata-publication.js:48`, `message-group-service-state.js:412`). The kept arm rests on a producer the contract calls retired.

## Necessity tests and lab evidence

| Claim | Finding |
| --- | --- |
| Necessity tests green on the pre-deletion commit | **FALSE for one file.** `lab/s2-necessity-65ca4c2c3`: `partition-service-row-owner.test.js` not ok, 204 assertions. The N2 witness failed 4 assertions (expected two publications, got one) and its process-wide `created_at` mint broke "registerReplica uses insert-only admission". Actual values match the final test's expectation. The other four files' witnesses passed. |
| S2a witness, 512 combinations, sibling and replacement included | VERIFIED at 65ca4c2c3 (4 roles cubed x 4 x 2), both witness leaders, three anchors ok. At e1e239d30 it enumerates 128 (sibling axis removed with the option). |
| Six of seven touched files pass at e1e239d30 | VERIFIED (`lab/s2-focused-e1e239d30`). |
| N1 message-group case on pre-deletion source | VERIFIED: 26012f39e (parent bb1c3b78e = 65ca4c2c3 + the case), 117 assertions ok. On no branch. |
| Seven failing cases identical on base | VERIFIED: cases 1, 2, 3, 4, 6, 8, 9; the same 15 assertions on 316671f87 and e1e239d30. |
| Cone 1600 files, 96 failing, all on base | VERIFIED for all 96, not a sample: 95 fail on base with the identical assertion count; the 96th is the touched file (38 versus 32, the added witness). |

Test quality (VERIFIED by read): the S2a witness calls the production function on the real workflow owner; role ranges are `Object.values(RAFT_ROLE)`; the `leader_node_id` axis is live (`test/rebalancer/test-helpers.js:1115-1122` matches the SQL and the test mutates the returned rows); the anchor flips the decision. It cannot pass by testing only itself, but it asserts no intermediate effect, and it omits an absent role and the publication partition. Those are covered by the routing read above.

Base evidence caveat: 75 of the 96 base failures come from a cone run on another host (`w2-cone-316671f87.log`, adam-laptop); 21 from tv-dator. Failure text was not compared, only file and assertion count.

## The seven reds (item 4)

First assertion: `replace-named-handoff-attempt.test.js:216` "one handoff was issued", expected 1, got 0, after `coordinator.executeOperation`. The rest are consequences (null attempt, no STEP_DOWN). Owner: the REPLACE named-handoff dispatch through the coordinator (quest `replace-source-removal-owner`). They are the full-path proof of the mechanism that now alone protects a leading source, and they are red on the base. The deletion did not cause or change them.

## Removed besides code (item 6)

- Snapshot and log fields, warning keys: no reader (one fixture key migrated in `dt-ledger-completion-continuity-discriminator.test.js`).
- Grammar pin: forbids the literal `raft_role` in the leader-safety file and in `resolvePriorityPublicationSourceRoleState`, plus four deleted names; three known-bad cases and a clean pass on the real files. It is a fragment pin: `COLUMN.RAFT_ROLE`, `raftRole`, `isLeaderReplicaRow`, or a role read in a helper elsewhere would pass it.
- Ratchets: tightened only (test duplication 609/21780 to 606/21632, unused exports 1319 to 1316). `lab/s2-static-checks.log` also prints six navigability tightening hints that were not applied; probably inherited, not confirmed.

## Side finding (item 7)

Correct on e1e239d30 (VERIFIED by read). `getCriticalPartitionRowForSafety` has one consumer (`priority-publication-handoff.js:85`); its `leader_node_id` reaches only `sourceRemovalLeadershipSafe`. The SAFE branch at `:113-119` and the tail at `:160` are unreachable from the production caller. So the tenure-bound merge of sealed quest `local-leadership-tenure-bound-safety-evidence` (`priority-publication-safety-rows.js`, `mergePartitionRowForSafety`) informs no decision today; it costs one authoritative read per evaluation. CL-038 `sourceReplicaRemoved` and the follower-source-removal table are dead the same way.

Not a deletion recommendation. It would have to be shown that:

1. no caller can reach the gate with a non-partition entity (today enforced only by the evaluator's ordering, not by the gate);
2. the property the quest sealed (an old-tenure replay never outranks a fresher successor during publication lag) holds through the fresh witness alone, including a five-node REPLACE of a live leader;
3. the seven red full-path handoff tests are green, since they are that proof;
4. the `leader_claim_*` annotations have no other reader (one further reference, `src/service/call-partition-topology.js`, not read);
5. user partitions, which get no leadership gate at all (`evaluator:596`), are out of the quest's scope by decision.

## Not confirmed

- Original requirement of the #6 warning and of the N2 row arm (history squashed).
- That `preparation.serviceBirth()` carries no `raft_role`, and that no code outside `src/node` sets `replicaState.role`.
- That overlay rows never enter the system-table cache feeding N1 and #6 (immaterial to both verdicts).
- Why the seven cases issue no handoff.
