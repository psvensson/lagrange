---
audience: development
documentClass: current
---

# Independent startup-lifetime review history

Date: 2026-10-22. Reviewer: `subagent:/root/opening_review`.

This record preserves the initial **REVISE** decision and the subsequent
**APPROVE** decision for the bounded startup-to-native source interaction.
Future source adjustments, final commit bindings and execution evidence must
be appended as new entries; they must not replace either decision below.

## Scope and governing inputs

The source base for both review rounds was
`7766ccafbe3767c9e397fabf97f41a197d7fb53e` on
`work/original-handoff-boundaries-20261021-cloud`. The candidate was an
uncommitted working-tree change. The reviewed source bytes are bound by the
20-file manifest below. No digest was recorded for the earlier rejected draft;
the corrected candidate's digest is not attributed retrospectively to it.

The review used the repository owner contracts and the current-main bounded
review policy: `docs/steering/rules.md`, `docs/steering/router.md`,
`docs/development/quest-subagents.md` and the applicable admission/gating,
recovery/replay, concurrency/serialization, harness-fidelity and owner-interaction
verification templates. The governing main revision supplied for this work was
`0146e1f4`, incorporating the revision-4 steering change from
`a75050381a582475450441d812ca4e8e54bca6d3`.

The implementation correspondence remains the existing quest package,
particularly `design.md`,
`evidence/CONTINUATION-boundaries-2026-10-21.md`,
`evidence/pre-source-owner-correspondence-2026-10-21.md`,
`evidence/pre-source-r1-r2-correction-2026-10-21.md`,
`evidence/independent-r1-r2-correction-review-2026-10-21.md` and
`evidence/pre-source-preparation-custody-addendum-2026-10-21.md`.

The approved implementation ceiling is an **unmerged, explicitly unavailable
WIP startup-to-native boundary**. It establishes the existing preparation owner
as the startup attempt lifetime; requires the same authority at queue admission
and actual service/native construction; revokes synchronously; and retains exact
cleanup custody. Fresh startup must HOLD before elections or ordinary legacy
publication. A retained declaration must HOLD before writable/native recovery
until the real retained-command classifier exists. The HTTP bootstrap API stays
uninitialized, and seed router infrastructure remains listenerless.

Neither review decision claims a complete startup handoff, serving, classified
retained-command replay, protected activation, durable transfer, complete public
admission exclusion, or the composed two-start proof. All eight handoff receipts
remain unchanged. There is no approval to merge this unavailable WIP to `main`.

The earlier approval of the lower-level opening and lifecycle-participation
mechanisms remains applicable. Lab #735's reported six files and 58 passing
tests are evidence for its exact `7766ccaf` source revision. This review did not
query that run independently, execute tests, or count those results as evidence
that the new startup wiring passes.

## Entry 1 — initial source review: REVISE

The initial review inspected the complete proposed interaction, including
`src/bootstrap/seed-original-allocation-startup.js`, the service and phase
wiring, the actual message-group/partition constructors and operation-port
boundary, cleanup owners, router and reconciler acquisition, and the original
14-case witness source. Four material findings were returned together.

### F1 — High: message-group custody after successful but revoked initialization

In `SeedMessageGroupsPhase.createBootstrapMessageGroupReplica`, the draft
awaited `initializeRegisteredMessageGroup`, asserted the original attempt was
still current, and only then put the service in `messageGroupServices`.
`initializeRegisteredMessageGroup` retained an object on cleanup failure, but
did not retain a successfully initialized object for its caller. Revocation
while that successful initialization was pending could therefore make the
post-await assertion throw while the real native resource and registered
handler were absent from the startup host's cleanup map.

Failed contract: every acquired resource must remain in exact cleanup custody,
including a successful acquisition whose startup continuation is refused.

Required repair: retain the exact service in the existing host map before
handler registration and before the initialization await. A focused witness
must hold a real native initialization completion across revocation and show
both refusal and eventual exact cleanup.

### F2 — High: partition map presence reported as successful CREATE

