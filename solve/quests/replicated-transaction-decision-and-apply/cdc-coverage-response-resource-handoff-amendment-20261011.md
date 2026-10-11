# C17 coverage response resource handoff amendment

Status: proposed owner-interaction amendment for independent review before
transport source changes. It supplements only C17 retained-byte transfer
mechanics in `cdc-continuation-20261011.md`. Durable CDC delivery, snapshot bulk
transfer, query authority and router delivery-lifetime authority are unchanged.

Subject before this amendment: proof snapshot
`0b2bfb2bcf0cbbc1cef69754baba5bd9db5986e2`, source manifest
`04056353c157b98a695b407a085ffa1adcc54838c98326a81b3c07ea7cabd093`.
Triggering review:
`review-cdc-c17-round3-marker.md`, SHA256
`1c91465bcbad72cc8c1d0df9d32d2aaff731234f9ff9df65933b4063a38e476b`.

## Semantic owners and boundary

`CdcCoverageTransferOwner` remains the sole capacity owner for hydration
payload, cursor, chunk, base64 and response-frame copies. `MessageRouter`
remains the sole owner of remote serialization, WebSocket queueing, send
completion, connection close and shutdown. Their interaction answers one
question: **when a coverage handler returns a resource-charged response, who
owns the byte lease until the last transport-held copy is released?**

The answer is a local-only typed `ServiceResponseResourceHandoff` recognized by
MessageRouter. It contains the ordinary wire result and one opaque idempotent
byte-lease token with a positive safe `maxSerializedBytes` and `release()`.
It is never serialized, is not delivery permission, is not the existing
`RouterConnectionAuthorityOwner` lifetime context, and carries no CDC semantic
authority. MessageRouter may only take and release the token; it cannot mint,
resize or reinterpret coverage capacity.

The existing snapshot bulk channel remains snapshot-only. Coverage still uses
the canonical query/message-group request-response route. No direct local
handler call, raw socket, alternate transport or data-plane bypass is added.

## Bounded page protocol

Raw rows and BINARY cursors no longer occur in PAGE/OFFER/CHUNK JSON fields.
One canonical binary `cdc-coverage-page-v2` payload contains the lower cursor,
exclusive next cursor or final marker, applied index text, ordered tagged rows
and the immutable observation fields. All variable TEXT is length-prefixed raw
UTF-8 inside that payload. The small OFFER carries only fixed/bounded identity,
scope/domain digests, page ordinal, payload byte length, digest and chunk
geometry. Thus embedded NUL is charged as one payload byte, never allocated as
six JSON escape bytes. The applied index remains canonical bounded decimal text.

The source session owns the current cursor and page ordinal. After a page is
published, the next request carries only the opaque session ID, next ordinal and
prior observation digest; it does not echo the raw cursor. Session loss starts a
new capture from BINARY negative infinity under a new transfer ID. Existing
normalized-cover idempotency makes already installed pages harmless. No SQLite
transaction crosses a network await.

Before allocating a page payload, the source runs length/type probes one row at
a time, computes checked exact binary lengths plus fixed copy bounds, and chooses
the largest positive prefix up to 256 rows that fits the configured transfer
capacity. It reserves before materializing any row/cursor or encoded buffer.
A first row is never skipped: if its exact paired source/consumer requirement
cannot fit the configured capacity, the result is typed recoverable capacity
pressure and the debt remains owed. Capacity, rather than row type or a raised
global limit, remains the supported-path decision.

## Colocated reservation order

No recipient PAGE reservation is acquired before the source offer. The source
probe computes exact source peak `S` and the existing consumer peak formula `C`
for the offered payload. For different node pools it reserves `S`; the recipient
later reserves `C`, and refusal cancels the source session. For a source and
recipient sharing the same node pool, the pool atomically reserves two session
slots and `S + C`: the source root and an opaque recipient claim bound to the
transfer/target/lifecycle/generation. The recipient must adopt that exact claim
before chunk zero. Adoption changes endpoint ownership only and does not change
pool count or bytes. Cancellation, mismatch or recipient refusal releases both
exact claims and wakes the existing reconcile owner.

The measured supported 8 MiB ASCII case is the acceptance arithmetic:

```text
source peak S                 35,130,808
consumer peak C               51,905,406
simultaneous paired total      87,036,214
default node capacity         134,217,728
```

It therefore completes under 128 MiB without the rejected fixed
102,236,160-byte recipient prelease. A low-cap control refuses before row,
payload, base64 or frame allocation. Concurrent callers cannot take the held
recipient claim because the shared pool has already charged it.

