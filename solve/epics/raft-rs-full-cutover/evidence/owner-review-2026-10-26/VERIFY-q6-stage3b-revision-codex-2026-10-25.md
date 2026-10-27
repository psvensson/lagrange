# Independent Q6 revision review

Verdict: **APPROVE the bounded source correction** at
`ba3fb3bdf771132c6913de401d2bf90071ec28b9`, against rejected
`8104e974a10de6b88246593e6e0dfabc1ede569f`. R1, R2 and R3 of the prior
independent review are addressed. No additional blocking source defect was
established in this delta. This is not full-corpus, Quest landing, retained-seed,
publication, merge or release acceptance.

Reviewer: `subagent:/root/q6_review`. Candidate tree:
`e79563f82b52d08c2292e2f2f8f5a94acf5639d0`; source tree:
`fd2f3708edab7526bd3f668f1de7dd223c258b3c`; test tree:
`50929e58e5f191a399e57b800fb09f36d0b4e175`.
The independently regenerated 105-path revision patch hashes to
`c69ce2216f82f7388acb0e4af39a6a71bec1f529f1e95e362dc76dc55e2a6b83`.
All 105 committed file hashes match the author manifest and author worktree;
the author tree remains clean. `source-validation.json` records the check.

Review ran in detached, isolated
`/mnt/data/peter/projects/.worktrees/codex-q6-delta-review-20261025`.
Only one existing test file was extended there for an independent error-route
probe. No production bytes, author work, original interrupted work, commit,
push, seal or receipt were changed. Parent retains integration authority.

The prior report `/tmp/codex-rs-raft-20261025/q6-review/REVIEW.md` and its
manifest remain the record for the original complete producer/consumer,
callback-custody, history and primary-research review. This delta reuses those
unaffected findings while rechecking the changed owner interactions and test
seams. The supplied freeze, source manifest and repository REVISION.md were
read before the delta. The approved design and its Q3 error-recovery rule,
Quest, previously loaded AGENTS/rules/router and applicable checklists remain
the authority. External RabbitMQ/gRPC examples are inspiration, not contracts.

## R1: source-owned START uncertainty restored

`managed-source-replication-start-delivery.js:14,42,84,98` now provides the
single START loss classifier, forward-answer representation and continuation
decision. Split and merge call that owner. An onward lost reply produces the
domain fact `sourceStartOutcome: source_start_answer_unknown`; it does not
copy inner transport fields into the outer transport. Both managed workflows
keep their existing retry policy and durable confirmation callbacks. The
pending-response budget producer now emits the existing timeout code, so the
START reader no longer relies on matching timeout prose.

The frozen real three-router/WebSocket witness was independently rerun:

| Assertion family, for both split and merge | Result |
| --- | --- |
| Actual closed socket before onward send | Handler count 0; no source uncertainty marker; no confirmation; no continuation. PASS. |
| Actual onward handler engagement, ACK received, answer held then connection terminated | Handler count 1; source uncertainty marker present; canonical continuation invokes confirmation once and continues after its controlled true answer. PASS. |
| Hop authority | Outer transport remains DELIVERED; it never acquires onward `recoverableBeforeSend`. PASS. |
| Response custody | Outer and onward pending waiters retire. PASS. |

**Evidence ceiling:** this matrix proves handler engagement, wire/ACK/response
custody and the actual shared continuation/retry condition. Its effect counter
and confirmation result are controlled. It does not prove native durable
START authorization. The separately rerun 115-assertion restart/attempt suite
exercises the durable workflow owner; these two suites are complementary, not
one end-to-end native START acceptance proof.

## R2: direct-only QUERY provenance and error state preserved

`message-group-service-outbound-dispatch-runtime-methods.js:193-258,325-340`
now carries the canonical envelope throughout the direct attempt. The old
MG-specific `{delivered, attempt, error, ...}` representation is deleted.
`message-group-service-runtime-support.js:214` is the one direct-only Error
boundary; it carries state, code, reason, no-handler, retry and pre-send facts.
`transport-semantic-outcome.js:294` reads an Error's own metadata through the
existing canonical builder. It never obtains an ACK from an Error.

