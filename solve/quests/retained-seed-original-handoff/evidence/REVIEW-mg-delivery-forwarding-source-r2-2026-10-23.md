# Independent review: MG forwarding source revision 2

Reviewer: `subagent:/root/mg_delivery_design`.

Verdict: **REVISE**. The ordinary-intrinsics source corrections for F3-R1,
F3-R2 and F3-R3 are present. F3-R4 remains incomplete at the new wrapper/control
validation boundary: mutable intrinsics can erase terminal-mode admission or
invoke numeric coercion. This is one finite residual category, detailed below;
it does not commission a general rewrite of legacy JavaScript or transport.

This is an independent, read-only source review. No application code, runtime,
tests, metadata, Quest log, commits or lab jobs were executed or changed. The
review creates only this evidence file. Source correction is not measured
forwarding acceptance, native proof, composed W7 acceptance, or permission to
land or publish.

## Exact review identity

Worktree: `/mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023`.
Preserved base: `21cfd917d8ceb2f0c1435cade117c0c44a91a03a`.
Frozen bundle: `/tmp/mg-f3-forwarding-frozen-r2-20261023`.

| Artifact | SHA256 |
| --- | --- |
| R2 `manifest.json` | `b1e46350dc3430248fa461650f161b2e9b31327362998664cef2bb02a7f66128` |
| R2 `NOTES.md` | `1d407c59658c0ff4d164082e5dbddf7905b5bdfa259f484d1cb35dd0f446a330` |
| R1-to-R2 patch | `011920bfcec45adb52a06e3abb4a72c9eacd568c166e968fbdf876c9da8c34bb` |
| Cumulative author-owned patch | `9b37e39fce2788c2aaabf8722936baa1482ba52ff3e32c389f51803bc27ed83d` |
| Author static report | `fefa760b5da505b66e35b68f6c08cba33c92054b10a364b63d2bd7b43f66a31c` |
| Author complexity comparison | `1e3c3ad8e038f159257a23a79e946f0793b550a76438fa3121f5408fe330da86` |
| Prior independent F3 R1 review | `8d57c56fcb76281a521a3127ccf4de8d352a96490b2c417f16f6a53e909b089a` |
| Approved MG contract | `474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383` |
| Approved design review | `2eb6a5a1243ee5efc72e0c5182e5f919fbc7d058c1404785bb3d4123ba3e597d` |

I independently compared all ten current files with both the manifest and
the bundle's `after/` copies. All ten matched, including the four unchanged
R1 files. I also checked the artifact hashes above. The author reports syntax,
scoped ESLint and whitespace checks passing, with the same 15 inherited
complexity findings and no increased finding. Those static reports are not a
runtime result, and I did not re-run an application or test to obtain this
verdict.

All paths in the following table are relative to `src/`.

| Source | SHA256 |
| --- | --- |
| `message-group/message-group-forwarding-owner.js` | `a8d724ec76ccbe33cb85cf5e79d584a6c81a674631bebde53a100ee9db08d167` |
| `message-group/message-group-forwarding-owner-delivery-methods.js` | `56488a9b2f94065a148ba6627beb0cb9c14f988c4d4ed58de6ef2bbec4dc9a61` |
| `message-group/message-group-forwarding-owner-routing-methods.js` | `2d761655e4f517f2cf5cee3ef4e01a7216edf9bdbe86d9ed02463814c8e4de33` |
| `message-group/message-group-forwarding-owner-constants.js` | `fc88e3a5c9002a636f6cc70b1b15bd85be124d9319a0fa20131794ecb9b3b020` |
| `message-group/message-group-service-cdc-propagation-runtime-methods.js` | `24732f26862829adea6f83877efbf5106a7b1e74302959e3b993998c3b880945` |
| `message-group/message-group-service-cdc-replication-runtime-methods.js` | `8f1fece571068e8207b66c6afb0397ce39f22016467ba0f7f542d6b67dbd39e4` |
| `bootstrap/shared/message-group-transport-handler.js` | `650cacdf21b59d6ff03a0b5f16c97e37422209b411441579a466acd53769a5bd` |
| `message-group/message-group-service-inbound-ingress-runtime-methods.js` | `4f2db5fce3e601e42d5cc4fa9ff470807f7e98a823e5d3f5e371dd64ed437796` |
| `cdc/cdc-delivery-budget.js` | `4ac20d01cef7c97fc9928bebf339a9051460584e7990b799167fec77f7c84bc1` |
| `message-group/message-group-forwarding-owner-native-delivery-methods.js` | `bd981bf8fbd3134f50a31310d8cea075e3c5aafb0106894adfbeac7fe3b34351` |

## Disposition of the four requested repairs

### F3-R1: queued cached target freshness

The new shared predicate at `message-group-forwarding-owner-routing-methods.js:81`
restricts cached candidates to the currently observed native leader, when known,
and a current non-learner peer. `assertCachedCdcForwardTarget` at line 109 repeats
that decision from a fresh usable native status before dispatch. Missing native
observation, changed leader identity, removed/learner membership, or newly
resolved native leader routing refuses the queued cached target. A resolved
native peer location must match the actual address about to be sent.

