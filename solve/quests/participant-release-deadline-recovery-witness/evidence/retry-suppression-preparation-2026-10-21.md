---
audience: development
documentClass: evidence
---

# Existing-origin retry suppression: reattempt preparation

Date: 2026-10-21. Author: `subagent:/root/release_recovery_writer`.
Status: read-only preparation, **not an executed negative or approval of the
completion refactor**. No source/test/receipt/seal was changed and no test or
guard was run for this assessment. Only this additive note was written.

The inspected execution tree advanced from
`0e003dc89c808ac23a7c1fe18e70342f058486b0` to
`5af0cc7f6d7ddd81bb10e9b590f02cc13e70ddad` during the separate exception-audit
checkpoint; the recovery/witness bytes below did not change. The separate
completion worktree, branch `work/participant-release-completion-owner-20261021`,
has HEAD `fefc75988807f2e89733ebaf2bc3a844d8ca311f` plus uncommitted source.
Its writer identified the inspected bytes as the first REVISE freeze and is
correcting fresh-completion result handling. They are not a final candidate.

## Preserved obligation

The existing Quest remains sealed at
`be93c7e5d9a76a39e76a530c93715521b2281356`. It permits this native owner witness
and controlled negatives, not a production repair or whole-startup acceptance.
The authority-and-recovery contract and held-recovery Quest retain the same
rule: a wake carries no permission; the existing origin, current leader,
measured build, control owner and complete cutover proof still decide release.

The prior packet in `negative-controls-20261020` remains unchanged. All 14
entries of its SHA256SUMS were independently recomputed without mismatch.
The stored retry patch hashes to
`c388662f7f0c04eb61c02360ad7d828e217cc9a0473ae10e4ebb8b2bc40d9cf8` and reproduces
the recorded old mutant hash when applied in memory to exact positive
`a72609dadfca7f8292c347d041175990b09e2c54`.

That attempt never committed or ran natively: the normal staged decision audit
rejected the existing fresh-CREATE local loop. The rejection remains a
preparation blocker, not a native semantic negative. The deadline and
authorization negatives are already separately recorded; the retry control is
still missing. This note does not change any receipt.

## Independent source correspondence

The completion candidate delegates only fresh seed/CREATE completion to the
existing client. Direct comparison found these recovery regions byte-identical
to both execution source and the original a726 positive:

| Region in `src/node/replica-handler-release-recovery.js` | Bytes | SHA256 |
| --- | ---: | --- |
| Factory state through the declaration before private sleep | 268 | `7ab0d2632dd5e742e5bcdbcb7e6a9e7caa5d2b96c2fde0a2abbc80a1b831ab84` |
| `hosted` through `arm`, enqueue/discharge/report, reconcile, dispatch and both subscriptions | 5636 | `c04a93258383297461094f9dc66bbe66587329ec74deb223b6b7533eb524963f` |
| `releaseOperator` through shutdown/export | 860 | `51d41422de8e9c82c8f8b45429fa7acd37dc3d42eecc9a70394ca8d91012934c` |

In the inspected candidate, lines 183-210 require a current leader, closed
admission, real durable origin, measured build and exact live registry identity,
then call the existing cutover with EXISTING_ORIGIN and its existing 30000ms
attempt budget. A returned non-CUT_OVER answer is reported and re-enqueued at
the existing 1000ms cadence. Host-held retries at line 171 and thrown-reconcile
retries at line 227 are distinct and must remain intact.

The same owner coalesces pending work by partition, bounds running attempts to
four, and retains the scheduler with each timer (lines 109-140). Registry and
consensus changes enqueue only the named partition (lines 237-246). Control
replacement therefore does not manufacture a dependent wake. Shutdown retains
its existing unsubscribe, clear and join behavior. The changed private sleep
belongs to fresh completion; background `arm` does not call it.

The original single-attempt request and operator route remain separate from
fresh completion. The completion audit currently checks the fresh caller body,
its now/sleep substrate and canonical client body rather than the background
reconcile body. The proposed deletion does not touch those checked operations.
This is source inspection, not proof that a future normal hook will pass.

## Exact proposed diagnostic treatment

From the final approved, integrated positive commit, in a new isolated
diagnostic worktree, delete **only** this post-answer line inside `reconcile`
(line 210 in the inspected candidate):

```diff
     report(partitionId, answer);
-    if (answer.outcome !== OUTCOME.CUT_OVER) enqueue(partitionId, BOUND.RECOVERY_RETRY_MS);
```

Do not invert its condition, suppress events, remove exception/host-held retry,
alter timers, rewrite the test, relax a baseline or bypass normal hooks. The
mutant is an experiment and must never enter production integration. Its new
whole-file/patch hashes must be recorded from the final composed source; the
historical mutant hash does not describe the refactored file.