In `SeedPartitionsPhase.createBootstrapPartitionReplica`, both the initial and
post-stagger checks returned `CREATED` from `partitionServices.has(replicaId)`.
The draft had correctly moved partition custody into that map before awaiting
initialization, so map presence could now identify an initializing, failed or
shutting-down service. A repeated creation could report success without a
settled valid runtime.

Failed contract: resource custody is not a successful creation receipt. A
pending or failed exact instance must retain its obligation without being
classified as a successfully created replica.

Required repair: use the existing service initialization/shutdown state at one
post-stagger decision, with renewed original admission. Already-present
resources may skip the delay, but only settled valid resources may return
`CREATED`. Pending or failed resources need a typed existing-owner refusal.

### F3 — Medium, blocking: schema correspondence did not reach actual DDL

`RaftRsOriginalAllocationPreparation.admitReplica` bound member identity,
service kind, group, path, membership and peer addresses, but retained the
caller's nested `schema` object. The partition constructor consumed that schema,
and `createPartitionServiceTable` used it for SQLite DDL before opening the
native port. A valid member could therefore be queued with a different schema,
or with a schema mutated after queue admission.

Failed contract: the exact original catalog member must determine the actual
construction inputs, including its state-table schema. Correct native identity
does not establish that preceding DDL used the declared catalog.

Required repair: obtain the schema through the existing catalog owner, validate
any caller-supplied schema, and return an owned immutable copy. The repair must
not create a second schema catalog. Evidence must distinguish refusal before
DDL from later native refusal and exercise mutation after valid queueing.

### F4 — Medium, blocking: asynchronous infrastructure acquisition escaped shutdown

`SeedInfrastructurePhase` published its router only after
`MessageRouterSetup.create` completed. The shared
`StartupServiceLifecycleOwner` published its reconciler only after
`ServiceReconciler.start` completed, although `start` had already armed its
cadence and awaited initial reconciliation. A concurrent direct
`BootstrapService.shutdown` could finish its inspection and cleanup while
either acquisition was pending; delayed completion could then publish an
unclosed resource after cleanup.

Failed contract: shutdown must retain and settle exact acquisitions already
started. A post-await currentness assertion alone prevents continuation but
does not close an acquired router or reconciler.

Required repair: retain acquired infrastructure before asynchronous
initialization/start and join its acquisition settlement before clearing the
host fields. Preserve exact failed-close custody for retry. The scenario is
the supported asynchronous acquisition/direct-shutdown interaction; it does
not assert that public `awaitStartupAcquisition` races its awaited promise
against abort.

### Unaffected initial dispositions

No further blocker was identified in establishing the one preparation lifetime
from actual directory custody, build-measurement ordering, queue checks before
desired-state publication, token propagation to the final native check,
synchronous revocation, typed primary-cause propagation, or the explicit
listenerless/continuation HOLD boundary. Those findings were retained for the
re-review. Completing the later classifier/activation/transfer design was not
made a condition of approving this narrower source unit.

## Entry 2 — corrected source re-review: APPROVE

Verdict: **APPROVE the bounded source checkpoint** identified by the 20-file
manifest below. All four source findings were resolved. No further material
defect was found in the repairs or their affected startup, construction and
cleanup interactions. This is independent source approval at the stated
ceiling, not a passing test result, a static-gate waiver, a landing receipt or
approval of a future changed candidate.

### Finding resolutions

1. **F1 resolved — exact MG custody.**
   `src/bootstrap/phases/seed-message-groups-phase.js:149-186` constructs and
   retains the service in `messageGroupServices` before registering its handler
   or awaiting initialization. The post-await currentness check can reject
   without abandoning that instance. Existing cleanup closes the actual service
   and retires its exact handler.
2. **F2 resolved — actual settled-state classification.**
   `src/bootstrap/phases/seed-partitions-phase.js:212-236` renews admission after
   the optional stagger and requires an existing service to be initialized and
   not shut down. Otherwise it returns the original owner's typed `RESOURCE`
   refusal. Lines288-295 retain a newly constructed partition before its await.
   The MG creator likewise uses one post-stagger settled-state decision through
   the existing `messageGroupCreationAlreadySettled` helper.
