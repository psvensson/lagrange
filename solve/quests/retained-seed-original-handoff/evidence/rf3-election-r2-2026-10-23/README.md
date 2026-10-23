# Proposed RF3 survivor-election fixture correction R2

Author: `subagent:/root/retained_effects_tests`, 2026-10-23.
Status: proposed test-only bytes for independent review. No runtime, worktree
mutation, commit or push. R1 remains preserved at the sibling directory
`mg-delivery-rf3-native-election-fixture-correction-4ce8fbd31-20261023`.

The exact base remains `4ce8fbd31b7c44129a3431752313b2e9c0ae19ab`, target
`test/message-group/message-group-native-custody-handoff.test.js`, Git blob
`c50ce6247241e749f325bb5f8ae7d42126223a07`. Base SHA256:
`0c5225055f319df6440cc56028d178a7f16fffd406f169dac6d9e27f6b7a7e9b`.

## Correction and authority

The original #1026 RF3 loss loop ticks only r2 after both followers have heard
the original leader. The carrier pump delivers messages but advances virtual
clocks by zero. Exact historical commit
`9f7c915bb55968bcf0c84c9d19878a9c8f6c8e50` repaired this lease-freeze fixture
pattern in `test/raft/raft-rs-backend/local-log-guard-correct-followers.test.js`
by ticking both survivors under the same bound and accepting the actual native
survivor leader. The independent #1026 lab review identifies that source/history
match but does not claim the unrecorded individual vote/refusal sequence.

R2 keeps this bounded schedule: each existing loss round explicitly ticks both
surviving services, executes the unchanged pump and captures both native status
answers. Those captured answers are the only inputs to its election predicate.
`LOSS_ROUNDS` remains 200; either actual native survivor may lead. No role,
readiness, safety flag, receipt, opening authority, campaign or transfer is forged.

R1 independent review found that an additional diagnostic `readStatus()` is not
necessarily read-only. At the exact base,
`src/raft/raft-rs-runtime-owner.js:1427-1455` can drain queued inbound work or
read recovery state. R2 therefore makes every new survivor status read part of
the explicit election schedule. The diagnostic serializes the very answers used
by that round's election decision; it makes no further status call and does not
observe the isolated old leader's volatile native state. The full durable/cache
and queued/held/delivered packet vector is still recorded before the assertion.
These stored read answers are not represented as a later fresh native snapshot.

The new diagnostic also avoids the existing `report` helper's source-lane
collector, whose `laneOf` can reset a stale lane. Existing source-obligation cuts
remain unchanged.

## Unchanged acceptance and checks

The original election assertion and every subsequent loss/rejoin,
suffix-replacement, never-applied-quorum, original-identity, source-redrive,
source-debt and native commit/application assertion are byte-identical. The
19,214-byte prefix and 2,979-byte suffix beginning at that election assertion
were compared exactly. RF1 and the shared fixture remain untouched.

Passed: proposed-file `node --check`; repository-scoped ESLint using the real
test path as `--stdin-filename`; read-only `git apply --check`. All R1 artifact
hashes were also verified unchanged against their manifest. These are static
checks, not native-election or recovery proof. #1026 remains FAIL; corrected
runtime behavior requires independent source review and a new exact-source
locked-lab measurement.

## Frozen R2 code identities

- Proposed test SHA256:
  `7f4cf6984aadb9724b012bd1f32be53e3eda28d065a07a76a7cc5ff2f44cacb7`
- Unified patch SHA256:
  `52d2f27805ab91a8890346f67b132f377ec6f6005bd3263cb5a03c6b954b2e36`
