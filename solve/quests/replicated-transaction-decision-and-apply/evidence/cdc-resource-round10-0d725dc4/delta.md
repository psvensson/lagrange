
## D21 effective Adrop, subordinate-population and runtime-profile correction

The exact round-nine approved subject is retained at
`evidence/cdc-resource-round9-navigation/subject-0c44f474.md`, SHA-256
`0c44f474493dc001385fe623eb7fb8eeed4d445fb84f075fa498887f2da2a130`.
The runtime prerequisite that found the counterexample is retained unchanged
at `evidence/cdc-runtime-allocation-certification-20261011T2100/`:
`certification-report.md` SHA-256
`4af9e5a5325aa76bcb39a0fd10583e902455eb311f6158b8a31ecd270d6c7c56`
and `packet-sha256.txt` SHA-256
`f219ab10bc2910a6895086bb1e56c0514b6a2db429a809928f6b2ae543ed7c82`.

This section is the effective scoped supersession for three premises only:

1. It replaces D20's one-native-handle `Adrop` premise and every timeline or
   gate that relies on a dropped handle closing before another listener
   callback. `Adrop` is now a standing finite batch envelope.
2. It replaces D11-D13/D15's deadline-derived `maxWireMessages` population and
   the unspecified later population inside the fixed 8 MiB term with the
   countable banks below. The deadline and cadence still govern retry time;
   they no longer multiply resident send copies.
3. It replaces D16/D17's illustrative Node 22.23.2 profile choice with the
   release-owned profile contract and supported-profile inventory below. The
   measured v0.2.5 Node 22.22.0 image is evidence, not the future candidate.

All other D1-D20 guarantees remain operative, including the complete E pair
before the first probe, lower-node then upper-node acquisition, atomic
colocation union, actual send-callback/socket-drain release, D18 ACK then
result settlement, D19 receive phases, ordinary/snapshot isolation, the
unchanged 128 MiB/eight-root limits and the supported 8 MiB and
`16 MiB + 1 byte` cases. The approved caller source at
`2de419483c9b4ce9e3fabc87bb54d93e4afb8817` remains closed.

### Standing `Adrop` batch owned before native acceptance

The unchanged Wbase equation is now read as:

```text
Aactive = eight receiver cells, 448 KiB each        = 3.5 MiB
Adrop   = one standing dropped-accept batch envelope = 0.5 MiB
Aaccept = Aactive + Adrop                            = 4 MiB
Iout    = four dial cells, 1.5 MiB each              = 6 MiB
Iin     = four accepted-lane cells, 1.5 MiB each     = 6 MiB
Wbase   = Aaccept + Iout + Iin                       = 16 MiB
```

`Adrop` is one aggregate reservation, not one handle slot and not an
application admission claim. `CdcCoverageTransferOwner` withholds its complete
512 KiB before MessageRouter starts the dedicated listener and keeps it
withheld for the listener's whole lifetime. This preownership covers native
objects created before JavaScript can classify or claim A. It never borrows an
A/I/E cell and is never lent to a live Socket, HTTP parser, ordinary frame,
snapshot transfer or data root.

The certified Linux profile establishes the population before implementation:

1. One `uv__server_io` call accepts at most one descriptor and Node constructs
   one `TCPWrap` before entering `lib/net.js`.
2. The max-connections branch runs before JavaScript `Socket` and HTTP parser
   construction, emits `drop` synchronously, calls `clientHandle.close()` and
   returns.
3. A Linux `epoll_pwait` result contains a watched descriptor at most once.
   The pinned loop has 1,024 event entries and can repoll only while a full
   batch was returned. Its counter starts at 48. The dedicated listener can
   therefore contribute at most one dropped accepted root to each of at most
   48 batches before `uv__io_poll` returns.
4. `uv__run_closing_handles` runs after that poll and before the next poll.
   Thus at most 48 pre-Socket roots are physically live at once. A sampled
   async-hooks count is not used as the proof.

The immutable measurement in
`evidence/cdc-adrop-native-layout-20261011.md` records the actual base layout:
`TCPWrap::SelfSize() = 432` bytes, its embedded `uv_tcp_t = 248` bytes, and the
associated V8 `TCP` object self size is 56 bytes. The profile uses wider hard
charges so allocator and close bookkeeping are not hidden:

