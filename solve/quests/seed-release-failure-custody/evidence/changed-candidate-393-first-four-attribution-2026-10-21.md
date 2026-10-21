---
audience: development
documentClass: current
---

# First four relevant failures: frozen 393 candidate

Read-only triage, 2026-10-21, subagent physical_custody_review.
Measured candidate: `393f411ca09449898465cc3cb7320c03fba2aba8`.
Requested predecessor: `847c36a31ea3e84880dbf5e16b7e4ffb81cdd3eb`.
The five-host 1,261-file run was still active during this read. This is neither
its final result nor a classification of all red files. Primary HEAD advanced
to documentation checkpoint `a1d004f31fca54354570f00e74b519ba9f027d28`;
`git diff 393... -- src scripts test` was empty. No source/test/receipt edits,
reruns, native execution, fetching, staging or commits were performed here.
Only this additive note was written.

Raw source: `test-output/seed-release-custody/changed-candidate-393f411ca/controller.log`.
Line references below are to its already-written prefix; the active full log
is deliberately not represented by a final hash. Root owns final log preservation.
**All four remain current failures.** Byte equality and historical observations
do not establish same-host predecessor behavior, waive obligations or permit
claiming these failures inherited from the requested predecessor.

| Test | Actual first material result | Engagement and limit | Minimum matched comparison |
| --- | --- | --- | --- |
| `test/config/code-path-uniqueness.property.test.js` | :259 expects zero flagged files, observes five; controller :2026-2062 | Raw ENABLE substring scanner, not proof of executable feature toggles | Exact847 and393 on adam-laptop |
| `test/node/replica-handler-owner-path-bypass.test.js` | First child unfinished, waiting at :226 after INITIATED and SYNCING; controller :4946-4980 | No ACTIVE/emitter/no-direct-write assertions reached. Later cannot-create-subtest errors are cascades | Exact847 and393 on adam-laptop |
| `test/node/replica-create-admission-recovery.test.js` | Child2 cancelled with pending promise/event-loop-resolved, waiting at :315; controller :1284-1333 | Child1 passes. Actual physical factory starts and SYNCING occurs, then logged semantic Raft status unavailable. Later cancelled cases are cascades | Exact847 and393 on adams-gamla |
| `test/message-group/message-group-native-custody-handoff.test.js` | :146 expects one exact recipient proposal, observes zero; controller :874-901 | Real source write/CDC debt engaged; recipient proposal and later loss/rejoin/custody assertions not reached | Exact847 and393 on adams-gamla |

## Source-bound discrimination

**Scanner.** `checkForFeatureFlags` at test:75-122 scans raw text with
`/ENABLE_\w+(?!_LOG|_DEBUG|_TRACE)/gi` at :82. Current list is
`ENABLE_REFUSED` in participant-release caller/outcome constants;
`ENABLE_PHASES` substrings inside `OPENABLE_PHASES` in WASM opening; and
`ENABLE_FAILED` in `SERVING_ENABLE_FAILED` references/constants. The all-files
assertion :254-261 returns five. Relevant references are
`src/node/replica-handler-participant-release.js:212`,
`src/partition/partition-participant-transaction-cutover-constants.js:25`,
`src/wasm-service/wasm-creation-opening.js:51,226`,
`src/wasm-service/wasm-creation-publication.js:87`, and
`src/wasm-service/wasm-service-constants.js:126`. These are named state/phase
vocabulary, not source evidence of runtime feature switches. Test and all five
source blobs are unchanged847->393. Preserve the no-core-toggle requirement;
any later scanner repair needs semantic executable-toggle controls, no filename
whitelist, enum deletion or baseline relaxation.