The durable MG path retains parallel durable-admission/pending behavior and
does not expose a failed direct attempt's pre-send fact as proof that the
durable operation was unsubmitted. QUERY remains exactly one direct attempt
per MG invocation, with no MG Raft admission.

| Assertion family | Result and ceiling |
| --- | --- |
| Real QUERY router -> actual MG direct-only -> actual closed socket | Target never engaged; `recoverableBeforeSend=true`; actual query debt owner does not invent unknown-write debt. PASS. |
| Same path, handler engaged and ACK received before answer loss | `recoverableBeforeSend=false`; unknown-write debt retained. PASS. |
| Earlier unknown/admitted-attempt debt followed by either later observation | Earlier debt remains unknown in both cases. PASS; no unsafe debt clearing. |
| Finite reply loss and reconnect through actual QueryExecutor | Both actual handler invocations carry `original-write-entry`; controlled settled-replay answer reaches caller; MG/router custody clears. PASS. Native exactly-once application is not proved by this target double. |
| Actual MG error boundary, FAILED plus retry hints | FAILED remains FAILED with the owner's discriminators. PASS. |
| Actual MG no-handler and deferral cases | Owner classifications retained. PASS. |
| Thrown Error claiming DELIVERED | Canonical conversion fails closed; no success/ACK is invented. PASS. |

An additional reviewer probe combined explicit FAILED, connection-closed code
and retry hints, then crossed actual MG and the outer QUERY router. MG retained
FAILED; the outer recovery owner returned DEFERRED/connection_closed while
preserving `recoverableBeforeSend=false` and zero MG custody. My first probe
incorrectly required FAILED to survive that further recovery step. Its red log
and patch are retained as `query-state-attack.log` and
`query-state-overstrict-expectation.patch`. Approved design Q3 explicitly routes
FAILED through `resolveRecoverableDeliveryError`/rethrow. No ordinary production
producer of this contradictory input was found. The corrected contract probe
passes in `alias-custody-focused.log` and independently checks both the MG
preservation boundary and the permitted outer recovery. This is not a source
regression finding, a native-admission claim or an unreported failed check.

## R3: obsolete answer ACK aliases and fixture branches removed

The changed producers no longer emit transport-era ACK aliases: SWIM,
direct-dispatch wake, learner proof, MG Raft/duplicate ingress, WASM Raft,
remote QUERY, participant answer wrappers, entry apply, START and coordinator
settlement. Their consumers use the appropriate domain answer. START's
`success` check still requires the authorized/current handle, run promise,
leader role and non-shutdown state. Settlement still requires committed=true
and a canonical APPLIED/REPLAYED/ALREADY_RECORDED result; transport success
does not replace those facts.

The admin local dispatcher now returns `answer: {payload}`, matching the
ServiceDispatcher record. The CDC diagnostic path requires delivered
transport before calling a result successful or a refusal handler-authored.
Changed fixtures were inspected for no-op answers, fake-router return seams,
callbacks and collections. Actual router doubles use the owner builder;
domain handlers return only their domain answer/null. The CDC topology
fixture's flat answer compatibility branch is deleted. No new dual decoder,
public acknowledged alias, address-only retirement, or compatibility bridge
was found in this delta.

Remaining source ACK names were classified by owner: internal transport
frame/builder observations, CDC acknowledged group collections, recorded
workflow/invariant history, write telemetry, and the private creation-intent
write-callback diagnostic followed by the authoritative journal read. The
MG `acknowledgedMessages` dedup set is not an obsolete answer field. Its
unbounded long-lived retention is inherited owner debt; Q6 does not invent
retirement authority or claim endurance acceptance. Adversarial answer
fields remain intentionally in isolation tests.

## Native handler-gate fidelity

The repaired gate at
`test/partition/participant-release-native-application-order.test.js:256`
now couples the service's current transportHandler with the exact registered
wrapper. It records custody before mutation, retires the exact original, and
restores only its own exact wrapper or a vacancy caused by its retirement.
It refuses a successor callback. Installation errors traverse that same
restoration path and retain aggregate restoration failures. Production
callback identity policy was not changed or weakened.