3. **F3 resolved — owned canonical schema.**
   `src/raft/raft-rs-original-allocation-preparation.js:297-331` obtains the schema
   with `getSchemaByTableName`, uses `structuredClone` plus `deepFreeze`, validates
   any supplied schema and returns that owned value. The actual partition
   constructor consumes it. The inspected existing table-bootstrap code reads
   the schema without mutating it; no duplicate catalog was added.
4. **F4 resolved — retained and joined infrastructure acquisition.**
   `src/bootstrap/shared/message-router-setup.js:149-164` transfers router custody
   immediately after construction. The seed phase tracks router/lifecycle
   acquisition settlements, uses private acquisition helpers, checks currentness
   after acquisition and does not republish a router after awaiting it
   (`src/bootstrap/phases/seed-infrastructure-phase.js:209-279`). Both cleanup
   entries revoke and join those settlements before teardown
   (`src/bootstrap/phases/seed-cleanup-handler.js:130-133,518-528`). The shared
   lifecycle owner retains its reconciler before `start` and shares concurrent
   initialization through one settlement
   (`src/bootstrap/shared/startup-service-lifecycle-owner.js:21-30,70-87`).

### Category-complete affected-surface disposition

| Category | Re-review disposition and evidence ceiling |
| --- | --- |
| Ownership and authority | One existing preparation owner remains the startup lifetime. Real directory custody is threaded through the public seed acquisition path. No new grant ledger or resource owner was introduced. |
| Admission and identity | Queue admission precedes desired-state/map publication. Exact member, service/group, path, peers, canonical schema and token remain bound. Creators renew admission after stagger waits. Existing successful instances are distinguished from cleanup debt. |
| Native construction and reentrancy | The owned service field carries the opaque token into the actual operation-port request. The previously approved final native admission/durable-right recheck remains unchanged. Ordinary services without the marker retain the original request path. No broader arbitrary-hostile-intrinsics claim is made. |
| Concurrency and acquisition | MG and partition custody precedes initialization. Router/lifecycle acquisition is retained before it can yield and seed cleanup joins its settlement. The shared lifecycle owner prevents duplicate concurrent initialization. |
| Revocation, cleanup and retry | Startup shutdown and both failure-cleanup entries revoke synchronously. Existing exact service maps and preparation custody retain failed releases. A rejected continuation cannot erase the object requiring cleanup. A retry settles the same retained object. |
| Transport and public admission | The seed router has local routing without a WebSocket listener or self-connection. The HTTP bootstrap API remains uninitialized before successful bootstrap. Reviewed transport-opening entry points hold. This does not claim a completed general public-ingress fence. |
| Timers and reconciliation | Initial reconciler acquisition is retained before `start` arms its cadence. Cleanup joins the initial acquisition before stopping/clearing its owners. The actual cadence is exercised by a focused witness; no timer-elapsed success threshold substitutes for settlement. |
| Recovery and publication | Retained declarations still stop before writable/native recovery while the application classifier is absent. Fresh original attempts hold before elections, ordinary registration and successful completion. UNUSED publication rights cannot be justified by claiming this checkpoint already implements activation or transfer. |
| Harness fidelity and evidence binding | The seven appended witnesses use actual native/SQLite resources and real router/reconciler methods, with controlled awaits or injected release failure at the relevant boundary. The original 14-case prefix is byte-for-byte unchanged. Tests were inspected, not executed by this reviewer. Earlier #735 results are not added to any new test total. |

### Witnesses inspected

The seven appended tests in
`test/bootstrap/seed-original-attempt-lifetime.test.js:432-756` cover:

- successful actual native MG initialization whose completion loses to
  revocation, retaining the exact runtime through cleanup;
- an initializing actual native partition versus the same valid settled
  runtime, with no second native construction;
- partition initialization failure retained as exact cleanup debt, rejecting
  a successful-CREATE retry;
- changed SERVICES schema refusal before queue publication/DDL, followed by
  post-admission caller mutation and inspection of actual SQLite columns;
- acquired real router initialization held across shutdown, with shutdown
  joining acquisition and closing the retained router;