**Owner-path CREATE.** Test factory:130-137 supplies only identities,
initialized/shutdown/sync methods plus the exact-handler helper. The helper
`test/test-helpers/replica-handler-identity-fixture.js:76-93` supplies transport
identity, not a semantic Raft runtime or participant release proof. First child
:204-226 awaits CREATED/CREATION_FAILED after successful INITIATED. Its current
log exposes only SYNCING before unfinished, so the precise unresolved await
inside the production operation is not measured by this log. The unchanged
create path `src/node/replica-handler-create-methods.js:405-415` awaits fresh
participant release before ACTIVE :422-426. Missing semantic runtime is a
concrete fixture-contract suspect, not a proven current causal diagnosis.
The owner-path admission wrapper is also unchanged. Do not count later parent
termination errors as independently failed owner interactions.

**Retained CREATE.** Fixture:236-246 returns a bare initialized follower with
shutdown/sync methods and handler identity; it has no raft.readStatus. Test
:308-315 observes one physical start, releases its factory gate, then waits for
the completion event. The log actually reports `release_fact_unavailable`,
`missingFact: semantic_raft_status`, `reason: semantic raft status unavailable`
before cancellation. `src/node/replica-handler-release-recovery.js:58-83`
classifies missing semantic status; this observed refusal does not prove safety
or a complete recovery. The tests/fixture/create path are unchanged, but
releaseFreshCreate and its client completion ownership changed in393. Thus
preserved original-source timing witnesses do not substitute for the requested
full same-host comparison. No timeout change or synthetic successful release
may be used to erase this failure.

**Native CDC custody.** Producer test:129-133 submits type INSERT with SQL/params
and no data. Current diagnostic shows a committed source row with the requested
key/value and an owed durable event whose data contains only updated_at_hlc,
not config_key. Source record commit/applied=5; source obligation delivered=false;
recipient records contain only entry1, no held envelopes or recipient row.
Delivery reports held_by_subscriber/committed_entry and retryArmed=true; the
explicit flush is empty. These facts show retained source debt at this cut,
not a demonstrated lost obligation. The requested post-proposal suffix-loss
experiment never starts.

The unchanged CDC generator extracts `entry.data || {}` at
`src/partition/partition-cdc-generator.js:340-355` and extracts SQL parameters
only for type QUERY at :357-368. The fixture's INSERT-with-params shape therefore
already explains the missing key in generated event data at the source boundary.
It does not, alone, prove why no recipient proposal was reached: selection,
readiness, propagation or missing-data rejection must be observed separately.
The subscriber calls its beforePropagation hook before selection/readiness
(`src/bootstrap/shared/partition-cdc-propagation-subscriber.js:198-223`), so that
single logged hook is not evidence of actual topology fanout. The bridge body
`seed-runtime-bridge-owner.js:199-215` forwards event data unchanged and is
unchanged847->393 despite the file's new exact SQL-engine release method.
The directly used transport registration file differs only by extracting two
existing cleanup literals; the recipient fixture uses its existing registration
function at :109, not a new cleanup path. Do not turn this limited correspondence
into a full dependency-tree equivalence or current historical-failure verdict.

## Historical references, no present waiver

- Read via Git only: `bdc94775708e357c5b0129fded70be4cea48079b:solve/epics/raft-rs-full-cutover/historical-failure-ledger-2026-10-20.md:60-70`.
  It records the same five scanner matches and hosted Actions run39438868937,
  and explicitly recommends semantic scanner proof. Its record is not imported
  or rerun, and this task did not revalidate the external run.
- Current preserved `solve/epics/raft-rs-full-cutover/composition-report-2026-10-17.md:198-212`
  records the same native-custody0/1 assertion and CREATE cancellation mode in
  a different candidate/lane comparison. Its historical classification remains
  scoped to those heads/hosts. The linked verifier record also retains them at
  `composition-verifier-verdict-2026-10-17.md:98-99,137,196`.
- Ledger119/1898 and115 predecessor overlaps are historical file observations;
  they neither explain these four current causes nor certify a clean baseline.

## Smallest measured next selection

After the active broad run completes and its unique evidence is copied, use
canonical locked-lab APIs with matching dependencies/retries0. Preserve the
full current failure outputs first. Run both exact SHAs on each original host:

- adam-laptop: scanner + owner-path-bypass (two files).
- adams-gamla: retained CREATE admission + native CDC custody (two files).