`assertDurableCdcForwardTarget` in `native-delivery-methods.js:141` selects the
native binding guard or this cached-target guard. The transport preparer repeats
it at actual dispatch (`:167`). The existing native binding still compares the
exact operation port, group/replica, term/role/leader/address, configuration,
membership generation, runtime/lifecycle incarnation and bootstrap/admission
identity, then re-resolves the exact peer target. There is no new public Raft
authority or cache promotion into native membership.

This resolves the reported stale cached-target path on source inspection. The
queued-change/unchanged-control witnesses remain required.

### F3-R2: native suppression participates in both decisions

`resolveNativeCdcIngressDecision` at `routing-methods.js:142` now consults the
existing service/address suppression owner before returning a native target.
Suppression yields a DEFER decision, not a cached substitute. Actual dispatch
also checks suppression at `native-delivery-methods.js:143`.

The later addressed-ingress attempt re-enters the same canonical decision, so a
still-present suppressed native route cannot become provisional success through
that attempt. No suppression interval, key, timer, topology-repair cadence or
new retry owner was introduced. A genuinely changed observation is re-evaluated
by the existing decision owner; this review does not require a stale suppression
to invent a now-missing native route.

The suppression repair is correct on source inspection, subject to the existing
clock-based before-expiry/after-expiry witness.

### F3-R3: terminal control is admitted before the legacy branch

The incoming single and batch handlers capture/validate the request at
`cdc-propagation-runtime-methods.js:53` and `:197`, before selecting the ordinary
or durable path. With ordinary intrinsics, explicit terminal mode requires a
durable occurrence, exact target group and valid relay depth. A terminal request
to a follower cannot reroute or use addressed provisional ingress. Actual native
admission remains with the existing committed-acceptance owner.

I also traced sibling direct methods: `applyCDCEvent` (`:305`), `applyCDCBatch`
(`cdc-replication-runtime-methods.js:157`), `forwardCDCEventToLeader`
(`delivery-methods.js:365`), `forwardCDCBatchToLeader` (`:407`), and
`forwardCDCPayloadToLeader` (`:528`). These use the new captured context and the
terminal/durable guard before their respective ordinary branches. The private
command-forwarding path consumes the already admitted context; it is not an
independent wire wrapper entry point.

The legitimate domain remains intact: a same-group ordinary payload carrying
`targetGroupId` without terminal mode still follows ordinary CDC behavior. A
terminal mixed vector requires at least one durable occurrence; ordinary members
remain in the complete vector and are not required to acquire fabricated durable
keys. R3's normal path is corrected. The R4 residual below can bypass this same
guard under a replaced intrinsic; it is not a second unrelated finding.

### F3-R4: descriptor capture fixed, intrinsic independence incomplete

`captureCdcForwardRecord` now reuses `copyStrictOwnDataRecord`. That existing owner
pins its reflection operations and rejects an outer proxy, accessor descriptor,
symbol/non-enumerable property, or unsupported prototype before reading values.
The captured null-prototype record prevents later inherited control reads.
The receiver captures its creating-clock start before wrapper validation, so
that work is charged to its local budget. Private `localDelivery` closures remain
separate local authority and are not serialized.

The residual is in the new consumer after that safe capture:

| New control seam | Concrete failure |
| --- | --- |
| `native-delivery-methods.js:27,31,38` uses live `Object.hasOwn` | Replacing it can conceal an own terminal mode or duration from admission while the canonical record still contains the value. |
| `native-delivery-methods.js:26,47` uses `for...of` for control-field lists | A changed array iterator can omit inherited-control checks or omit the group/mode/depth merge; the latter can reset a terminal forwarding context to its defaults. Freezing an array does not freeze its prototype iterator. |
| `native-delivery-methods.js:67` uses live `Number.isInteger` | A replacement can admit a boxed/exotic relay depth, after which `<`/`>` executes coercion. The bounded primitive integer guard is no longer authoritative. |
| `cdc-delivery-budget.js:14` uses live `Number.isFinite`; `:39` uses live `Object.hasOwn` | A replacement can admit a boxed/non-finite duration and execute coercion, or hide the received duration so the configured local budget is used instead of the supplied child grant. |

The first row has a complete finite source counterexample, without modifying any
event payload after capture:

1. After module loading, replace `Object.hasOwn` with a wrapper that returns false
   only for the key `cdcForwardMode` and delegates every other key to the original.
2. Supply an otherwise valid same-group ordinary single or batch request with an
   own `cdcForwardMode: 'native_commit'`. The pinned strict-own-data owner copies
   that field faithfully. The real own-property record remains valid.
3. `hasCdcForwardMode` reports false. `readCdcForwardContext` sees a valid mode and
   group, but `captureCdcForwardRequest` skips its explicit-mode/durable-occurrence
   refusal at `native-delivery-methods.js:98` and returns `durable: false`.
