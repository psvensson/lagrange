# PR109 review 5459955866 - first corrective response

Status: two source findings corrected and measured; independent rereview
outstanding. The third, restart-duration finding remains OPEN. No terminal
Quest landing, main merge, FreshMG completion or release approval.

Original reviewed head: `ff8c95ee3546458db0154e7eb8920bcd1978b9c4`.
Corrective source/test-metadata commit:
`f786555fc2ec74c60dcc00a6d04c6aa0735945d8`.
Evidence-bearing published head:
`ff46e8d523b0d936fccade3d821b9b84525663f5`.
Actions measurement: `37815226541`, GitHub-hosted Ubuntu 24.04, NOT GCP.
This note changes no source and does not extend that measurement's scope.

## Finding 4221679085 - existing native admission owner

The new `proposeAuthorizedGroupLearner` had cyclomatic complexity 25 against
12. Its body now delegates to unexported helpers IN THE SAME MODULE for
receiver-field snapshot, port availability, authorization refusal mapping,
recipient/transition matching and reservation/proposal. None owns new state.
The before/after strict scoped count across the two touched source files is
2 -> 0; strict cognitive count is also 0. Decision-boundary, runtime-grammar
and literal audits remain at their inherited zero counts.

The semantic sequence remains:
1. require the existing bound observation function;
2. require the actual semantic operation port;
3. snapshot host-composed receiver bindings;
4. await the repository observation ONCE at the existing await boundary;
5. retain typed unavailable/refusal results;
6. check current port/group/replica and ADD_LEARNER stage;
7. reserve only the issued target identity;
8. pass the original transition unchanged to native same-turn fences.

No extra await, public resolver registration, new export, native status
substitution into an old permit, or planner/handler activation was added.
The successful proposal still is NOT a physical CREATE grant or membership
obligation release.

## Finding 4221679210 - repository-side request observation

`snapshotRequest` previously mixed structural decoding and cross-record
identity checks and measured 14. Structural decoding stays at the same owner;
`matchesInitialLearnerRequest` separately compares the successfully decoded
operation/transition, ADD_LEARNER stage, IN_FLIGHT state, first sequence,
permanent target replica and peer identity. Missing/invalid codec results are
still refused before any field comparison. Original intent/holder/boot checks
elsewhere are unchanged. The new source file now passes its mandatory strict
cyclomatic and cognitive checks; no inherited-debt exception was requested.

## Measured behavior and resource controls

The native-consumer integration file passed: 16 reported assertions, 5230 ms,
below its unchanged 30000 ms limit. Four existing regression files passed:

| File under test/rebalancer/ | Reported assertions | Whole-file ms |
| --- | ---: | ---: |
| message-group-membership-branch-authorization.test.js | 90 | 1005 |
| message-group-membership-operation-lane.test.js | 8 | 871 |
| operation-progress-store-persistence.test.js | 24 | 999 |
| reservation-file-backed-restart.test.js | 39 | 910 |

All four satisfy the unchanged 2000 ms unit-file limit. Temporary mutations
removing exact issued-permit equality, current-holder equality and stale
native-fence refusal all fail at their original specific assertions. Source
bytes were restored after every mutation. The same integration/fixture proof
ceiling remains: no registered remote ingress, complete membership driver,
physical worker CREATE, or multi-host acceptance.

Execution history is preserved, not averaged away:
- `37813136467`: GCP VM already RUNNING, but the self-hosted measurement stayed
  queued. Only that exact unstarted job was cancelled; no test or source
  result belongs to it. No GCP service restart or unrelated work was touched.
- `37813798876`: hosted baseline reproduced the two complexity violations and
  restart timing; the refactor then failed lint on one overlong line. No
  after-repair positive result belongs to this attempt. That line was wrapped.
- `37814349071`: strict source checks and all 177 focused assertions passed,
  but the four unit files ran concurrently at jobs=4 and measured
  2321/2381/2600/2778 ms. The explicit timing check failed; no push occurred.
- `37815226541`: identical corrected source/tests, existing classified-runner
  `LAGRANGE_LANE_JOBS_CAP=1`. The four unit files are within budget as above.
  No time limit, assertion, durability setting or resource class changed.

The single-worker result supports investigating runner-concurrency sensitivity;
it does not establish a full aggregate-corpus cure or a statistical speedup.
The latest host reports 4 logical CPUs, approximately 16.8 GB memory and no
swap use at the initial sample. This sample is not proof that any prior lab or
hosted failure was caused by memory/CPU saturation. Distributed certification
still uses the existing GCP/lab harness; a hosted component run is not that.

## Finding 4221679298 - restart test is still over budget

The unchanged restart-equivalence file passed its 16 reported cases in
8376 ms in the last uninstrumented run. That exceeds the existing 2000 ms
unit-file budget, so the complete Action deliberately ends RED even after
preserving and publishing the accepted-scope refactor evidence. There is no
claim that all three review findings are closed.

A separate, temporary observation-only instrument around the independent
readonly SQLite oracle measured:
- 3431 calls;
- opening: 150.637 ms;
- executing reads: 283.658 ms;
- closing: 43.958 ms;
- instrumented process window: 8724.842 ms.

The direct time in these oracle calls is about 478 ms. This does not support
readonly connection pooling as the main repair for an 8+ second test. No
reader caching, result caching, changed transaction mode, reduced election
storm, dropped matrix cell, shortened history, moved test classification or
relaxed deadline was introduced. The helper was restored byte-for-byte.
The next duration investigation should profile actual history construction,
native configuration/Ready application and durable write costs, retaining
all 16 cases and independent disk observations. Do not infer a production
performance defect from this partial cost profile alone.

## Integrity and independent-review boundary

Machine-readable record: `runtime-review-37815226541.json`.
Canonical Solver archive:
`message-group-fresh-identity-membership--runtime-review-37815226541-1.zip`.
Canonical SHA256:
`76fe18b76818d81c242193ea6cff97340314cbc4a33d1008eb37db7f547cc032`.
Downloaded Actions archive id: `11567290824`.
Actions SHA256:
`6f5398ec68f752bf3c15043c5deaeb0e00865b53dc80d32ac53d0c649fe6183d`.
The Actions archive and all 92 named manifest members were independently
rehashed in the reviewing session and matched. The two failed-attempt
archives are nested and hash-bound. The canonical archive is a separate ZIP;
this note does not claim a second download of it.

Actual push used the existing ephemeral Actions token and normal non-force
Git push to the authorized work branch. Expected old and final remote SHAs
were checked. Final measured checkout status was empty. The source scope is
exactly the two reviewed modules; generated impact seal and append-only Quest
records accompany them. This response does not mark an independent approval
receipt. PR109 must be rereviewed at its new exact head.

The original full lab FAIL (941 selected / 918 process-level passes / 23
failures), unfinished FreshMG recipient/driver/CREATE chain, intact snapshot
catch-up and final A1-v13 compatibility/cutover gates remain unchanged.
