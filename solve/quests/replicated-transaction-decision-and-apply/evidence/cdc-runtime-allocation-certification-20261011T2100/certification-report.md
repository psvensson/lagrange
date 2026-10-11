# CDC runtime and allocation certification prerequisite

Date: 2026-10-11  
Approved design subject: 0c44f474493dc001385fe623eb7fb8eeed4d445fb84f075fa498887f2da2a130  
Independent design approval:
aa0e355c25522395bacf9123fe7197815918476b40614318fcc4bfd95a577b64

## Scope and disposition

This packet evaluates the runtime/allocation SOURCE gate that follows the
approved D1-D20 design. It changes no product, deployment, test, Quest
metadata, index or log source.

**Disposition: STOP before coverage transport source.** The immutable current
production image is inventoried, several native premises pass conditionally,
and both supported row cases have mathematical pool headroom. Certification is
not complete because the existing release owner does not bind the runtime
executable to source/profile facts, the fixed coefficients are not yet
source-certified, and the actual subordinate send/callback population inside
the fixed 8 MiB term is undefined. The pinned Linux loop also provides a
concrete counterexample to the approved one-handle Adrop premise. These are
prerequisite facts; none is
resolved by increasing the pool, reducing supported rows, or treating measured
RSS as a cap.

The approved caller at
2de419483c9b4ce9e3fabc87bb54d93e4afb8817 and all nontransport behavior remain
closed and unchanged.

## Actual production artifact

The release receipt at data/releases/v0.2.5.json binds revision
0d66b0cb67e7778500e33e65dcd9155163070458 to:

    docker.io/psvensson/lagrange@sha256:b58d44906ac09ffbb7959f717ce5f1a50b087dbd74431e506620a581a894da17

The raw OCI manifest in production-image-manifest.json hashes to that exact
digest. The digest-pinned image, rather than the mutable latest tag, reports:

| Fact | Exact observation |
| --- | --- |
| OCI config | sha256:0aaa52816a94c7042f3495c9b5faa5d2c4bd1642e0d3cf6fad2c20e171646f50 |
| platform | Linux x64, Debian 12 distroless, glibc 2.36 |
| executable | /nodejs/bin/node, 123,405,064 bytes |
| executable SHA-256 | 1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31 |
| Node / V8 / libuv | 22.22.0 / 12.4.254.21-node.33 / 1.51.0 |
| application source | 1,701 files, 17,479,301 bytes, content digest c1464ca6df05257ab61027d7d8cf475fd9f4fbfd52a2256cf1b1ac6a451a29cc |
| installed dependencies | 5,934 files, 276,530,621 bytes, content digest 79a86c65345b9d20cd22c2ee31f7c12ea6d7fd25ed6261a1705221a58065a54f |
| dependency manifests found | 237 |
| ws | 8.21.0; receiver SHA 4879edbf8e48d04d09783cf9c04b5e25f5a448247bb01279438ded2899747220 |
| better-sqlite3 | 11.10.0; addon SHA d7d9272b12d11c1dc2bb787741b1b7c4037d336155f316ace3420410c28fda37 |
| runtime lock | /app/package-lock.json is absent |

production-runtime-inventory.json contains every process.versions field, all
237 discovered package manifests with their hashes, selected executable
dependency hashes, and the source/dependency tree digests. The exact command
is sh capture-production-image.sh; its probe is
production-image-inventory.mjs.

The release-revision Dockerfile and workflow are retained under
production-release-source-0d66b0cb67e7778500e33e65dcd9155163070458/.
Both builder and runtime FROM values are mutable names
(node:22-slim and gcr.io/distroless/nodejs22-debian12). The workflow builds
only linux/amd64, tests version/label, and records the final registry manifest
digest. It records no base digest, executable digest, Node/libuv profile,
installed-dependency digest, or native-source identity.

