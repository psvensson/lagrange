# C17 caller source and resource amendment: independent round-four review

Date: 2026-10-11. Reviewer: `subagent:/root/review_checkpoint_composition`.
Author-distinct. Source, tests, documentation, metadata, index and Quest logs
were not edited. Independent diagnostics are retained under P/independent-review.

## Separate verdicts

1. **APPROVE N1/N2 SOURCE at `2de419483c9b4ce9e3fabc87bb54d93e4afb8817`,
   limited to the five changed source/test paths below.** The callers have
   independently bounded waiters, a synchronous exact settlement operation,
   finite admission and reference cleanup. The shared generation captures its
   execute closure and deadline, and the normal catchup path checks its original
   budget before the next table. Independent execution demonstrates that an
   expired caller cannot inherit COMPLETE while a valid shared publication and
   longer caller succeed. No new blocking source finding was established.
2. **REVISE the complete resource DESIGN at SHA
   `35ad2ff5ee9d19467e89b662aa671a2a578d0fca1a38833c1642e99b97b603ea` for D10
   below.** D9's mutually blocking pool claimants are removed. The lower-node
   then upper-node admission rule addresses that particular counter-schedule.
   The newly mandatory scalar probe introduces a retained response lifetime
   which is not yet included coherently in the transition to the complete
   source allocation. This is a bounded design finding, not an executed
   page-v2 failure or a defect in the five caller source paths.
3. **Preserve all earlier bounded approvals and outstanding obligations.** The
   D1–D8 corrected design directions remain preserved. R3-4/R3-5/R3-6/R3-7
   component approvals remain unchanged. R3-1/R3-2 transport/resource source,
   whole-operation memory proof, normal startup, activation, BEGIN,
   original-event delivery/lost ACK, replacements and physical recovery remain
   open. This is not approval of the entire source snapshot or of a main merge.

The complete finding batch is D10, with source/evidence limits stated below.
The N1/N2 source approval is available independently of further transport design
work. No future implementation tests are required merely to revise D10.

## Exact subjects and provenance

