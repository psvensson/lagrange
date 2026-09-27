# STOP checkpoint publication repair, 2026-09-27

This record is publication-only. It does not reopen the stopped design and it
does not add a production repair.

- Sealed STOP checkpoint: `292b7204334cf47617e675dd9b12bc708b682886`.
- Branch: `quest/distributed-transaction-replicated-apply`.
- Publication state at the start of this repair: `SEALED / PUBLICATION_BLOCKED`.
- Pushed branch SHA: pending the normal publication gate and independent
  remote-ref readback.

## Failed normal publication gate

The normal whole-corpus push gate reached the exclusive lane with one job and
failed in
`test/integration/transaction-concurrent-read-outage.integration.test.js`.
The failure occurred in `cluster.formCluster(3)`, before `evidence.create`, the
warm-up, or any transaction/outage round. The final formation observation was
a public CREATE rejection whose schema intent was already durably terminal.
The formation loop then retried the same deterministic schema intent under new
operation ids until its deadline. This is a formation-harness failure, not a
failure of the transaction witness and not evidence against the STOP verdict.

Resource reclassification cannot repair this failure: the failed publication
execution had already classified the target in the exclusive lane with
`jobs=1`.

## Historical boundary and isolated challenge

The current test first entered this line of work at
`72d878ece6971915b3284bec3a2cabe38770b8ea`. Its parent has no equivalent
transaction/outage witness. From that commit to the sealed checkpoint, the
transaction body is materially unchanged; the relevant later change replaces
a local log parser with the shared node-log-window helper.

The repository lab selector cannot name one file directly. Two disposable,
scheduling-only commits changed only `package.json` and
`test/shards/resource-exclusive.txt` to select exactly this file through the
normal lab runner. In both cases the selected test and `src/` trees were
byte-identical to the commit under challenge.

| challenged source | selector wrapper | host/lane | result |
| --- | --- | --- | --- |
| `292b7204334cf47617e675dd9b12bc708b682886` | `e008293ce7a57afd56b3a98d6d0f59c8be2e936e` | tv-dator, normal lock and thermal gate, exclusive/jobs=1 | green, 5 assertions, 100314 ms |
| `72d878ece6971915b3284bec3a2cabe38770b8ea` | `51c97a9c2a351be4a76d017f1e6a6af5c3d1d729` | tv-dator, normal lock and thermal gate, exclusive/jobs=1 | green, 5 assertions, 92148 ms |

These isolated greens do not erase the publication red. Together with the
pre-property failure location, they classify the mechanism as nondeterministic
formation admission rather than a transaction-assertion defect.

## Deterministic correction

The first repair checkpoint, `50834c2e2`, was rejected by an independent
verifier before lab execution. Its gate consumed canonical readiness-owner
output but did not match CREATE's provisioning enforcement: ordinary CREATE
also consumes `provisioningEligible` and an operation-specific capacity
decision. Its admin fetch also lacked a request bound, so one stalled request
could escape the remaining formation deadline.

The second repair checkpoint, `4e240ceca`, was also rejected before lab
execution. It incorrectly required `snapshotObservation.state=fresh`; the
`scope=local` HTTP route directly builds its local snapshot and does not attach
that shared-snapshot-owner field. The focused fixture had fabricated a shape
the live route cannot produce.

The amended embedded formation harness consumes the current priority-placement
owner output from the seed's directly built local admin control snapshot before
it submits application DDL. It requires an available, satisfied observation
whose `capturedAt` equals the enclosing snapshot's `capturedAt`, which
establishes that the placement observation belongs to the same local build,
and whose `eligibleNodeIds` set exactly equals the expected harness cohort.
Every snapshot request is aborted at the remaining formation budget.

These are formation preconditions, not CREATE authorization. The one-shot
CREATE remains the operation-specific authoritative decision because its
provisioning owner separately evaluates the operation's estimated bytes
against fresh capacity. A denial there is legitimate direct evidence and is
not retried by the harness.