```text
48 dropped accepted roots * Droot, Droot <= 8 KiB       <= 384 KiB
one synchronous fixed drop-data/callback graph          <=  16 KiB
shared poll/async/close bookkeeping for the 48 roots     <=  64 KiB
listener terminal-barrier closure and fixed diagnostics <=  16 KiB
---------------------------------------------------------------------
Adrop maximum                                            <= 480 KiB
Adrop reservation                                          512 KiB
margin                                                     32 KiB
```

`Droot` includes the 432-byte native wrapper, the embedded libuv handle, the
56-byte V8 object, actual allocator extent and every per-root async/close
entry. The fixed `drop` graph has only six bounded address/port/family fields.
The sole MessageRouter `drop` observer is synchronous: it may increment fixed
scalar diagnostics but is nonthrowing and may not retain, stringify, log,
enqueue or invoke user code with the address record. Consequently there is one
live drop-data graph even when 48 native roots await the close phase. The
shared and terminal terms include their real arrays/closures; embedded close
links are not charged again as separate roots.

The artifact profile must prove `Droot <= 8 KiB`, drop graph `<= 16 KiB` and
shared plus terminal values `<= 80 KiB` from the selected executable,
allocator and V8 bytes. The observed 488-byte base is evidence for that check,
not permission to assume the remaining values. A profile exceeding any cap is
unsupported for coverage and stops before listener construction; the 512 KiB
cell and 16 MiB Wbase do not grow.

No per-drop release is fabricated. Node does not expose the pre-Socket handle
to MessageRouter, so the aggregate `Adrop` reservation remains held while the
listener can accept. Each actual native root reaches the pinned libuv close
phase, but that terminal only reduces the population inside the standing
envelope. During shutdown MessageRouter first withdraws the capability and
closes the listening handle, drains all A/I connections, awaits the server's
actual close terminal, and then crosses one refed public `setImmediate`
barrier. The barrier's check phase is in a later loop turn; with the listener
closed no new accept can occur, and the preceding turn's closing-handle phase
has completed. Only then may the transfer owner release the aggregate Adrop
term with the rest of Wbase. Drop emission, `_connections` decrement and a
Socket `close` projection never release it.

The public `maxConnections = 8/0` A gate remains as D20 specifies. Its purpose
is to prevent a constructed Socket after all eight A cells are owned. It does
not establish the Adrop byte/count bound and does not need to stop the listener
between drops. This correction therefore adds no listener family, raw parser,
private-field mutation, retry owner or arbitrary port.

### One fixed 8 MiB bank with executable subordinate counts

The semantic term remains exactly 8 MiB per admitted root. Its byte maxima are:

```text
Bsend = one fixed outbound graph/string/frame/socket/callback population
                                                              <= 320 KiB
Frecv = max(fixed text Buffer+UTF-16+graph, binary raw+header)
       = max(448 KiB, 640 KiB + 64 KiB)                       <= 704 KiB
Pr    = one retained parsed probe graph                       <= 192 KiB
Fmeta = fixed turn/ledger/late/close/deadline metadata        <= 512 KiB
EbootstrapRetained for a remote endpoint                    <= 1,400 KiB
```

`Bsend`, `Frecv`, `Pr` and `Fmeta` are real disjoint
populations. A Buffer and its aliases are one backing whose release waits for
all aliases; a concat, UTF-16 string, parsed graph, frame or socket copy is a
separate charged value. `Frecv` includes the raw `WiPending` backing and its
bounded parsed/header graph. A copied row remains C, and a binary send remains
H. `Ps` occupies a source `Bsend` slot; `Wo` and `Wr` occupy their own
`Bsend` slots. These labels retain their semantic owners even though the
physical fixed-send bank enforces their aggregate count.

The producer and MessageRouter enforce this one local-attempt population:

