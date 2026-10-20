---
audience: development
documentClass: evidence
---

# Independent seed failure custody witness review

Date: 2026-10-20.
Reviewer: `subagent:/root/control_source_review`.
Scope: design and witness review only. This reviewer performed no native
measurement and approves no production patch, Quest landing or release.

The product source reviewed for the initial witness is unchanged from
`847c36a31ea3e84880dbf5e16b7e4ffb81cdd3eb`. The initial test checkpoint is
`f7a3bf12236a63aa1ccc7ac2237e636f31110bf9`.

## Design review and focused witness decisions

The first design review required a caller-visible cleanup observation,
retention of exact failed service objects, and SQL/CDC cleanup before their
references disappear. A phase-label change alone would not establish those
obligations. The append-only design correction names those requirements.

The corrected design is approved for the bounded existing-owner cleanup
interaction. Moving acquisition and release into the existing registration
phase intentionally changes their scheduler and phase-event boundary.
Clearing only the current rejected shutdown attempt permits same-owner
retry; it does not reopen serving admission.

The focused tests approved for baseline measurement were:

| File under `test/bootstrap/` | SHA-256 |
| --- | --- |
| `bootstrap-failure-cleanup.test.js` | `cef46d453616d85e535738cc499198ffeafb9fc2d0e8027c9063e2f0ff1d8b1b` |
| `bootstrap-shutdown-quiesce.test.js` | `350b9be8b3b69b7f69f3d13b34e88e94a60ac79bff20b862d7d9f09cfa38e3a9` |
| `pipeline/seed-registration-phase-custody.test.js` | `67bc5b5bd59f84feaa5488e978b17a40815ff716e16714055b2a66f26b419d29` |

The phase test's earlier draft replaced `executePhase` and used two fixed
microtask turns. The superseding approved bytes bind the actual
`createBootstrapServiceSeedWorkflowMethods().executePhase`, assert class A
at the injected scheduler callback, coordinate release entry or attempt
settlement, release both gates in `finally`, and preserve assertion and
attempt errors. This proves callback ordering through the actual phase
method, not runtime scheduler fairness.

## Native witness round 1: REVISE

The complete review covered these frozen initial bytes:

| File | SHA-256 |
| --- | --- |
| `test/bootstrap/seed-release-failure-custody.test.js` | `5cf1e0ad7dce4cc42ffb19855bd0e8c6289f24a2be44685eee60297d14344228` |
| `test/test-helpers/seed-release-failure-custody-fixture.js` | `15a8547eb0231ff565cf8217771489855b1d7eec7bd0b9260d548c1409bfeb45` |

Two findings prevent approval of these bytes for native measurement:

1. **Transport, timer, concurrency and harness attribution.** Test lines
   59-72 apply one deadline, one ENABLE and no applied-observation/RESUME to
   all captured traffic. Lines 79-83 select a refusal without binding its
   trigger and deadline. The actual recovery owner can legitimately create
   another deadline at
   `src/node/replica-handler-release-recovery.js:213-215`, with registry and
   consensus wakes at lines 244-254. Bind the assertions to the selected
   expired FRESH_SEED operation and its shared deadline. Retain other
   traffic as observations; do not suppress legitimate recovery to satisfy
   the witness.
2. **Recovery, harness and custody.** Fixture lines 220-251 delete the
   supplied directory after checking only the selected connection. Baseline
   `src/bootstrap/phases/seed-cleanup-handler.js:314-341` catches individual
   close failures and clears its map; lines 370-390 do the same for message
   groups. A fulfilled cleanup call therefore cannot establish every old
   native connection closed. Capture read-only references to the original
   acquired partition and message-group DB objects and require all captured
   connections closed before deletion. Report exact unresolved identities
   and retain the directory on uncertainty. Existing owners remain the only
   teardown path; the observation must not directly close resources.

No other actionable finding was withheld from this round.

## Category-complete initial assessment

Numbers below correspond to every item in the nine declared verification
templates. Source references describe current behavior; test references
describe the proposed assertions, not executed results.

