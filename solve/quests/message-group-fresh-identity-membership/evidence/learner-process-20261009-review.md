# Learner outcome: process-loss and refusal-classification review

Base: 85711505b502950ddfd095e108d31df237fb7464 (PR113).
Measured source/tests/metadata: 8f8213d994b84c3c5858525dbdc91de835e59b5d.
Original-source red: daff9859dc52c2c42097a8d4387274da18da4ef7.
Evidence-bearing head: d78d9d70ec199895871bffdbd53a0ecb47920d56.
Contract clarification: 00cd3a8d8f2aca6c716fa5e97f7a08135fb2c4ca.
Actions measurement: 37948946816, GitHub-hosted Ubuntu, Node22, locked better-sqlite3.
This is author implementation/self-review, NOT independent approval or cutover closure.

## Implemented correction

PR113 review 5471494993 / finding 4231271062 correctly identified loss of the
native outcome's meaning. The existing repository authorization owner now keeps
exact unresolved history UNKNOWN, explicit unavailable reads UNAVAILABLE, and
malformed/wrong-action/corrupt/impossible evidence CONFLICT. A valid historical
origin whose same-turn membership witness is HELD or lacks configuration generation
remains UNAVAILABLE rather than permanent conflict. No refused input changes the row.
The original tuple, native fences, SQL CAS, readback and debt semantics are unchanged.
No new schema, lease, coordinator, receipt ledger, public route or retry algorithm.

The original runtime fails the named classification assertion; 51 other reported
cases pass. The corrected file passes all 53. The added terminal-at-CAS test
exercises both a failed and successful ordinary operation winning the actual SQL
competition. The old CAS loses without altering the winner. Only an exact failed
row can later record its committed membership result; success remains a conflict.
Ordinary history and every other outstanding obligation remain intact.

## Actual OS-process witness

One test fixture is extracted from the existing integration file and reused,
not copied into a parallel implementation. Its optional tempRoot is test-only;
the parent's own scratch directory contains every native and operation database.
The metadata gateway is file-backed SQLite and the native messages use the
existing in-process PartitionNodeCluster. This is not physical cross-node SQL.

Three separate writers reach explicit durable cuts. Their IPC channel is kept
referenced at the cut; an unresolved Promise alone cannot allow a normal exit.
The parent terminates the owned worker group and verifies SIGKILL/code-null before
starting a fresh reader process. Cleanup owns only those child groups and scratch.
The reader uses another logical node id and another existing voter's intact file,
not a synthesized bootstrap configuration or reissued membership proposal.

The final restored-positive raw TAP observations are:

| Scenario | Writer -> reader PID | Input recovered from | Before -> after learner phase | Recording native reads | New proposals |
| --- | --- | --- | --- | ---: | ---: |
| pending | 4279 -> 4288 | authoritative operation row | in-flight -> committed | 1 | 0 |
| ordinary-failed | 4297 -> 4306 | authoritative operation row | in-flight -> committed | 1 | 0 |
| record-answer-lost | 4315 -> 4324 | original request redelivery | committed -> committed | 0 | 0 |

All writers ended by SIGKILL; every reader exited normally. Each recovered the
same term-1/index-2 origin from consumer-b after consumer-a was the original
proposer. The logical holder changed consumer-node -> consumer-successor,
generation 1 -> 2, only after the fixture clock crossed the original exact expiry.
Attempted takeover before expiry leaves the row untouched; the original holder's
request is refused after takeover. Original permit term/fences/sequence survive.
The failed ordinary operation stays failed; membership obligation remains unknown.
Every ordinary and debt field outside holder/phase/permit/learner-stamp was compared
unchanged, and exact replay issues no new SQL update or native read/proposal.

The answer-loss case proves a committed write can be recognized upon original
request redelivery. It does NOT claim automatic scanning of recorded operations
or reconstruction of an in-flight request from a now-committed permit alone.
The other two cases obtain request identity/permit/holder from the real operation
repository; the parent message is an expected-result oracle, not their source of
execution authority.

This establishes operating-system process loss on intact local storage. It does
not establish power loss, physical multi-host election/liveness, remote membership
claiming through replicated SQL, the full OperationWorkflowOwner driver, current
CREATE, automatic recovery discovery or any new successor-action permission.
Different logical holder is not shorthand for physically distinct machines.

## Completed canonical measurements

All use the existing classified runner and one-worker cap. Limits unchanged.