| Population | Source role | Recipient role | Colocated union |
| --- | ---: | ---: | ---: |
| callback-owned fixed sends (`Bsend`) | 4 | 4 | 8 |
| transferred inbound populations (`Frecv`) | 2 | 2 | 4 |
| retained `Pr` graph | 0 | 1 | 1 |
| `Fmeta` bank | shared role bank | shared role bank | one deduplicated bank |
| retained bootstrap | one 1,400 KiB earmark | one 1,400 KiB earmark | 0 |

The source role's four send slots are two atomic ACK/fixed-result pairs: one
older pair may remain callback-owned while one current pair is emitted. Before
sending ACK, the responder claims both fixed slots, or one fixed ACK slot plus
the already preowned H result slot. It can therefore always emit the one
result promised by ACK. The recipient role uses at most a previous and current
request slot plus one terminal/control slot; its fourth slot is the
preacquired completion margin. No locally valid send begins without its own
slot.

The source's two receive slots cover the current request and the one already
scheduled successor allowed by D19. The recipient's two slots cover ACK and
the exact JSON or binary result. Semantic permission for N+1 may be recorded
while an old send callback remains, but the local producer waits for the
required physical slot. The requester also waits until the prior ACK/result
raw receive slots reach emitter/consumer unwind before emitting N+1. Waiting
uses the original shared-generation deadline and existing reconcile wake; it
does not turn a valid N+1 into refusal. A third application emitter terminates
the lane under D19 and remains charged in I close scratch rather than creating
a fifth receive slot.

`Fmeta` has at most eight send-credit records, four receive-credit records,
four `pendingMessages` entries, four `pendingResponses` entries, four retired
late contexts, two endpoint turn records, two close records and two existing
deadline/cadence wake records. It also covers the bounded terminal CLOSE
frames and fixed aggregate diagnostics. Every record carries the existing
bounded request/endpoints/roles/boot/admission/connection-generation/ordinal
identity. No payload, row, arbitrary error text, address record or per-retry
history can enter Fmeta.

Physical release, rather than semantic settlement, returns a bank slot:

- a send slot releases on its exact ws callback, synchronous throw or exact
  generation close/drain;
- a receive slot releases after both emitter and consumer/handler aliases are
  terminal, with derived copies separately charged;
- a retired late context releases only after the old lane's response/close
  terminal;
- a deadline retires the lane but releases none of these values by itself.

At most two protocol windows can therefore overlap physically. If callbacks
never arrive, the bank fills, new sends wait, the original deadline retires
the lane, and same-identity redrive waits for the old I/send/late drain. The
30-second/100-millisecond cadence may cause many sequential attempts but
cannot create 300 simultaneous `Bsend` copies.

The byte proof is strict and leaves unused space:

```text
remote endpoint:
  bootstrap 1,400 + 4*Bsend 1,280 + 2*Frecv 1,408
  + Pr 192 + Fmeta 512                              = 4,792 KiB
  fixed term                                        = 8,192 KiB
  margin                                            = 3,400 KiB

colocated atomic source+recipient union:
  no bootstrap + 8*Bsend 2,560 + 4*Frecv 2,816
  + Pr 192 + one Fmeta 512                          = 6,080 KiB
  fixed term                                        = 8,192 KiB
  margin                                            = 2,112 KiB
```

Both remote node orders use the same role banks after the complete lower then
upper E acquisition. Colocation reserves the single deduplicated union before
the probe. More than eight compliant peers cannot add subordinate populations:
only eight root sessions are admitted, and excess peers retain debt under the
existing cadence. For an admitted root, pressure waits within these preowned
slots and cannot consume an ordinary or snapshot budget.

The whole-pool arithmetic remains:

```text
8 MiB row:       Wbase 16 + S 18 + H 2 + C 25 + K 16 + fixed 8 = 85 MiB
16 MiB + 1 byte: Wbase 16 + S (34 MiB + 2 B) + H 2
                 + C (49 MiB + 3 B) + K 16 + fixed 8
                                                               = 125 MiB + 5 B
```

Thus both supported cases can be admitted under 128 MiB; the correction does
not rely on always refusing them. The unused fixed-bank margin cannot enlarge
S/H/C/K, Wbase, a row limit or an ordinary/snapshot message.

### Existing release/runtime owner profile proposal

The release workflow remains artifact-policy/publication-receipt owner. The
existing runtime-provenance measurement remains the boot owner. MessageRouter
only consumes that owner's typed result before Wbase/listener construction; it
does not implement a second provenance check.

