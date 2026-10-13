# Applied-position controls V5 frozen implementation report

Status: **TEST CONTENT FROZEN; BEHAVIOR UNRUN**. This batch changes only the four
review-authorized test paths below. It does not approve production, native/query
composition, metadata, Quest closure, or landing.

## Binding

- Isolated worktree HEAD: `ad23d75d58e320ca2fe58f8baa9b0a941a8158e2`.
- Complete V4 content review: `a31086b7e104227e1e1b7d8526e557ebbbdaba9e7652ed220b6c5994fbfc9288`.
- Reviewed production input used for schedule alignment only: source V3 commit
  `7a755cf833b342c275ff5138e087a97832e28c2d`; no source bytes were copied or edited.
- Preserved V4 manifest: `42b3d2b17f7eefa3ce410f3d29831e33da3ac8534352f577208a30e14e182e46`.
- V4-to-V5 patch: `a2043c95c480ce7a6f2da3a3ce689f6ce6b79b9fd37ce5e8b7ff0beea80d9927`.
- Base-to-V5 patch: `137add026d1e861aaf313492c31f4de34263f138405bca8893a3b1fc9306836e`.

## Frozen paths

| Path | SHA256 | Lines |
| --- | --- | ---: |
| `test/test-helpers/participant-transaction-fixture.js` | `48c385ffd2ac0df93214af165feb608e679c566faa09b41f473f4a688e5a3e53` | 1172 |
| `test/partition/participant-release-protocol.test.js` | `41c00e05c22a714babbcf0943794d52108ec06114bcb232094ddcba84e719c9c` | 760 |
| `test/node/replica-handler-release-recovery.test.js` | `158bd7f029485af2e98974252b348f35b0a23358197d952210295c4ac7df4095` | 1415 |
| `test/partition/participant-release-applied-position.test.js` | `39c7523e13f4110b1bbf8ec536b7f9a9dd2504f489a438f22e9f04b9997764a5` | 940 |

The new applied-position file contains six extracted V4 controls plus two
causal V5 cases. All seventeen prior protocol test names remain present
across protocol and applied-position files; no existing case was dropped.

## T1-T6 closure in the test content

- **T1 grammar:** unsafe top records (proxy, exotic prototype, accessor,
  symbol-key, array and boxed discriminator) use the actual registered handler
  and require the full generic unknown-message envelope with zero hostile reads.
  Strict release-tagged requests retain canonical INVALID. An unavailable nested
  release copy requires `releaseId:null`; safely copied malformed tuples retain
  their release ID. Diagnostic-trigger tests now contain only safe records.
- **T2 causal ordering:** the S1 case holds the actual committed-membership read,
  arms the actual owner clock only after engagement, and changes the real
  controllable port term on the consuming sample; the paired same-context case
  stays OBSERVED. The S2 case captures committed membership N, applies a real
  accepted SQL command K between assessment and adjudication, observes the real
  applied-progress wake, and verifies the real write outcome, cursor and queue
  settlement without a false STALE result.
- **T3 hostile and missing input:** release, attempt, target and origin are each
  tested missing and own-undefined both before observation creation and against
  a held starter. A narrowly scoped Array-iterator replacement surrounds strict
  nested capture. The recovery witness installs its Array attack only after the
  actual service teardown and requires exact cleanup-error identities to survive
  observer cancellation, handler collection and AggregateError construction,
  including a thrown `null` cleanup value.
- **T4 prompt cancellation:** handler and service shutdown cases track the
  registered route, take the fixture's one existing `setImmediate` checkpoint,
  and assert settlement while membership facts remain held. They do not advance
  a clock, poll, sleep, or rely on the runner bound.
- **T5 lifetime/custody:** a divergent replacement clock advances past expiry
  without sampling, expiring, renewing or clearing the installing clock's
  record. A retained-debt join first preserves the stored answer, then after
  faults are disabled discharges that same record without new facts/resources;
  a later clean request creates a fresh record. The post-ENABLE control-loss
  case restores the exact transport property and owns the original release
  attempt on every exit. Real SQL write promises are registered with the shared
  cleanup owner.
- **T6 scope:** the nearly-full protocol file fell from 1497 to 760 lines. The
  focused applied-position module is 940 lines; recovery is 1415 and the shared
  fixture 1172, all below the 1500 test limit. Shared cleanup and scripted clock
  utilities moved once to the existing participant fixture and have two real
  consumers. No classifier, generation projection, clock policy, progress
  algorithm or lifecycle driver was copied.

The existing V4 controls for negative registration/later clock samples, first
Raft-subscription replacement, cleanup reentry, all seven resource slots,
backward timer fallback, typed follower reentry, registry replacement/removal,
and ordinary older-origin pending work remain in the frozen paths.

## Static evidence and limits

- `node --check` passed independently for all four paths.
- Exact four-path ESLint passed.
- Exact four-path strict cyclomatic (12) and cognitive (20) checks passed.
- Repository file-size ratchet passed in normal mode; current inherited counts
  remain 25/27 source and 21/21 test, with no changed test at or above 1500.
- `git diff --check` passed.
- No behavioral test or lab command ran in this worktree, as required.
- No full test duplication scan ran here. The extraction leaves zero clone
  groups between the two partition test files under the repository's 20-line /
  100-token thresholds, but only root's canonical full test scan can discharge
  the inherited 46-line test duplication HOLD.
- Native V10/V11, final-query composition, startup budgets, ordinary shared-entry
  corpus coverage, generated metadata and final same-host treatment controls
  remain root-owned gates.
