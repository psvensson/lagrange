# Independent test-source review: input guards and native vector membership R1

Reviewer: agent:/root. Author: subagent:/root/mg_delivery_design. Verdict:
**APPROVE for the declared test-source scope; runtime UNEXECUTED.** This review
does not approve a source SQL occurrence, source acknowledgment, complete
delivery package, classification, two-start acceptance or merge.

## Exact reviewed bytes

Frozen bundle: `/tmp/mg-vector-owner-guard-witnesses-r1-20261023`.

- Manifest: `11b2081ce7de091f36d85aef1f2c4f4b0446223a9ba313922ed75782111e7789`.
- Delta: `0f9714df7780dfe8cf68439e6ee4e6e2b66990d4abba946d0337d4549b3489c3`.
- Notes: `a9257efc2a7d8028d76c538c394d1d179af8af7b8c92a25af74a4363839a55b9`.
- `test/message-group/message-group-cdc-input-guard.test.js`:
  `40adc3e235fd82f10f79a166c61a5b5eacffd3803395c81208fc2b56eeffb25c`.
- `test/message-group/message-group-native-application-membership.test.js`:
  `aa64c7978594077cb5f0c07170fdc7fcdf2c7d3c706f7b312122cb5b8e750e77`.

The recipient fixture remains
`2806d3980b7b4b0392c79e2924984fb23e26147c5c27a3ed2e5d7a9409ff3012`;
the intrinsic-restoration helper remains
`6267943e12e515d2d57aa9b86810c5652e6a2b8a058727439d9d591860cf558a`.
The reviewed implementation consists of the guard R1/R2 and native complete
vector repairs, whose separate source reviews remain authoritative.

## Harness fidelity and causal binding

1. The input test's `startEntry`, `observeEffects`, `refuse` and `accept`
   enter the real service methods. Transparent wrappers pass the original
   receiver and arguments. Every negative requires the owner INVALID code,
   one actual requested entry, no proposal or cache application, unchanged
   durable record/frontiers/row, unchanged waiter size, and an independently
   captured complete caller vector. The size assertion closes the possibility
   that one subsequent successful request could conceal a small reservation
   leak. This is a reservation-release observation, not a raw-child closure
   claim for an operation that never proposed.
2. `recipientFixture` forms and initializes the actual RF1 native group,
   subscribes CONFIG, and checks native leader/readiness before the measured
   section. No service role or committed receipt is fabricated. CONFIG rows
   use the canonical config_key. Inputs deliberately are synthetic durable
   occurrence envelopes; they are not represented as real source SQL writes.
3. `settleEntry` uses the unchanged finite native pump. The test changes no
   production budget, timeout, retry limit or fixture scheduling. A formation,
   timeout or pump-settlement failure must be reported as such, not as proof
   that a guard or receipt assertion rejected the intended mutation.
4. `observeCommittedApplication` wraps the actual installed application method
   and passes the identical committed object and actual native lifetime. It
   observes both cache rows inside the real SQLite application transaction.
   The command snapshot is taken independently before delegation; retained
   history, commit/applied frontiers and cache state are captured at the actual
   returned application promise. The wrapper never runs an afterCommit callback
   or supplies an acceptance outcome itself.
5. The selective iterator fault has an explicit engagement probe. It would
   omit the ordinary sibling if consulted. The attacked and unmodified cases
   require exact membership/order/stamps and both rows; the attacked case also
   requires exactly the deliberate probe to consult that iterator. Empty input,
   no application, a different native command, or a receipt naming another
   index cannot satisfy the assertions.
6. These are eight authored tests, not eight passing tests. The source review
   establishes the intended binding; only exact-SHA locked-lab execution can
   establish the runtime result. No red-on-revert or mutation result is claimed.

## Adversarial input and intrinsic categories

| Category | Reviewed evidence and limit |
| --- | --- |
| Numeric domain | Canonical versions cover arrays, strings, boxes, zero, negative, NaN, infinity and unsafe integers, plus mutable Number conversion and isSafeInteger. The owner requires primitive positive safe integers before rebuilding. This file does not claim exhaustive numeric coverage of every CDC field. |
| Own fields | Each canonical scope field is separately deleted and supplied through Object.prototype; same-count extra-field controls also refuse. Valid null-prototype canonical scope still reaches native acceptance. |
| Accessors and proxies | Normal and revoked proxies at vector/member/data/nested-array positions must execute no traps. The test-owned view substitutes only proxies it constructed; it neither invokes them nor makes a production admission decision. Existing envelope tests own the broader getter/descriptor cases. |
| Prototype pollution | Own-key and inherited-field faults are installed only for the synchronous actual admission prefix. The unchanged helper restores in reverse order in finally. No global mutation persists across native asynchronous work. |
| Exotic primitives | Boxed numeric versions and the explicit noncanonical version set reach real entry validation. Broader canonical-data type coverage remains in the separately selected owner suites. |
| Mutable intrinsics | Object.hasOwn, JSON.stringify, Array.toJSON, Set.has, Number conversion/isSafeInteger and the selective native iterator all have named tests. Valid identity bytes and builder primitive conversion are also checked under the relevant mutations. |
| Digest coercion | Duplicate identities under replaced serialization must refuse with zero calls to those hooks. Invalid array versions must refuse without invoking toString. Expected caller semantics are captured before production invocation. |
| Array authenticity | Proxy vector and member controls reject before traps. Native membership uses the real committed array; the selective iterator probe proves the omitted sibling fault is active while both rows remain required. |

Restoring intrinsics before awaiting is intentional. These tests prove the
synchronous guards and synchronous native application remain independent of
the named mutations. They do not claim whole-program asynchronous liveness
while every global intrinsic remains hostile.

## Owners, custody and remaining proof

The path remains capture/identity/scope owners -> recipient admission -> native
proposal/application -> registered afterCommit acceptance. Tests do not add a
second identity definition, acceptance authority, queue, retry loop or recovery
path. Test observations of actual rows/frontiers remain assertions rather than
authorities consumed by production. Cleanup remains the unchanged fixture's
service/router shutdown and failure-preserving directory custody.

Independent review found no material test-source defect in this bounded set.
Exact file/artifact hashes, syntax and scoped ESLint were checked. Runtime,
predecessor discrimination, source SQL/ledger/ACK composition, routing/retry
composition, held real network writes, W7/W9 and the broader rs-raft gates remain
separate and unproved by this review.
