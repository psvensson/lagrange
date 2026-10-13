# C2 proof-harness refit addendum

## Status and boundary

This is a proposed proof-harness correction for independent review. It does
not change the sealed Quest statement, the selected C2 source subtraction, or
any production policy. No test or fixture change is authorized by this
document alone.

The proposal binds the locked d35 baseline recorded in
`evidence/baseline-d35-lab-result.json` (SHA-256
`42bab4db045f22f24af27da4780caf85f15f18688cb2ae9a2a40c7f83bfb741c`):
eleven current C2 witnesses reported 434 assertions, eight files passed, and
three files were red. The three reds occurred before their intended proof
completed:

- `test/rebalancer/message-group-membership-branch-authorization.test.js`
  reported 90 assertions with 21 failed cases because the supplied learner
  fact was rejected before the branch CAS;
- `test/convergence/dt6-learner-promotion-progress-proof.test.js` reported 30
  assertions after its bodies ran, then failed exact handler retirement during
  fixture shutdown;
- `test/integration/message-group-membership-claim-cache.integration.test.js`
  reported one assertion because seed bootstrap stopped with `Seed participant
  release authority unavailable` before its T1 SQL/Raft/CDC/cache cases.

Those setup and cleanup failures are system harness defects. They are not
semantic proof of the branch, lifecycle, or claim-cache behavior. The refits
below preserve every existing assertion and timeout. The baseline count is a
provenance fact, not a candidate assertion-count target: the cache test must
execute assertions that the baseline never reached, and direct fixture safety
checks are added.

The four C2 production paths remain frozen. Their current binary diff from
`d35d8828c630d1b9675b47f511c477b3cc9ee991` has SHA-256
`d982b26235430dfbfa92fa594c5d3b9d0b6d849682de5b02e143818f88b6c603`.

## Refit 1: persist the canonical committed learner stamp

### Measured mismatch

`test/rebalancer/message-group-membership-branch-authorization.test.js:46-50`
constructs a semantically valid committed learner answer by hand. The existing
check at line 187 calls `committedStampOfAnswer(learnerStamp)` but discards the
returned canonical, frozen stamp. Fixture setup then serializes the raw object
at line 207. Its insertion order differs from the sole stamp owner's
`COMMITTED_STAMP_FIELDS` order in
`src/raft/raft-committed-membership-stamp.js`: in particular, the owner orders
`appliedIndex`, `configurationKey`, `membershipGenerationIndex`, `commitIndex`,
then `term`.

`recordedLearnerFactIsValid` requires the stored learner fact to equal
`JSON.stringify(committedStampOfAnswer(...))` exactly. The raw serialization is
therefore a different durable fact even though it contains the same values.
The branch owner correctly returns `conflict`; no promotion/abort CAS is
engaged.

### Exact proposed correction

Keep the existing hand-built answer as input to the existing owner, but assign
the result of `committedStampOfAnswer(...)` once to `learnerStamp`. Keep the
existing positive assertion that this result is non-null. All uses of
`learnerStamp`, including the durable JSON seed, the configuration stamp in the
request, and later equality checks, then consume the one canonical returned
object.

Do not copy the field order, introduce a fixture codec, relax
`recordedLearnerFactIsValid`, or compare parsed unordered objects. The existing
production owner remains the only validator and serializer-shape owner.

### Required nonvacuity

The repaired file must retain all existing cases and prove that the intended
owner is reached: exact promotion and abort branch CAS, replay/reopen, losing
CAS, terminal interleavings, stale/current owner fencing, uncertain write
readback, initial learner authorization, and durable row facts. A green setup
check alone is insufficient. Existing assertion and time bounds remain
unchanged.

Baseline file SHA-256:
`2e4dd8fd53ffd0da0a9f100c6ed8f795c5f862f5665989adc460dcf7812810f5`.

## Refit 2: preserve identity-safe retirement through the DT6 gate

### Measured mismatch

`test/convergence/dt6-learner-promotion-progress-proof.test.js:84-95` wraps the
real proof transport to drop only gated learner-promotion proof messages. The
wrapper delegates `register`, `unregister`, and `deliver`, but hides the
underlying transport's existing `getRegisteredHandler(address)` and
`unregisterExact(address, handler)` identity methods. The exact retirement
owner therefore refuses to unregister a handler it cannot identify, producing
the retained red `Replica transport handler left registered: the transport
cannot prove handler identity, so retirement was refused`.