The earlier native packet studied Node 22.23.2 executable
3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327.
It is not the production executable. The 22.22.0 env.cc, stream_wrap.cc,
stream_base.cc, and libuv 1.51.0 stream.c bytes are identical to the earlier
retained files. node_http_parser.cc is not: 22.23.2 adds native request
header-pair tracking that 22.22.0 lacks. Matching a few functions therefore
cannot promote the old profile to production certification.

## Existing runtime-owner decision proposed

The existing release workflow remains the artifact policy and publication
receipt owner. The existing runtime provenance measurement surface remains the
boot byte-measurement owner; this work does not create another provenance,
admission or retry framework.

The bounded owner change required before coverage source is:

1. Release builds name the builder and distroless runtime by immutable digest.
2. Before the final image layer, the release owner writes one in-image runtime
   manifest containing base digest, revision, executable SHA, complete
   process.versions, platform/architecture/libc, source digest, production
   dependency digest, package/lock digest, and the exact ws/native profile
   source identifiers used by certification.
3. The post-push receipt maps the final OCI manifest digest to that in-image
   manifest digest. The final OCI digest cannot be embedded in its own image;
   the receipt owns that non-self-referential binding.
4. Deployment uses the immutable image reference. At boot, the existing
   provenance owner remeasures local bytes and profile facts against the
   embedded manifest before MessageRouter constructs Wbase or binds/publishes
   the coverage endpoint. Mismatch withholds the versioned coverage capability
   and fails coverage-dependent startup.
5. Other Node/npm/SEA profiles retain ordinary and snapshot behavior. A
   profile can advertise coverage only after its own artifact-bound
   certification. This is an explicit capability contract, not a silent
   reinterpretation of package engines.

The proposed runtime-build-provenance.js already measures executable, source,
dependencies and native addons, but its source-tree path calls
measureRuntimeContent(), which requires /app/package-lock.json. The production
Dockerfile does not copy that file, so the current distroless path would report
provenance unavailable. The release/runtime owner must compose the manifest
and packaged dependency measurement coherently; an environment value cannot
replace measured bytes.

## Native receive and close trace

Exact upstream Node 22.22.0 and libuv 1.51.0 files, licenses, URLs and hashes
are retained under node-v22.22.0-libuv-v1.51.0/. They establish these source
properties:

1. libuv uv__server_io accepts one descriptor, stores it as accepted_fd, and
   invokes one connection callback. Node ConnectionWrap::OnConnection
   constructs a TCP wrapper, performs uv_accept, then calls JavaScript.
2. Node lib/net.js tests
   maxConnections != null && _connections >= maxConnections before it
   constructs a JavaScript Socket. At zero it emits the fixed drop record,
   closes the client handle, and returns. _connections is incremented only
   after Socket construction and decremented earlier in Socket destroy.
3. Linux uv__io_poll invokes the listener watcher once for one returned event,
   but it can issue another epoll_pwait before returning when the previous
   batch contains exactly 1,024 events. Its fixed poll-loop count starts at 48.
   The listener remains active after the maxConnections drop branch, so another
   batch can call uv__server_io and accept/drop another handle. uv_run does not
   call uv__run_closing_handles until uv__io_poll finally returns. The approved
   one-native-handle Adrop premise is therefore false for the pinned source
   without an additional public enforcement boundary.
4. A diagnostic with server.maxConnections = 0 attempted 256 loopback
   connections on the production executable. It produced drop events and zero
   JavaScript connection events. It observed peak two main-isolate TCPWRAP
   async identities before async-hooks destroy notification. Therefore
   async-hooks lifetime is not a valid proxy for native close overlap. The
   source close phase also cannot establish the required one-handle bound
   because of the intra-uv__io_poll repoll above.
5. libuv uv__read requests a 64 KiB buffer and limits one read callback to 32
   iterations. Node allocates the suggested managed BackingStore; a short read
   temporarily overlaps it with one exact-nread BackingStore before the
   JavaScript read callback. The HTTP parser uses a fixed 64 KiB current buffer
   and can copy its current bytes for upgrade.
6. The production ws 8.21.0 bytes expose and propagate maxPayload,
   maxFragments, maxBufferedChunks and deferred event delivery. Its source
   checks the limits at the retained push points recorded by the approved
   design.

