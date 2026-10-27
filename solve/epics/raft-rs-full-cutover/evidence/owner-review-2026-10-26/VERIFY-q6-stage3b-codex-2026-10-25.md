# Independent Q6 stage 3b review

Verdict: **REVISE** for candidate `8104e974a10de6b88246593e6e0dfabc1ede569f`
(tree `94e2ba613c82e14b9dd9cd2fe3769aa2060c9a12`) against
`f0060ff36ee16b8eee479ef927d81978b8daabb1`.

Reviewer: `subagent:/root/q6_review`. The original interrupted tree and author
tree were not edited. Review trees are
`/mnt/data/peter/projects/.worktrees/codex-q6-review-20261025` and
`/mnt/data/peter/projects/.worktrees/codex-q6-review-base-20261025`.
Only two existing test files were extended in the reviewer candidate tree;
one identical extension was applied to the reviewer predecessor. No production
source, commit, push, seal, receipt or merge was changed. The candidate diff is
370 files, +4912/-3822. The manifest records exact candidate file bytes and all
retained reviewer artifacts.

Authority loaded: the supplied handoff and custody JSON, then live integration
AGENTS, rules and router (revision 2026-10-26), the approved Q6 design and stage
1-2 review, the new Quest, runtime contract, and applicable verification and
test owners. The new Quest is separate from retained-seed acceptance. The
full producer/consumer census was checked against source, not accepted from
the implementation summary.

## Required revisions

### R1. Forwarded START loses its confirmation obligation after an onward reply is lost

Severity: high; **measured candidate regression**. Violates runtime contract
`architecture/runtime-contracts.md:490` and Quest lost-answer preservation;
R02/R03/R08 require the forwarding representation to preserve the source
owner's obligation while keeping hop transport separate.

Reachable path:

1. `deliverProcessedSourceReplicationStart` asks a follower.
2. Production `forwardStartMergeReplicationToLeader` at
   `src/partition/partition-service-merge-replication-methods.js:210` forwards
   to its leader. Split uses the same conversion at
   `partition-service-source-replication-start-methods.js:64`.
3. The onward handler is engaged, its ACK arrives, and the onward connection
   closes while its answer is held. The inner router correctly returns a
   connection-closed outcome with no pre-send proof.
4. `forwardedDeliveryAnswer` (`src/transport/transport-semantic-outcome.js:275`)
   converts that to `{success:false, error, deferRetry, retryAfterMs,
   forwardedReasonCode}`. The outer transport correctly says delivered.
5. `requireProcessedSourceReplicationStart` stores only that outer transport
   on the thrown error (`managed-source-replication-start-delivery.js:45-58`).
   Its loss classifier at lines 16-24 cannot see the onward loss.
6. `sourceReplicationStartAnswerMayBeLost` is false. The actual workflow
   confirmation conditions at `managed-split-workflow.js:612` and
   `managed-merge-workflow.js:713` therefore skip `confirm*ReplicationStart`.

The two-case witness uses three real routers and real WebSockets, the actual
production merge-forward method and actual START delivery/loss owners. Its
onward handler is controlled: it increments an effect counter and holds the
answer. This proves handler engagement, ACK/answer custody and classification;
it does **not** prove native durable START admission. The full workflow branch
is source-traced, not executed. This ceiling is sufficient to establish the
conversion regression and is not a native acceptance claim.

Same host, same added test bytes, exact heads:

| Controlled onward condition | Predecessor | Candidate |
| --- | --- | --- |
| Socket already closed; handler never invoked | Loss=true (conservative pre-existing error) | Loss=false (correct) |
| Handler engaged; ACK received; reply lost on connection termination | Loss=true (correct) | Loss=false (**regression**) |

Both heads retire outer and onward waiters. The candidate's original direct
START loss cases still pass. See `review-forwarded-start-head.log`,
`review-forwarded-start-base.log`, and `review-start-witness.patch`. The
candidate fails the behavioral assertion, not setup/import/timeout.

