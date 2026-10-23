# Independent review — RF3 native election fixture correction, 2026-10-23

Reviewer: `subagent:/root/retained_effects_review`.

**Verdict: REVISE one observation-boundary issue before preservation or lab measurement.** The two-survivor election schedule and unchanged acceptance suffix match the historical correction. The newly added diagnostic is not read-only under the actual native status owner.

This review is static. No test, production source, metadata or root Quest/lab record was changed, and no runtime, source job, commit or push was executed. This new review file is the only repository write for this task.

## Exact proposal

The proposal directory is `/tmp/mg-delivery-rf3-native-election-fixture-correction-4ce8fbd31-20261023/`. All four artifact byte lengths and hashes were checked before and after inspection.

| Artifact | SHA256 |
| --- | --- |
| Exact base test | `0c5225055f319df6440cc56028d178a7f16fffd406f169dac6d9e27f6b7a7e9b` |
| Proposed test | `cda29b76c731da84420c7a754ba3e96b5a30170f0fb3d4edcb8ecb940ab1cf87` |
| Patch | `9318c436e3ba3d75fb80797095cd6aebcfa0c477134b64eca30edd9cd4f78f8f` |
| Rationale README | `1e2477dca8180758da0c6476d63a864de26955b55d7a256511246daca195abad` |

The base bytes equal Git object `4ce8fbd31b7c44129a3431752313b2e9c0ae19ab:test/message-group/message-group-native-custody-handoff.test.js`, blob `c50ce6247241e749f325bb5f8ae7d42126223a07`. The proposed file is 23,226 bytes. Its first 19,214 bytes and final 2,979 bytes (including the existing election assertion and every subsequent assertion) are byte-identical to the exact base. The patch is unapplied.

## Required correction R1 — diagnostic status reads may actuate native work

At proposed lines 392–393 the new diagnostic executes:

```js
nativeStatus: f.services.map((service) => ({replicaId: service.replicaId,
  status: service.raft.readStatus()})),
```

That public method is not a universally passive snapshot. At the exact production source:

- `src/raft/raft-rs-operation-port.js:433` routes it to the runtime's READ_STATUS command.
- `raft-rs-runtime-owner.js:1438–1453` (`readStatusObserved`) can enqueue `perform(...READ_STATUS)` when the group has inbound packets.
- `perform` at lines 1736–1754 drains captured inbound/Ready work before the command.
- `readStatusNow`/`readStatusInRecovery` at lines 1415–1435 can enter the recovery path and reconstruct a recovery-required group.

The added diagnostic reads every replica, including the isolated old leader that is not otherwise polled by the new survivor election predicate. A finite pump is not proof that all native inbound queues are empty or every group is healthy. Consequently this diagnostic can change the state immediately before the existing assertion and rejoin; the README's read-only claim is unsupported. This is a general status-owner semantic property, not a special case to fix by changing native production behavior.

**Bounded correction:** capture and retain the actual status answers used by the explicit election decision, then have the diagnostic serialize those captured answers. Keep their replica identity and observation point. Do not issue an extra status probe only to enrich the diagnostic. For the old leader, omit an unavailable current volatile status or label an already captured earlier observation accurately; its actual durable frontier/cache/queued packets can still be read here. The diagnostic must not trigger a tick, pump, native drain/reconstruction, source flush, source drive or lane reset.

Avoiding the existing `report` helper was correct: `cdcObligationDiagnosticsOf` calls `laneOf`, which can reset a stale lane at `partition-cdc-obligation-delivery.js:107–113,619–620`. The proposed direct diagnostic already avoids that source-lane path. Retain that property while removing the extra native status probes.

The existing `view(f)` part reads retained rows through `RaftRsDurableStore.readDurableRecordIn` and clones the cache row; copying the fixture-owned queue, held packets and events does not add protocol actuation. Those parts need no semantic change for this finding.

## Schedule and assertion preservation

The substantive schedule correction is appropriate by source inspection:

- `survivors = f.services.slice(1)` names the two actual surviving RF3 service objects; each round ticks both through the public operation port, then calls the unchanged pump.
- `LOSS_ROUNDS = 200`, the setup budget, pump rounds/microtask count and native safety flags remain unchanged. There is no forced campaign, transfer, readiness/role rewrite or gate override.
- Either survivor may satisfy the actual `RAFT_ROLE.LEADER` observation. The test no longer requires r2 specifically. It does not treat a cache leader hint or a transport ACK as election proof.
- The same repair exists in `9f7c915bb55968bcf0c84c9d19878a9c8f6c8e50`, `test/raft/raft-rs-backend/local-log-guard-correct-followers.test.js`: both live survivors tick under the existing round bound and the real native winner is consumed. That precedent was independently reread.
- The original leader remains isolated; the real held append bytes and later rejoin are untouched. The patch neither edits nor removes a native entry, cache row or event.
- The unchanged suffix still requires election, then actual rejoin/suffix replacement, no recipient occurrence on any native history, no application on the new quorum, canonical source redrive completion, exact source identity, retained source data, owed source custody and actual newly committed/applied recipient entries.
- RF1, real source release/ordinary QUERY, original native-debt cuts, topology lifecycle and inner bridge-return capture are unchanged.