`W` = `/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011`.
`E` = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`.
`P` = `E/cdc-c17-n1n2-caller`.
`I` = `P/independent-review`.

**D** = `W/solve/quests/replicated-transaction-decision-and-apply/cdc-coverage-response-resource-handoff-amendment-20261011.md`.
Current SHA-256: **`35ad2ff5ee9d19467e89b662aa671a2a578d0fca1a38833c1642e99b97b603ea`**;
691 lines. D references below use those exact bytes. The frozen source snapshot
contains the preceding approved-caller design, SHA
`475490300df5a6f64bfa72d774160ecbab24e578a3e4defb52aec460dd64510b`, not the later
unapproved transport revision. The text between the Three independent lifetimes
and Binary page headings is byte-identical: 6170 content bytes, or 6201 bytes
including the first heading. Thus no caller design change is smuggled into D9.

| Source identity | Value |
| --- | --- |
| Snapshot | `2de419483c9b4ce9e3fabc87bb54d93e4afb8817` |
| Snapshot tree | `0ca9696f2f77dde6d5d84d34151728251fb127c9` |
| Comparison source | `d23a0746bf5ee6c9b659d43abe27630d86d38397` |
| Worktree HEAD | `e7c89f4b5114c0238312d3831b65889a4622f4e9` |
| Unchanged observed index tree | `4d45f84daa6d4a2639b4bd3d6ea5e819bf98360d` |
| P/scoped-manifest.sha256 | `55bdda8be9aa1a031f23df3e675df61d1f73b590d653e2b3e113f20e2a6a750a` |
| P/commands-and-results.md | `ba70cbce4c4cbce5a47606942fad98473dee7522cc373ecc6f93b9a4fc8c98c8` |

Independently verified the manifest's **nine entries** against both live W and
the exact snapshot: five changed source/test paths plus four unchanged metadata
files. The complete snapshot delta from d23 is those five paths plus the frozen
475 amendment. Also checked **48/48 cumulative source/test/metadata entries**
from the prior source census, applying only the five new fingerprints. No
unlisted source delta was found.

| Approved changed path, relative to W | SHA-256 |
| --- | --- |
| `src/cdc/cdc-coverage-reconcile-owner.js` | `0d844cff666dfcd3e7aa58246b782cad5ccfdd5f321e7b5af8d795fdc949218a` |
| `src/cdc/cdc-integration-service-authoritative-catchup.js` | `706246104aa7e06ab9f02eec9cba3aa88be899814725deb5362335f5bbc3d577` |
| `src/cdc/cdc-complete-coverage-reconcile.js` | `1b45e2bc303e7466484731b541a3502fdf2f9f371ebcf4ccdb00c1d5ae01a983` |
| `test/cdc/cdc-coverage-reconcile-owner.test.js` | `ab3ec86d18bae8e9092ff64b7054aa9e08528eaf1c9dcc313ffe23ce4108e5e8` |
| `test/cdc/cdc-authoritative-catchup-hydration.test.js` | `65318532cc40a2a9d802b7a75669572bda3cf3c50f193ee398f1c70ef36af2e1` |

Prior complete review: `E/review-cdc-c17-resource-handoff-round3-checkpoint.md`,
SHA `620e72722c59ce232868f636b687dc2f952a809ca58ae0d332e7f8e950bf4b49`.
Its preceding complete round-two review remains SHA
`22c52c6222b08fd1787ce649967e51973b6135fe44491bf1d7159642695e949d`; the retained
original source/resource review remains SHA
`c4d9d172dd9d69aa87198d29f1ffe1abb61ceb16f9f92fbb3f18020d2a32ecce`.
These cumulative controls and the applicable repository templates/owner
contracts were used. Memory only supplied routing/scope guidance.

### Source reference key

All source aliases below are relative to W.

| Key | Path |
| --- | --- |
| RO | `src/cdc/cdc-coverage-reconcile-owner.js` |
| CT | `src/cdc/cdc-integration-service-authoritative-catchup.js` |
| RC | `src/cdc/cdc-complete-coverage-reconcile.js` |
| PO | `src/cdc/cdc-coverage-transfer-owner.js` |
| FC | `src/cdc/cdc-coverage-fragment-consumer.js` |
| SC | `src/partition/partition-cdc-source-coverage.js` |
| ST | `src/partition/partition-cdc-coverage-transfer.js` |
| PE | `src/partition/partition-service-entry-apply-base.js` |
| CO | `src/cache/system-table-cache-cdc-source-order.js` |
| CN | `src/cache/system-table-cache-observation-methods.js` |
| Cache | `src/cache/system-table-cache.js` |
| Domain | `src/cdc/cdc-coverage-domain.js` |
| JSON | `src/utils/canonical-json-data.js` |
| RI | `src/transport/message-router-inbound-dispatch.js` |
| RD | `src/transport/message-router-delivery-behaviors.js` |
| AR | `src/cdc/cdc-integration-service-authoritative-read-flow.js` |
| Registry | `test/shards/impact-contracts.json` |

## Source reasoning and six witness groups

RO:137–166 is the sole waiter settlement predicate. It checks exact map entry
and pending identity, captures resolve, current cancellation/lifecycle/time,
then selects CANCELLED, RETIRED, SPENT or the proposed outcome. It removes the
entry and timer/abort listener, clears signal/lifecycle/resolve references and
resolves once. Generation completion settles while the debt is still current,
then retires the completed debt (RO:391–408); shutdown marks the owner retired
before settling its callers (RO:208–221).

RO:175–205 admits at most 64 waiters, each with its own promise. It attaches no
per-join reaction to `debt.inFlight`. At equal caller/generation deadlines the
caller timer deliberately leaves settlement to the generation deadline race;
RO:258–267/354–374 bounds that race, and completion still executes the exact
current-time predicate. Shorter joiners have their own timer. Timers use the
existing injected clock and unref helper.

RO:411–421 captures `generation.execute`; RO:298–305 invokes that capture.
RO:470–478 does not replace an active generation's execution with a joiner.
RC:367–374 captures only immutable operation identity into the generation
closure, excluding caller request/signal/deadline references. CT:37–54 captures
the outer budget, and CT:73–99 checks it before every table admission. The
catchup public result remains its existing summary shape: spent later tables
are failed, not hydrated. A skipped later table currently logs the generic
reconcile-unavailable reason when no outcome was admitted; this is a current
summary/diagnostic limit, not false completion or renewal of its deadline.

| Required group | Independently inspected and executed evidence |
| --- | --- |
| 1. Short joiner, continuing long caller | Changed RO test drives short expiry, one shared read, uninvoked joining execute, one remaining waiter and valid long completion. I/caller-cache-probe additionally exercises the real cache and public catchup. |
| 2. Default multitable deadlines | Changed CT test drives t=1000 NODES+SERVICES and t=1050 SERVICES. At t=31000 the first call finishes failed without another join/read; the second stays pending to t=31050. Exactly two original reads. |
| 3. Delayed timer | Canonical RO test holds timers across t=1040–1060. Independent real-cache probe gives short SPENT/failed, long COMPLETE/hydrated, one persistent nonempty row and one installation; old d23 RO gives short COMPLETE on the same schedule. |
| 4. Cancellation/lifecycle/shutdown | Changed tests cover native pre-abort, post-attach/duplicate abort, target replacement and shutdown. Independent probe checks real native AbortSignal listeners reach zero and later abort cannot retract the row. |
| 5. Cap and exact cleanup | 64 admitted, caller 65 gets retryable capacity refusal without a timer/listener; after one cancel a replacement joins. Independent native-signal census: zero remaining listeners/timers and only one execute launch. |
| 6. Retained recovery controls | Existing spent generation/cooldown, frozen generation time, lifecycle rearm, final cache publication fence, source scope/coverage and suffix controls are included in the five-file rerun. |

### Independent execution and semantic control

Command, from W:

```sh
node --test test/cache/system-table-cache-cdc-source-order.test.js \
  test/cdc/cdc-authoritative-catchup-hydration.test.js \
  test/cdc/cdc-authoritative-coverage-reconciliation.test.js \
  test/cdc/cdc-coverage-reconcile-owner.test.js \
  test/partition/partition-cdc-source-coverage.test.js