4. The incoming handler takes the ordinary branch. Its ordinary apply/forward
   options omit the terminal mode (`cdc-propagation-runtime-methods.js:127`,
   `:155`, `:171`, and the corresponding batch branch). The request can therefore
   reach ordinary projection/forwarding that terminal admission was meant to
   forbid. No native acceptance or fabricated receipt is needed for the violation.

This is source reasoning, not a claimed executed attack. It falls within the
already required `adversarial-js-intrinsics.md` items 5, 6 and 8, and the prior R1
review explicitly included intrinsic-sensitive wrapper coverage. The correction
is confined to this new guard and grant boundary: use captured trusted operations
or primitive operations/indexed control-field reads, consistently for the own-key
discriminators and numeric checks. Include context construction/freezing in that
same capture discipline rather than leaving the freshly defended guard dependent
on replaceable operations. Reuse the existing canonical input owner; do not add a
second schema, durable store, broad fallback or framework.

Do not widen this finding into a claim that every legacy module already promises
intrinsic independence. Conversely, a test that only feeds canonical member events
does not cover the new wrapper. The repair needs the actual single/batch wrapper
and the direct sister ingress controls, with replaced intrinsics restored in
`finally` and forbidden getter/coercion/projection/proposal/send counts checked.

## Coupled owner and proof boundaries

The unchanged bootstrap handler and inbound dispatch preserve the exact private
third local-delivery argument; the second connection-authority argument keeps its
original meaning. The durable receiver composes the local parent's currentness,
remaining duration and genuine invocation brand with its own creating-clock
budget. Outbound calls retain full envelopes and return the complete accepted
answer. The generic `deliveryDurationField` option coordinates the existing
numeric wire duration with the separately reviewed transport encoder. No absolute
timestamp or local authority crosses the wire, and this review claims no receiver
knowledge of unobservable network transit time.

The complete mixed-vector result-binding correction belongs to the root semantic
owner lane and is still separate. This review cannot certify a receipt covering
the entire vector merely because forwarding preserves that vector. It also does
not certify the moving root native acceptance helper or the independently frozen
F1 transport revision. Their exact composed manifest still needs independent
review and measured evidence.

The existing component fixtures that manufacture only mutable `service.leaderId`
and a peer-address-only consensus report remain inadequate positive premises for
native route authority (`message-group-service.test.js:568` and the adjacent
strict-forwarding case). They need coherent initialization, group/replica,
health/participation, peer and leader status. Restoring a mutable-leader fallback
would undo the contract. No fixture was changed by this review.

## Required witnesses after the finite correction

| Witness | Required discrimination |
| --- | --- |
| Queue eligible cached voter B; change observed leader, membership, participation, port/incarnation or peer address before dispatch | No stale handler/send/proposal; unchanged valid observation permits a real dispatch. |
| Suppress a native target using an existing suppressible failure, then retry before and after the existing expiry | No pre-expiry send or provisional result; one fresh post-expiry decision, without a new timer or retry controller. |
| Valid terminal single/batch on admitted leader versus follower, wrong group, malformed/exhausted relay, or missing durable occurrence | Real native afterCommit acceptance only for the valid path; zero forbidden projection/proposal/relay for negative paths. |
| Same-group ordinary targetGroupId-only single/batch and mixed durable-plus-ordinary terminal vector | Ordinary behavior remains reachable; every mixed-vector member survives and the separate complete-vector receipt owner decides completion. |
| Outer proxy/accessors/inherited controls and boxed/exotic numeric controls | Zero input getter/proxy/coercion effects before refusal; no projection, proposal or send. |
| Replaced own-property/numeric predicates and array iterator, plus polluted prototypes | The same terminal and numeric refusal remains authoritative; exact intrinsic restoration and a valid adjacent control. |
| Wrapper validation and final preparer consume creating-clock time | Remaining grant decreases; an expired dispatch/result cannot regain a full local budget. |
| Same-process local delivery versus remote-duration delivery | Exact private parent currentness is preserved locally; remote receiver uses its own clock without inventing sender absolute expiry. |

The review's category pass covers the inherited R1 checklist: transport,
concurrency/custody, recovery/replay, retry/timers, admission, owner interaction,
formation circularity and harness fidelity introduce no additional independent
R2 blocker on this bounded delta. Adversarial-input items 2-5 improve through the
canonical record capture; items 5/6/8 retain the finite residual above. Numeric
duration/depth controls must be primitive and finite before derived arithmetic;
larger positive durations remain capped by the existing local limit, with no new
payload or total-fanout restriction. Semantic event/digest authenticity remains
with its existing owner rather than being reimplemented here.

No S2 lab setup/timer failure, author static success, source retention, or focused
component witness closes the required native/composed acceptance gates. Preserve
the original R1/R2 bundles and the known unengaged lab outcomes when applying the
finite correction. The next review can be a bounded exact-delta review of this
remaining category plus its meaningful witnesses.
