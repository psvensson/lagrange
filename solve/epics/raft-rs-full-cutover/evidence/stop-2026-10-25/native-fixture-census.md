# Inherited native queue transport returns — separate fixture finding

Source finding at integration parent `9e026a011a2368853926f602abc300acb75aed67`
and the D1 composition reviewed in `REVIEW.md`. This does not revise that
bounded source-composition approval. It withholds use of the affected fixture
runs for acceptance until their transport seam is faithful and measured.
No production defect or new D1 regression is inferred from these doubles.
No failing native run is invented: this review is source-only.

## Census boundary and evidence

`census-delivered.mjs` inspected 5,509 tracked JavaScript files in `src`, `test`
and `scripts`, parsing all 294 files containing the `delivered` identifier.
It enumerated object literals, including quoted keys, rather than relying on
two known file names. It found exactly six `{delivered:true}` objects: each is
the resolved result of a native fixture's queued transport override. All six
exact returns occur in the integration parent. Current/parent file hashes,
literal introduction commits and static relative-import closures are retained
in `native-flat-return-census.json`; its readable summary is `.log`.

Two other delivered-only objects are numeric CDC scan counts inside
`partition-cdc-obligation-delivery.js:618,624`; they are consumed by that lane,
not the peer transport. `test/distributed/harness/virtual-network.js:761` is a
three-field scheduler step result (`delivered,event,nowMs`), consumed by
`network.runStep()` drivers such as `formation-sim-quiescence.js:234`, not
returned by a native consensus send port. These are explicit exclusions.
A supplementary assignment search found no additional peer transport producer
that sets a `delivered` property dynamically. This is a bounded literal and
producer-path census, not proof about arbitrary generated strings or future
fixtures.

The Q6 design's producer census names all three consensus port surfaces:
`partition-service-raft-init-base.js:457`,
`message-group-consensus-port.js:112`, and
`wasm-service-consensus-port.js:169`. Current source confirms each forwards its
transport's delivery result unchanged to the runtime. The latter two ports
consume the six overrides below. The partition `createLoopbackTransport`
already returns `buildDeliveryEnvelope` and is used by the passing D1 native
admission composition witness.

The existing Q6 producer census is
`/tmp/codex-rs-raft-20261025/q6-preservation/deliver-census.txt`; the Q6 revision
AST census `/tmp/codex-rs-raft-20261025/q6-revision/census-all-ack.mjs` filters
source containing `acknowledged` and objects with `acknowledged:true`. It
therefore does not exhaust this distinct delivered-only family. Its preserved
source and this pass's evidence hashes are in `external-evidence-hashes.json`.

## Six producers and affected construction paths

All paths below are under `test/`. Line numbers refer to reviewed composition.
The JSON retains the broader static import closure; shared scheduling-helper
imports alone do not mean the importing fixture calls the helper's constructor.

| Fixture return | Native constructors/test consumers |
|---|---|
| `message-group/message-group-native-custody-fixture.js:97` | `message-group-native-custody-handoff`, `message-group-native-mixed-vector`, `message-group-native-application-membership`, `message-group-cdc-input-guard`, `message-group-cdc-receiver-admission` |
| `message-group/message-group-native-provisional-route-fixture.js:346` | `message-group-native-provisional-route`, `message-group-cdc-public-defer-repair` |
| `wasm-service/wasm-strong-write-native-fixture.js:119` | `wasm-strong-write-native-completion`, `wasm-strong-write-v1-native-completion` (through its v1 fixture); it also exports the shared delivery scheduler used below |
| `wasm-service/wasm-creation-bound-native-fixture.js:237` | `wasm-creation-bound-native` |
| `wasm-service/wasm-retained-bootstrap-fixture.js:115` | `wasm-retained-bootstrap.integration`, `wasm-creation-genesis.integration`, `wasm-creation-reconciliation.integration`, `wasm-creation-publication.integration` |
| `wasm-service/bound-creation-handler-embedding-fixture.js:205` | `bound-creation-handler-embedding.integration`, `bound-creation-physical-custody.integration`, `bound-creation-restart.integration`, `bound-remove-physical-operation.integration` (through its physical-operation fixture) |