Reading actual native status as part of the explicit election decision is an existing operation in the witness schedule. It must be kept distinct from claiming that a subsequent diagnostic is passive.

## Category-complete disposition

| Category | Finding / evidence |
| --- | --- |
| Admission/gating | No changed grant, participation gate, release or readiness path; unchanged prefix. |
| Retry/redrive | No changed source retry/scan/ACK logic; unchanged 2,979-byte suffix includes the existing redrive/debt assertions. |
| Transport/delivery | Same held native append/isolation/rejoin schedule and byte-preserving carrier; new diagnostic must not introduce extra native processing (R1). |
| Sweep/timer | Both surviving native clocks advance under the unchanged 200-round bound; no larger timeout, extra pump budget or safety-flag change. |
| Recovery/replay | Actual suffix-replacement/debt/application assertions remain intact; R1 prevents a diagnostic-only status call from triggering recovery before them. |
| Concurrency/serialization | Actual public ticks remain sequential and awaited; R1 covers hidden native drain/reconstruction in the added observer. No source lane reset is introduced. |
| Formation circularity | Corrects the previously identified frozen-survivor lease schedule using the known historical owner semantics; fresh measured election is still required. |
| Harness fidelity | Exact base/prefix/suffix and history verified. The only blocking fidelity finding is R1; no runtime engagement or successful election is inferred from source. |
| Owner interaction | Native owner still decides roles, source owner retains custody/ACK, and actual retained records decide application. No new semantic owner, copied receipt or test-only production path. |

No production hostile-input contract changes are in this patch. No additional material finding was identified in this finite correction scope.

## Static checks and next boundary

Independently passed `node --check` on the proposed file, repository ESLint through stdin using the actual target test path, and read-only `git apply --check`. These do not execute or validate the native witness.

After R1 is corrected and refrozen, recheck the bounded delta and its hashes, then let root run the normal metadata/checkpoint path before any exact-source lab request. The #1026 FAIL remains preserved: RF1 semantic red and RF3 pre-loss source-leader ACK are already engaged; corrected election, native suffix replacement, redrive and complete RF3 loss/custody behavior remain unmeasured. This review grants no production, full MG/W7, startup, Quest or merge acceptance.


## R2 bounded correction recheck

Appended 2026-10-23. The preceding R1 review remains byte-for-byte intact, SHA256 `f99b8baf29de8ed7f0b54252130481edb67007319e2abddb4a21c7563a9da880`.

**Verdict: APPROVE the exact R2 test-only correction for candidate application/preservation and subsequent exact-source baseline measurement, subject to root's normal generated-metadata/checkpoint checks.** R1 is resolved. No additional blocking finding was identified in the bounded delta. This remains source-only approval, not an executed election, suffix replacement, redrive, delivery fix, full MG acceptance or Quest/merge verdict.

R2 is frozen at `/tmp/mg-delivery-rf3-native-election-fixture-correction-r2-4ce8fbd31-20261023/`:

| Artifact | SHA256 |
| --- | --- |
| Proposed test, 23,429 bytes | `7f4cf6984aadb9724b012bd1f32be53e3eda28d065a07a76a7cc5ff2f44cacb7` |
| Patch | `52d2f27805ab91a8890346f67b132f377ec6f6005bd3263cb5a03c6b954b2e36` |
| Rationale README | `e69aa7bcc3abc60f38997cdeaed40248c2e89d59b379b66d06b65e243846bef8` |
| Proposal manifest | `81ff08f38dfdfc765b65992cf7c00636ef750ef74185be475e0f99aacb1f5a14` |

The R2 loop explicitly reads both survivors after their native ticks and the existing pump. It records each replica's returned status and computes `elected` solely from that captured vector. The diagnostic then serializes that same vector; it makes **no new native status call**, observes no current volatile status for the isolated old leader, and does not invoke the source-lane collector. Its durable/cache/packet reads remain unchanged. The wording correctly labels these as the answers used by the election decision, not a later fresh or simultaneous native snapshot.

I compared R1 and R2: the only executable delta is capturing the survivor decision vector in the explicit schedule and reusing it in the diagnostic. The exact base, 19,214-byte prefix and 2,979-byte suffix including every original acceptance assertion remain identical. Both survivors receive their native tick within each unchanged loss round; `LOSS_ROUNDS=200`, the old-leader isolation, carrier pump, rejoin, held packet bytes, source identity/debt and all final native assertions remain as reviewed above. No new import or production API is introduced.

All preserved R1 artifacts and every R2 manifest artifact were hash-checked; original R1 material is unchanged. Independent proposed-file syntax, repository ESLint via the real test path, and read-only patch applicability checks pass again. No runtime or repository test/source edit was performed. Root must bind regenerated metadata and any later composed source to the new exact candidate before lab execution; #1026's failed/unengaged recovery result remains preserved.
