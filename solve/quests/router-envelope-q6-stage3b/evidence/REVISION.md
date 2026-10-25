# Q6 independent REVISE repair candidate

Status: author WIP only. Independent delta verification, composed-source gates and
acceptance remain outstanding. The original broad retained-seed seal and all five
acceptance receipts remain unchanged/red. No lab was submitted by this repair.

## Review and scope

This repairs R1, R2 and R3 of `/tmp/codex-rs-raft-20261025/q6-review/REVIEW.md`,
SHA256 `ac760c930455d43dde8e1a71154a28c352f41d9bc0c6ba4beab800c1ae444a89`,
against frozen `8104e974a10de6b88246593e6e0dfabc1ede569f`. All checklist
and adversarial-JavaScript dispositions were read. The reviewer witness patches
were first applied unchanged: `q6-revision/reviewer-red.log` records engaged red
for forwarded START and actual QUERY/MG pre-send provenance before these repairs.
The existing green tests did not disprove the review findings.

## R1: START owns uncertainty, each router owns only its hop

Both split and merge forwarding now use the source START delivery owner. A lost
onward answer becomes the one domain fact `sourceStartOutcome:
source_start_answer_unknown`. The outer envelope still reports that its own hop
delivered the forwarding answer. No onward transport fields are copied outward.
The direct START reader and forwarded answer reader use the same loss classifier.
Both managed workflows use one shared continuation decision, retaining their
existing retry policy and durable confirmation methods. The old string matching
for pending-response timeout is deleted; its actual producer now emits the
existing router timeout code.

The three-router split/merge matrix engages the production forwarding methods,
real WebSocket ACK/response waiters, actual retry policy and shared managed
continuation. Its paired pre-send/lost-answer cases assert handler engagement,
confirmation count, outer-hop delivered state, absence of transitive pre-send
claims and waiter retirement. Confirmation itself is controlled in this network
matrix; it does not claim native START authorization. The separate existing
115-assertion split restart/attempt suite exercises the durable workflow owner.
The network matrix and durable suite are complementary, not one end-to-end native
acceptance claim.

## R2: same direct-only request provenance

MG `attemptDirectDelivery` now returns the canonical envelope directly. Its
redundant `{delivered, attempt, error, ...}` record and deferred-only error builder
are deleted. The sole direct-only API error boundary preserves the router code,
reason, no-handler, retry and recoverable-before-send discriminators. This lane
performs exactly one attempt and no parallel Raft admission. Durable MG retains
its own pending/admission behavior and does not expose that pre-send assertion as
proof that a durable operation was unsubmitted.

Actual QueryExecutor -> MG direct-only -> MessageRouter probes distinguish a
closed socket before send from connection loss after target engagement. Earlier
unknown-write debt remains monotonic. A finite after-ACK failure then reconnects
the real WebSocket route and settles under the same entryId; both actual handler
invocations see that identity and pending MG/router custody clears. The target
answer is controlled: this proves transport/QUERY custody and identity, not native
Raft exactly-once application.

## R3: one answer contract, no ACK aliases

Removed obsolete answer ACK fields and their consumers/fixtures from SWIM,
direct-dispatch wakeups, learner proof, MG Raft ingress/duplicate answers, WASM
Raft ingress, remote QUERY, participant request wrappers, entry apply, START
admission and coordinator settlement. START now reads its existing `success`
answer after the same authorized-handle/run-promise checks; settlement retains
its committed flag, typed result and admissible settlement states. No authority
was replaced by transport success. The admin local dispatcher now returns the
same `{answer:{payload}}` record as the real ServiceDispatcher.

The source ACK census is in `q6-revision/final-source-ack-census.txt`. Remaining
ACK names have separate owners: internal router frame/builder observations;
CDC_DELIVERED acknowledged group collections; invariant-engine recorded phase
acknowledgements; write-path telemetry; and the private service creation-intent
write-callback diagnostic, whose comment explicitly denies persisted-state
proof. That callback is followed by the authoritative journal read. These are
not router handler-answer aliases. Opaque/adversarial handler answers in the
isolation tests intentionally retain spoofed fields to prove they cannot affect
transport. Internal router-step tests retain raw ACK inputs where those inputs
are the actual contract.

A structured AST census classified answer-shaped ACK fixtures and migrated their
producer seams, including callbacks and arrays that the initial mechanical pass
missed. Real handler results in fake router seams are now explicitly wrapped by
the owner builder; no consumer accepts both shapes. Stale websocket tests now
assert verbatim domain `type` and failure after ACK when the answer is lost.
CDC diagnostics require delivered transport before classifying handler rejection;
a missing handler cannot author an answer or count as successful delivery.

## Retention follow-up, deliberately separate

`acknowledgedMessages` is MG deduplication authority: ingress checks it, completion
and Raft application add message IDs, and status reports its size. Current source
has no retirement path. Successful control completions, including recurring
rejoin/heartbeat identities, therefore grow it over a long-lived process. This
is inherited retention debt, not an obsolete envelope ACK field. Preserve it and
track a representative endurance/retention measurement with that owner; do not
invent a TTL or delete deduplication authority in Q6. No endurance acceptance is
claimed here.

## History, research and composition

The earlier implementation evidence records 7bf6ceecb, 013979c41 and abcafb95a,
plus the RabbitMQ confirm-scope and gRPC deadline primary sources. This revision
uses those same lessons at the actual owner paths: hop delivery cannot settle a
forwarded operation, and a lost reply cannot prove no effect. Removing duplicate
records and ACK predicates addresses the systemic cause rather than adding a
compatibility decoder. History of START, MG state and Raft timing was rechecked;
the retention authority predates this Q6 change.

Composition with SQL-admission `8fee98abe` now has TWO explicit intersections:
`query-executor-partition-request-builders.js` retains Q6 answer predicates plus
SQL policy fields; `admin-websocket-api-base.js` retains SQL admission changes
plus the new local ServiceDispatcher `answer` record. Parent owns composition;
no SQL branch was taken here. Activation source remains outside this candidate.

## Proof status

External evidence directory: `/tmp/codex-rs-raft-20261025/q6-revision`.
The final 10-file envelope/owner run passes 360 assertions, including per-hop
START assertions, finite same-entry recovery, verbatim answers, full field
rewrite matrix, no public ACK, handler throw symmetry and durable split restart.
The expanded 40-file local run has 35 pass and five fail; all five remaining
failure files reproduce at exact f006 on the same controller. The comparison is
bounded local evidence, not a replacement for locked-lab regression attribution.
Those failures are MG live-leader address resolution (three files) and native
partition/write setup/admission (two files). The current write-pacing file has
fewer failing leaves after its fake router migration; the remaining independent
submission failure is not relabeled green. See `base-comparison.log` and
`focused-final.log` for exact identities and all passing assertions.

Parent reconciled the ORIGINAL exact-8104 full run: 2147 remote files reported
1985 pass/162 fail plus the controller-reserved formation file failed, total
2148 with 1985 pass/163 fail. Controller terminal status was unavailable. All
five workers completed and locks are free. This is historical candidate evidence,
not proof of the repaired source; raw manifests and failure identities remain
under `q6-preservation`. No run was retried or reduced to a greener selection.

Normal-hook WIP commit and final static results are recorded in the external
freeze handoff. No source acceptance, Quest land, publication or merge is claimed.