Required direction: the START interaction owner must represent and consume
its own forwarded uncertain-START obligation. Keep each hop's transport
classification intact. Do not copy a later hop's `recoverableBeforeSend` into
a broader operation-wide no-effect claim, restore a flat reply, or make
generic transport infer application admission. Re-run paired pre-send/lost
reply cases for both START families and show the canonical confirmation path
engages after the loss.

### R2. The production QUERY/MG route still drops genuine same-request pre-send provenance

Severity: medium; **measured incomplete scoped contract**, conservative
uncertainty rather than unsafe clearing of a debt. Direct MessageRouter
pre-send provenance is fixed, but the required query transport path erases it.

`message-group-service-outbound-dispatch-runtime-methods.js:236-246` builds
its deferred record without `recoverableBeforeSend`; the thrown-deferred
record at lines 267-279 also omits it. `buildDeferredDeliveryError` at
`message-group-service-runtime-support.js:210-227` omits it again. The outer
query router's conversion at `message-router-delivery-pressure-routing.js:261`
therefore sees a connection-close failure without the original before-send
proof. `query-executor-unknown-outcome.js:171` correctly treats that as loss,
creating unnecessary OUTCOME_UNKNOWN debt for a query never sent.

`review-query-mg-witness.patch` extends the actual pre-send witness with a
real MessageRouter, actual `MessageGroupService.sendMessage` and query
resolver, and the actual query debt owner. The direct-only QUERY service is
marked initialized without opening Raft; `persistToRaftLog` throws if called.
Thus the fixture deliberately cannot hide admission through MG persistence.
The source socket is actually closed before `sendWithAck`; the remote handler
is never invoked. Both the pre-send flag assertion and debt assertion fail.

Its paired case uses real handler engagement, ACK and socket termination;
that case correctly remains unknown. An explicit earlier admitted-attempt
debt is never cleared by a later observation. Both router and MG pending
state settle to zero in both cases. Evidence: `review-query-mg-head.log`.
This is not presented as a new predecessor regression: the candidate's new
contract and claimed producer repair remain incomplete on the required path.

Required direction: preserve the proven same-request fact through the
direct-only QUERY representation. Keep the distinction from durable MG
delivery or a forwarder that may already have admitted other work. Add
paired actual-before-send and after-engagement loss coverage, then prove a
finite-failure recovery retains the same write entry identity.

### R3. Redundant transport-era ACK answer fields remain in the declared producer migration

Severity: cleanup/contract, **source-derived**. The public transport outcome
has no acknowledged alias, and no old plain-object transport classifier was
found. Nevertheless, redundant handler answers still publish the old ACK
field, contrary to design section 2.3's deletion directions and the user's
one-version/no-legacy instruction:

| Producer | Source evidence | Current consumer |
| --- | --- | --- |
| SWIM ping/ping-req answers | `membership-swim-prober.js:59,77,80` | Migrated consumers read delivered transport plus alive/reachable. |
| Direct dispatch success | `replica-dispatch-service-lifecycle.js:308` | Migrated wake consumer uses transport and success refusal. |
| Learner proof answer | `partition-service-learner-promotion-proof-methods.js:74` | Migrated consumer uses transport and partition/replica/proof identity. |
| MG Raft and duplicate ingress | `message-group-service-inbound-ingress-runtime-methods.js:124,156` | Raft uses transport; duplicate application result has its named status. |
| WASM Raft answer | `wasm-service-replica.js:367` | Raft peer owner reads transport. |
| Remote QUERY answers and participant answer wrappers | `partition-service-remote-query-methods.js:53,57,88,109,182,230,242`; `partition-participant-transaction-request.js:629,664,667,671` | Query/participant consumers migrated to transport plus typed answer identity. |