After that owner-authorized readiness transition, the harness submits the
CREATE exactly once and the INSERT exactly once. A rejection is surfaced
directly with the node-log digest. It is not converted into another readiness
poll, retried under a new operation id, or hidden by a longer timeout. A
focused regression proves that a rejected CREATE has one attempt and cannot
fall through to INSERT. The transaction/outage assertions are unchanged.

## First corrected-branch lab preflight

An independent verifier approved `788fca7cbc2a568257530b828889367a9e27b0fc`
for a changed-profile preflight. The normal selector produced one exclusive,
single-job lane containing both the outage witness and the new focused
regression. The controller placed that exact SHA on tv-dator after its normal
lock and thermal checks.

The first selected integration file stopped in `formCluster`, before its tested
transaction property, because the four per-peer readiness dimensions did not
all become true before the formation deadline. The final control snapshot had
an available, satisfied, same-build priority-placement observation for the
full expected cohort, while the embedded per-peer evidence still contained
seed-projected `planning_snapshot_refresh_pending` states. Those projections
are not the canonical formation-completion event.

The remaining preflight was cancelled through the controller rather than
spending six more formation deadlines. The copied placement log preserves the
first file's TAP failure. The controller cancellation exited 130, and a
subsequent normal lab fleet probe reported tv-dator ready with its machine lock
free. The preserved placement log is
`test-output/placement/788fca7cbc2a-mujmpyka-2712098-tv-dator.log`.

The follow-up correction therefore removes the stale per-peer readiness
predicates and requires the canonical current priority-placement owner to show
the exact expected eligible cohort. A reduced, expanded, or same-size
mismatched cohort remains closed. The one-shot CREATE still owns refreshed
operation-specific provisioning and capacity admission, so this harness gate
does not authorize DDL or hide a legitimate denial.

## Exact-cohort preflight

The next verifier-approved checkpoint,
`8c2b64ede899c13bc05dfda9967a4f2fe6b2c61f`, again selected the same seven
exclusive files at one job. tv-dator accepted that exact head, acquired its
normal machine lock, and passed the thermal gate. The first file,
`transaction-active-owns-connection.integration.test.js`, again timed out in
`formCluster` before its transaction property began.

The bounded TAP failure preserved the full top-level membership and priority
summary but elided the decisive `currentPriorityPlacementObservation` fields.
It therefore proves that the exact-cohort precondition stayed false, but not
which input was false. The remaining six files were cancelled through the
controller. A subsequent normal fleet probe reported tv-dator ready with its
machine lock free. The preserved artifacts are
`test-output/placement/8c2b64ede899-mujnjytq-2727270-tv-dator.log` and
`test-output/placement/8c2b64ede899-mujnjytq-2727270-tv-dator.err`.

The next diagnostic checkpoint changes neither the predicate nor its budgets.
Each poll retains a compact real observation containing the enclosing and
placement capture times, placement state and satisfaction, placement eligible
node ids, the expected cohort, and the predicate result. A further lab run can
therefore classify the exact failed field without serializing the entire
control snapshot into the timeout line.

## Priority-placement diagnostic and owner correction

The diagnostic checkpoint `88457ed1038f6ca13336304b55840866ca875fd9`
selected the same seven exclusive files on tv-dator with the normal machine
lock, thermal gate and `jobs=1`. The first file again stopped in `formCluster`
before its transaction property. Its compact final observation established
that the enclosing and placement captures were identical, the placement was
available, and its eligible-node set exactly matched the three-node harness
cohort. The only false predicate input was `placementSatisfied=false`.

The node-log digest contained five `control_plane_replicas_not_spread`
observations and repeated seed reservation collisions. Those signals explain
why the topology-quiescence summary could remain unsatisfied; they do not make
that summary the mutation-admission authority. The remaining six files were
cancelled through the lab controller after this classification. The controller
released tv-dator's machine lock, and the preserved artifacts are
`test-output/placement/88457ed1038f-mujnwb6s-2734803-tv-dator.log` and
`test-output/placement/88457ed1038f-mujnwb6s-2734803-tv-dator.err`.

