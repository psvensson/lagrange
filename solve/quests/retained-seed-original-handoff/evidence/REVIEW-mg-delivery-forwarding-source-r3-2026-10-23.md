# Independent review: forwarding source R3 intrinsic correction

Reviewer: `subagent:/root/mg_delivery_design`. Date: 2026-10-23.

Verdict: **APPROVE for the exact bounded F3 R3 source revision**. The residual
intrinsic/control finding recorded in the R2 review is resolved on source
inspection. The authorized existing-normalizer dependency change preserves the
ordinary admitted-data behavior while removing its mutable array-method/species
dependence. No new blocking finding was established in this finite delta.

This is source-only approval. It neither claims runtime success nor approves the
separate complete-vector semantic implementation or the final F1/root/F3
composition. No native acceptance, source ACK, S2/W7, classification, activation,
durable-transfer, two-start, Quest landing or publication result follows from it.
No runtime, test, production source, metadata, Quest log, commit, push or lab
action was performed. This evidence file is the only write.

## Exact reviewed bytes

Worktree: `/mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023`.
Base: `21cfd917d8ceb2f0c1435cade117c0c44a91a03a`.
Bundle: `/tmp/mg-f3-forwarding-frozen-r3-20261023`.

| Artifact | SHA256 |
| --- | --- |
| R3 manifest | `f1d72b0a2cd86f66f8dc225266427bde9625fd3d698014d351acbe87c78e05fa` |
| R3 NOTES | `f9c998162fcf4fe5aa593f1150bc591cef1c99137e06bf25f449b606dba977ab` |
| Finite R3 patch | `c8e5495e99410b73fb67656c21ca3438ce7b44a8d79d95ce2230b9c5892a536e` |
| Static report | `b94bbecde837362b0a8ee7463d23dcfd2bec74923470b9102c9423886d4d9c99` |
| Complexity comparison | `307bfb9fd604344032b3cef5d4bd2f4eed303873dda7e6465c61e03c1aec3fbc` |
| Prior R2 manifest | `b1e46350dc3430248fa461650f161b2e9b31327362998664cef2bb02a7f66128` |
| Prior R2 independent review | `80cd661f5e41e6f5e5a01d608d43bed6b97be91910a61118ef4e93d609538ad1` |
| Governing contract | `474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383` |
| Approved design review | `2eb6a5a1243ee5efc72e0c5182e5f919fbc7d058c1404785bb3d4123ba3e597d` |

I independently checked all ten live source hashes against both the R3 manifest
and frozen `after/` copies, and checked all manifest artifact hashes. The seven
unchanged files match their R2 identities. The three changed files are:

| Source | SHA256 |
| --- | --- |
| `src/message-group/message-group-forwarding-owner-native-delivery-methods.js` | `a27dc32303b06d2b44ef724e873cd1efc2bd9e3020bcd5dd13f75c86c0dbdb53` |
| `src/cdc/cdc-delivery-budget.js` | `b8531cb441c74bd51cf66bea23e64c68a09ca45272bc1f59dfbdac089d7ed27d` |
| `src/message-group/message-group-service-cdc-propagation-runtime-methods.js` | `ad397356fcbbd1058943a0e4fc4e874559b2426a2be3d692579a2c9a29e3baea` |

The preserved R1/R2 findings, fixes and witness obligations remain part of this
review chain. They have not been replaced by a whole-worktree approval.

## Residual F3-R4: exact reported control paths now stay authoritative

`native-delivery-methods.js:15-25` captures own-property, integer, array,
construction and freeze operations at module initialization. The wrapper and
context control-field loops use indexed access (`:33-41,55-61`). The existing
strict-own-data owner remains responsible for descriptor/proxy admission;
this change does not introduce a second input-schema implementation.

The previously reported counterexample no longer reaches ordinary ingress:
replacing live `Object.hasOwn` after import cannot hide an own `cdcForwardMode`
from `hasCdcForwardMode`. The explicit-mode check still rejects an entirely
ordinary terminal request before the handler's ordinary/durable split. The same
retained predicate validates supplied duration presence. Changing the array
iterator cannot skip an inherited-control check or omit mode/group/depth from
the merged context.

The depth predicate is retained and rejects boxed/exotic/non-integer values
before relational comparisons. The returned context is a frozen null-prototype
record (`:70-87`), preventing an omitted mode from being supplied later by
Object-prototype pollution. Captured construction/freezing operations remain in
effect if the public methods are replaced after module loading. Strict-event
selection and the new target traversal also no longer depend on a replaced
array predicate/find operation or target iterator.