The same fixture already demonstrates the correct transparent-decorator shape
in `test/convergence/dt6-learner-promotion-fixture.js:286-294`.

### Exact proposed correction

Add only these delegations to `gatedProofChannel`:

```js
getRegisteredHandler: (address) => inner.getRegisteredHandler(address),
unregisterExact: (address, handler) =>
  inner.unregisterExact(address, handler),
```

The wrapper continues to own only proof-message loss while the underlying
transport remains the handler identity and retirement owner. Do not make
`unregister` report success, substitute handler identities, swallow shutdown
errors, or change the gate, cadence, lifecycle, or budgets.

### Required nonvacuity

All five existing DT6 scenarios must retain their typed body assertions for
lag, term changes, membership-epoch divergence, typed proof outcomes, and
quorum shape. The whole file must then complete exact owner-driven retirement
with no registered handler left behind. Body assertions followed by a cleanup
red do not constitute a passing lifecycle proof.

Baseline file SHA-256:
`5f2e5fd85f56146cf444447092cda871a79dc5adb7b1420cdb51a3ec0bc9e948`.

## Refit 3: compose the virgin-seed fixture with the startup decision owner

### Measured mismatch

`test/integration/helpers/cluster-test-helpers.js:259-289` resolves one
canonical data directory, constructs its data-directory manager, and obtains
the production SERVICES storage admission. It then constructs
`BootstrapService` without `membershipOwnerOutcome` unless a caller happened
to supply one.

During seed bootstrap,
`src/bootstrap/bootstrap-service-seed-workflow.js:269-275` asks the existing
participant release authorization owner to authorize each fresh-seed release.
`src/node/participant-release-authorization-owner.js:14-22` accepts only the
topology owner's canonical outcome: the expected semantic owner and boundary,
`BOOTSTRAP_SEED`, startup mode `SEED`, reason `FRESH_SEED`, and both
`durableStateDetected` and `identityMismatch` false. A missing value is
correctly refused. The fixture omission caused the claim-cache suite to stop
before its T1 seam.

### Sole owner and read/side-effect census

The existing owner is `resolveAutoRejoinStartupDecision` in
`src/bootstrap/rejoin-hints.js:652-655`. With only the fixture's final
`dataDir`, `nodeId`, and `nodeAddress`, it:

1. reads the rejoin-hints file through `readRejoinHintsOutcome(dataDir)`;
2. enumerates durable nodes-partition replica databases and reads their nodes
   tables through `readDurableNodesTableSnapshot({dataDir, nodeId,
   nodeAddress})`;
3. classifies the existing durable evidence and identity; and
4. returns the canonical `membershipOwnerOutcome` attached by
   `buildAutoRejoinStartupDecision`.

The evidence readers perform filesystem reads and open discovered SQLite
replicas read-only with an existing-file requirement. They do not create or
write durable evidence. Because the helper supplies no `probePeerAddress`,
`probeRecoverablePeerAddress` returns `null` before its loop and performs no
network call. The resolver registers no service, starts no timer, performs no
bootstrap, and persists no decision. On an actually virgin directory it
returns the existing `FRESH_SEED` outcome; corrupt, unreadable, mismatched, or
otherwise durable evidence continues through the production fail-closed
classification.

### Exact proposed correction

Import `resolveAutoRejoinStartupDecision` into the shared helper. After the
helper has selected its final canonical `dataDir` and the existing
`startupServicesAdmission.empty === true` check has passed, branch on property
presence with `Object.hasOwn(options, 'membershipOwnerOutcome')`:

- when the property is present, pass `options.membershipOwnerOutcome` through
  unchanged, including explicit `null`, `undefined`, or an invalid object;
- only when the property is absent, call
  `resolveAutoRejoinStartupDecision({dataDir, nodeId: options.nodeId,
  nodeAddress: options.nodeAddress})` and use its
  `membershipOwnerOutcome`.

Pass that selected value explicitly into the existing `BootstrapService`
construction after `...options`, alongside the same final `dataDir`, the same
manager, and the existing `startupServicesAdmission`. Do not spread all helper
options into the resolver, supply a peer probe, infer `forceNewCluster`, use a
truthiness or nullish fallback, validate the outcome locally, manufacture a
fresh-seed object, or alter `BootstrapService` production defaults.