Delete demonstrably redundant aliases and stale assertions/docs through the
existing answer owners. Do not introduce a compatibility bridge. This is not
a blanket request to delete every field named acknowledged: source START's
authorization handle, split/merge mirror ACK, coordinator settlement and CDC
ledger group collections have distinct live domain readers and require their
own contract judgment. Internal ACK frames and builder inputs are legitimate.
The retained raw census records those distinctions. No additional broad
architecture redesign is requested.

## Confirmed behavior and census

The frozen candidate's unmodified witnesses passed **18 files / 400 runner
assertions**: 8/234 in `review-focused.log`, 10/166 in
`review-owner-union.log`. These cover owner branding, no-public-ACK,
full-field rewrite, literal local answer identity, remote serialization
failure, per-hop forwarding, direct lost-write/query classification,
callback retirement, retired partition Raft refusal, CDC roundtrip/failed
sets, Raft peer failure, supersession, direct wakeup, participant protocol,
learner proof, replacement witnesses and service dispatch.

The source census includes every `.deliver` call in src and every old
classifier/normalizer/unregister/acknowledged occurrence, plus direct
`.answer`/`.transport` reads. Relevant families are service/admin/bootstrap,
query/participant, Raft, CDC/MG/topology, partition START/write/membership,
control-plane wake/SWIM, and rebalancer. Remaining direct answer fields
include other owners' native-forwarding and service-dispatch records; they
are not assumed to be router envelopes. `deliveryReadingOf` selects one
namespace through owner accessors and never merges the two. No production
flat decoder, compatibility branch for cloned envelopes, public transport
acknowledged alias, inline ACK payload route, or address-only unregister
remains in the inspected surface. R3 describes answer-side dead fields,
not a claim that transport branding is bypassed.

Callback review confirms the three node singleton handlers retain the
callback/router on refused retirement, reject wrong-router retirement,
retire their previous registration before replacement, and preserve another
owner's successor callback. The shared retirement owner and router exact
comparison are synchronous, with replica lifecycle retirement running
through its existing lane. The partition dispatch refusal is measured with
the lifecycle retirement window held open. No new durable CAS or timer
owner was introduced.

## Applicable checklist dispositions

PASS below means the bounded cited claim was checked; it is not overall
approval. SOURCE means source inspection without the stronger execution
claim. FAIL identifies a required revision. N/A names an unchanged or absent
mechanism rather than silently omitting it.

| Transport/delivery item | Disposition and evidence/invariant |
| --- | --- |
| 1 ACK is not processed | PASS: owner state, peer/CDC/direct wake witnesses; no-handler is failed and no answer. |
| 2 Late responses | SOURCE: pending-response ledger retires by original pending identity; no late-response policy changed. Supersession completion measured. Full late native recovery not claimed. |
| 3 Outcome classification | PASS with R1/R2 boundary failures: owner unit/rewrite matrices; transport failures and domain deferrals remain separate. |
| 4 Undeliverable bound | PASS: real pre-send and lost-answer probes settle; zero retained response waiters; canonical no-handler and shutdown owner paths inspected. |
| 5 Stub fidelity | PASS: delivery doubles use owner builder; independent probes use real router/ACK/wire. Controlled target effect explicitly bounded in evidence ceiling. |
| 6 Effect/obligation continuity | FAIL R1; FAIL R2's distinct pre-send fact. Query direct same-entry matrix passes; forwarding START recovery is not preserved. |

| Concurrency/serialization item | Disposition and evidence/invariant |
| --- | --- |
| 1 Actual serialization boundary | PASS SOURCE: exact handler map comparison is synchronous; replica retirement still delegates to the lifecycle lane. No new durable claim implementation. |
| 2 Check/await/use | PASS for changed custody: singleton retire completes before replacing references; refused retirement keeps references. Partition dispatch checks exact current registration before synchronous step invocation; membership recipient revalidates captured callback after awaits. |
| 3 Single-winner claims | N/A new mechanism: no durable CAS or multi-driver claim was changed. Existing workflow owners remain authoritative. |
| 4 Timer reentrancy | SOURCE: no new timer; existing lifetime/queue retirement owns timers. Measured lost-response and supersession waiters settle. |
| 5 Lock scope | N/A new lock: handler identity key is exact address+callback; existing replica lane scope retained. |
| 6 Custody through uncertainty | PASS handler custody witnesses; FAIL R1 effect confirmation continuity. No whole-service eventual recovery claim. |

