# PR109 review 5460477132 - bounded R2 response

Status: the new paused-boot-read finding is reproduced, corrected and measured;
independent rereview is still required. Restart duration remains OPEN. The
previous two complexity corrections were confirmed by this review. No Solver
terminal landing, main merge, FreshMG completion or release approval.

Reviewed head: `6d09b134c2ac0f7639b98751f4ed7f535367cb11`.
Unchanged-runtime profile/evidence head:
`963edd9678466b8ae7246add2d9c535b1b53e2cc`.
New test red head: `97e2b1071107507eac468f6b61af8a59cf8bb0d8`.
Corrective runtime head: `ab5298277d47a244dacb6d730778c4788ad05151`.
Evidence-bearing published head:
`de00becf1fe8fbb8622332f9703085d31f9800c2`.
This additional written response changes no measured source.

## Finding 4222118121 - operation facts after an awaited boot observation

The previous implementation observed the operation and exact current holder,
then awaited canonical boot rows. A real repository renewal or successful
terminal settlement could complete inside that await. The old operation image
was still used afterwards, so the bounded native consumer could propose from
an observation already superseded before its boot read completed.

Four new cases extend the existing native-consumer integration witness:

| Change during the boot-read callback | Existing source | Corrected source |
| --- | --- | --- |
| Real holder renewal wins its conditional operation update | CORE_OK; refusal assertion fails | Refuses, no native proposal |
| Real successful terminal settlement completes | CORE_OK; refusal assertion fails | Refuses, no native proposal |
| Operation authority becomes unreadable before final observation | Proposes from the earlier row; unavailable assertion fails | Typed retryable unavailable, no native proposal |
| Failed terminal settlement retains the exact already-issued intent | Existing retained-action positive | Still commits the exact learner through native Ready/apply |

The callback explicitly proves its window engaged, clears itself before the
competing repository operation to prevent recursive fixture interception, and
uses the actual claim/update methods with file-backed canonical schemas. It
does not manufacture a completed renewal or substitute a fake native outcome.
The older sixteen reported cases and all original assertions remain.

### Smallest changed owner interaction

Only `replica-operation-message-group-learner-observation.js` changes under
src. After the authoritative boot read, the same repository observes the
operation again, checks the existing complete exact-issued-intent predicate,
then checks claim liveness after the reads. Unavailable evidence stays typed.
The first read remains an early invalid-request refusal; it cannot authorize
using a stale row after the boot await. No new state, lease, queue, retry loop,
export, result vocabulary, schema or alternate mutation path is introduced.

This is NOT an atomic transaction across operation metadata, boot metadata
and the group's Raft state. Changes after the final observation, including
between independent group operations or while native work is queued, are not
magically excluded by another read. The existing issued-action/receipt driver,
transport binding and native same-turn fences retain those responsibilities.
The correction proves the explicitly reproduced intervening boot-read window,
not global cancellation or linearizable cross-group authorization.

Ordinary FAILED settlement after intent issue does not revoke that intent.
An unchanged exact issued action remains owed. The positive failure-during-read
case is intentional: a blanket terminal check would break the accepted
terminal-obligation contract. Successful/mixed terminal state is not permission
to add a fresh learner. A native proposal remains neither physical CREATE
permission nor membership-obligation release.

## R2 measurement - Actions 37818495699

Substrate: GitHub-hosted Ubuntu 24.04 with Node 22 and the existing
`LAGRANGE_LANE_JOBS_CAP=1`. Not GCP, physical networking or distributed acceptance.

The new tests failed on the unchanged runtime at all three specific assertion
messages above. The corrected source passed them and the retained-action
positive. Reverting only that source file to the original bytes restored the
same three assertion failures; restoring the corrected file left a clean tree.
No source-independent failure, timeout or missing prerequisite is counted as
the red-on-revert witness.

| File | Reported assertions | Whole-file milliseconds | Existing limit |
| --- | ---: | ---: | ---: |
| integration/message-group-learner-runtime-authorization.integration.test.js | 20 | 2186 | 30000 |
| rebalancer/message-group-membership-branch-authorization.test.js | 90 | 1152 | 2000 |
| rebalancer/message-group-membership-operation-lane.test.js | 8 | 774 | 2000 |
| rebalancer/operation-progress-store-persistence.test.js | 24 | 958 | 2000 |
| rebalancer/reservation-file-backed-restart.test.js | 39 | 866 | 2000 |

All five files pass their unchanged budgets: 181 reported assertions in total.
Scoped strict cyclomatic and cognitive checks pass for both the changed source
and test. Source decision-boundary, runtime-grammar and literal counts remain
zero. Lint, regenerated metadata and shard audit pass. These are scoped guards,
not an assertion that the entire repository corpus/static gate is green.

