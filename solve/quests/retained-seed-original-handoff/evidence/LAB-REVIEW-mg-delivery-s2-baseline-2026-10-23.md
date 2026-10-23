# Independent S2 native provisional-route baseline lab review

Reviewer: `subagent:/root/retained_effects_review`.
Review time: 2026-10-23 10:14 UTC.

Verdict: **the exact commissioned baseline completed FAIL. Native setup and
ordinary replicated source debt engaged; the claimed S2 provisional-result
failure remains UNENGAGED.** This run stopped at the preceding requirement for
a matching F2 handler return. Preserve the failure and investigate that boundary
before claiming this is a decisive semantic red for F3 or provisional coverage.
This review approves the evidence interpretation only, not source correctness,
S2 acceptance, implementation, Quest closure or merge.

## Exact source, workload and controller custody

The sole source job is [lab #1049](https://github.com/psvensson/lagrange-lab/issues/1049):

- Source: `86fd86137cdbd3944f6eddcd34d7df04ab9b81e8`, from the preserved
  `work/mg-delivery-fixture-trace-20261023` branch.
- Request: `72bf9d0adf044252bee68e98d7a160d8`.
- Envelope SHA256:
  `b56373893ffa7f621b34dc7420946b7316bd5eb4ba23187af1790a5da92f69aa`.
- Payload SHA256:
  `22d5c6c44f66de01288a2a5df5e82a2a387767a21514a47afc1b21dddba8fc23`;
  one payload part, 1,021 decoded bytes.
- Trusted controller: `b4a2e06c193c44b09f1b67d02e8d80f4`.
- Sole selected file:
  `test/message-group/message-group-native-provisional-route.test.js`.

The fetched remote issue body and payload part match the preserved local packet.
The decoded payload binds that exact source and selection. The independent
review rehashed all eleven committed blobs against
`MANIFEST-mg-delivery-s2-baseline-2026-10-23.json`, manifest SHA256
`abfc68bc84df91515100915dca7ec6b85aed3e6222ab6a1c0916076459e7b30c`.
Every blob matches. The exact committed `src/` diff against
`21cfd917d8ceb2f0c1435cade117c0c44a91a03a` is empty.

The [terminal receipt](https://github.com/psvensson/lagrange-lab/issues/1049#issuecomment-6362454343)
explicitly reports COMPLETE / FAIL, exit 1, source execution started and one
worker on `lenovo-laptop`. It records completion at
`2026-10-23T10:05:49.838Z`; the receipt was recorded at
`10:05:50.002Z`. COMPLETE is not interpreted as PASS.

## Full original log custody

The original worker log, not the controller's 8,209-byte tail, is:

- 59,196 bytes, SHA256
  `2826f710e7a1e3a3b22ccdc4ebeb8896c13011e62aa45e7eb8a8b06ef3a88884`.
- Stream ID
  `48ed131278748255b73454b24e6dcee453c4b6955c1ac538f4f9b4edec091348`.
- No truncation. Terminal original output/log byte counts and digests agree.
- Eight contiguous chunks: offsets 0 through 48,000 in 8,000-byte increments,
  then offset 56,000 with 3,196 bytes. The final next offset is 59,196, with
  `eof:true` and `complete:true`.
- Read-only evidence issues: [#1050](https://github.com/psvensson/lagrange-lab/issues/1050)
  and [#1052](https://github.com/psvensson/lagrange-lab/issues/1052),
  [#1053](https://github.com/psvensson/lagrange-lab/issues/1053),
  [#1054](https://github.com/psvensson/lagrange-lab/issues/1054),
  [#1055](https://github.com/psvensson/lagrange-lab/issues/1055),
  [#1056](https://github.com/psvensson/lagrange-lab/issues/1056),
  [#1057](https://github.com/psvensson/lagrange-lab/issues/1057),
  [#1058](https://github.com/psvensson/lagrange-lab/issues/1058).

For every chunk I checked its request ID and envelope digest, original job,
controller, host, exact stream, offset/next offset, byte length, decoded base64
versus UTF-8 text, and independently computed chunk/raw digests. All agree.
Each receipt identifies `source:"original-worker-log"`, `read_only:true`,
`executed_source:false` and the same terminal source job. Reassembly matches
both the original worker digest and terminal receipt. No failed retrieval,
duplicate source execution or workload resubmission occurred.

The complete local artifacts are:

- `/tmp/mg-delivery-s2-baseline-runtime-worker.log` — authoritative original bytes.
- `/tmp/mg-delivery-s2-baseline-runtime-log-custody.json` — per-offset request and
  receipt identities; SHA256
  `05a778c342137e4ba2e2e7e497c7b88097a03a5ec29cd923798b42fb71972057`.
- `/tmp/mg-delivery-s2-baseline-runtime-terminal-receipts.json` — source receipts;
  SHA256 `21d065351e51373d2371b283352ca9a638c2b4eb5025f0c0ca16372f59a719e4`.
- `/tmp/mg-delivery-s2-baseline-runtime-evidence<offset>.json` and matching
  `-request.json` files — complete evidence receipts and submitted read packets.
- `/tmp/mg-delivery-s2-baseline-runtime-source-envelope-observed.json` —
  fetched source issue body and payload.
- `/tmp/mg-delivery-s2-baseline-runtime-diagnostics.json` — analysis-only decoded
  TAP diagnostic objects; it does not replace the original log.

## Actual boundary engagement

The final classified-runner census is **one selected/completed file, zero
passing files, one failing file, one runner-reported assertion**. The sole TAP
test failed; no tests were skipped, cancelled or marked todo. The generic
terminal driver's `completed_test_files:null` is not treated as an incomplete
run because the full original runner output ends with
`test-files total=1 pass=0 fail=1 assertions=1`. This is one test case, not a
count of every internal `assert` call.

The source-bound sequence before the first failure establishes:

1. Actual SERVICES participant release reached CUT_OVER. All three source
   voters were real native participants. The following ordinary SQL calls
   passed the released source admission path.
2. RF5 recipient formation completed. The test observed five native voters,
   then exact retained reopen setup for F1/F2, with the intended partial route.
   F1 was a pre-candidate with no native leader; its stale cache selected F2.
   F2 was an actual follower of L with L's native address unavailable, no
   L cache row and an empty external peer-hint list. The source MG was a real
   leader and ready for SERVICES metadata ingress. The captured safe target
   was G/F1. These are setup facts, not proof of a later CDC relay.
3. Ordinary SERVICES query A retained its actual APPLIED outcome and exact debt
   at native index 5, term 1, ordinal 0, entry
   `provisional-route-a`, event key `entry:provisional-route-a`.
   Query B followed at index 6, term 1, ordinal 0, entry
   `provisional-route-b`, event key `entry:provisional-route-b`.
   The setup assertions compare every source voter’s actual SQL command,
   parameters, outcome, applied/commit frontiers, physical STOPPED row, HLC and
   exact ledger JSON. Both setup diagnostics were emitted after these checks.
4. The real topology initialize/start and source subscriber setup assertions
   returned before execution reached the failure. The test awaited actual
   subscription handshake and its unchanged native tick/pump operation.

The first failure is:

```text
S2_PROVISIONAL_A: actual registered handler returned; []
requireReturn:207
TestContext:265
```

This is the first `requireReturn` assertion: it found no recorded
`application-return` to F2 whose envelope contained A's service row.
The `application-error` list included in that message was empty. The later
canonical `isProvisionalCdcOutcome` check at line 211 did not run.

Consequently this log does **not** establish a canonical provisional response,
real F1-to-F2 application ingress, relay depth 1, source-MG native application of
A, no target native occurrence at that cut, provisional scan release reaching B,
B hydration, F2's later depth-2 route to L, actual target native receipt or source
ACK settlement. Those assertions are after the first failure and remain
unexecuted.

The full original log contains six setup diagnostic objects and no
failure-time serialization of `f.events`. The fixture collects additional
selection, subscriber, application-send, registered-handler and return records
in memory, but the failing assertion prints only the filtered application-error
array. An empty array cannot distinguish an earlier source refusal, no F1
dispatch, a first-hop local return, a missing relay, or unfinished work. It is
not evidence that none of those owner paths ran. No route or root cause is
inferred from that absence.

## Cleanup and physical-machine observations

The source terminal receipt reports `execution_scope_closed:true` and
`scope_closed:true`; the sole worker reports
`containers_closed:true`, `execution_scope_closed:true` and
`thermal_scope_closed:true`. There is no thermal-abort reason. Last measured
CPU was 47 C; SSD measurement was unavailable. The full TAP log reports no
second failure from the registered cleanup hook. This is not a separately
instrumented assertion that every application resource closed at a particular
intermediate cut.

The independent pre-fleet [#1048](https://github.com/psvensson/lagrange-lab/issues/1048)
completed at `10:02:31.350Z`: all six machine locks free, lenovo CPU 44 C,
boot `18581133-d0d9-4dec-a3f8-266562235699`.
The independent read-only post-fleet
[#1051](https://github.com/psvensson/lagrange-lab/issues/1051#issuecomment-6362528753)
observed `10:10:04.084Z` through `10:10:04.986Z`: all six locks free;
lenovo CPU 47 C and the same boot identity. Fleet collector source is
`53e262450fada3b4e706898201a3c732811ae4d0`.
The post-fleet JSON hashes to its receipt digest
`c30e26c742e9c8ebebfc9ce702e891029c1d7fbd1b34b73da5eb0010a588a792`.
Full normalized pre/post receipts are preserved in
`/tmp/mg-delivery-s2-baseline-runtime-pre-fleet.json` and
`/tmp/mg-delivery-s2-baseline-runtime-post-fleet.json`.

## Disposition and remaining proof

Keep this exact FAIL and the previous RF1/RF3 baseline evidence. It proves the
released native source and partial-route setup were achievable on the locked
host, but it is not the intended S2 red-to-green witness.

The next authorized investigation is source/history tracing and transparent
failure-path diagnostics at the earliest missing-return boundary. It must
preserve the existing accepted assertions and scheduling bounds and must not
perform additional native `readStatus` calls disguised as passive logging.
A diagnostic may serialize observations already captured by the actual
operation and preserve the original error object. Any changed fixture requires
a separately reviewed exact source and a new explicit lab commission.

No production/test changes, local runtime, new source workload, commit or push
were performed by this reviewer. This run does not grant broad W7 coverage,
startup activation/custody, durable transfer, two-start acceptance, full Quest
receipts or merge approval.

## Source/history follow-up at exact 86fd, 2026-10-23 10:23 UTC

This append follows the root's read-only investigation commission. It does not
revise the original lab FAIL or turn an unobserved path into a measured cause.
The exact S2 fixture/test hashes still match the eleven-file manifest; no
production or test file was edited. The current source tree was checked against
the immutable executed source before tracing it.

### Finite findings

**T1 — The first-return assertion has no observed delivery-completion barrier.**
At `partition-cdc-delivery.js:673-678`, subscription schedules buffer replay,
starts `driveCdcObligations(...).catch(...)`, and returns its handshake without
awaiting that ledger drive. The S2 test then does one `tick(f)` and immediately
calls `requireReturn` (`test.js:259-265`). The helper pumps 64 rounds of native
packets, zero virtual-time advance, microtasks and real `setImmediate` turns
(`fixture.js:99-125`).

Meanwhile, unchanged topology admits a single SERVICES wave to its immediate
batch owner when it has targets
(`cdc-group-propagation-delivery-methods.js:58-79,183-235`). Its normal delay is
10 ms (`cdc-group-propagation-service.js:41,106-108`), armed with the real global
`setTimeout` (`cdc-group-propagation-lifecycle-methods.js:65-66`). A fixed count
of immediate turns is neither an elapsed-time guarantee for that timer nor
evidence that the callback/handler settled. The run could therefore stop while
A still waits in a legitimate batch window. The log does not print that queue,
so this is a concrete static synchronization gap and a candidate cause, **not
a proven runtime explanation**. Do not enlarge timing/pump bounds or bypass
batching to conceal it; first observe the actual boundary.

**T2 — Source-occurrence loss is definite but does not by itself explain the
empty first-return candidate set.** The executed seed bridge passes only
table/operation/data to topology
(`seed-runtime-bridge-owner.js:199-215`). Topology strips metadata in its own
normalization and outbound payload
(`cdc-group-propagation-delivery-methods.js:698-715,749-773`).
The source MG receives a metadata-free apply call
(`cdc-group-propagation-service.js:237,406-410`), remints missing timestamps in
normalization and takes its RF1 local/cache branch
(`message-group-service-cdc-propagation-runtime-methods.js:251-274`;
`message-group-service-cdc-replication-runtime-methods.js:182-214,270-292`).
These are the already identified production identity/native-completion gaps.
They would prevent later exact-envelope/native assertions from passing on this
baseline. However, `requireReturn` first matches A by `data.service_id`
(`test.js:201-207`), and that row field survives these projections. Lost
`eventKey` alone cannot establish why no F2 return was recorded.

**T3 — The captured default F1 premise supports forwarding, not automatic local
ingress.** F1 has a captured viable strict target F2, no native leader, recovery
routing state `none`, and no local recovery target. Its constructor is given no
join/deferred-convergence or metadata-publication-readiness override. Those
defaults are false/null
(`message-group-service-state.js:282-285,308,319-320`).
Without a readiness object, background readiness is true
(`traffic-readiness-utils.js:112-115`); metadata readiness is also true, making
the special metadata-publication convergence window false
(`message-group-service-metadata-publication.js:44-58`).

For an unchanged depth-0 input without an addressed-convergence flag,
`shouldUseCanonicalLocalIngressForStrictCDC` therefore returns false at
`message-group-forwarding-owner-routing-methods.js:450-454`, and the actual
ingress decision can choose the captured target
(`message-group-forwarding-owner.js:307-378`). Merely colocating F1/F2 on one
node does not make them the same local replica
(`message-group-forwarding-owner-target-methods.js:84-105`).
A first-hop local result would need its actual decision/inputs observed; it is
not explained by the fixture's captured default state alone.

If F2 actually receives depth 1, the unchanged owner deliberately prefers local
convergence ingress from its relayed flag
(`message-group-forwarding-owner-routing-methods.js:397-402,438-448`).
The actual handler then applies locally and builds an ordinary response
(`message-group-service-cdc-propagation-runtime-methods.js:45-95`). That is the
known later provisional/native-release gap; it remains unengaged in #1049.
Fresh native route preference after B still needs the approved F3 correction
and real proof. Neither the static premise nor this failed run proves it.

**T4 — Failure instrumentation omits the discriminator already held in memory.**
The fixture records subscriber input, async selection, outbound application
start, registered ingress, application return/error, and topology return.
The error at `requireReturn:207` prints only application errors, omitting all
other events. Upstream source readiness/callback errors can be retained as a
HELD drive outcome rather than reject the handshake:
`partition-cdc-obligation-delivery.js:508-551`. The fixture's logger is fatal.
Consequently an empty printed application-error array is compatible with no
dispatch, an upstream refusal, in-flight work, a local first-hop result or a
missing relay. Existing collection is insufficient to discriminate them.

A bounded diagnostic at that failing assertion can synchronously serialize
already captured `f.events` plus direct data snapshots: topology state and
existing batch/retry map sizes, captured targets and pending row IDs, resolver
counts and timer-present booleans; existing source-lane object fields
(`inFlight`, scan/cursor, current tenure, pending/command counts, lastDrive),
subscriber/wrapper identity, and existing application-settlement counts.
Read only copied scalar/data state; do not serialize timer/promise objects.
This supplies the following discriminator without weakening the assertion:

| Observed cut | What it distinguishes |
| --- | --- |
| No subscriber input; lane never started or currentness differs | Source scheduling/currentness/readiness before propagation. |
| Input/selection occurred; an immediate batch retains A; no application send | The actual batch scheduling boundary before F1. |
| F1 send/ingress/return exists, but no F2 send | First-hop owner decision/result; inspect its captured data, do not infer a relay. |
| F2 registered ingress exists but no return | The actual receiver/return path is unfinished, rather than undispatched. |
| F2 return contains A and canonical predicate rejects it | The intended semantic-result failure is now engaged. |

If the direct source operation threw before an existing observation, a narrowly
placed error recorder may retain the actual error's name/code/message and
disposition fields while rethrowing the **same object**. It must preserve the
real subscriber readiness delegate and original arguments/context; it must not
turn a refusal into an answer. This is a diagnostic recommendation, not review
approval of an as-yet unwritten fixture.

Do **not** call the existing `targetView` or `sourceView` helpers as if they were
pure failure observers. The former calls native `readStatus`; the latter calls
`getCdcObligationDiagnostics`, which calls `laneOf` and can reset a mismatched
lane (`partition-cdc-obligation-delivery.js:107-112,138-146,619-634`).
Likewise do not invoke routing/readiness/reconciliation predicates afresh merely
to print their answers. Prefer operation-captured snapshots or direct fields.
No added native tick, timer advance, retry, timeout or queue drain belongs in
this diagnostic.

**T5 — Both relevant mechanisms predate this test and require separate proof.**
History traces the 10 ms immediate batching to
`46b65f8abbd145900ff92e1d30a9db502a9b8a51` (March 18, “wip stabilizing node join
under load scenario”), later extracted by
`ce7be3c743e86e454a658c8b0ef6697924f1e2e4`.
Existing `cdc-group-propagation-stop-settles-deliveries.test.js:128-165`
explicitly observes a pending immediate batch and its settlement on stop.
That is a source-bound precedent for measuring the owner-held queue, not
assuming a turn count means delivery.

The relayed strict local-ingress rule was already present in
`e2797b6c8756cc0d596e24b16465b41c820cbd56` (April 20) and extracted by
`18dbdbe7f92d90266d3359c5bf5c76548426d3ce`.
The existing strict convergence tests cover relay-local hydration, including
competing stale targets
(`message-group-service-strict-cdc-join-convergence.test.js:579-905`).
Those tests explain the original formation-liveness motivation. They do not
supply native committed receipts, erase durable source debt, or prove the new
F3 transition. The correction must preserve that hydration behavior while
proving its later native release.

Consolidated follow-up: record the missing passive census before choosing a
fixture scheduling change or blaming F1. The source already explains why an
unawaited drive can still be queued, and separately explains the known
identity/native gaps. It does not prove which path produced #1049's absent F2
return. The unchanged acceptance and cleanup assertions remain binding.

### Explicit observation-schedule qualification

The executed S2 fixture itself already calls native `readStatus` in
`targetView`, in the registered-handler observer, and in its reconciliation
observer (`fixture.js:85-93,167-172,267-271`). Those are operations in this
witness's actual schedule; they are **not generally passive diagnostics**.
The native owner can drain queued inbound work or perform recovery when status
is read, as recorded in the preceding RF3 fixture review. The evidence above is
bound to that exact observed schedule and does not prove those reads have no
effect.

The proposed failure discriminator adds no such operation. It serializes only
already captured event data, direct existing lane/topology/held-work fields,
and permitted SQLite/cache reads. A fresh native status/readiness/route query,
`sourceView`, `targetView`, `getCdcObligationDiagnostics`, reconciliation,
extra tick or queue drain is excluded. This keeps the first missing-return
failure at its original cut while making the already owned work visible.