- the actual reconciler's initial read held across shutdown, including
  retirement of its real cadence;
- router close rejection retaining the exact object, followed by retry through
  the existing cleanup owner and successful real release.

The native cleanup witnesses inspect the actual database's closed state, port
refusal, exact handler retirement and one native `free` operation. They do not
replace these observations with a mocked final lifecycle boolean. Controlled
methods call the actual implementation; they do not supply a permissive
original authority or fake successful consensus object.

The original 14 cases already cover queue-before-preparation refusal, exact
option mismatches, concurrent preparation, abort during build measurement,
listenerless real infrastructure, real MG/partition construction, direct MG
creation, revocation during both staggered creator paths, synchronous shutdown
revocation, early failure cleanup, missing direct-start authority, retained
declaration HOLD and continuation entry-point HOLD. Positive constructor tests
enter the real internal prepare/queue/create route; they are not described as
the completed public two-start proof.

## Reviewed content fingerprints

The source approval was issued with HEAD at
`7766ccafbe3767c9e397fabf97f41a197d7fb53e`. At persistence, HEAD was the
test-only baseline commit `3fa20cefeca622ec2060509903a921979d32a082`.
Recalculation produced the same 20-file production manifest and complete
witness digest. The later final source-commit binding must be appended
separately; it is not inferred from either baseline commit.

| Input | Bytes/count | SHA-256 |
| --- | --- | --- |
| Production content manifest | 20 files | `1622d6133efa47a6e4b6c0d42b13e480abd31567b9b691f1a0bd5929ed2d6078` |
| Original 14-case witness prefix | First 20,600 bytes | `e4afdcabc63bd3397b992978a5cdaa7da136122d4802eb203482b3e975a72790` |
| Complete 21-case witness file | 35,489 bytes | `3ef091d21e2e67af4ae40f06e6061fa1334f29a88583a6aa4a5d9547584018c7` |

### Exact production manifest

Each line below is the lowercase SHA-256 of the raw file bytes, two ASCII
spaces, the repository-relative path, and a single LF. Paths are sorted
lexicographically. The manifest digest covers the UTF-8 encoding of all 20
lines, including the final LF; it does not cover the Markdown fences.

```text
7a76c30217a6004a1910bdb5f4583327d83200eea923ce7adb830f5bb7b47678  src/bootstrap/bootstrap-service-runtime-methods.js
1a6b8cb5ac638bda4cc2563f64a11f3f31f5a04d336fc1b422f9fd30109248e7  src/bootstrap/bootstrap-service-seed-delegates.js
33e082713d3628a426812dd1e91c5f9028b3fb200bef463ec5c213021f434bc0  src/bootstrap/bootstrap-service-seed-workflow.js
f5754e64dfc26fb5a6a4e0dadbde3b78c0f57de47b1119881c3367d590e6027e  src/bootstrap/bootstrap-service.js
7b997644d9f652b68eb218bb10403b6a70d340dcf1a86c36ee8a1852e05c071b  src/bootstrap/phases/seed-cleanup-handler.js
a4b76aa1929b710bdfcc529c51f2ce5730c97b40b657dc717c64017343bb5eda  src/bootstrap/phases/seed-infrastructure-phase.js
977ab3c7d43d2cb39d512d1f2bcde68e291f5af5cee9abee0ca89036ce03742e  src/bootstrap/phases/seed-message-groups-phase.js
b471ae0609f86b55910fd7871c6dc610a6f7d117ec1f59615692c6cfe8c44295  src/bootstrap/phases/seed-partitions-phase.js
563191ad0e5229f666ed67f27c46abc30f1d50c6459e70363834474506ca854d  src/bootstrap/phases/seed-registration-phase.js
50871a6b761c74a23b055b5816067fc73ca6f8f9fbaef6e5f24c25f53b58d7f0  src/bootstrap/rejoin-hints-constants.js
9b19e25b6e14bb29d46f1c464c9ddaf0fd281abdf29de5e63e75419d101f6d84  src/bootstrap/seed-original-allocation-declaration.js
3e8191748e0518c93de9beeb00ade353ba2ea035dd67dd4412c871a62a5c07a9  src/bootstrap/seed-original-allocation-startup.js
0251304bc1b171830cf6f8443a2fe096c70bf27b52d1ebb1ba12865e941b81ee  src/bootstrap/shared/message-router-setup.js
13c174ba6069b42a6c02e13db036f41cd93e387f0fbba6f5a961566c57f76292  src/bootstrap/shared/startup-service-lifecycle-owner.js
5e77f5a3df927035c2f42ffc716cb75d717a4b618c4cfa1cf7691af21f4bcad0  src/lagrange-runtime-startup.js
bb25869c9df7ec2e503ca630eb9ef8f3b836a9dac45b83a0a938b811d80e4d7b  src/message-group/message-group-service-state.js
8bb57d46b372ab7b820e3a394c478e5b3cfb9eb444f6818e9385ac78ac1e292c  src/node/participant-release-authorization-owner.js
c053e51babbc39da8cac679d6135acff8e2deadf261a6217ac01c8800765d4a6  src/partition/partition-service-core-base.js
583de2ceba2f045f7d7a00d075d2b0e430269d24a8ee4b15b9a45b8472b38a81  src/raft/raft-rs-original-allocation-constants.js
f77bb57ba14b0563871431bdb51e5185670fff2bf871f71c59203a6a64a00d3f  src/raft/raft-rs-original-allocation-preparation.js
```