| Category | Item-specific assessment and evidence |
| --- | --- |
| Admission/gating | 1: actual retained SERVICES reader feeds the actual replacement constructor, test 157-175 and fixture 185-209. 2: original failure and typed creation refusal remain failures, test 74-84 and 168-176. 3: budget remains 3000 ms, fixture 39-46 and test 41. 4: actual answer and failure-result shapes are asserted, test 74-105. 5: exact cleanup retry is separate from reopening, test 125-143. 6: retained readers run again after real close, fixture 188-204. 7: diagnostic identities include actual node, partition, replica, DB path and origin, test 188-192. |
| Recovery/replay | 1: exact old object remains the custody oracle, test 85-90 and 106-109; successor protection has the focused map witness. 2: second bootstrap uses a new NodeService and BootstrapService, fixture 197-205. 3: real nonempty control and dependent operations are required, test 46-68. 4: origin is reread through a new read-only DB after closure, test 146-158 and 177. 5: nonempty retained storage without SERVICES rows refuses, test 160-176; no absent-row permission. Directory deletion remains REVISE finding 2. |
| Retry/re-drive | 1: restore actual close, then retry top-level shutdown, test 125-143. 2: no new retry loop is supplied by the fixture. 3: original cleanup failure is matched by exact error identity through nested causes, test 31-36 and 127-129. 4: top-level cached-rejection defect is independently asserted before lower-owner teardown, test 195-200. 5: focused shutdown test 104-126 covers joining, retry and completed idempotence. 6: exact old versus successor map completion is covered by focused test 130-164. 7: transport success never supplies cleanup success; actual connection state and owner custody are asserted. |
| Transport/delivery | 1: real ENABLE outcome and applied origin are required, test 48-52. 2: fault occurs after the original response, fixture 113-143. 3: first post-ENABLE and final seed refusals are separately checked, test 74-84. 4: original delivery options pass unchanged through fixture 126-147. 5: MessageRouter is real and original delivery is invoked once at fixture 134. Attempt attribution remains REVISE finding 1. |
| Sweep/timer | 1: handler clock alone is replaced; scheduling delegates to the original source, fixture 91-98. 2: no leadership, membership or authorization fact is substituted. 3: replacement runtime objects are new, fixture 197-205. 4: native answer must settle before forced expiry, test 53-58. 5: no Raft-status polling is used to manufacture continuation. Recovery traffic must be distinguished under finding 1. |
| Concurrency/serialization | 1: concurrent shutdown joining is independently covered by the focused test. 2: exact service and DB references bind the close fault, fixture 104-120; production map identity guards remain future source-review obligations. 3: no new operational claimant is introduced. 4: recovery continues through its existing subscriptions; the witness must not classify another attempt as the expired one. 5: assertions use actual object identity and the same path rather than only names, test 85-90 and 130-141. |
| Formation circularity | 1: SQL, CDC and handler are captured from actual registration acquisition, fixture 83-101. 2: retained restart records the first actual creation refusal, fixture 162-209. 3: no serving or application-write success is invented after failed startup. 4: unchanged release budget is measured; total startup performance is excluded by the test header. 5: actual membership and storage readers are consumed, and seed ingress is required before replacement construction; no SERVICES synthesis or forced seed. |
| Harness fidelity | 1: origin and close-fault engagement precede the semantic subtests, test 39-90 and 187-202. 2: real native stores and BootstrapService are used, fixture 269-279. 3: budget is unchanged and only the handler clock is forced. 4: requests and answers originate from the actual route. 5: non-null target, real origin, close calls, open DB and retained owner exclude empty assertions. 6: ceiling is BootstrapService entry, not public process-lock reentry. Findings 1 and 2 must be resolved before native approval. |
| Owner interaction | 1: service/handler lifecycle owns release; bootstrap cleanup owns orchestration. 2: proposed cleanup observation uses existing outcome vocabulary, test 93-105. 3: origin, failed cleanup and actual same-owner retry occur in one sequence. 4: restoring native close re-enters the existing shutdown path, test 133-143. 5: no new timer, retry cadence or authority is added. 6: explicit shutdown retry is the continuation. 7: observation does not grant reopen permission; actual second bootstrap refuses. 8: phase and retry source controls remain required and unexecuted at this review. 9: direct lower-owner cleanup is visibly teardown-only after the retry assertion, test 197-200. 10: source/impact-registry alignment remains a production-review gate, not supplied by this test review. |

## Scope clarification: SQL reference discharge

The subsequent design clarification remains inside the approved cleanup
interaction: after awaited successful engine shutdown, clear bootstrap and
bridge references only when they still name that exact engine. Preserve
references on rejection or replacement. Use the existing shutdown algorithm;
do not introduce another SQL lifetime owner.

This clarification needs its own focused assertion and production-source
review. It is not implementation acceptance.

### Subsequent focused SQL witness review

The extended `test/bootstrap/bootstrap-shutdown-quiesce.test.js`, SHA-256
`9d1df4d004c7b7bd9ddd9829d184cf89589e7ca51e42ef294044c29cf1800b6a`,
is approved for a focused baseline measurement. This supersedes the earlier
hash only for the extended test file; the earlier review remains preserved.