| Group | Reported assertions | Whole-file milliseconds | Limit per file |
| --- | ---: | --- | ---: |
| Native/operation integration | 53 | 6037 | 30000 |
| Process-loss integration (three scenarios plus parent) | 4 | 4594 | 30000 |
| Four repository/workflow/reservation files | 161 | 966 / 869 / 1134 / 998 | 2000 |
| SQL/Raft/CDC cache visibility | 3 | 17777 | 30000 |
| Committed-read/checkpoint neighbors | 69 | 654 / 714 | 2000 |

Nine files / 290 reported assertions pass. The separate cache test supplies the
native evidence and exercises real SQL/Raft/CDC, exactly as before; it does not
combine with the local process fixture into distributed-failover proof.
Restored positives: native integration 5999 ms; process-loss file 4554 ms.
Strict changed-test/helper complexity and lint pass. Source has no new violating
function; inherited selectMessageGroupMembershipBranch cyclomatic complexity 39
remains. Cognitive, decision, grammar and literal checked violation counts are
zero. Generated classifications/import metadata and shard audit pass. No global
file-size/static or complete change-impact gate is claimed.

## Mutation and engagement proof

The existing PR110 owned POSIX process executor and structured Node reporter are
read at pinned 44e968be4e2f2db03b37d8a26470fd0a3b256fee. No new general-purpose runner.
Each mutation checks exact failed leaf identities, ERR_ASSERTION, message, file,
exit status, zero cancellation/skip/todo and complete process cleanup.

1. Permanent conflicts mapped back to UNAVAILABLE fail the exact classification
   leaf (actual unavailable, expected conflict).
2. Removing temporary witness-unavailability handling fails that leaf in the
   opposite direction (actual conflict, expected unavailable).
3. Replacing SIGKILL with SIGTERM fails all three process scenarios at the signal
   assertion, before recovery. A normal/cooperative exit cannot earn crash credit.

Original bytes are restored after every mutation and both complete integration
files pass again. These controls test the new change and the interruption claim;
they do not assert that all imaginable crashes, fault schedules or external
process escape behavior have been covered.

## Retention, first failure and independent inspection

The first run 37947895412 stopped before behavior tests because the new integration
file matched two subsystem categories. The existing subsystem owner now assigns
that exact test to storage/raft, with an explicit reason. No test duration or
execution/resource class was weakened. Its original archive is nested unchanged:
SHA256 2f64471ee5dd9014254f0857d6f21e6e08b3fd9affb5edadd65edb6387830207.

Successful Actions archive:
368e36ecbee8f1c1d9e97c2ff6564cdfc358b569ee3e936673f290acfd3a3b6d.
All 184 named manifest members were independently rehashed. The 216-entry Actions
ZIP also includes post-publication copies/status/bundle not covered by that inner
manifest; its entire ZIP digest covers those bytes. Raw restored-positive process
observations and actual failed mutation events were decoded and checked after
download. Node TAP escapes backslashes in diagnostics; removing that reporting
escape is required before parsing the diagnostic JSON, not a source/test repair.

Canonical Solver asset (uploaded in the completed publication step):
a298549664f2ef938b6ff80b6de88c23d9d3504498936c3e98a2251883f2ef89,
message-group-fresh-identity-membership--learner-process-37948946816-1.zip.
See learner-process-37948946816.json for the upload record and exact commands.
Normal non-force branch-preservation push was checked against the expected prior
SHA and resulting remote HEAD. Final measured status was empty. No main, earlier
PR, preservation reference, Solver approval or sealed acceptance was changed.
The Action's final step intentionally stays red for the distinct full-cutover
claims; the measurement and publication steps themselves passed.

## Next bounded interaction

Obtain exact-head source review, then wire the existing ordinary membership
reconciliation/registered recipient capability to this recorder and current
CREATE through its existing descriptor and exact physical-worker/generation
checks. Remove fixture-driven workflow staging only when that actual path can
produce it. Do not add another recovery coordinator, issue a refreshed old permit,
or release the lane because this historical fact was recorded.

The ordered successor-action path still needs definitive predecessor fencing AND
noncommitment. Holder replacement is not that proof. J1 forward recovery after
promotion authorization remains binding. Full change-impact/static checks,
restart-duration debt, original full-lab FAIL, physical two-replacement/off-seed
seed-loss acceptance and exact-main/A1-v13 review remain separate open gates.