The owner trace showed that `currentPriorityPlacementObservation.satisfied`
is a conjunction of replica-spread and leader-coverage diagnostics. It is a
topology-quiescence observation, not the formation event that authorizes an
application-mutation attempt. The local control-snapshot builder directly
attaches the existing `publicationActiveGateHandoff`, the canonical handoff
from the topology-publication owner to the active-gate owner. In the preceding
raw lab evidence that handoff was complete for the exact expected cohort,
allowed runtime promotion, and named `admit_active_gate` as its next action
while the priority-placement summary remained blocked.

The formation precondition now consumes that direct handoff: state `complete`,
`runtimePromotionAllowed=true`, next action `admit_active_gate`, and an
`expectedNodeIds` set exactly equal to the harness cohort. The enclosing local
snapshot's `capturedAt` remains in compact timeout evidence; the handoff is
attached by that same local snapshot build rather than carrying a fabricated
independent capture time. CREATE and INSERT remain one-shot. CREATE still owns
the refreshed operation-specific provisioning and capacity decision, and a
denial is surfaced directly without a retry, sleep, or extended timeout.

## Exact-handoff preflight and settling-witness classification

The verifier-approved checkpoint
`7af1997428e1d3536413af3d6d0fe5f0f38ff474` ran the exact seven-file
exclusive cone on tv-dator at `jobs=1`, after the normal lock and thermal
checks. The repaired formation path reached the transaction properties:
`transaction-active-owns-connection` passed 33 assertions and the target
`transaction-concurrent-read-outage` witness passed five assertions. The
focused handoff regression passed 18 assertions. Six of seven files passed;
the sole red was the later replicated-apply settling witness.

That red occurred before the settling witness established its transaction
property. Its evidence recorded CREATE as `served:true` after 30619 ms with
no transport rejection. In the same interval the table-creation owner logged
`Initial table partition provisioning failed` because it timed out waiting for
a routable `settle_rows` partition service. Later routing observations showed
one and then two service rows, but no canonical leader. The transaction's
first INSERT then failed with `No leader available for write operation`.

This is a quest-evidence harness defect, not a transaction-apply result and
not lab infrastructure. A transient provisioning timeout becomes a fulfilled
durable schema-job result with `contractState=pending`, `nextAction=retry` and
an exact `jobId`. The quest's `serveStatement` helper classified any fulfilled
IPC query as readiness and discarded that owner contract. Both that helper
and the settling witness entered at `72d878ece`; its parent has no equivalent
witness and no production `src/` changed at that boundary. The settling file
itself is unchanged from `72d878ece` through `7af199742`. Earlier runs of that
same witness reached the property when CREATE converged quickly, which makes
the missing schema-lifecycle precondition timing-dependent.

The settling witness now submits CREATE exactly once and retains its canonical
schema-job contract. A ready/proceed result advances immediately. A
pending/retry result is followed only through read-only SELECTs of the exact
`schema_operations.job_id`; `SUCCEEDED` advances, `FAILED` fails directly, and
the existing CREATE/run deadline bounds a job that stays pending. No CREATE or
transaction retry, arbitrary sleep, enlarged timeout, production source
change, or weaker transaction assertion is introduced.

## Shared formation schema-lifecycle correction

The verifier-approved checkpoint
`31892a19140f64426f17b12bc18b224cef1a0912` selected the same seven-file
exclusive cone on tv-dator at `jobs=1`, with the normal machine lock and a
green thermal check (CPU 58 C, NVMe 47 C). The first file,
`transaction-active-owns-connection.integration.test.js`, failed during
`cluster.formCluster()` before its transaction property began: two assertions
ran in 100486 ms. The one-shot INSERT into
`embedded_harness_write_probe` was rejected because the table partition had no
leader after its initial provisioning failed to establish a routable cohort.
The CREATE had been fulfilled with a durable pending schema job, but the shared
formation harness still treated transport fulfillment as table readiness.

