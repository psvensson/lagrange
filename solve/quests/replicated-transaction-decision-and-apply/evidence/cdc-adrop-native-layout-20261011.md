# CDC Adrop native-layout evidence

Date: 2026-10-11  
Scope: immutable production-image measurement supporting the next design
correction; no product-source or runtime-policy approval.

## Artifact

The measured executable was copied from:

```text
docker.io/psvensson/lagrange@sha256:b58d44906ac09ffbb7959f717ce5f1a50b087dbd74431e506620a581a894da17
```

Its path in that image is `/nodejs/bin/node`, its SHA-256 is
`1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`,
and its ELF build ID is `d0b2f2fae6c78489250185a4b0379c0dbf87c67a`.
The executable contains DWARF information and an ordinary symbol table.

This v0.2.5 image is measurement evidence. It is not selected as the future
rs-raft release profile.

## Exact layout observations

`objdump` of the executable gives this complete body:

```text
0000000001106d00 <node::TCPWrap::SelfSize() const>:
 1106d00: b8 b0 01 00 00  mov $0x1b0,%eax
 1106d05: c3              ret
```

Thus the exact Node native wrapper self size is 432 bytes. DWARF describes
`uv_tcp_s` with `DW_AT_byte_size: 248`; `ConnectionWrap<TCPWrap, uv_tcp_s>`
embeds that value in the 432-byte wrapper, so 248 is included rather than
added.

A V8 heap snapshot was written synchronously from the first public Node
`drop` event on this executable, before `lib/net.js` called
`clientHandle.close()`. Clients ran in a child process so client-side handles
were absent from the server snapshot. The exact relevant graph was:

```text
synthetic Node / TCPSocketWrap  self_size=432 count=1
  internal native_to_javascript -> object TCP self_size=56
object TCP self_size=56
  internal javascript_to_native -> synthetic Node / TCPSocketWrap self_size=432
```

The server wrapper appeared separately as `Node / TCPServerWrap`, 432 bytes.
The accepted pre-Socket root therefore has 488 bytes of directly reported
native-wrapper plus V8-object self size. The 248-byte libuv handle is already
inside the 432-byte native value. This observation does not by itself bound
allocator extent, async-hook bookkeeping, the synchronous drop record, or the
shared close queue; the effective design reserves those separately and
requires the release profile to attest the conservative cap.

## Reproduction outline

1. `docker create` the immutable image and `docker cp` `/nodejs/bin/node`.
2. Verify the executable SHA above.
3. Run `objdump -d --demangle` around symbol
   `node::TCPWrap::SelfSize() const` and `readelf --debug-dump=info` for
   `uv_tcp_s`.
4. In the immutable image, start a `net.Server` with `maxConnections = 0`.
   Spawn a separate Node child that connects repeatedly. In the first `drop`
   callback call `v8.writeHeapSnapshot()` synchronously.
5. Parse the snapshot using its `node_fields`, `node_types`, `edge_fields` and
   `edge_types`; locate `Node / TCPSocketWrap` and both
   `native_to_javascript`/`javascript_to_native` edges.

The source-side population bound remains the retained Node 22.22.0/libuv
1.51.0 evidence: one accepted root per `uv__server_io` callback and at most 48
full Linux `uv__io_poll` batches before `uv__run_closing_handles`. The layout
measurement supplies sizes; it does not change that count proof.