The native application-order test independently passes at ba3. Its carrier,
commit and native application assertions are unchanged by the fixture repair;
the extra failure diagnostic does not create a success route. Source review
covers installation-failure cleanup branches; not every injected restoration
failure was dynamically executed. Separate exact-handler, replica retirement,
activation-boundary and seed cleanup custody suites also pass on this source.

## Independent execution and failure classification

All runs used the canonical classified runner with `LAGRANGE_PLACEMENT=local`.
No broad corpus or lab job was submitted. Thermal admission was honored.

| Run | Result |
| --- | --- |
| Frozen correction/interaction witnesses, `focused.log` | 15 files, 15 pass, 0 fail, 555 runner assertions. |
| ACK/custody/consumer follow-up, `alias-custody-focused.log` | 10 files, 9 pass, 1 inherited failure file, 316 runner assertions. Includes the corrected reviewer error-route probe. |
| Initial overstrict reviewer experiment, `query-state-attack.log` | One deliberately retained failing expectation; classified above against approved Q3, then corrected. Not counted as passing source evidence. |

The follow-up failure is the single leaf `Unable to resolve unified peer
address for mg-1-r2` in `MessageGroupService - buildPeerAddress prefers the
consensus configuration peer address before bootstrap hints`. Its file has
74 passing and one failing leaf assertion (88 runner assertions including
containers). All changed CDC answer/diagnostic assertions in that file pass.
The failure identity, source line 91 and semantic cause match the author's
exact-f006 same-controller `base-comparison.log` and `failure-comparison.json`.
The peer-resolution owner is byte-identical from f006 to ba3. This is reused
bounded predecessor evidence, not a fresh independent baseline run or a
locked-lab regression attribution. The file remains red.

The author's other seven local failure files remain holds, not new independent
passes: two further MG live-leader-routing files; partition-write answer and
write-pacing native setup/admission; CDC currentness route counts;
seed-infrastructure's missing assertOriginalSeedAttempt delegate; and the
foreground-boundary runner refusal for a nonliteral timeout constant (zero
assertions executed). Raw base/final logs and failure comparison are retained.

## Applicable checklist delta dispositions

These are item-by-item updates to the full prior report's checklists. PASS is
bounded by the evidence above; SOURCE is inspection, and N/A means no new
mechanism. Earlier unchanged limitations remain literal.

