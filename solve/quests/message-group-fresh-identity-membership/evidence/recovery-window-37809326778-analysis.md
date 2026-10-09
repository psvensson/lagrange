# Controlled recovery-window measurement - Actions 37809326778

Runtime source: `50ef7714d0fb74e9cad61d739eb62d486fe87ac9`, with no runtime/test
changes from `3fda8406d4c97bfd47231072e8065fb61f3a13f6`.
Measurement/evidence published at `5c54bb74ed15f0be4a932f9f047addfa9c03d936`.
Runner: lagrange-gcp-runner. Full measurement took one recorded wall-clock
second, not eight seconds per response-schedule cell.

This is the next bounded investigation following the failed 941-file lab run.
It neither changes the lab verdict nor makes the FreshMG chain operational.

## What actually executes

The query cells use the real QueryExecutor, its real candidate routing, request
identity, unknown-outcome tracker, exponential delay selection and partition
attempt budget. Clock advancement uses the existing nowFn/delay seams. System
metadata and transport answers are supplied test inputs. Each delivery records
its exact entryId, logical time and remaining delivery budget. No real SQL
application, disk crash or consensus change is implied by these query answers.

The separate election control runs the existing GuardedSchedule over real
production operation ports and the native WASM core. It establishes a leader,
loses that leader's traffic, proves repeated observations alone do not advance
the survivors, then explicitly ticks the live quorum until it elects. This
control does NOT supply the query-cell responses. The two controls are not a
composed end-to-end SQL/election test and establish no physical election latency.

## Measured query results

Caller budget: 8000 logical milliseconds; initial retry delay: 5 milliseconds,
as in the recorded F-aj witness. The existing owner chooses all later delays.

| Supplied result becomes available | Actual client return | Result | Deliveries |
| --- | ---: | --- | ---: |
| Immediately, 0 ms | 0 ms | success | 1 |
| 1000 ms | 1275 ms | success | 9 |
| 9000 ms, after deadline | 6555 ms | typed unknown, same caller entryId | 12 |
| 7277 ms, inside the residual caller window | 6555 ms | typed unknown, same generated entryId | 12 |

Both unresolved cases retained 1445 ms of nominal caller budget at return.
The residual case is chosen from the actual first late-case measurement, not
from an independent reimplementation of the backoff policy.

The owner source explicitly refuses a retry when its requested delay exceeds
the remaining budget (`createPartitionAttemptBudget.waitForRetryBudget`). Thus
an 8000 ms timeout is not currently a promise to continue observing for all
8000 ms. The inherited owner can report an unresolved result earlier rather
than scheduling a delay which will exceed that deadline. The supplied result
in the residual cell was never delivered before the caller returned.

This demonstrates a real executor-policy boundary without any election
randomness. It does not prove the membership consumer caused the original
F-aj failure, nor that an actual committed result is available during every
physical residual window. It also does not establish that returning UNKNOWN
early is forbidden by the public request contract. The outcome remains honest
and retains the retry identity; no success, cancellation, failed-commit or
exactly-once claim is fabricated.

## Native control and mutations

The existing native guarded-port schedule elected b after a was lost, in 21
explicit drive rounds within its 600-round safety bound. Ten read-only
observations before driving left the two surviving status snapshots unchanged.
No assertion depends on 21 specifically; native random election choice is not
converted to elapsed wall time or a pass-rate claim.

Three temporary production-source mutations were measured and restored exactly:

1. Replace the unknown result's entryId: caught at exact identity preservation.
2. Replace the unknown result's failureCode: caught at typed unknown preservation.
3. Remove the existing delay-fit guard: caught when the logical client window
   exceeds 8000 ms.

All three exited 1 at their intended assertion. The original runtime remained
unchanged after the controls; the final published worktree status was empty.
This is author-side measurement, not an independent approval.

## Integrity and retention

- Original Actions artifact id: 11563903032.
- Downloaded ZIP SHA256:
  `02471cbf34c212cc1a80d60c6b249a7cc6f95a6f19e8ebfd685a4c90feb1614e`.
- All 22 members named by member-sha256.json were rehashed and matched.
- Canonical Solver evidence archive SHA256:
  `9e9286c4b2f69a65edd423c13cdf015a790283403a42d9ed607d7bbf05c6d43f`.
- Canonical asset:
  `message-group-fresh-identity-membership--recovery-window-37809326778-1.zip`.
- Raw machine-readable record: `recovery-window-37809326778.json`.

The canonical upload was performed by the existing Solver evidence owner.
The independent download/hash check described above is of the Actions ZIP;
no second download of the distinct canonical ZIP is claimed in this note.

## Next source decision, narrowly scoped

The earlier paired trace contained two different timing facts: leader recovery
was not established within the failing base setup; in the candidate the client
returned before leadership/commitment recovered. This controlled measurement
now isolates early retry exhaustion from the election itself. Neither leg
justifies changing pre_vote/check_quorum or raising any time budget.

The immediate next witness should compose actual partition application and
query delivery with explicitly controlled consensus/recovery scheduling under
the unchanged budget. Existing operation ports expose stopScheduling/tick and
hosted replicas already have a time-source seam; use those owners rather than
inventing a second clock or consensus implementation. Keep positive recovery
before an eligible attempt separate from outlasting recovery and retained-ID
redrive. Correct a timing-sensitive test's precondition only with evidence;
do not weaken its success, no-duplicate, unknown-outcome or source-revert checks.

Any proposal to add a final retry inside the residual window belongs to the
existing query delivery-budget owner, with cancellation, backpressure, load,
boundedness and remaining delivery budget reviewed together. It is not an
automatic consequence of this diagnostic and is not implemented here.

Continue the remaining FreshMG recipient/driver/CREATE chain under its existing
sealed Quest once relevant owner review is resolved. No C0 receipt, FreshMG
completion receipt, independent source approval, physical baseline or A1-v13
compatibility gate is advanced by this measurement.