The source trace is not yet executable provenance. The production image has no
attestation that binds /nodejs/bin/node SHA 1bec... to the retained upstream
source bytes. Its matching /nodejs/LICENSE, version strings and behavior are
corroboration, not that missing binding.

Source navigation for independent checking:

| Concern | Retained source |
| --- | --- |
| accepted native wrapper before JS | node-src-connection-wrap.cc.txt:33-74 |
| Node maxConnections zero/drop and Socket construction order | node-lib-net.js.txt:2235-2302 |
| early native-count decrement | node-lib-net.js.txt:853-859 |
| one libuv accept per server callback | libuv-unix-stream.c.txt:508-532 |
| 64 KiB read and 32-iteration turn | libuv-unix-stream.c.txt:1025-1105 |
| Linux poll dispatch and pre-close repoll | libuv-unix-linux.c.txt:1498-1598 |
| close phase before next loop | libuv-unix-core.c.txt:427-480 |
| managed backing allocation/release | node-env.cc.txt:754-775 |
| short-read exact copy | node-stream-base.cc.txt:686-716 |
| HTTP fixed buffer/current upgrade copy | node-http-parser.cc.txt:737-807 |
| ws retained-push limits | repository node_modules/ws/lib/receiver.js:440-584 |
| ws fragment reset/deferred emitter | repository node_modules/ws/lib/receiver.js:595-665 |
| current bulk send lifetime gap | repository src/transport/bulk-transfer-channel.js:244-285 |

### Old fragment release witness

run-ws-fragment-root-probe.sh runs the exact production V8 and ws receiver with
two independently backed fragments. It retains the real deferred dataMessage
closure, advances to a later task, forces weak processing, and checks
ArrayBuffer roots.

Before the deferred emitter executes, _fragments is empty and both original
fragment backing stores are unreachable; the deferred callback is still
present. After emitter and write-callback unwind, the original backings remain
unreachable while the intentionally retained contiguous 64 KiB payload
remains live. This passes the approved D19 old-fragment premise for this exact
observed V8/ws pair. It does not certify a different image or remove the
separate current/transient native read terms.

## Coefficient census

| Term | Approved ceiling/equation | Result on this prerequisite |
| --- | --- | --- |
| Mlane | 48 KiB per I cell | **Uncertified.** The coverage Socket/Receiver/turn/ledger adapter does not exist, so the exact object/count graph cannot be enumerated. |
| Gc | 192 KiB (2*Lc + Mf) | **Arithmetic only.** No implemented canonical control schema yet enforces every string/count maximum before allocation. |
| Bsend | 320 KiB per fixed outbound population | **Uncertified.** Existing bulk sendControl() has no send callback or pending-count debit; sendChunkFrame() calls ws.send() without a callback and ends its in-flight term immediately. |
| Aactive | eight times 448 KiB = 3.5 MiB | **Uncertified.** Native/parser maxima are traced, but the exact HTTP header graph, rejection write, Socket/ws upgrade objects and close-retained fixed metadata are not implemented/censused. |
| Adrop | one 512 KiB cell | **Failed premise / STOP.** Linux uv__io_poll can repoll before the close-handles phase when a batch contains 1,024 events, so two or more dropped native handles can overlap. The source loop limits such batches to 48, but neither the one-identity contract nor the 512 KiB coefficient covers/certifies that population. |
| Iout + Iin | eight times 1.5 MiB = 12 MiB | **Phase arithmetic passes; fixed coefficients remain uncertified.** Old fragment witness passes for the production V8/ws pair. |
| S | 34 MiB + 2 bytes at a 16 MiB + 1 row | **Approved target only.** Current product code still uses the prior page/base64 copies and is not the approved binary/copy implementation. |
| H | 2 MiB | **Approved target only.** Actual callback-owned binary result path is not implemented. |
| C | 49 MiB + 3 bytes at a 16 MiB + 1 row | **Approved target only.** Preallocated final P/direct-copy path is not implemented. |
| K | 16 MiB | **Approved target only.** Exact cache/listener population measurement remains a later source gate. |