| Checklist/item | Delta disposition |
| --- | --- |
| Transport 1 ACK vs processed | PASS: no-handler, lost-answer and aliases remain distinct from handler/domain completion. |
| Transport 2 late response | PASS/SOURCE: paired loss waiters retire; no new late-native policy; original ledger identity review reused. |
| Transport 3 classification | PASS: MG state/error matrix and handler-throw/field-isolation suites; Q3 outer recovery distinction recorded. |
| Transport 4 undeliverable bound | PASS: real pre-send and loss cases settle with no pending custody. |
| Transport 5 stub fidelity | PASS: real routers/MG/QueryExecutor, explicit controlled target/confirmation ceilings. |
| Transport 6 effect/obligation | PASS repair: R1 source uncertainty and R2 monotonic debt now survive their seams. |
| Concurrency 1 serialization | SOURCE: exact synchronous callback comparison and existing lifecycle lane unchanged. |
| Concurrency 2 check/await/use | PASS/SOURCE: coupled native gate identity, exact restoration; production currentness guards unchanged. |
| Concurrency 3 single winner | N/A new durable claim; existing owners retained. |
| Concurrency 4 timer reentrancy | PASS/SOURCE: no new timer; loss/custody tests clear existing waiters. |
| Concurrency 5 lock scope | N/A new lock; exact address+callback ownership retained. |
| Concurrency 6 uncertain custody | PASS bounded: START confirmation signal and failed-retirement suites; no whole-service recovery claim. |
| Retry 1 must fire | PASS: actual shared START continuation invokes confirmation after loss. |
| Retry 2 frozen evidence bound | SOURCE: existing request budgets/backoff unchanged. |
| Retry 3 observable stops | PASS: named failure/deferral/source uncertainty; no silent fallback. |
| Retry 4 mutual suppression | PASS/SOURCE: direct-only one attempt, no duplicate START decision; repaired confirmation no longer suppressed. |
| Retry 5 storm ceiling | SOURCE: maxAttempts and QUERY one-attempt rule retained; no new retry scheduler. |
| Retry 6 duplicate effects | PASS identity only: same entryId across actual reconnect; native exactly-once ceiling explicit. |
| Retry 7 reset semantics | PASS/SOURCE: domain START/settlement guards remain; transport cannot reset domain authority. |
| Retry 8 finite recovery | PASS bounded QUERY reconnect and START confirmation; complete deployed recovery not claimed. |
| Owner 1 one question owner | PASS: canonical transport conversion and shared START domain obligation owner. |
| Owner 2 typed seam | PASS: old MG flat record removed; START carries only its domain marker. |
| Owner 3 paired invariant | PASS: split+merge and QUERY before-send/after-engagement pairs. |
| Owner 4 stale/fresh | PASS: monotonic prior debt; exact callback replacement/retirement suites. |
| Owner 5 pressure/backoff | PASS/SOURCE: existing deferral hints retained; no bypass. |
| Owner 6 wake/release | PASS: confirmation, direct wake, native fixture and custody checks. |
| Owner 7 projection authority | SOURCE: no new cache/native authority; actual durable confirmation remains required. |
| Owner 8 negative fidelity | PASS: actual engagement and fail-if-MG-persist; original R1/base discriminator reused. |
| Owner 9 escape hatch | PASS: R3 producers/fixtures migrated; no old-shape compatibility reader added. |
| Owner 10 contract/proof | PASS bounded: original missing interaction witnesses now included; full-corpus gate remains open. |
| Harness 1 red cause | PASS: original R1/R2 behavioral failures addressed; inherited leaf and overstrict probe separately classified. |
| Harness 2 binding seam | PASS: native fixture repaired to honor exact service/router identity. |
| Harness 3 time | PASS: wait for real ACK/handler state; canonical thermal/runner guards honored. |
| Harness 4 fields | PASS: original owner envelopes; synthetic error experiment explicitly marked. |
| Harness 5 nonvacuity | PASS: engagement counters, actual QUERY entry IDs, custody-zero and fail-on-persist checks. |
| Harness 6 entry/owner | PASS: actual forwarding methods/shared continuation and MG/QueryExecutor; controlled confirmation ceiling. |
| Harness 7 ceiling | Local network/owner proof; separate native participant-release witness; no native START or deployed certification claim. |
| Harness 8 failure/progress | PASS bounded finite fault; inherited red and missing current corpus remain explicit. |
| Adversarial JS 1 numeric | Unchanged/N/A accessor input; owner metadata contract retained. |
| Adversarial JS 2 own fields | PASS: Error's own metadata enters canonical builder; thrown ACK is never read. |
| Adversarial JS 3 accessors | PASS rerun: verbatim answer/unreadable answer witnesses; local reference semantics retained. |
| Adversarial JS 4 prototype | SOURCE unchanged: branded frozen envelope; no new structural acceptance. |
| Adversarial JS 5 primitives | SOURCE unchanged: unbranded values fail closed. |
| Adversarial JS 6 intrinsics | No global-runtime-tampering claim, unchanged limitation. |
| Adversarial JS 7 serialization | PASS rerun: existing remote wire owner, no local JSON normalization. |
| Adversarial JS 8 arrays | Unchanged: opaque answers; unbranded envelope arrays rejected, domain validation stays domain-owned. |

## Outstanding integration and acceptance gates

The old 8104 all-lane job was reconciled by parent as 2148 files, 1985 pass,
163 fail, with no aggregate controller exit. It is historical evidence and
cannot certify ba3. No repaired-SHA full corpus/lab proof exists in this review.
The inherited whole-complexity result remains 1765 against baseline 1755
(prior 1766); no baseline was raised. Author static/normal-hook and registry
results are retained as author evidence, not rerun or relabeled here.

Root must compose the two SQL-admission intersections explicitly:
`query-executor-partition-request-builders.js` and
`admin-websocket-api-base.js`. This approval binds the exact reviewed source,
not an unreviewed composition. Retained-seed acceptance receipts and all
release/landing/publication gates remain outside this approval.