This preserves explicit negative injection and makes the ordinary fixture use
the real owner on the same physical and logical identity that it hands to
bootstrap. Existing data-directory mismatch and durable SERVICES refusal stay
ahead of construction. Resolver refusal remains production data rather than a
fixture exception or replacement classifier.

The current census contains 101 textual invocations across 44 files: one
helper definition plus 100 calls in 43 consumer files. Only
`test/integration/seed-migration-cutover-persisted.integration.test.js:120-123`
currently supplies `membershipOwnerOutcome`; it already passes an actual
result from the same resolver and must remain unchanged. The property-presence
rule protects that positive injection and future/current explicit negative
injections without changing the other callers.

Baseline helper SHA-256:
`33b4b1056c7b41d3702fa41a61783d4ad1b64ec4cb3194578d017b9d52999e94`.

### Direct fixture safety controls

Extend `test/bootstrap/node-bootstrap-consistency.property.test.js`, beside
its existing unique-path and non-virgin-storage controls, with one bounded
fixture-composition case using a caller-owned temporary directory and explicit
node ID/address:

- obtain the expected value from
  `resolveAutoRejoinStartupDecision({dataDir, nodeId, nodeAddress})`, then show
  that an ordinary helper call stores that exact canonical fresh-seed outcome
  on the constructed service;
- show that an explicit `membershipOwnerOutcome: null` remains `null` rather
  than being replaced by the derived positive outcome;
- show that an explicit frozen invalid object remains the identical supplied
  object rather than being normalized or replaced;
- shut down every constructed service and prove caller-owned directory cleanup
  remains with the caller.

These checks exercise selection and identity threading only. They must not
restate the production outcome predicate. Existing tests in that file still
prove concurrent implicit directory uniqueness, stable joining-node paths,
dataDir/manager mismatch refusal, and durable SERVICES identity refusal.

Baseline direct-test SHA-256:
`accde5b7d288bd70735fdf77e21a04e288d1e3b43074770609da432b1030169c`.

## Proof plan after separate implementation approval

Cheap checks first:

- `node --check` for the three edited test files and the shared helper;
- exact-file ESLint;
- `git diff --check`;
- a call-site census confirming the only helper semantic change is the absent
  owner-outcome default and that no local owner-outcome classifier or literal
  was introduced.

Minimal behavioral falsifiers:

1. `test/rebalancer/message-group-membership-branch-authorization.test.js` —
   the canonical fact must reach and preserve the full branch CAS matrix.
2. `test/convergence/dt6-learner-promotion-progress-proof.test.js` — all typed
   progression bodies and exact handler retirement must complete.
3. `test/bootstrap/node-bootstrap-consistency.property.test.js` — derived,
   explicit-null, explicit-invalid, identity, storage, and cleanup fixture
   controls.
4. `test/integration/message-group-membership-claim-cache.integration.test.js`
   — bootstrap must cross the actual fresh-seed release owner and then execute
   both intended T1 settlement cases over real SQL/Raft/CDC/cache owners.
5. `test/bootstrap/rejoin-hints.test.js` — fresh seed plus corrupt, unreadable,
   mismatched, and durable evidence remain owned and fail closed.
6. `test/integration/seed-migration-cutover-persisted.integration.test.js` —
   the existing explicitly supplied real owner outcome remains authoritative.
7. `test/partition/participant-release-protocol.test.js` and
   `test/partition/partition-participant-release-admission.test.js` — current
   participant release authorization/admission behavior remains unchanged.

After those pass once on exact bytes, rerun the original eleven C2 witnesses
as the preservation cone with their existing budgets. Retain raw TAP/stderr and
the exact input manifest. Any fully spent healthy timeout is a system red; it
is not proof by retry. Root decides same-host predecessor comparison and lab
placement.

Passing the four refitted files proves only that their existing owners are now
composed faithfully. It does not prove the deleted C2 island was ever live,
close FreshMG, establish physical off-seed promotion, or authorize a production
startup-policy change. Quest acceptance still requires the sealed static,
current-owner, preservation, independent-review, and locked-lab receipts.