| Retry item | Disposition and evidence/invariant |
| --- | --- |
| 1 Must-fire retry | FAIL R1: the condition guarding the only immediate START confirmation loses its signal. Existing retry timers otherwise unchanged. |
| 2 Frozen evidence bound | SOURCE: query caller budget and existing redelivery max delay retained; no new frozen-row loop. |
| 3 Observable stops | PASS scoped: no-handler/failure/deferral and supersession remain named; R1 is lost semantic information, not an omitted outer error. |
| 4 Mutual suppression | No new mutual suppression found; SOURCE: query/MG direct-only retains one inner attempt. R1 suppresses confirmation and must be repaired. |
| 5 Storm ceiling | SOURCE: MG maxAttempts and QUERY direct-only maxAttempts=1 unchanged; query exponential redelivery cap remains 2000 ms. R2 adds unnecessary uncertainty rather than a new loop. |
| 6 Duplicate effects | PASS bounded identity: query lost-write matrix keeps original entryId; forwarding source identities are carried unchanged. Native duplicate-effect proof is outside these deterministic probes. |
| 7 Reset semantics | PASS SOURCE: MG counts transport delivery, domain completion remains caller-owned; failed direct wake does not schedule successful verification. R3 removes dead aliases, not another reset predicate. |
| 8 Recovery after finite failure | NOT PROVED for complete package; R1 blocks immediate canonical confirmation. Existing direct query same-entry continuity measured; full lab incomplete. |

| Owner interaction item | Disposition and evidence/invariant |
| --- | --- |
| 1 One question owner | PASS transport: transport-semantic-outcome; domain CDC, query, START and replica-operation owners remain distinct. |
| 2 Typed seam | FAIL R1/R2 preservation; PASS namespace isolation/brands. R3 is residual dead answer metadata. |
| 3 Paired invariant | FAIL R1 real pre-send versus reply-loss matrix, exact-base comparison; R2 real query/MG pre-send versus reply loss. |
| 4 Stale then fresh | PASS handler replacement/refused retirement retry tests; SOURCE query obligation is monotonic until settled. No fabricated stale-debt clearing allowed. |
| 5 Pressure/backoff | PASS failed-set/forwarding witnesses and source: existing pressure owner and retryAfter policy consumed. No bypass added. |
| 6 Wake/release path | FAIL R1 confirmation path; PASS direct wake refusal, callback retirement and supersession checks. |
| 7 Projection authority | PASS SOURCE: no new cached/native state authority; envelope is hop evidence, CDC owner still validates canonical receipt vectors. |
| 8 Negative fidelity | PASS: exact predecessor and candidate, identical test extension, actual onward handler+ACK reached; failures are behavioral. |
| 9 No escape hatch | PASS flat decoder/aliases at transport; FAIL R3 dead ACK answers. No envelope re-merge found. |
| 10 Contract/registry/proof | PASS registry names changed consumer families and live tests; FAIL completeness: direct witness omitted forwarded START and real MG query path. Add these at the named existing interaction. |