### Exact hashing procedure used

The following Python was run from the repository root. At the reviewed moment,
all 19 tracked source modifications were unstaged, and the startup helper was
the one untracked source file. `git diff --name-only -- src/` therefore selected
those 19 tracked paths; `git ls-files --others --exclude-standard -- src/`
added the new helper. This selection procedure describes that review state.
After staging or committing, reproduce the content digest from the explicit
20 paths above rather than assuming the working diff still selects them.

```python
from pathlib import Path
import hashlib
import subprocess

paths = subprocess.check_output(
    ['git', 'diff', '--name-only', '--', 'src/'], text=True
).splitlines()
paths += [
    p for p in subprocess.check_output(
        ['git', 'ls-files', '--others', '--exclude-standard', '--', 'src/'],
        text=True,
    ).splitlines() if p not in paths
]
paths = sorted(paths)
manifest = ''.join(
    f'{hashlib.sha256(Path(p).read_bytes()).hexdigest()}  {p}\n'
    for p in paths
)
production_manifest_sha256 = hashlib.sha256(manifest.encode()).hexdigest()
witness = Path('test/bootstrap/seed-original-attempt-lifetime.test.js').read_bytes()
original_14_sha256 = hashlib.sha256(witness[:20600]).hexdigest()
complete_21_sha256 = hashlib.sha256(witness).hexdigest()
```

## Outstanding gates and next binding

At source approval, the new 21-case test file had not been run. The reviewer
made no production/test edits and ran no runtime tests. Test execution,
metadata/static verification and any final commit binding remain separate
evidence obligations for the integration owner.

The integration owner subsequently reported two static findings: the optional
router-retention call increased `MessageRouterSetup.create` complexity from 12
to 13, and a mixed cache/SQL decision-boundary finding was measured on both
`7766ccaf` and the current partition phase. These are owner-reported findings,
not independent passing checks from this review. No baseline relaxation or
green static claim is approved here. A source adjustment addressing them needs
its own bounded delta review and appended content binding; unaffected
approvals and both history entries above remain preserved.

## Entry 3 — physical-router helper delta: APPROVE

Date: 2026-10-22. Reviewer: `subagent:/root/opening_review`.

Verdict: **APPROVE the bounded source delta and retain Entry 2's source
approval for the updated manifest below.** The integration owner made one
source adjustment after Entry 2: the existing physical constructor selection
in `src/bootstrap/shared/message-router-setup.js` now lives in the named,
synchronous `createPhysicalMessageRouter(routerFactory, options)` helper.
Independent comparison against every line of Entry 2's production manifest
confirmed that this was the only changed production file. The witness bytes
also remained unchanged.

