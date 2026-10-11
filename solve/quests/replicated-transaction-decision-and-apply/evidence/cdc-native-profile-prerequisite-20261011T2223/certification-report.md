# CDC selected-native profile prerequisite

Date: 2026-10-12 Europe/Stockholm  
Approved design subject before evidence erratum:
`b4b0294f4e91f09773f708e5e006c936c9617129e550dcfa2707032d07c76269`  
Independent design approval:
`f68026470d22e3d3762cdf8c884c638553bb2b3943d6030fd02b0d21e8c97c1d`

## Disposition

The conservative selected-native prerequisite **passes for the exact measured
Linux/x64 Node 22.22.0 profile**. The result removes the earlier source-identity
and native-layout blockers for implementation against that reference profile.
It does not certify a future release artifact or any other supported delivery
form.

The approved future adapter measurements remain source gates. In particular,
the implemented 4/8/4 KiB `Rterminal` graph, `Mlane`, `Aactive`, `Bsend`,
`Frecv`, `Fmeta`, `S`, `H`, `C` and `K` must be measured from their actual
source. They are not circular preimplementation requirements and this packet
does not fabricate them.

## Executable and source chain

The historical application image is still measurement evidence rather than
the future candidate. Its 19-layer distroless prefix exactly matches signed
index `sha256:8a3e96fe...`. Pinned cosign v2.6.1 verifies the index and its SPDX
attestation as issued to the distroless service account. The attestation binds
the base to the official Node 22.22.0 Linux/x64 archive SHA `c33c39ed...`.

The executable extracted from that archive is byte-identical to
`/nodejs/bin/node` from the application image, SHA `1bec56ef...`. The Node
release `SHASUMS256.txt` signature validates under the exact active release
key retained here. The official source archive SHA is `5a4585d7...`; all 16
Node and embedded-libuv files used by the design compare byte for byte with
the prior retained source packet. `profile-identity.json`,
`source-correspondence.tsv` and `commands-and-results.md` contain the exact
chain and reproduction commands.

## Hard native caps

The source population proof remains one accepted root per listener callback,
1,024 events per Linux poll batch and at most 48 full-batch polls before the
close phase. The exact binary and selected allocator give these stronger
values:

| Component | Selected-profile value | Design ceiling | Result |
| --- | ---: | ---: | --- |
| one native wrapper allocation | 448-byte glibc chunk for 432-byte request | part of 8 KiB Droot | pass |
| one V8 `TCP` object | 56 bytes | part of 8 KiB Droot | pass |
| one destroy scalar | 8 bytes | part of 8 KiB Droot | pass |
| conservative Droot graph | 512 bytes | 8 KiB | pass |
| 48 charged Droot values | 24 KiB observed-layout upper sum; 384 KiB hard charge retained | 384 KiB | pass |
| complete maximum-shape synchronous drop graph | 1,064 bytes | 16 KiB | pass |
| compiled poll frame plus destroy vector/callback | 19,880 bytes | 64 KiB | pass |

The 15,720-byte compiled poll frame includes both `events[1024]` and
`prep[256]`. Close-list links live inside the already charged libuv handle.
The 512-double destroy vector is reserved when the Node Environment starts;
48 scalar IDs do not grow it. The empty-to-nonempty transition allocates one
32-byte callback, a 48-byte allocator chunk. No sampled RSS or async-hooks
count is used as a hard cap.

Using the approved charges rather than the smaller observed values remains:

```text
48 * 8 KiB Droot       = 384 KiB
fixed drop graph       =  16 KiB
shared poll/close      =  64 KiB
standing terminal term =  16 KiB
                         -------
maximum                = 480 KiB
Adrop reservation      = 512 KiB
margin                 =  32 KiB
```

The standing terminal 16 KiB remains reserved in that equation. Its actual
object census is deliberately `future_source_witness` because the approved
MessageRouter adapter does not exist yet.

## Profile and implementation boundary

This reference is sufficient to implement the existing runtime provenance,
transfer and MessageRouter owners without guessing native coefficients.
Implementation may consume only an exact `coverage-runtime-profile/1` result;
version strings and `engines >=22.12.0` cannot activate the listener.

Every advertised recovery-capable form remains required. OCI/Helm, SEA,
npm/source and lab each remain **HOLD for an exact future-candidate receipt**.
The historical image cannot satisfy that release gate. No feature switch may
turn recovery off to pass a form, and ordinary/snapshot behavior does not
substitute for the required coverage capability.

Transport source acceptance also remains HOLD for independent review and the
cumulative witnesses in the approved design. Caller source
`2de419483c9b4ce9e3fabc87bb54d93e4afb8817` remains closed.