The remaining six files were cancelled through the lab controller after that
pre-property classification. The controller exited 130, its copied `.err`
records `Terminated`, and a subsequent normal fleet probe reported tv-dator
ready with its machine lock free. The preserved artifacts are
`test-output/placement/31892a19140f-mujpsuob-2819074-tv-dator.log` and its
adjacent `.err` and `.sh` files. The remote evidence named by the TAP output is
`/home/peter/projects/lagrange/test-output/transaction-replicated-apply/active-owns-connection-2026-09-27T11-07-57-423Z/active-owns-connection.json`.

The shared formation write probe now uses the same schema-lifecycle observer as
the settling witness. It submits CREATE exactly once; a ready/proceed contract
advances immediately, while a pending/retry contract is observed read-only by
its exact durable job id until `SUCCEEDED`. `FAILED` or the existing total
formation deadline prevents INSERT. Only after schema readiness does the probe
submit INSERT exactly once. The completed exact-cohort
`publicationActiveGateHandoff` remains the preceding formation precondition;
no retry, new sleep, larger budget, production change, or weaker transaction
assertion is introduced.

## Final corrected-branch preflight

After independent verification, exact head
`a486f6803d84fd3424a3b3d87950b95d94dfb106` ran the same seven-file exclusive
cone on tv-dator with `jobs=1`. The normal machine lock and thermal gate passed
at CPU 64 C and NVMe 44 C. All seven files passed on their first attempt with
no retries, for 130 assertions total:

| file | assertions | duration |
| --- | ---: | ---: |
| `transaction-active-owns-connection.integration.test.js` | 33 | 176980 ms |
| `transaction-concurrent-read-outage.integration.test.js` | 5 | 81511 ms |
| `transaction-embedded-cluster-harness-readiness.integration.test.js` | 35 | 482 ms |
| `transaction-replicated-apply-settling.integration.test.js` | 12 | 137187 ms |
| `exact-election-evidence-same-turn-model-contract.test.js` | 16 | 3135 ms |
| `local-leader-row-visibility-model-contract.test.js` | 26 | 3255 ms |
| `lagrange-server-npm-package.integration.test.js` | 3 | 21836 ms |

The copied placement artifacts are
`test-output/placement/a486f6803d84-mujqi96h-2870136-tv-dator.log`, its empty
adjacent `.err`, and its adjacent `.sh`. The consolidated results are in
`test-output/reports/test-results-tv-dator.ndjson`. A post-run fleet readback
reported tv-dator ready with its machine lock free. This closes the focused
preflight requirement, but the quest remains `SEALED / PUBLICATION_BLOCKED`
until the normal publisher succeeds and the remote branch SHA is independently
read back.

## Design verdict remains sealed

The liveness wording is corrected for future work: there is no configured
universal 350 ms workspace timeout. The relevant interval is from a follower's
last valid leader message to its randomized election deadline, and a workspace
is dangerous when it monopolizes the authoritative event-loop/tick path across
that interval. Future probes must measure workspace wall-clock cost and
authoritative-path interference separately.

That correction does not rescue full-image serialization. The STOP verdict is
still based on workspace preparation scaling with total partition bytes. Full
SQLite serialization, WAL-header normalization, anonymous-buffer open, and
Raft-table scrubbing remain measured evidence for a rejected mechanism, not a
production transaction workspace.

## Publication completion

Before the next normal push attempt, the corrected branch must have a green
isolated tv-dator run of the actual outage witness, its directly affected cone,
the focused regression, static checks and ratchets, with a clean worktree. The
quest remains `SEALED / PUBLICATION_BLOCKED` until the branch exists on origin
and the remote SHA is independently read back.