## Allocation and release timeline

1. **Probe:** SQLite returns only bounded type/length scalars. Checked arithmetic
   computes the binary payload, source retained copies, one raw chunk, one
   base64 string, one JSON response string/frame and consumer copies.
2. **Reserve:** acquire `S` or atomic colocated `S + C` before materializing the
   row, cursor, payload, digest input, base64 or response frame.
3. **Capture:** materialize and encode exactly one page into the source root.
   OFFER contains no raw row or cursor. Recipient reserves/adopts `C` before
   requesting chunk zero.
4. **Chunk:** only one chunk is in flight. Before `subarray`, base64 conversion
   or response construction, the source root transfers its already charged
   response slice to a response handoff token. No second allocation is hidden
   behind a raw-byte estimate.
5. **Remote send:** MessageRouter unwraps the handoff, serializes while the token
   is live, verifies the actual UTF-8 response length does not exceed the token,
   and registers the token against the exact socket/send. `ws.send(serialized,
   callback)` releases it only from that callback, synchronous throw, exact
   socket close or router shutdown. A source TTL/cancel can retire the session
   and release its untransferred root bytes but cannot release a token already
   handed to transport.
6. **Local send:** the colocated recipient claim is already live. The local
   delivery path unwraps the result and releases the source response token only
   after transferring the value to the caller result. The adopted consumer
   claim then accounts the caller-held base64/input copy.
7. **Consume:** encoded length is checked before base64 decode. The recipient
   validates ordinal/digests, appends under `C`, and requests the next chunk only
   after the previous request has settled. Full decode includes cursors and rows;
   no JSON reconstruction of `{key,row}` is used for a digest.
8. **Publish:** after decode/staging and immediately before the synchronous cache
   visibility swap, the reconcile owner rechecks its exact lifecycle and the one
   original absolute operation deadline with the injected clock. Late work keeps
   debt and publishes nothing. On commit, consumer staging/notification charges
   release after listener scheduling; source and consumer sessions then cancel.
9. **Failure:** malformed, timeout, disconnect, capacity, publication throw,
   replacement and shutdown release each exact root/claim/token once. Transport
   handoffs remain charged until their own send/close terminal event. TTL never
   makes a still queued response free.

The router keeps a bounded map of pending response handoffs keyed by exact
socket/send identity and exposes count/bytes in existing transport stats. The
coverage pool diagnostics enumerate every root, recipient claim and transport
handoff across all endpoints in the shared node pool, including table,
partition, target lifecycle, generation and category where applicable.

## Deadline and recovery class

The production multi-table owner captures one absolute deadline before the
first table and forwards it to every table/page/chunk/wait. Existing background
debt may arm a later generation only after the foreground invocation settles;
it never renews that invocation. Every semantic completion and the synchronous
cache visibility switch recheck the original deadline. Durable CDC event
publication and acknowledgement remain separate owners and are not discharged
by hydration.

Descriptor discovery uses the accepted
`PRIORITY_RECOVERY_BOOTSTRAP` routing token with CRITICAL pressure work class and
CRITICAL delivery priority. Payload OFFER/CHUNK traffic remains BACKGROUND/BULK
and receives no readiness or pressure bypass.

## Required paired evidence

The same candidate must prove:

1. real remote WebSocket response queueing retains the response token until the
   send callback and releases it on callback, throw, close and shutdown;
2. source TTL/cancel during a stalled send releases root bytes but leaves queued
   frame bytes charged until transport termination;
3. local and remote 8 MiB SQLite rows complete under the default 128 MiB pool,
   with high water at or below the exact paired formula and no fixed recipient
   prelease;
4. one-byte-below capacity refuses before materialization; interruption starts a
   new transfer and publishes once;
5. multi-megabyte NUL key/value cases keep raw cursor/row data out of JSON and
   plateau under the configured pool;
6. one absent outer deadline is captured once for a real multi-table caller,
   and a synchronous boundary stall past it publishes nothing and retains debt;
7. source discovery is CRITICAL while payload is BACKGROUND/BULK;
8. shared diagnostics name holds owned by another endpoint; and
9. numeric, oversized, signed, whitespace and noncanonical applied-index text
   refuse before regex/BigInt, while canonical bounded decimal text succeeds.

Impact registration must add the live transport endpoint and primary
WebSocket/local paired witness to `cdc-source-coverage-reconcile-publication`.
This amendment provides no normal-startup, durable CDC obligation, original
event, lost-ACK, transaction activation or snapshot-recovery acceptance.