Lines 168-203 call the real cleanup method through its real delegates with
explicit engine/CDC doubles. A rejected exact engine shutdown retains all
three references and its original error; a successful retry must discharge
bootstrap, bridge and captured CDC references. Lines 205-239 replace all
three references while old shutdown is pending and require old completion
to spare the successor and never call its shutdown. The first case is
expected to expose the existing missing bootstrap/bridge reference discharge;
the second is a preservation control, not necessarily a baseline-red case.
This is an owner-mechanism witness, not native query-engine cleanup proof.

## Outstanding review

Corrected native bytes require a separate appended round. Approval of a
witness permits only its declared baseline measurement. Engaged native
results, source changes, semantic negatives, composed checks, static gates
and the Quest receipts remain distinct obligations.

## Native witness round 2: baseline measurement approved

The reviewer reread and independently hashed the corrected files:

| File | SHA-256 |
| --- | --- |
| `test/bootstrap/seed-release-failure-custody.test.js` | `5c82b7321196e624f1e16963047c33281a56edc8e2ff71a8aeba5089cf758f21` |
| `test/test-helpers/seed-release-failure-custody-fixture.js` | `f15ac20c8f229e8265a4c21cdb44b0449972ee6ae5fd51456f4a01dd6d3dda10` |

**Verdict: APPROVE these witness bytes for one declared locked baseline
measurement.** No production source change was present in the execution
tree when reviewed. This is not approval of a production repair or a
prediction that the fixture will reach its semantic assertions on the lab.

Round 1 finding 1 is resolved. Fixture `selectedSeedIntent` at lines 125-134
matches an outstanding actual FRESH_SEED RELEASE by partition, deadline and
build digest; the selected ENABLE retains that exact outer record.
Test `belongsToSelectedAttempt` at lines 39-43 matches partition, release ID
and the complete attempt. Lines 45-67 scope the deadline assertion to real
fresh-seed intents, scope ENABLE/observation/RESUME assertions to the selected
attempt, and consume its captured outer refusal. Other recovery traffic
remains recorded and is not prohibited. Fixture line 150 captures admission
at the real ENABLE response, before later recovery or cleanup can supply a
different observation. This read consumes the admission already established
by the real PAUSE/ENABLE path; it does not poll Raft status.

Round 1 finding 2 is resolved. Fixture lines 86-106 retain exact original
partition and message-group DB references and require an inventory equal to
both acquired maps. Creation observers at lines 196-218 also capture later
registered native objects without replacing their original promise.
Teardown captures remaining map entries before cleanup and requires each
captured DB's `open` property to be exactly false at lines 264-282. An open
or unknown result records kind, node, replica and path, aggregates the
failure and retains the directory. This observation grants no cleanup
permission and performs no direct native close.

The round 2 category review covered all items enumerated in the initial
table, including unchanged portions of both files:

- **Admission/gating:** current initial and retained readers remain binding;
  new traffic attribution does not alter authorization or failure shapes.
- **Recovery/replay:** the native inventory closes the deletion-custody gap;
  same-file origin reread and the actual second bootstrap remain intact.
- **Retry/re-drive:** the named top-level retry assertion still precedes
  explicit lower-owner teardown, so teardown cannot make that assertion pass.
- **Transport/delivery:** selected outer intent and full inner attempt now
  identify the measured operation; original delivery remains one call.
- **Sweep/timer:** only handler observation time changes after the real
  answer; legitimate independently scheduled recovery is neither suppressed
  nor mistaken for the expired attempt.
- **Concurrency/serialization:** original object identity remains the close
  fault and custody oracle; unrelated attempts keep their own deadlines.
- **Formation circularity:** replacement construction still requires the
  actual membership reader to select seed ingress and consumes actual
  SERVICES admission. Earlier refusal remains a measured frontier.
- **Harness fidelity:** nonempty native inventory, real committed origin,
  exact close-fault calls and original error identity precede interpretation.
  Unexpected setup, timeout or admission outcomes cannot count as the
  declared semantic negative.
- **Owner interaction:** actual SQL/CDC lifecycle observation, primary
  failure plus cleanup observation, retained origin and first authoritative
  restart refusal remain in one sequence. No alternate completion or
  admission owner was introduced.

The witness intentionally measures a local BootstrapService construction
with native groups and SQLite. It does not establish public process-lock
reentry, cross-host quorum recovery, automatic partial-seed admission, full
startup latency, U1/TX1/FreshMG closure, complete static/corpus gates or release
acceptance. Runtime results and any source patch require separate review.