The helper preserves the existing choice: call the supplied physical factory
when it is a function, otherwise construct the real `MessageRouter`. Both
paths remain synchronous and receive the same options. There is no inserted
await, callback, catch, publication, retry or authority decision between
construction and return. `retainRouter` still runs immediately after the
returned instance is assigned in `MessageRouterSetup.create`, before resolver
configuration, registry attachment or initialization. The setup method retains
semantic configuration and the seed retains cleanup custody. Thus the
extraction uses the existing physical-substitution boundary without reopening
F4 or introducing a new owner. No additional material defect was found.

This approval is source review only. The integration owner reported successful
scoped ESLint, complexity and diff checks, including the complexity change from
13 to 12. This reviewer did not independently execute those checks or any
runtime tests. The previously reported mixed cache/SQL decision-boundary
finding remains outside those reported successful scoped checks and is not
waived by this entry. The broader evidence ceiling and all eight unchanged
receipts remain exactly as stated above.

### Updated content binding

The 20-file manifest is exactly Entry 2's manifest with this one line
substituted in place, retaining the same path order, two-space delimiter and
final LF:

```text
5e9c42a9cde9b874e30501211a2487f08438168b63dcd7259f785be3de6a79ad  src/bootstrap/shared/message-router-setup.js
```

- Updated production manifest SHA-256:
  `550cd6fbe3c5a982933066921cfdf691228cfa45765fc8036efd6bce2985fdae`.
- Replaced router file SHA-256:
  `0251304bc1b171830cf6f8443a2fe096c70bf27b52d1ebb1ba12865e941b81ee`.
- Unchanged original 14-case prefix SHA-256:
  `e4afdcabc63bd3397b992978a5cdaa7da136122d4802eb203482b3e975a72790`.
- Unchanged complete 21-case file SHA-256:
  `3ef091d21e2e67af4ae40f06e6061fa1334f29a88583a6aa4a5d9547584018c7`.

Reverification read the explicit 20 paths from Entry 2's manifest, hashed each
file's raw bytes, reconstructed the manifest using the identical serialization,
and hashed its UTF-8 bytes. It also recomputed both witness hashes. Independent
`git diff --quiet 7766ccafbe3767c9e397fabf97f41a197d7fb53e
3fa20cefeca622ec2060509903a921979d32a082 -- src/` returned zero, confirming that
the test-only baseline did not change the source tree. Final committed-source
binding and runtime execution evidence still require separate appended records.

## Entry 4 — committed binding and narrow self-connection oracle correction

Date: 2026-10-22. Reviewer: `subagent:/root/opening_review`.

Verdict: **APPROVE the specified four-site witness correction and provenance
comment update before edits.** The bounded production-source approval remains
applicable. The measured candidate run remains RED. This entry does not claim
that the revised witness bytes have been inspected or executed; their exact
diff, digest and later result require a separate appended binding.

### Committed production and original witness binding

In the read-only follow-up to Entry 3, the reviewer independently read the Git
blobs at `7fa4d79ae0a2cdb806bf073f8cb3e0578b0d576f` and compared all 20 source
files against Entry 3's approved manifest. There were zero mismatches. The set
of changed production paths relative to `7766ccaf` also exactly matched those
20 files; no additional changed production path was present.

The committed production manifest therefore remains:
`550cd6fbe3c5a982933066921cfdf691228cfa45765fc8036efd6bce2985fdae`.

The committed 21-case witness at `7fa4d79a` was 35,489 bytes with SHA-256
`3ef091d21e2e67af4ae40f06e6061fa1334f29a88583a6aa4a5d9547584018c7`.
Its first 20,600 bytes exactly equalled the 14-case file in test-only baseline
`3fa20cefeca622ec2060509903a921979d32a082`, with SHA-256
`e4afdcabc63bd3397b992978a5cdaa7da136122d4802eb203482b3e975a72790`.
These are historical content bindings. They must not be relabelled as hashes of
the forthcoming corrected witness.

### Preserved candidate failure evidence

