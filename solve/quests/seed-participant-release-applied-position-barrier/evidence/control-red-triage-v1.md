# V3 fixture-control red triage (read-only)

Date: 2026-10-13

## Binding and claim limit

- Immutable tested input: commit `e8afaa2cfe87cfbbbb3f11ae0516b294e9d48ba4`, tree `995db773d0ecb3d36488101de0a12ea3dc399359`.
- Source base and current worktree HEAD: `77e091f64fb711fbc5ca40a7915ae85f01a5cf4e`; `git diff 77e091f64 -- src` is empty.
- tv-dator log: `test-output/seed-release-diagnostics-20261013/native-witness-v3-fixture-controls-a/lab.log`, SHA-256 `9414dcd067007a2a15b797f953aa8699d115d6398d0a8928d3f192ae443c324f`.
- lenovo-laptop log: `test-output/seed-release-diagnostics-20261013/native-witness-v3-fixture-controls-b/lab.log`, SHA-256 `1bdffb083549c9e76e49f51403a80b752f38ca7bb5928bf1f89c17afebaaa76e`.
- This is source- and call-graph triage only. Same-host runs of the unchanged `77e` source/test predecessor are pending. The observations below do not classify any red as inherited or as a regression, and do not waive any exhausted bound.

## Shared owner edge

Every `PartitionService` lifetime starts participant-release admission CLOSED; only the canonical complete release census opens it (`src/partition/partition-participant-transaction-pause.js:1-2,17-25,73-102`). An ordinary admitted write reaches `pausedWriteAnswerOf` before proposal and returns the typed `partition_write_cutover_paused` refusal while CLOSED (`src/partition/partition-service-raft-write-commit.js:428-447`). A direct local mutation similarly returns CUTOVER_PAUSED while the same admission is closed (`src/partition/partition-local-mutation-admission.js:20-31`).

Neither construction path implicated by these reds composes that release owner:

- `formAdmittedGroup` initializes/admit peers and returns them, but does not attach `ReplicaHandler` release recovery or run a release (`test/partition/partition-admitted-group-fixture.js:84-141`).
- `withLonePartitions` directly initializes a singleton, starts its election, and returns it (`test/partition/settled-replay-preserves-result.test.js:170-198`). It does not use either changed fixture or a release owner.

This makes CLOSED admission the source-backed common setup edge. It is measured directly in statement-admission A4: all ingress answers and the positive-control write returned `failureCode: partition_write_cutover_paused`. Some query output also prints that exact refusal. Where a test discarded the answer and retained only `.success`, CLOSED is only a plausible branch until the same-host control or a retained answer identifies it.

## tv-dator: `partition-statement-admission`

The file reported 11 assertions, 9 pass and 2 fail.

1. A2 fails at `test/partition/partition-statement-admission.test.js:209`. It directly constructs two replicas with `startReplica`, then calls `executeLocalQuery` in `disturbConnection` (`:171-178`); it never calls `formAdmittedGroup`. The expected first replica disturbance was three `rowid_ceiling` refusal layers, but the actual values were three `undefined`; all six apply results, byte-identical outcome rows, and every retained statement result still matched. Because the helper projects only `.refusalLayer`, the raw local refusal code is absent from the log. The current local admission owner can produce CUTOVER_PAUSED without a `refusalLayer`, so that is consistent with the observed projection, but the retained evidence does not prove the exact answer.

2. A4 fails at `:385`. This is the sole test in the file that calls `formAdmittedGroup` (`:352-353`). Formation completed, but every wire/ingress refusal was `partition_write_cutover_paused`; the explicit-key positive control was also `success:false`, rows stayed empty, and `refusedRows` was zero. The assertion expected the statement-admission refusal layers plus one successful explicit-key row. This is an admission/setup failure before the intended statement-admission behavior, not a failed statement-classifier assertion.

The V3 fixture delta can be reached by A4 only through the same exported constructor. With `transport` omitted, `transport ?? createLoopbackTransport()` selects the same loopback transport as the base. The other changes are ownership-aware shutdown, error aggregation, and temporary-directory custody in setup/disposal. A4 reaches its body and fails before `dispose`; none of those V3-only branches can create or open participant-release admission. A2 has no path to either changed fixture.

The same tv-dator cohort also reports initial-write/setup reds in `partition-write-leadership-transfer`, `partition-write-answer-consumers`, `unknown-outcome-redelivery-budget`, and `unknown-outcome-same-entry`; the latter retains an exact `partition_write_cutover_paused` setup answer for its admitted-group case. The 73.9 s unknown-outcome-redelivery-budget spend remains an exhausted system bound, not a scheduling waiver.

## lenovo-laptop: `settled-replay-preserves-result`

All six assertions fail before their replay/runtime-replacement behavior begins:

- Five singleton cases fail their first ordinary write at `test/partition/settled-replay-preserves-result.test.js:254,293,319,356,413`. They run through `withLonePartitions`, which does not import or call either changed fixture. The log retains only `success:false`, so it does not identify the exact typed refusal.
- The sixth case uses `formAdmittedGroup` at `:468-471` and fails its first setup insert at `:476-477`. As with statement A4, the default formation path before the body is byte-equivalent to the base except for selecting the same loopback through a nullish expression. The V3 cleanup changes have not run at the failure point.

The file imports no `partition-release-fixture` API. Therefore five failures are outside the V3 fixture call graph, while the sixth reaches only the admitted-group default path whose pre-body behavior was not changed. The common early write failure is source-consistent with unopened current participant-release admission, but the answer shape is not retained and must not be inferred as measured.

The lenovo cohort also reports the same first-write shape in `partition-write-leadership-transfer-committed` and two 30 s setup expiries in `write-exactly-once-schedules` through `unknown-outcome-surface-fixture`; the latter transitively calls `formAdmittedGroup`. The 30 s spends are system bugs regardless of the pending predecessor classification. Four other files in that cohort passed, including typed-release, committed-outcome, unreadable-record, and three-replica transaction-leg controls.

## Bounded conclusion

The exact V3 fixture changes do not have a pre-disposal route to the failing direct singleton/local tests, and their default admitted-group construction does not alter transport, membership, election, or write admission. The failures cluster at an existing interaction boundary: current services begin CLOSED, while these historical fixtures/tests attempt ordinary writes without composing and consuming the canonical participant-release owner. That is a source-supported harness/owner-interaction candidate, not yet a regression or predecessor verdict. The pending same-host `77e` controls remain necessary; no test expectation, timeout, release algorithm, or fixture state should be changed from this triage alone.