The first attempt, 37817790691, stopped at lint BEFORE a behavioral test:
an unnecessary preparation-time reformat of old test descriptions caused one
101-character line. Removing that broad reformat preserved all existing test
bytes outside the added cases/helper. The original failed archive is nested
inside the successful bounded attempt's evidence, not overwritten or counted
as a behavioral result.

Integrity:
- Actions artifact 11568970224; SHA256
  `90dea36056354050e53abeaadd79bb482dd10b824a6181ead320d11be03ece82`.
- All 85 members in its manifest independently rehashed and matched.
- Original lint-failure archive SHA256
  `41b60af4288203264de99eb20f1b161a57891e5c3b9eca4019b9cf68699dfcb9`.
- Canonical Solver evidence asset
  `message-group-fresh-identity-membership--runtime-r2-37818495699-1.zip`,
  SHA256 `89981ce5cc66717d0ffe2775a2907487d549558f98f971b3bf8ae4a512a8a2d0`.
- Machine record: `runtime-r2-37818495699.json`.

Normal non-force Git push used the existing Actions token. Expected old and
new remote SHAs were checked, with empty final checkout status. The complete
workflow deliberately ends red because the independent restart-duration
finding remains open. This is not independent source approval.

## Finding 4221679298 - actual unchanged restart cost

Actions 37817140133 ran the unmodified sixteen-case restart-equivalence test
and then a separate V8 CPU-sampled execution. The ordinary file returned zero
with 16 reported assertions in 5840 ms, still above 2000 ms. Its different
elapsed time from the preceding 8376 ms run is NOT an optimization: source,
assertions and persistence settings were unchanged.

The profiled process took 5.87 s wall time, 3.58 s user and 1.28 s system time,
with 160208 KB maximum resident set and no swap. Its sampled window was
5793.030 ms. Aggregating identical function/location frames across stack
occurrences gives:

| Function | Inclusive sampled milliseconds |
| --- | ---: |
| formHistory | 2855.750 |
| admittedTarget | 3148.014 |
| electionStorm | 770.570 |
| assertGatedAfterRestart | 757.164 |
| assertConverged | 274.746 |
| applyRestartClass | 42.787 |

Inclusive costs OVERLAP; they cannot be summed. In particular admittedTarget
includes history construction. Sampled self stacks include SQLite transaction
wrappers (1469.718 ms), statement preparation (647.748 ms), identity reservation
and lookups (444.291 / 416.595 ms), and exec (339.945 ms). Wrapper samples may
include native execution or time blocked there; this is not a syscall-level
attribution of fsync or proof that any write is redundant.

This strengthens the cost attribution to repeated real history/native/durable
work. It does not establish a safe optimization that meets 2000 ms. Current
peer-registry source already has an existing-reservation early return; do not
invent a missing cache from its sampled presence. The earlier independent
readonly-oracle measurement also did not support read-result caching or
connection pooling as the principal fix.

No matrix cell, independent disk observation, storm interval, native check,
restart scenario, transaction/durability setting, time limit or classification
was removed or weakened. No shared prepopulated history was substituted for
live continue-versus-restart comparisons. The remaining duration correction
must be justified at the fixture/native/persistence interaction, or a genuine
classification/contract discrepancy must be explicitly decided by its existing
owner; changing a filename merely to obtain a pass is not authorized here.

Profile integrity:
- Actions artifact 11567552402; SHA256
  `2d626af2000982c5f606637960d508eb44a85dcb71b41ef50194d15dfe709831`.
- All 16 manifest members independently rehashed and matched.
- Canonical Solver asset
  `message-group-fresh-identity-membership--restart-profile-37817140133.zip`,
  SHA256 `bb2b652a580271d82b77729383188bfd026972f650d034bbecd645e27d53cb0c`.
- Original source SHA: `6d09b134c2ac0f7639b98751f4ed7f535367cb11`.
- Machine record: `restart-cost-37817140133.json`.

The independent ZIP downloads described here are the Actions artifacts; no
separate download of the distinct canonical ZIPs is claimed.

## Review and remaining product boundaries

The PR description must distinguish current head from historical measurement
SHAs; the companion exact-head review request updates it without changing
historical records. Request category-complete rereview of the R2 correction,
including the failure-after-issue positive and the explicit non-atomic limit.
No author-generated independent approval is recorded.

The original full lab FAIL, incomplete production membership driver and
registered recipient/CREATE path, snapshot catch-up, physical off-seed
acceptance, final exact-main certification and A1-v13 compatibility fence all
remain. Do not run another broad lab campaign merely because this bounded
source interaction now passes.
