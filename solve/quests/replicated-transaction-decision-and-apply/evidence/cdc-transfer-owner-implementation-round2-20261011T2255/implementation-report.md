# CDC transfer-owner source correction, round 2

Date: 2026-10-11 UTC. Scope: PO-1 through PO-4 from independent report
`review-cdc-transfer-owner-source-round1-independent.md`, SHA-256
`98b1ac59e078b20f71a7c3f67e88e653c8ef080c46ae4ec6957fe458f0ba9102`.
The report's 19-entry diagnostic manifest has SHA-256
`a9f58b8ce42136dd8bde3f171e1165058e7dcf3cae279d43e368c582d3f4189c`.

The approved design and D24 erratum remain unchanged at SHA-256
`cfe7405ce63469383c879c7dd3de6406b255468cd3e6816fbdbb5c219019eb84`.
The rejected predecessor is preserved in snapshot
`c8800cd70d315b27034506d5632c6d554fabbb80`.

## Corrections

### PO-1: one canonical descriptor capture

The owner now obtains each of the eight declared descriptor fields exactly
once with the captured `Object.getOwnPropertyDescriptor` intrinsic. Every
field must be an own data property. Accessors and inherited fields are refused
without invoking the terminal callback or changing the claim state. Numeric
fields must be nonnegative safe integers and negative zero is refused.

The captured values are copied into a null-prototype object, fully validated,
frozen and retained before the callback begins. Callback mutation therefore
cannot change retained custody. Capture error or invalid evidence leaves the
original ACTIVE claim and release capability retryable.

### PO-2: the nonterminal owner remains reachable

Endpoint retirement now refuses every listener claim owned by that endpoint
unless it is terminal transferred. This includes both ACTIVE and TRANSFERRING.
Throwing and wrong-result callbacks restore ACTIVE state and the same release
capability while the canonical owner remains in `owners`. The same claim can
then complete, retire and admit an exact-capacity successor.

### PO-3: one bounded wake pass with truthful failures

The existing owner has one fixed-snapshot wake dispatcher. It catches each
synchronous callback failure, continues through every callback present at the
start of the pass, and adds the number of failures to the pool's fixed scalar
`wakeFailures` diagnostic. The authoritative row or listener release remains
successful and exact once; a failed wake cannot turn it into a refusal or
repeat its byte debit.

The same correction covers the pre-existing row-session release boundary in
this owner. It adds no queue, retry, timer, store or alternate owner.

### PO-4: standing node diagnostics without dead-service retention

Diagnostics now fall back to read-only lookup of the canonical node pool when
an endpoint owner has retired. They report the actual 16 KiB standing charge,
terminal descriptor, high-water and release/failure counters during a
zero-endpoint interval without registering a replacement endpoint.

Listener claims require a nonempty node ID. The persistent pool is keyed by
that bounded node key; retirement removes the endpoint owner and its service
from `limitsByOwner`. The terminal descriptor contains only captured scalars.
The reviewer's GC controls confirm the normal service, shutdown record and the
callback-injected 1 MiB graph are collectible.

## Exact results

- All ten independent counterexample/control observations pass on the selected
  executable.
- The original focused coverage plus new PO-1..4 cases passes 114 assertions.
- Five direct owner/reconcile/source/integration files pass 438 assertions.
- ESLint, impact contracts, refreshed shard metadata and diff check pass.
- First acquisition remains exactly 16,777,216 bytes; endpoint-free custody is
  16,384 bytes; an exact-capacity successor succeeds; one-byte-short capacity
  refuses without retaining terminal bytes; root sessions remain unchanged.
- Recursive and stale releases remain false. One failed wake is counted while
  later wakes execute once and the committed release stays true.

Exact source and log hashes are in `source-sha256.txt` and
`packet-sha256.txt`.

## Retained HOLDs

This correction does not add or activate the MessageRouter listener. Full
Immediate/Promise graph census, adapter coefficients, wire interaction tests,
and exact future OCI/Helm, SEA, npm/source and lab artifact receipts remain
HOLD. No required release form is downgraded. The fixed 128 MiB pool, 16 MiB
base, 16 KiB terminal term, eight root sessions and supported row equations do
not change. Caller source
`2de419483c9b4ce9e3fabc87bb54d93e4afb8817` is unchanged and remains closed.