The integration owner supplied the complete candidate controller log as
`/workspace/scratch/fb19a647cca6/startup-candidate-7fa4-full.log`, corresponding
to lab #769 at `7fa4d79ae0a2cdb806bf073f8cb3e0578b0d576f`. The reviewer read the
log and independently verified its 21,297 bytes and SHA-256:
`c2116fe04a9e48a11919865b822d01a0e3f9cdb506a24f9f3d90c79365bd26ec`.

The runner reports **79 tests, 75 passing, four failing, zero cancelled, zero
skipped and zero todo**. All four failures are `ERR_ASSERTION` strict-equality
comparisons with actual `undefined` and expected `false` in the startup witness:

| Failing case | Original witness line | First failed observation |
| --- | --- | --- |
| Infrastructure requires an original attempt before lifecycle/listener setup | 238 | `router.hasSelfConnection()` strictly equals `false` |
| Continuation entry points hold elections, registration and public admission | 426 | `f.service.messageRouter.hasSelfConnection()` strictly equals `false` |
| Shutdown joins acquired router initialization | 667 | `router.hasSelfConnection()` strictly equals `false` |
| Shutdown joins initial reconciliation and retires cadence | 721 | `router.hasSelfConnection()` strictly equals `false` |

The continuation case failed during the first of its six loop iterations.
Consequently #769 does not establish the remaining five continuation calls or
the assertions following the failed comparison. In the other three failed
cases, assertions after their first failing comparison likewise remain
unmeasured on that run. Earlier reached assertions are not permission to mark
the whole case successful. The 75 passing cases and four failed cases remain
the result for the original exact witness; no corrected result is substituted
for that history.

The integration owner reported separate lab #770 metadata/fast-static PASS on
the same candidate and closure of the run scopes. That independent operation
does not make #769 green. This entry's direct verification is the supplied
complete runtime log and source/oracle correspondence; it does not substitute
for a separate final receipt/result review.

### Existing router contract and approved oracle

The unchanged `src/transport/message-router-delivery-behaviors.js:756-762`
reads `router.nodeConnections.get(router.nodeId)` and returns:

```javascript
connection &&
connection.isSelfConnection &&
connection.state === ConnectionState.CONNECTED
```

When the current node has no map entry, that expression returns `undefined`.
Existing owner witnesses already test falsiness for this state:
`test/bootstrap/shared/message-router-setup.test.js:81-82` explicitly describes
the falsy return, and `test/transport/message-router-tail-more-test-cases.js:440`
uses `notOk`. Thus the four new strict-Boolean assertions contradict the
existing absent-connection return contract. Their measured failures do not
require changing the production router merely to return a Boolean.

At exactly those four sites, approve replacing the strict `false` assertion
with this pair, using the actual router's own node identity:

```javascript
assert.ok(!router.hasSelfConnection());
assert.equal(router.nodeConnections.has(router.nodeId), false);
```

The continuation-loop site uses the corresponding
`f.service.messageRouter` expressions. The first assertion conforms to the
existing method contract. The added strict map assertion requires actual
absence of the current node's connection entry, excluding a disconnected or
otherwise nonqualifying retained entry. The strict `server === null` checks
remain. Together these observations retain the intended listenerless/cleaned-up
transport condition and make the absence requirement more explicit.

The authorized correction is limited to those four assertion sites and the
provenance comment. Queue admission, typed refusal, native-entry, durable-right,
resource-custody, shutdown-join, cadence and other cleanup assertions remain
unchanged. No source change, permissive authority, mocked consensus success,
skip, case deletion or expectation suppression is approved.

### Provenance and evidence ceiling after correction

The old comment at lines432-433 describes the preceding 14 cases as preserved
byte-for-byte. Two of the four approved corrections occur inside that prefix.
Revise the comment to point to the frozen historical versions in `3fa20cef`
and `7fa4d79a`; do not claim the revised prefix still equals those bytes. Preserve
the old prefix and complete-file hashes, baseline RED, candidate #769 RED,
full-log hash and separate #770 static result, then append the new witness
digest and measured result when available.