The existing broad393 result is the first candidate observation. A paired
same-host focused393 observation removes placement/crowding differences from
an isolated847 comparison; retain every result rather than selecting a green
rerun. If root uses a different available host, run both SHAs on that same host
and label the original placement difference. Neither inherited-by-comparison
nor candidate-only failure can be determined from the current read alone.
Keep source/test bytes frozen for this comparison. If unresolved-stage
instrumentation becomes necessary, use a separate reviewed diagnostic attempt
with its own exact bytes; do not alter the baseline measurement or infer a
runtime mutation kill from static reasoning.

## Exact Git blob correspondence

`same` means the entire file is byte-identical at847 and393. It does not assert
that all transitive owners, dependencies, scheduling or environment match.

| Path | 847 blob | 393 blob |
| --- | --- | --- |
| `test/config/code-path-uniqueness.property.test.js` | `8d59c5a36a4de8ee887245292ff764a5a0b91abb` | same |
| `test/node/replica-handler-owner-path-bypass.test.js` | `7e271541e4a4b3ae59eb0a43284d6a1120a14413` | same |
| `test/node/replica-create-admission-recovery.test.js` | `a03596fb1d44a8f7c6b68ae37ba4ed190f99e662` | same |
| `test/message-group/message-group-native-custody-handoff.test.js` | `42309a81432a22a04e453c0cc600fea5983095e6` | same |
| `test/node/replica-handler-owner-path-admission-fixture.js` | `9e185f2110d1c9bd13a2f045de1c374a418529de` | same |
| `test/test-helpers/replica-handler-identity-fixture.js` | `d07be32eb06d6d82975b9da2781faa678c8829d2` | same |
| `test/message-group/message-group-native-custody-fixture.js` | `ae6779d8c33b087ac2902e40aa77495713ac3c37` | same |
| `src/node/replica-handler-create-methods.js` | `679524b4daf1f36e0b2f9dc820ce4b641b979a55` | same |
| `src/node/replica-handler-release-recovery.js` | `2adfab4f12de051e50754611365a9ec65faf45a9` | `5c8a5762b0a79fdfcbac1df5cadd626f85cfd1be` |
| `src/node/participant-release-client.js` | `7f9ee02e34df436f6fb30c901601fc2e010c2601` | `173627a0f95910020dbb3d6e14332f227c901c5c` |
| `src/node/replica-handler-participant-release.js` | `f5d911e5bb52159c696262b33131fb64f0bdaa8c` | same |
| `src/partition/partition-participant-transaction-cutover-constants.js` | `b2fde9c0ca00284bb7372d5c291f1cc263056f13` | same |
| `src/wasm-service/wasm-creation-opening.js` | `883a724fa069df65031f7a96e02978256d7e09fb` | same |
| `src/wasm-service/wasm-creation-publication.js` | `05d5a1e244a3802457cb8363960dccafafcc489b` | same |
| `src/wasm-service/wasm-service-constants.js` | `a7eb078c9f625091113e186a6d9fdeaefa2d626f` | same |
| `src/bootstrap/owners/seed-runtime-bridge-owner.js` | `778ddd07cca6faec8686ec02faefd43253ee76a1` | `21ed5486039e23c9dc9814b6c0a77f188e7ae3d7` |
| `src/bootstrap/shared/message-group-transport-handler.js` | `8c8b74cb41e1d11992bde39a048e9dc25bd327e1` | `4dbb027a938e7a17b8cf2c096c780b1fe6da01eb` |
| `src/bootstrap/shared/partition-cdc-propagation-subscriber.js` | `8c3f02fe4440f6f772ac8ba6878c380652111199` | same |
| `src/partition/partition-cdc-generator.js` | `81b3ca81a1e0991a2d7265980ad86cfa81e01118` | same |
| `src/message-group/message-group-service.js` | `cdff336502fec05723082bfcadabfde925cd2252` | same |
| `src/topology/cdc-group-propagation-service.js` | `55b4456a45eec93579bdf233f7ef77a1c8c6df71` | same |
