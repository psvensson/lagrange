# Proposed RF3 survivor-election fixture correction

Author: `subagent:/root/retained_effects_tests`, 2026-10-23.
Status: proposed test-only bytes for independent review; not applied to a
worktree and not executed. No production change, commit or push.

## Exact inputs and proposed artifacts

Base commit: `4ce8fbd31b7c44129a3431752313b2e9c0ae19ab`.
Repository target: `test/message-group/message-group-native-custody-handoff.test.js`.
Both copies were constructed from that exact Git object, not from a dirty
worktree. The proposed file changes only the post-loss election loop and adds
the immediately following diagnostic. The prefix and suffix outside this one
replacement are byte-identical to the base.

| Artifact | SHA256 |
| --- | --- |
| `message-group-native-custody-handoff.base.test.js` | `0c5225055f319df6440cc56028d178a7f16fffd406f169dac6d9e27f6b7a7e9b` |
| `message-group-native-custody-handoff.proposed.test.js` | `cda29b76c731da84420c7a754ba3e96b5a30170f0fb3d4edcb8ecb940ab1cf87` |
| `native-survivor-election.patch` | `9318c436e3ba3d75fb80797095cd6aebcfa0c477134b64eca30edd9cd4f78f8f` |

## Source-bound rationale

The independent review at
`solve/quests/retained-seed-original-handoff/evidence/LAB-REVIEW-mg-delivery-fixture-trace-r2-2026-10-23.md`
records job #1026 as FAIL: RF3 reaches the actual retained but uncommitted
recipient proposal and premature source-leader ACK, then fails the survivor
election prerequisite. Its log does not record post-loss native statuses or
vote packets, so it does not establish which individual pre-vote was ignored.

At the exact base, the loss loop ticks only r2. The unchanged carrier's `pump`
delivers actual queued native packets and advances the injected clocks by zero;
it cannot expire r3's native election lease after r3 has heard the old leader.
The native owner enables pre-vote and check-quorum for every group.

This repeats the source pattern repaired in exact commit
`9f7c915bb55968bcf0c84c9d19878a9c8f6c8e50`, specifically
`test/raft/raft-rs-backend/local-log-guard-correct-followers.test.js`: tick both
survivors under the existing round bound and accept the survivor that actually
becomes native leader. The same witness remains at base lines 122-146.

The proposal follows that schedule through the existing public `raft.tick()`
operation. Each loss round ticks both live survivors, then runs the unchanged
carrier pump. The success predicate reads `RAFT_ROLE.LEADER` from either
survivor's actual `raft.readStatus()`. It neither selects r2 in advance nor
forces campaign, transfer, role, readiness or an opening decision.

## Preservation and observation

- `LOSS_ROUNDS = 200`, `BUDGET_MS`, setup bounds and pump bounds are unchanged.
- Original leader isolation, queued/held append bytes and later rejoin remain
  unchanged. No database, cache, event or native suffix is edited by this patch.
- The existing `assert.equal(elected, true, ...)` is unchanged. Every later
  suffix-replacement, never-applied-quorum, source-redrive, source-debt,
  original-identity and actual-native-commit assertion is byte-identical.
- Before that election assertion, a direct diagnostic records the attempted round count,
  unchanged bound, survivor identities, each actual native status and the
  queued packets, retained native frontiers, rows, held packets and packet
  custody/delivery events. It does not tick, pump, campaign or flush anything.
  It deliberately avoids the existing `report` helper's source-lane diagnostics:
  at base `cdcObligationDiagnosticsOf` calls `laneOf`, which may reset a stale
  source lane. Existing source-obligation cuts remain untouched.
- RF1 acceptance, source release/ordinary SQL admission, subscriber/topology
  lifecycle and actual bridge-return receipt assertions are untouched.

## Static checks and remaining proof

Passed without running the test:

1. `node --check` on the proposed file.
2. Scoped repository ESLint via standard input with the actual repository test
   path supplied as `--stdin-filename`.
3. Read-only `git apply --check` against the unchanged target file in the trace
   worktree.

These checks establish syntax, lint and patch applicability only. The corrected
native election, suffix replacement and redrive remain unmeasured. Independent
source review and a new exact-source locked-lab run are still required; the
failed #1026 attempt and its unengaged recovery assertion remain preserved.