This is eighteen distinct test files, not a claim that all eighteen have failed.
None is in the 18-file D1 composition cone. The custody fixture's return dates
to `5a3cdc71854c7d97d2e3b688258b73c19dd0c6e4`; the provisional-route return to
`681da1dc1beb5728a52ee5d223113b71b423156b`; all four Wasm introduction commits
are retained in the JSON. These facts establish inheritance without executing
an unrelated broad test corpus.

## Exact meaning and history

Each override first clones and enqueues real native bytes. Queue pumping and
holds later determine when the recipient's real handler runs. The immediate
return represents fixture transport custody only; it does not prove recipient
application, membership convergence, durable commit or CDC settlement.

Before C2, `settlePeerDelivery` accepted an object lacking explicit refusal
fields, so the old raw result was treated as delivered. C2 commit
`7bf6ceecb33d7cf0f7a13d7438d070e030e8015e` switched to the canonical
acknowledged-based outcome classifier, which does not recognize `delivered` as
an ACK. Thus this mismatch predates Q6. Q6 commit
`cf9e88ee75c91d1217b947e991a94652ce57343d` changed the boundary to the branded
envelope accessor; a raw object now reads as its canonical invalid transport.
The exact four historical function bodies and file hashes are preserved in
`peer-delivery-history.json`. This history is a source discriminator, not an
unperformed same-host behavioral red/green comparison.

At the reviewed source, `raft-rs-peer-delivery.js:82` reads
`deliveryTransportOf`. The six raw objects therefore record FAILED even though
the first message has entered the fixture queue. `peerDeliveryFailed` adds the
peer to the current batch's failed set, and `sendMessages` suppresses subsequent
messages to that peer in that batch. Later pump/tick retries can hide this
distortion, so a broad green run would not justify the raw result. No production
consumer should accept the old shape again.

## Prescribed narrow migration and proof

At each of the six successful enqueue returns, import and use the existing
sole owner from `src/transport/transport-semantic-outcome.js`:

```js
return Promise.resolve(buildDeliveryEnvelope({acknowledged: true}));
```

The builder's input ACK is its private transport fact, not a restored public
ACK alias. Its output is canonical DELIVERED transport plus null answer. Keep
the clone, queue admission, hold/release schedule, original recipient dispatch,
and all application/native assertions unchanged. This corrects the immediate
transport classification while claiming no recipient application result. Do
not hand-build `{transport,answer}`, broaden `deliveryTransportOf`, add a
parallel adapter/legacy decoder, replace native carriers, or turn an actual
queue refusal/drop into successful custody.

Two adjacent retired-address doubles in the retained-bootstrap and embedding
fixtures return `{acknowledged:true,noHandler:true}` from the *later pump's*
`f.deliver/e.deliver`. `deliverScheduled` awaits and discards that return; it is
not the direct result consumed by peer delivery and does not enlarge the six.
If their stale production-shape claim is cleaned with this migration, use the
same builder with those exact facts: canonical FAILED/NO_HANDLER and null
answer, preserving the no-throw schedule. Do not convert it to DELIVERED or
manufacture an answer. Their fate is separate from the six direct queue ACKs.

The smallest decisive paired witness is the existing peer-delivery owner with
two messages to one peer: the raw queue result demonstrates FAILED and
second-message suppression; the canonical enqueue result delivers both to the
controlled queue, clears the failure count, and still has no application
answer. Run through the normal classified test owner and preserve both exact
source identities and first failure. Then run affected native witnesses in
coordinated thermal/lock windows; select the construction paths above, not
every file importing only the shared scheduling helper. Their original
native receipt, commit/application ordering, restart/recovery, boundedness,
and cleanup assertions remain the acceptance oracle. A setup-not-reached
failure must remain distinct from a target semantic failure. Do not claim
W7/W9, remote network acceptance, or whole-D1 closure from this fixture repair.