The Wbase integer equation itself is exact:

    8 * 448 KiB + 512 KiB + 4 * 1536 KiB + 4 * 1536 KiB
    = 16,384 KiB
    = 16 MiB

No margin exists inside Wbase. Every coefficient and count must therefore pass;
one larger term is a STOP rather than an adjustment to another cell. The
Adrop source counterexample alone keeps implementation stopped.

## Fixed 8 MiB term

The remote bootstrap earmark is 1,400 KiB, leaving 6,792 KiB for all later
Ps + Pr + WiPending + Wo + Wr populations. That relation is reproduced in
approved-allocation-ledger.json.

The approved deadline and cadence alone do not define the simultaneous physical
population. The current constants permit as many as
floor(30,000 / 100) = 300 retry opportunities. If one 320 KiB Bsend copy from
each turn could remain callback-owned, bootstrap plus those copies would be
97,400 KiB, far above 8 MiB. The approved protocol prevents that only when the
producer enforces an explicit subordinate send-credit count, waits when those
credits are occupied, and drains the old lane before redrive.

The existing bulk default MAX_PENDING_SENDS = 8 cannot be substituted as that
proof: fixed controls bypass it, and binary send completion is recorded before
the ws send callback/socket drain. MessageRouter's current JSON sends also omit
callbacks. Consequently there is no executable current population from which
to census Ps/Pr/WiPending/Wo/Wr, and no honest way to distribute the remaining
6,792 KiB among them. This is the exact fixed-term STOP.

The source implementation may use the approved existing owners to establish
the missing count: CdcCoverageTransferOwner preowns the bytes/counts,
MessageRouter owns the exact send/pending/late identities, and the typed bulk
lane machinery supplies connection/pacing structure. It must make fixed
controls and binary results share one actual callback-owned credit bank; it
must not add a retry, ledger or budget owner.

## Supported-case admission arithmetic

The approved whole-operation equations still show real headroom when all
coefficients are eventually enforced. Including Wbase and the entire fixed
8 MiB semantic-control term:

| Colocated case | Wbase | S | H | C | K | controls | Total | 128 MiB margin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 8 MiB row | 16 MiB | 18 MiB | 2 MiB | 25 MiB | 16 MiB | 8 MiB | 85 MiB | 43 MiB |
| 16 MiB + 1 byte row | 16 MiB | 34 MiB + 2 B | 2 MiB | 49 MiB + 3 B | 16 MiB | 8 MiB | 125 MiB + 5 B | 3 MiB - 5 B |

Thus neither supported case is mathematically forced to refuse. Admission is
not source-certified until the coefficient and fixed-term STOPs above close.
Both endpoint orders use the same per-node complete units; colocation consumes
the one atomic union. This calculation does not borrow ordinary/snapshot
capacity or change the eight-root ceiling.

## Required closure before transport implementation

1. The release/runtime owner accepts the non-self-referential immutable
   manifest/receipt composition and selects an actual artifact profile.
2. The existing listener/transfer owners choose a bounded Adrop correction:
   either a public mechanism that prevents a second listener callback before
   the first drop handle closes, or a finite count/byte population proven
   within the unchanged Adrop cell. The pinned source permits as many as 48
   intra-poll batches, so the current one-identity premise cannot be retained.
3. The candidate artifact binds executable bytes to exact native sources and
   reruns the retained production probes.
4. The coverage adapter supplies an executable object/copy census for Mlane,
   Gc, Aactive, I close overlap, Bsend and S/H/C/K.
5. MessageRouter/bulk send composition supplies one callback-owned subordinate
   count and proves the complete 1,400 KiB bootstrap plus later
   Ps/Pr/WiPending/Wo/Wr population fits 8 MiB.
6. The actual build/startup owner verifies the embedded profile before
   Wbase/listen and records the external OCI digest/profile binding.

Until then the approved design remains valid, production transport source
remains held, and ordinary/snapshot support is unchanged.