The owner publishes one versioned `coverage-runtime-profile/1` for every
distribution form that is to advertise coverage:

| Supported form | Profile binding |
| --- | --- |
| OCI/Helm | immutable final OCI digest -> embedded profile-manifest digest in the existing external release receipt |
| SEA executable | SEA executable digest -> embedded/adjacent profile-manifest digest in the SEA build receipt |
| source/npm and lab | exact `process.execPath` digest, Node/V8/libuv tuple, repository/lock/dependency digest and native-profile digest in the existing build/lab provenance receipt |

The broad Node 22+/npm/source, SEA and Docker/Helm contracts remain inventory;
none is silently relabeled as certified. Each form that must perform coverage
recovery receives its own exact profile. An arbitrary compatible Node 22
binary may continue ordinary and snapshot behavior, but cannot advertise the
versioned coverage capability until the existing build/runtime owner has
certified its exact bytes. The current immutable v0.2.5 image is only the
measurement baseline above. A future rs-raft candidate needs a new receipt and
profile bound to its own final artifact.

The profile manifest contains:

- revision, artifact kind, executable path/size/SHA/build ID,
  `process.versions`, OS/architecture/libc and immutable base identity;
- repository/source, package-lock and installed dependency digests, plus ws
  version and exact receiver/websocket file hashes;
- Node/libuv source archive identities bound by the build owner to the
  executable, and the native constants used by the proof: poll array 1,024,
  repoll count 48, `TCPWrap` 432, embedded `uv_tcp_t` 248, V8 TCP object 56,
  and the attested Droot/drop/shared caps;
- the versioned receive-profile fields and the design ceilings for Aactive,
  I, Mlane, Gc, Bsend, Frecv, Fmeta, S, H, C and K.

The two bindings stay noncircular. Immutable builder and runtime bases are
named by digest in the build. The in-artifact manifest can bind all local
bytes but cannot contain the final OCI digest. After push, the existing release
receipt binds that final digest to the embedded manifest digest. Source/npm,
lab and SEA receipts bind their own final executable instead. Copying an
environment value is not byte measurement; the current distroless image's
missing `/app/package-lock.json` must be repaired by embedding the lock digest
or packaging the lock for the existing provenance owner.

At startup the existing provenance owner verifies the local profile before
MessageRouter allocates Wbase or binds the coverage endpoint. Mismatch returns
a typed `COVERAGE_RUNTIME_UNCERTIFIED`; MessageRouter withholds only the
coverage listener/capability. Ordinary transport and snapshot startup remain
under their current contracts. The existing coverage reconcile/recovery owner
keeps affected CDC debt and prevents only the dependent partition/role from
publishing transaction-serving state. This creates no new global readiness
barrier and no cycle in which coverage is needed to verify the runtime.

One operator policy decision remains explicit: a deployment profile may mark
coverage recovery required. For such a profile, the existing release/deployment
admission must reject an uncertified image/SEA/source receipt before rollout;
runtime does not force an uncertified node ready. A profile that does not
require coverage may start its currently supported ordinary/snapshot surfaces,
but cannot host or publish a partition whose recovery owes this coverage debt.
The release/runtime owner must choose and record that requirement per supported
distribution; MessageRouter cannot infer it from Docker, Helm, Node version or
an open port.

Exact owner changes requiring approval are:

1. digest-pin builder/runtime bases and add the profile-manifest composition to
   the existing release, SEA, source/npm and lab receipts;
2. bind executable bytes to exact Node/libuv source and record the native
   layout/allocator attestation before a profile becomes coverage-capable;
3. make the existing runtime-provenance owner verify the manifest for its
   distribution form and return the typed certification result;
4. make existing deployment admission enforce its declared coverage-required
   policy and deploy OCI images by immutable digest;
5. let MessageRouter consume that result before only the coverage Wbase/bind/
   capability path, while the existing reconcile/publication owners retain
   debt and partition publication authority.

No new provenance store, startup coordinator, retry framework, readiness
owner or global support restriction is introduced.

### Noncircular certification and source HOLD