`cdc-delivery-budget.js:8-12,18-21,44-57` retains finite-number, own-property,
minimum, error-assignment and freeze operations. A boxed/non-finite wire duration
is refused before comparison or minimum arithmetic can coerce it. A replacement
own-property predicate cannot turn a supplied short received duration into the
configured full service grant. Both local parent and receiver budget continue to
bound the result. Existing creating-clock arithmetic, service lifetime/port/group
fences and parent currentness are unchanged.

These conclusions concern the new wrapper/control and grant-admission boundary
under the specific post-import replacements described in the R2 finding. They
are not a claim that arbitrary replacement of every global or every unrelated
legacy operation leaves the entire application live. The existing timeout owner
continues to consume admitted primitive durations; no parallel deadline engine
or remote absolute-clock assertion was added.

## Existing normalizer dependency: finite behavior-preserving extraction

The third file changes only the existing ordinary batch normalizer's collection
mechanism and its helper imports/captured array predicate. I compared the actual
before/after normalizer and inspected the existing canonical array helpers.

The function captures the source length and performs the original membership
pass first. Present indices are inspected in order; the same truthy table,
operation and data condition admits each member. Indexed reads with `in` preserve
the old filter's absent-index behavior. Accepted members enter an ordinary array
through `appendOwnArrayValue`, which defines own entries without an inherited
setter. Only after that pass does `copyArrayByIndex` map the accepted entries.
Neither helper asks an iterator, live filter/map, or a constructor/species hook
to choose the output list.

Timestamp precedence remains event nonempty string, then options nonempty string,
then the service HLC. Table, operation, data, the existing cause-id policy and the
boolean replay policy are unchanged. The existing normalizer still owns this
policy; there is no new producer-stamp rule and no permission to remint durable
source stamps. Ordinary legacy raw access behavior was not upgraded into a
general hostile-object validator by this extraction. Root's separately reviewed
R4 admission/capture owner must supply the validated vector before invoking this
policy on the durable/mixed path.

## Domain and unchanged owner interactions

The revision preserves a legitimate ordinary targetGroupId-only single/batch
request. Terminal mode still requires at least one durable occurrence, with all
ordinary siblings retained in a mixed vector. It does not invent durable keys
for those siblings or filter them away. Wrong group, invalid mode/depth and a
wholly ordinary terminal request still refuse. Native target binding,
queued-cache target freshness, suppression selection/dispatch, terminal no-relay,
relay bound, and exact reply forwarding remain the reviewed R2 behavior.

Private local grant authority still crosses only the existing local third handler
argument. Wire grant remains a duration and is refreshed through the generic
transport preparer/field seam. No private invocation brand enters an event or
native command. Complete-vector digest/receipt coverage and ordinary missing-stamp
admission remain the root R4 dependency; this forwarding approval cannot certify
that separate semantic correction.

## Required measured controls and limitations

The R2 category-complete adversarial checks are now supported by defenses in the
new source. Runtime must still exercise the real single/batch/sister entry points:

- Replace own-property predicates after import for terminal mode and received
  duration. Terminal ordinary input must cause zero projection/proposal/send;
  a short child duration must remain short on the receiver's actual clock.
- Replace numeric predicates and pass counted coercion objects, boxes, NaN,
  infinities, invalid depths and nonpositive durations. Refusal must occur before
  coercion/effects. Preserve valid finite duration and depth controls, including
  the existing zero-depth interpretation and existing local cap.
- Replace iterator/construction/freezing methods and pollute prototypes. Context
  fields and refusal stay authoritative; no target is injected or omitted.
- Replace normalizer array predicate/filter/map and install constructor/species
  hooks. Exact membership, order, event/options/HLC timestamp precedence and
  cause/replay/data remain intact, with no species hook invocation.
- Retain ordinary and mixed-vector positives, actual leader/follower terminal
  controls, queued native/currentness changes, suppression expiry, same-process
  parent retirement and remote-duration-only coverage. Restore every altered
  intrinsic/prototype in `finally`.

An import/setup failure, missing method, timeout before engagement or a fabricated
native receipt is not a semantic kill. Source inspection establishes the
correction's mechanism, not an executed adversarial or native result.

The author static reports show syntax and ordinary scoped ESLint passing for the
three changed files. Explicit complexity-12 comparison has no new/increased
finding: guard/budget have none, and the runtime file retains its two inherited
findings. No ratchet or source limit changed. The preserved no-index diff status
1 is recorded as differing files with empty whitespace diagnostics, rather than
misrepresented as a runtime pass. Final integrated source review, registry/static
checks, exact checkpoint preservation and locked-lab proof remain root-owned.