The existing witness already supplies the discriminator. Test lines 287-303
drop exactly one actual settled dependent ENABLE response after observing its
real committed origin. Lines 203-249 recreate the same SQLite identity, require
the native leader, positively drop actual consensus notifications, run the
registry wake, and observe CURRENT_CONTROL_OWNER refusal. Lines 254-263 restore
the real control owner and require the dependent still CLOSED with no new
dependent INSPECT before the retry. After advancing the final 1ms at line 264,
the mutant must fail the bounded OPEN assertion invoked at line 265:
`retained recovery retry must reopen the current service after authority returns`.

That assertion polls only the exported admission view for the existing 5000ms
bound/20ms interval. It does not call Raft status, release or a recovery method.
Positive source must then report CUT_OVER, show new actual INSPECT traffic,
retain exact registry/origin identity and execute the ordinary native SQL write
(lines 266-274). The first 3000ms expiry/authorization case must still pass.
An early setup failure, absent loss/drop/refusal, control restoration failure,
static rejection or generic hang is not this negative. An unexpected mutant
pass leaves the dependency unproved and requires tracing the actual extra wake;
it is not permission to suppress that wake in the fixture.

## Prerequisites for the root-owned reattempt

1. Finish independent review and normal checks of the separately sealed
   completion unit, including its pending result-handling correction. Integrate
   approved changes and regenerate metadata on one exact committed positive.
   Recheck the background regions above and both frozen witness hashes; changes
   require a renewed scope assessment.
2. Run the unchanged two-case witness on that exact positive through the
   canonical locked runner, with retries disabled. Preserve full output and
   ledger. Older component green is not evidence for the new composition.
3. Prepare the one-line source-only mutant from that same commit. Independently
   review its diff/hashes and pass normal checkpoint hooks without allowances.
   If preparation is rejected again, preserve the rejection separately and do
   not call it the requested native control.
4. Root runs the mutant on the same locked host as the positive, with the same
   test/fixture bytes and retries disabled. Retain exact SHAs, raw assertions,
   result ledger and cleanup failures. Only the named late OPEN/progress failure
   after all prerequisites establishes engagement; independent result review
   precedes any receipt update.

This remains a same-process, one-member native-owner recovery witness with an
in-process transport and empty cache double. It does not prove whole bootstrap,
all wake schedules, cross-host recovery, performance, U1 or release readiness.

## Inspected hashes

The first two witness hashes, relay, clock, bound constants and test support are
identical in both inspected trees and at a726.

| Path | SHA256 |
| --- | --- |
| `test/partition/participant-release-deadline-recovery.test.js` | `d2f5be01c26338c9715d4abcb75ed6bd1a9dee269eaad312528bdc255bfcaa7a` |
| `test/test-helpers/participant-release-protocol-fixture.js` | `3f3b17a7d3fa637b09001fb179170bb1792efbec5acbb96cd009dcdd7117934c` |
| `src/node/replica-handler-membership-relay.js` | `3af4d88312712ab17686ffb79a33af94db92ada5dd305c8586de1945b863c52c` |
| `src/time/time-source.js` | `c4bf713ffca20541e11f079eeacf6cb51892ef722c0993a6277c7edd4ca48311` |
| `src/partition/partition-participant-transaction-cutover-constants.js` | `59d9a3088e04aa074b29c7143bc8bcaee1a83929e27bbe0613b989cf3d4a6507` |
| `test/partition/partition-service-test-support.js` | `8f29fc58fbb5343ebba18ec8465e2678c31daded2ff8461a46140e24cd1205bf` |
| `src/node/replica-handler-release-recovery.js` — execution/a726 | `d3ddafe1710e8d709f9c1a80c5a0cec5940d4b9fd6b2d0cef6cb6771c4cd5b0d` |
| Same recovery file — inspected REVISE candidate | `3f2fc82e8c484e575e769fdcd7875559f647521dd5b4716d6b50f9b79ba3db32` |
| `src/node/participant-release-client.js` — inspected REVISE candidate | `9bcaabfb0780182d5c0ad210135f577ee2e512ffcd2c0c07999f196087a2a4a1` |
| `src/bootstrap/bootstrap-service-seed-workflow.js` — inspected REVISE candidate | `b1c59e19d615ea176e76a65cd42dff5355e5b44265da78ae73c4c4fa9af4b507` |
| `src/node/replica-handler-participant-cutover.js` — execution | `29614ff0e427e4971cb4a186e000f8deafa55081a91877635833398948210464` |
| `solve/quests/participant-release-deadline-recovery-witness/quest.json` | `8c800e8b27828ac1e42626ac13415c401e07a3a0461f79fdbda4a25fea370ad9` |

Future candidate hashes supersede only their identified inspection binding;
this historical assessment and the blocked 2026-10-20 packet remain preserved.