| Harness fidelity item | Disposition and evidence/invariant |
| --- | --- |
| 1 Correct red cause | PASS R1/R2 logs show target engagement assertions and precise obligation/flag assertions, not setup failure. |
| 2 Binding seam honesty | PASS real router, ACK, wire and source START/merge forwarding/MG-query owners. Target effect controlled; native persistence absent. |
| 3 Time fidelity | PASS probes wait for handler/ACK/waiter state before terminating; no product timeout inflation. Bounded fixture polling inherited. |
| 4 Field fidelity | PASS original owner envelopes and actual router records; no fabricated transport outcome in independent probes. |
| 5 Non-vacuous | PASS both cases assert actual target invocation count and zero retired waiters; direct-only persistence throws if reached. |
| 6 Entry and owner | PASS actual router.deliver plus actual MG sendMessage and START forwarding/loss owner; workflow confirmation only source-traced. |
| 7 Evidence ceiling | Deterministic local real network on one host, controlled effect handler and MG readiness; no physical or native admission claim. |
| 8 Failure/progress | Product boundary failures retained; finite-fault whole-operation progress not proved. Full corpus custody gap is separately execution-unavailable/incomplete. |

| Adversarial JS input item | Disposition and evidence/invariant |
| --- | --- |
| 1 Numeric edges | N/A public accessor numeric input: unbranded values are rejected without inspecting fields. Internal builder raw metadata preservation is approved C2, not a hostile numeric validator. |
| 2 Own properties | PASS branded frozen envelope only; inherited envelope lookalikes cannot acquire brand. |
| 3 Accessor traps | PASS unreadable Proxy and verbatim answer witnesses; local answer getters are not read by router. |
| 4 Prototype pollution | SOURCE: private WeakSet membership, fixed frozen envelope fields; no enumerable traversal in accessors. Global intrinsic replacement was not executed or claimed. |
| 5 Exotic primitives | PASS SOURCE: WeakSet membership refuses unowned primitive/boxed values; no duck-type acceptance path. |
| 6 Mutable intrinsics | Not a claimed global-runtime-tampering proof. Accessors use WeakSet methods; tests establish hostile supplied-value handling, not immunity to replaced platform methods. |
| 7 Serialization coercion | PASS separation: local preserves reference, remote existing wire owner owns serialization failure. No second local JSON encoding added. |
| 8 Array authenticity | N/A envelope accessors: arrays have no brand. Answer arrays are opaque local values; CDC strict array validation remains with CDC. |

## Broad proof, historical evidence and integration

The canonical 2148-file all-lane split run is **incomplete, under root custody
reconciliation**. It targeted exact 8104 with exact f006 base and retry 0.
At the last root report controller PID 2715321 was gone and exec session
36345 had vanished; five exact-SHA SSH workers were still live under PPID
3332. No terminal aggregate result exists. Root will collect those existing
jobs through the owner path without resubmission. See original
`/tmp/codex-rs-raft-20261025/q6-preservation/root-handoff.json` for per-host
placement IDs and `lab-full.log` for the partial stream. The partial stream
contains failures and cannot establish full-corpus success or regression
classification. This reviewer did not consume hosts or duplicate that run.

Author-reported unchanged whole-complexity count (1766 on each head versus
1755 baseline), two direct-wakeup leaves and 21 CDC nonleader leaves are
retained historical/context evidence. This reviewer did not independently
rerun those same-host comparisons and does not relabel them green. The root
owns their complete disposition and the ongoing corpus collection.

History inspected includes 7bf6ceecb, 013979c41 and abcafb95a: ownership of
metadata, lost-answer/handler-throw classification and named supersession
must be preserved, not locally undone to restore a convenient result.
Primary research was independently read: [RabbitMQ confirms](https://www.rabbitmq.com/docs/confirms)
separates acknowledgement scopes; [gRPC status codes](https://grpc.io/docs/guides/status-codes/)
notes deadline expiry may occur after a state-changing operation completed.
These support the attack choice; local owner contracts define the verdict.

SQL admission composition still intersects
`query-executor-partition-request-builders.js`. This isolated review proves
neither composed source nor its gates. Preserve SQL admission fields and
Q6's owner accessor predicate, then review/test the composed exact source.
No retained-seed, release, Quest landing, publication or merge approval is
granted by this report.