```

Independent result: **386 tests, 81 suites, 386 passed, zero failed, cancelled
or skipped**. I/focused.log SHA
`bca49a082db3d773721e841bc7456732ac3505e1b7755e1ecfcc440540b5b502`.

Independent diagnostic command:

```sh
node /mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011/cdc-c17-n1n2-caller/independent-review/caller-cache-probe.mjs
```

The public production catchup → RC → RO → real SystemTableCache witness uses
scripted, fully bound source descriptor/page replies and one timing latch. It
does not use a boolean as its installed fact: the cache contains
`nonempty-caller-row` after installation and after later short-caller abort.
Observed: long hydrated 1; short failed NODES; four reads; one cache install;
zero pending timers; zero native abort listeners; four unref calls. This is
neither a physical source transport nor a normal restart acceptance test.

The same diagnostic also invokes old and new RO with the same canonical
nonempty cache page and clock schedule. Old RO returns long COMPLETE, short
COMPLETE. Current RO returns long COMPLETE, short SPENT. Both retain the valid
installed row, and each launches once. The old control is a diagnostic copy of
exact d23 RO with only relative import specifiers relocated; live source was
not reverted or edited. The unchanged cache/lifecycle dependencies are shared.

| Independent artifact | SHA-256 |
| --- | --- |
| I/caller-cache-probe.mjs | `d59c06f6c30136e6fcb4ebc06a8ffed51cbbf1af67feb3f5fba6df288f93e7da` |
| I/caller-cache-probe.log | `e623fa93fee9273be4d0f1825867b2c295e7cc052dee3facdb95cc95ba9f457d` |
| I/old-owner-exact.js | `220bb3573eb9ff8aa0e2e815461bc9143ad27365bf3f48def92c8868e202da14` |
| I/old-owner-relocated.mjs | `2015149e0d1309ddd3f64a98d0b6e5a55423afd5a930e8794178dd39530234fb` |
| I/verification.json | `b9d503bc05e4aef553b1291fa6b7babbbc4db93733eb936d87ca517f96708319` |

The author's separately retained locked-lab evidence was inspected, not rerun:
exact 2de snapshot on lenovo-laptop, **5/5 files, no retry, 467 runner-counted
entries = 386 tests + 81 suites**. P/lab-focused.log SHA
`84b6ac6c287cb72b0f6723f2f46a87be9c3b54910e771dee2b9919033e578dfd`;
P/lab-results.ndjson SHA
`7a68ea2292c389610a432047bd2fb557bba2849417e9139adf455524f069602b`.
No performance acceptance or defect follows from these run durations alone.

The three source paths and both witness files already belong to Registry's
`cdc-source-coverage-reconcile-publication` interaction (894–942 and
1797–1860). Both changed tests are present in primary/resource/subsystem
classification. The four metadata files are byte-identical to d23. No metadata
change is required for this five-path caller correction. Future transport and
notification paths still require their additional live endpoint registrations.
The author retains a broad complexity-gate red; this approval does not convert
that into a green repository source gate or raise a baseline.

## D9 disposition and the complete new design finding

### D9 is corrected for the prior opposing-claimant schedule

D:307–324 orders admission by bounded canonical node IDs. Source-lower reserves
S+H first; recipient-lower reserves C+K from a scalar probe first; colocated
admission reserves S+H+C+K atomically. D:326–347 makes local units self-contained
and refusal drains the exact first unit before retry. D:370 explicitly removes
completionClaimant. There is no idle marker which blocks a foreign root while
holding zero bytes, so the prior D9 schedule no longer exists.

For X<Y and A:X→Y/B:Y→X, both first data units compete in X. Subject to the
probe-lifetime correction below, one admitted X unit can acquire its
complementary unit in otherwise free Y; if both fit X and only one fits Y, the
other drains its X unit. Colocated operations have no later first-time H/K
request. Ordinary data admission, existing role/lifecycle fences and exact
custody remain the owners; the correlation token is not a new remote authority.

D:359–378/397–404 explicitly requires typed attempt state before release wakes,
and installed state before successful release. The numbered cleanup's step 5
therefore precedes the releases operationally; its explicit before-release
clause controls. This avoids the old unspecified marker/wake installation.
The current RO wakes skip in-flight generations even during backoff
(RO:523–544). The future transport implementation must provide the proposed
in-attempt wait/wake behavior through the existing RO context as D:441–458
requires; current source does not already have that capability. The existing
timer remains the cross-node correctness path, and no source-local wake is
assumed to cross nodes.

### D10 — the new mandatory probe can still hold its response token when full source admission is attempted

**Allocation-order and supported-progress DESIGN blocker.** The mandatory
probe is new in this revision (D:283,299–305). It has a separately charged
small-response byte/count token in the source node's pool. D:579 says that token
ends at the actual transport terminal and retains no data-unit credit. D:284–286
and 580–582 subsequently require a separate complete S+H source allocation.
No clause transfers/absorbs the live probe token into that allocation, preowns
its overlap as a separate term, or continues the same probe until its terminal
event permits that source admission. The asserted peak remains S+H+C+K at
D:593–598.

The new phase list cannot assume that receiving the probe means its source
send callback has run. D:423–429 correctly rejects that assumption for other
responses. The same actual RD:698–701 WebSocket send/receive ordering applies
to a scalar probe; its small payload does not make callback custody vanish.

Permitted schedule under the separately charged-token reading:

1. A recipient at lower node X obtains the required bounded probe from source
   Y. Its source send callback is delayed after the recipient receives the
   probe. The probe's bytes/count remain charged in Y.
2. X admits its full C+K unit from the exact probe. It requests materialization
   at Y, following the proposed lower-then-upper order.
3. Y has enough capacity for the measured full S+H unit in isolation, but not
   S+H plus the still-held probe token. For example, if S+H equals the available
   data boundary, any positive separate probe debit prevents the allocation.
   Count slots require the same accounting. This uses no unrelated pressure.
4. Y returns capacity refusal; X drains its first unit as required. The old
   probe callback then runs and releases its token. The existing owner retries
   with a new mandatory probe. If each new probe is received before its callback,
   the same affordable transfer can repeat this legitimate refusal until its
   original attempt deadline.

Source-lower admission has the same missing overlap if it must materialize
after the newly mandatory remote probe but before that probe callback. This is
not an assertion that every transfer fails, or a new executed page-v2 deadlock.
It shows that the current contract can require more simultaneously owned
credit than the declared complete-unit calculation, and does not yet define
progress at that supported boundary. D9's claimant fix remains valid.

**Required correction:** include the probe's full response/input/token custody
in the one allocation timeline and give an executable path from its receipt to
data-unit admission. Either preown and account for the overlap, transfer exact
probe credit into an appropriate live source credit without premature reuse,
or retain the exact probe/binding and continue through the existing owner until
the actual terminal makes admission possible. Specify which exact event or
bounded existing retry resumes that transition. Receipt, ACK, TTL, caller exit
or a counter reaching zero cannot falsely free an externally held response.

The paired future witness should hold each probe callback until after the
recipient attempts the next phase, release callbacks within the original
deadline, and demonstrate supported remote completion at the declared capacity
boundary, alongside one-byte-below refusal. Include both node orders and the
unchanged colocated control. Do not merely add a faster-callback success case,
renew the deadline, raise a global limit or add a second retry owner. This
corrects the newly introduced required probe handoff rather than reopening the
already specified same-ordinal continuation or digest contract.

## Cumulative design and acceptance boundaries

| Item | Disposition |
| --- | --- |
| N1/N2 | Five-path source correction approved at 2de, under the byte-identical caller clause. d23 itself retains the historical defect. |
| D1 | Full captured envelope preflight retained at D:200–271, including wrappers, escape/base64/UTF16/frame copies and bounded errors. New probe overlap is D10. |
| D2/D7 | One H/data token, exact send terminal release and same-ordinal retained continuation remain at D:414–473; required repeated N+1-before-callback-N witness retained. |
| D3 | Adoption/CANCEL separation retained at D:338–347/406–410; source never releases adopted recipient C/K. |
| D4 | Knotify transfer and actual queued closure/drop terminal retained at D:519–534. Installed state survives later caller exit. |
| D5 | Canonical nonallocating comparator and outside-incoming-page NUL identity control retained at D:477–492. |
| D6 | Disjoint complete units and fresh K preflight retained at D:225–262/281–297/349–368. The added probe must now join that accounting: D10. |
| D8 | Byte-identical incremental digest under JSON owner retained at D:536–567; source/recipient scratch and metadata charged, no semantic digest version change. |
| D9 | Prior exclusive-claimant interaction corrected by no-marker ordered data admission; full handoff remains held only for D10. |
| R3-4/5/6/7 | Prior bounded source approvals retained: final publication fence, recovery discovery priority, pool census, strict applied-index text. |
| R3-1/R3-2 | Actual allocation bounds, supported colocation and complete transport source remain pending. No old NUL/colocation red is declared closed by design. |

The original NUL amplification, old 8 MiB colocated allocation-order refusal,
greater-than-16-MiB event/row versus backlog distinction, interruption,
incomplete population/absence, same-N conflicting bytes, exact replay and
newer suffix UPSERT/DELETE controls remain cumulative. Runtime coefficients,
finite count limits, complete per-node high-water and receiver parser copies
must be measured on the eventual implementation. This review does not equate a
transient variable-data pool with total process RSS.

## Category-complete 63-item source/design disposition

Every item below has concrete evidence. “Covered design” is not source or
startup acceptance. References to D10 are effects of the single grouped finding.

### A — admission and current authority

| ID | Evidence and disposition |
| --- | --- |
| A1 | RO:175–205 enforces actual waiter cap; D:225–297/494–500 measures pool credits before data/cache allocation. Caller source approved; new probe overlap D10. |
| A2 | RO:137–166/439–466/498–509 gives typed spent/cancelled/retired/capacity; CT:73–99 preserves failed summary. D:619–624 forbids empty completion. Covered within scoped source/design. |
| A3 | CT:37–54/73–99 and RO:137–205/411–421; I probe and canonical multitable witness. Own caller deadline and fixed shared deadline proven, no renewal. |
| A4 | RO frozen outcome → CT:80–83 consumes success only; RC operationRequest unchanged protocol fields. D:264–271/414–473 new handoff/held consumers explicit; source transport pending. |
| A5 | RO:157–165 removes waiter resources; PO:62–81 exact release wakes; D:370–404/423–473/519–534 names send/notification release. Probe terminal-to-next-admission path remains D10. |
| A6 | RO:137–154 current predicate, RC:176–190 and CO:535 final fence; I real cache at t1060. Postpublication row retained. Approved caller interaction; transport rechecks retained. |
| A7 | RO:78–101/571–581 identifies actual debt/generation/waiter count; CT logs admitted deadline outcome. Generic reason for a skipped later table is stated above. D diagnostics remain actual-owner projections. |

### Y — bounded retries and progress

| ID | Evidence and disposition |
| --- | --- |
| Y1 | RO:354–408/523–544 preserves existing retry/cooldown; D:326–331/370–378/441–473 uses same owner. Caller controls green; probe-induced retry schedule unresolved D10. |
| Y2 | RO deadline race and independent waiter timers bound unreadable shared work; CT multitable test stops at original outer bound. D:600–624 keeps transient custody past semantic expiry where needed. |
| Y3 | RO:137–221/391–408 classifies each exact terminal; native listeners/timers reach zero in I. D:338–347/406–410/600–624 enumerates external resource exits. |
| Y4 | D:307–347/380–404 removes opposing local markers, atomically handles colocation; D:441–473 continues same ordinal. Mandatory probe is a new completing-transfer obstacle at D10. |
| Y5 | RO cap64 and bounded retry/log constants unchanged; D:225–297/576–598 accounts S/H/C/K and metadata. Probe overlap and aggregate source proof still open; no process-memory claim. |
| Y6 | Exact map identity RO:137–139 and exact claim/ordinal/notification tokens D:338–347/414–473/519–534. Duplicate abort/control and same-N controls green; no identity remint by short caller. |
| Y7 | RO generation capture plus CT original budget; I delayed-timer control. D:455–461/600–624 forbids transport success from extending caller/attempt budgets; D10 fix must preserve it. |

### T — transport boundaries

| ID | Evidence and disposition |
| --- | --- |
| T1 | RC:54–59 and RI:435–456 retain ACK/noHandler exclusion; D:423–429 rejects ACK/handler-return release. Caller source adds no authority shortcut. |
| T2 | D:338–347/414–473/519–534 preserves successor and adopted custody; repeated N+1-before-callback-N specified. D10 applies the same legal ordering to the new probe. |
| T3 | RO frozen outcomes and CT strict success check are compatible; D:264–271/299–305/435–463 requires typed probe stale/defer and held continuation in real PE/RI/RD consumers. Transport source pending. |
| T4 | RO deadline/waiter controls and D:264–271/600–624 bound missing delivery without deleting debt. Exact supported probe transition remains D10, not silently classified complete. |
| T5 | I uses real CT/RC/RO/cache with scripted authoritative replies, explicitly not WebSocket or restart. D:669–673 requires actual socket terminal witnesses; no such new transport claim made. |

### S — clocks and lifecycle

| ID | Evidence and disposition |
| --- | --- |
| S1 | RO:69–75/196–203/258–277; I records four unrefs and zero timers after completion. Held timers exercise N2, not a compressed operation deadline. |
| S2 | SC:263–271/413–422 and D:626–638 preserve current source authority and discovery/payload priorities. No caller code changes Raft role eligibility. |
| S3 | RO:208–238/546–568 settles old waiters and rearms only retained debt execute identity; lifecycle test green. D:600–647 preserves external obligations. Full restart remains open. |
| S4 | Caller expiry clears only caller references, verified with real installed row. D:338–347/600–618 forbids TTL/cancel freeing external send/recipient/notification copies. Probe custody included in D10 requirement. |
| S5 | AR:511–516/SC:263–271 canonical recovery lane retained; caller correction introduces no activation gate. Production admission/startup dependency obligations remain separate. |

### R — state and recovery

| ID | Evidence and disposition |
| --- | --- |
| R1 | CO:395–447/494–545 remains unchanged; focused suffix/absence tests green. I actual installation persists through short caller exit. Data/ACK durable owner unchanged by this source delta. |
| R2 | RO:137–166/208–238, RC:367–374; exact generation/lifecycle and operation identity captured. D:299–347 probe/adopted bindings require fresh current checks without claimant carryover. |
| R3 | RC:67–73/104–173 and D:187–210/639–647 retain exact complete-cell/final/next and partition-set boundaries. I uses a nonempty canonical row; no vacuous empty proof. |
| R4 | Same-N replay/conflict and later suffix controls green; D:441–473/536–567 preserves digest identity and retained ordinal. Caller fix neither reruns SQL nor changes recovery identities. |
| R5 | RO unsuccessful outcomes and CT failed tables cannot certify hydration; D:619–647 preserves unreadable versus empty/complete. Probe timeout remains an obligation, D10 progress pending. |

### C — concurrency and custody

| ID | Evidence and disposition |
| --- | --- |
| C1 | RO waiter map insertion/cap precede callback use; D:281–297/307–347 synchronously reserves complete units, D:519–534 transfers notification token before scheduling. Probe/data admission overlap is D10. |
| C2 | RO exact synchronous settlement, RC/CO final fence and D:299–324/448–461/494–516 revalidate at handoffs. Independent delayed-timer/cache probe passes. |
| C3 | RO exact waiter winner and captured execute preserve one shared launch; D exact pair/ordinal owner retained. D9 marker winner removed rather than hidden; D10 missing probe-credit transition remains. |
| C4 | Native duplicate abort, shutdown, lifecycle replacement and timer ordering executed. D:338–347/406–410/423–473/519–534 requires exact once-only terminal releases and no post-swap rollback. |
| C5 | RO partition/table debt keys unchanged; PO:32–49 remains node-shared pool. D canonical node ordering matches protected endpoint pools; probe byte/count credit must join same protection in D10. |

### F — production flow

| ID | Evidence and disposition |
| --- | --- |
| F1 | Public CT → RC/RO → AR/PE/SC → FC → CO remains canonical. I exercises CT/RC/RO/real CO using bound source replies. Source transport/SQLite startup not replaced or claimed by that probe. |
| F2 | RO:354–408/523–568 owns recovery and rearm; D:370–378/455–458 retains existing bounded timer for remote progress. No new generic retry owner; D10 must use this owner too. |
| F3 | Canonical t31000/t31050 and I short1050/long2000 actual cache controls demonstrate independent caller bounds during the production catchup call. Approved N1/N2 source scope. |
| F4 | D:225–297/576–598 and 657–681 name peak, supported 8 MiB colocation, >16 MiB row and multi-page recovery. New probe overlap prevents complete accounting approval: D10. |
| F5 | AR raw-read exclusion, D:41–46/307–324/536–567. No forced activation, snapshot-only transport substitution, SQL reexecution or new authority introduced. Preserved. |

### H — evidence quality

| ID | Evidence and disposition |
| --- | --- |
| H1 | I old/new RO real-cache semantic control reproduces old short COMPLETE and current SPENT; prior NUL/colocation reds retained. D10 is a design schedule, never described as a run failure. |
| H2 | I real production caller/cache and scripted source reply boundary explicitly stated; canonical five-file suite includes real SQLite partition coverage components. No full startup claim. |
| H3 | Held clock independently separates timer execution from synchronous cache completion; actual short/long outcomes and retained cache row observed. D callback-order witnesses remain required for future transport. |
| H4 | I constructs complete canonical source scope/cell/prefix/lifecycle/row digest and request binding; tests retain strict applied-index controls. New probe bounds and identity are D:299–305, not arbitrary response metadata. |
| H5 | I real nonempty row, four read requests, one install, zero remaining listeners/timers; cap64/65 refusal and valid reuse. D supported boundary/oversize/outside-page NUL controls retained. |
| H6 | Nine scoped and 48 cumulative entries independently verified; exact five-path source approval separate from current docs. Lab runner entries correctly distinguished from test count; broader gate reds/limits retained. |

### O — owners and interactions

| ID | Evidence and disposition |
| --- | --- |
| O1 | RO solely settles waiters/generations; CT owns table budget; PO/RI/RD/CO/JSON retain capacity/transport/publication/digest roles. D9 removes added claimant authority. D10 must stay within these owners. |
| O2 | RC operationRequest-only capture avoids retaining caller signal/request in shared execute. D:264–271/414–473 explicitly adds non-wire response custody through PE/RI/RD; probe new handoff needs D10 correction. |
| O3 | Independent refusal and legitimate real-cache completion coexist at exact 2de source; old/new semantic control retained. D requires cumulative same-candidate full transport witnesses after design correction. |
| O4 | Lifecycle replacement test rearms new owner and retires old callers; D:299–305/370–378 removes stale probe/claim markers and retains normal retry. D10 cannot use permanent veto or deadline renewal. |
| O5 | RO cap/backoff preserved, no limit raised. D preowned full units prevents old H/K borrowing; probe overlap is an additional accepted-operation accounting obligation, D10. |
| O6 | PO actual callbacks are local; RO currently ignores in-flight wake. D proposed in-attempt wait extension must be implemented in same owner; remote timer explicit. Probe-to-admission release/wake remains D10. |
| O7 | Diagnostics/waiter counts are corroboration, not settlement authority; I inspects actual promises/listeners/cache. D token terminals and final canPublish remain authority, not hashes/counters/ACK. |
| O8 | Snapshot/tree/design/manifests and independent artifact hashes above. Old RO exact copy and import-only relocated control separately pinned; no misleading whole-source revert claim. |
| O9 | RO/CT/RC callers, capture/rearm, AR raw-read gate, PE/RI/RD result wrappers and PO release/wake inspected. Caller has no alternate settlement predicate; new probe custody interaction enumerated once as D10. |
| O10 | Registry:894–942/1797–1860 covers all five caller paths and tests; unchanged primary/resource/subsystem classification verified. Future live transport/cache/probe witnesses still need metadata when landed. |

### J — JavaScript and byte domains

| ID | Evidence and disposition |
| --- | --- |
| J1 | RO:425–467 and CT:37–54 validate positive safe deadlines; existing clock/backoff domains retained. D:200–262 demands safe length/sum/base64/UTF16 arithmetic; new overlap D10 is accounting, not a global limit fix. |
| J2 | Caller objects are existing local owner requests/native signals, not a new wire authority boundary. RC captures primitive operation identity; Domain/FC strict own-field wire guards and D preflight remain unchanged. |
| J3 | RO:137–166 captures settlement evidence/resolve before clearing; generation captures execute once, RC freezes three operation fields. D captured canonical wire fields and same-turn K estimate/staging retained. |
| J4 | Existing prototype/own-property defenses in Domain/FC untouched. Source review did not add hostile arbitrary local signal implementations to the accepted native caller threat model. |
| J5 | RO state enums and strict boolean success/cancel checks; native AbortSignal capacity probe. D bounded primitive identity/error/OFFER/probe fields required before variable allocation; transport source pending. |
| J6 | Existing JSON pinned primitive contract preserved; D:544–567 proposes equivalent bounded mode. No unsupported arbitrary runtime patch immunity claim made. |
| J7 | JSON semantic digest bytes unchanged by caller source. D:477–492/536–567 retains nonallocating comparison and exact streaming-encoder equality controls including NUL/Unicode/key/number edges. |
| J8 | Waiter count bound is concretely64; caller source adds no unbounded page/row materialization. D page/row/metadata/queued notification bounds remain design obligations; aggregate probe overlap D10 must be included. |

## Completion

All 63 instantiated obligations have a scoped disposition above. Approve the
five-path N1/N2 source correction at exact 2de. Preserve D9's no-marker ordered
admission correction, and revise the full resource contract for the new probe
custody/credit transition D10. No other new blocking finding was established.