The gates split by when their evidence can exist:

**Before coverage transport implementation:** the release/runtime owners must
approve the profile composition and supported-form policy; a selected future
candidate profile must bind exact executable/source/dependency bytes and prove
the 48-root Adrop count plus the `8/16/64/16 KiB` envelope components above.
These facts depend on the runtime artifact and existing release machinery, not
on a coverage adapter. Failure keeps the coverage listener absent.

**On a later implementation candidate:** object/copy census verifies
`Aactive <= 448 KiB`, `Mlane <= 48 KiB`, `Gc <= 192 KiB`,
`Bsend <= 320 KiB`, `Frecv <= 704 KiB`, `Fmeta <= 512 KiB` and the existing
S/H/C/K ceilings. Tests must hold callbacks and receive aliases to reach all
declared counts, including old/current windows, bootstrap overlap, late result,
terminate and close drain. These coefficients cannot be measured on code that
does not yet exist; the hard caps and refusal behavior are already fixed here.
An implementation that exceeds them stops and returns to the existing owner
for a real-copy reduction or explicit contract decision.

Product transport, deployment and runtime-policy source remain held until an
independent review accepts this scoped supersession. A future failure may not
increase 128 MiB, enlarge Wbase or the fixed term, shrink the supported rows,
borrow ordinary/snapshot capacity, count native allocations as free, or revive
the one-handle premise.

### Corrected compact ownership timeline

| Phase | Simultaneous ownership | Locally observable transition |
| --- | --- | --- |
| profile/start | Existing provenance owner validates the exact distribution receipt; transfer owner withholds 16 MiB Wbase including standing 512 KiB Adrop | Certified result permits the dedicated bind/capability; typed uncertified result withholds it and leaves existing dependent debt |
| accept/drop | At most eight A cells own constructed paused Sockets; pre-Socket max-connection roots use the standing 48-root Adrop envelope | `drop` retains no record; native close phase reduces its physical population, but reservation remains |
| complete pair | Ibootstrap owns one bounded pair window; both full E units are acquired lower then upper | Surviving bootstrap references move into the 1,400 KiB earmark before the one probe |
| request/ACK/result | Source/recipient role banks own at most four sends and two receives each; responder reserves ACK/result capacity before ACK | ACK settles only PL; exact JSON/binary result settles RD; valid N+1 waits for physical credits without refusal |
| transfer/late input | S/H/C/K remain disjoint; old raw result stays in Frecv/WiPending while next native I phase uses its own slots | Actual emitter/consumer and send callback/close terminals release exact credits; timeout alone releases nothing |
| retry/close | Old I, send and late contexts retain their bank slots; no replacement lane uses them | Existing reconcile cadence redrives only after exact old drain and within the unchanged generation deadline |
| shutdown | Capability is withdrawn; listener, A/I, ledgers, callbacks and native close roots drain while Wbase remains held | Server close plus later public immediate barrier proves no Adrop root remains; Wbase releases once |

### D21 correction mapping

| Failed prerequisite | Effective replacement | Remaining acceptance |
| --- | --- | --- |
| one Adrop native identity | standing 48-root, 480 KiB maximum inside the unchanged 512 KiB aggregate; Wbase owns it before listen through the post-close barrier | selected artifact must attest the conservative root/record/shared sizes and exact Node/libuv source binding |
| cadence-derived or unspecified fixed population | four-send/two-receive role banks, eight/four colocated union, one Pr and one Fmeta; remote 4,792 KiB and colocated 6,080 KiB | later candidate must enforce actual callback/alias terminals and remain within each fixed coefficient |
| developer Node 22.23.2 treated as the target | per-distribution `coverage-runtime-profile/1` under existing release and boot-provenance owners | operator records which supported forms require coverage; the future candidate, not v0.2.5, supplies the final immutable profile |
| implementation-dependent coefficients required before code exists | runtime/native facts close before transport work; adapter copy/object coefficients close on the later candidate against already fixed ceilings | any overrun is a STOP and owner decision, never a silent coefficient or pool change |

This is a design correction only. It does not approve product source, tests,
runtime policy, deployment changes, metadata or publication, and it does not
reopen the closed caller or transaction semantics.