This oracle correction does not reopen an earlier source finding or change
the scope ceiling. It also does not establish unexecuted assertions by
reasoning alone. Runtime validation of the revised witness remains pending;
all eight handoff receipts remain unchanged. The reviewer made no source or
test edits and ran no runtime tests while assessing this correction.

## Entry 5 — exact revised witness delta and content binding: APPROVE

Date: 2026-10-22. Reviewer: `subagent:/root/opening_review`.

Verdict: **APPROVE the actual revised witness delta** in
`test/bootstrap/seed-original-attempt-lifetime.test.js`, bound below. The
reviewer independently inspected its diff against committed `7fa4d79a` and
reconstructed the entire revised file from the old bytes using exactly the
three plain-router assertion replacements, the one service-router assertion
replacement, and the provenance-comment replacement approved in Entry 4.
The reconstructed bytes exactly equalled the working file. No other witness
bytes changed.

At each site the new pair tests the existing predicate's falsiness and strictly
requires `nodeConnections.has(router.nodeId) === false` on that same router.
All strict server-absence, refusal, native, durable-right, custody, cadence and
other cleanup assertions remain unchanged. The comment accurately preserves
the old versions in historical commits without claiming that the revised
14-case prefix is byte-identical to them. The earlier owner-contract and
oracle-strength approval therefore applies to these exact bytes.

### Revised witness fingerprints

| Input | Bytes | Binding |
| --- | --- | --- |
| Revised complete 21-case file | 35,941 | SHA-256 `2421740ecafb0c9dcb457be3e1ef8286321645a426d23f7814d2d9a91d1e086f` |
| Revised complete file Git blob | 35,941 | `e87f872e32cca602d1055e6514437d49ec36ec10` |
| Revised file's first 20,600 bytes | 20,600 | SHA-256 `bad72ffc8cfc36555d27e30e754e0237390f4985a6472022e3d11391e1adf5ab` |

The last row is only a same-length prefix comparison. After inserted assertion
lines, those first 20,600 bytes are not a claim about the complete boundary of
the revised 14 cases. The historical 14-case prefix remains
`e4afdcabc63bd3397b992978a5cdaa7da136122d4802eb203482b3e975a72790`
in `3fa20cef` and `7fa4d79a`. The historical complete 21-case file remains
`3ef091d21e2e67af4ae40f06e6061fa1334f29a88583a6aa4a5d9547584018c7`
in `7fa4d79a`. Neither historical hash is reused for the corrected file.

### Selected baseline cases remain unchanged

The reviewer independently compared both complete selected case source blocks
across baseline `3fa20cefeca622ec2060509903a921979d32a082`, candidate
`7fa4d79ae0a2cdb806bf073f8cb3e0578b0d576f` and the revised working file. Both
were byte-for-byte identical in all three versions:

| Case | Block bytes | SHA-256 |
| --- | --- | --- |
| `BootstrapService prepares one live original attempt before either creation catalog mutates` | 1,531 | `85ed87038836d9a5c7614cd520478ba75e41438473deb44ef00ee31a16aac7f4` |
| `direct message-group creation cannot bypass BootstrapService attempt ownership` | 905 | `746b615adbe3cf1a504ab6f725b92894b6683d4b2dcec5f7cb2eac60456a663d` |

For this comparison, each block starts at its named top-level `test(` opening
and ends immediately before the next top-level `test(` or `for (` opening,
including intervening trailing whitespace. This binds the complete case body,
including its original required-refusal assertion and later positive control.

### Unchanged source and remaining execution gate

Independent `git diff --quiet 7fa4d79ae0a2cdb806bf073f8cb3e0578b0d576f -- src/`
returned zero. Rehashing the approved 20 production paths again produced
`550cd6fbe3c5a982933066921cfdf691228cfa45765fc8036efd6bce2985fdae`.
The production-source approval and scope ceiling remain unchanged.

The revised witness has not been executed in this review. Candidate #769's
75-pass/four-fail result and its unmeasured later assertions remain preserved
in Entry 4. The integration owner may bind the next commit to these reviewed
bytes; a successful runtime result is a separate outstanding gate. The reviewer
wrote only this appended evidence entry and did not edit source/tests, run
runtime tests or mutate GitHub state.
