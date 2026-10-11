# Commands and results

All commands ran on 2026-10-11 UTC. Large downloaded archives, the copied
123,405,064-byte executable and heap snapshots remained in
`/tmp/cdc-node-cap-20261012`; their digests and reproduction inputs are
retained here instead of copying bulky derived data into the Quest.

## Immutable image and signed base

```sh
docker image inspect \
  docker.io/psvensson/lagrange@sha256:b58d44906ac09ffbb7959f717ce5f1a50b087dbd74431e506620a581a894da17 \
  --format '{{json .RepoDigests}} {{json .RootFS.Layers}}'
docker buildx imagetools inspect \
  gcr.io/distroless/nodejs22-debian12@sha256:8a3e96fe3345b5d83ecec2066e7c498139a02a6d1214e4f6c39f9ce359f3f5bc \
  --format '{{json .}}'
```

Result: all 19 distroless Linux/x64 rootfs diff IDs are the exact prefix of
the application image. The signed index names Linux/x64 manifest
`sha256:8e8237445c76a400dfa7832936605e5da55752ec245b5dd659466506ed010fa7`.

```sh
docker run --rm \
  ghcr.io/sigstore/cosign/cosign@sha256:68839b7f13dac5a6744a5d8818e984dd39183374e37855c19e14d623d9bc9037 \
  verify --certificate-identity keyless@distroless.iam.gserviceaccount.com \
  --certificate-oidc-issuer https://accounts.google.com \
  gcr.io/distroless/nodejs22-debian12@sha256:8a3e96fe3345b5d83ecec2066e7c498139a02a6d1214e4f6c39f9ce359f3f5bc

docker run --rm \
  ghcr.io/sigstore/cosign/cosign@sha256:68839b7f13dac5a6744a5d8818e984dd39183374e37855c19e14d623d9bc9037 \
  verify-attestation --type spdxjson \
  --certificate-identity keyless@distroless.iam.gserviceaccount.com \
  --certificate-oidc-issuer https://accounts.google.com \
  gcr.io/distroless/nodejs22-debian12@sha256:8a3e96fe3345b5d83ecec2066e7c498139a02a6d1214e4f6c39f9ce359f3f5bc
```

Both pass. The signed SPDX statement has subject digest `8a3e...` and names
the Linux/x64 Node archive URL and SHA `c33c...`, Node 22.22.0 and libc6
2.36-9+deb12u13. Its DSSE blob is 856,836 bytes, SHA-256 `1b056c...`.

## Official binary and source correspondence

```sh
curl -fsSLO https://nodejs.org/dist/v22.22.0/SHASUMS256.txt
curl -fsSLO https://nodejs.org/dist/v22.22.0/SHASUMS256.txt.sig
curl -fsSLO https://nodejs.org/dist/v22.22.0/node-v22.22.0-linux-x64.tar.gz
curl -fsSLO https://nodejs.org/dist/v22.22.0/node-v22.22.0.tar.gz
git clone --depth 1 https://github.com/nodejs/release-keys.git
gpg --homedir release-keys/gpg-only-active-keys --status-fd 1 \
  --verify SHASUMS256.txt.sig SHASUMS256.txt
```

The release-key repository HEAD was
`481637f813e912c4aa3622d7964ab426c97b8e8d`. GPG returned `GOODSIG` and
`VALIDSIG CC68F5A3106FF448322E48ED27F5E38D5B0A215F`. The retained key has
SHA-256 `e31e1aa40a8331f01d753cef475f7b9eab934fc25f5f0b36995bfd80bd66ad27`.

```sh
tar -xOf node-v22.22.0-linux-x64.tar.gz \
  node-v22.22.0-linux-x64/bin/node | sha256sum
cmp -s <(tar -xOf node-v22.22.0-linux-x64.tar.gz \
  node-v22.22.0-linux-x64/bin/node) copied-production-node
```

The extracted and application executables both hash to `1bec56...`; `cmp`
returns zero. Each source listed in `source-correspondence.tsv` was streamed
from source archive SHA `5a4585...` and compared with the earlier retained
source packet. All 16 compare equal.

## Compiled layout and allocator

```sh
objdump -d --demangle \
  --disassemble='node::TCPWrap::New(v8::FunctionCallbackInfo<v8::Value> const&)' \
  copied-production-node
objdump -d --demangle --disassemble=uv__io_poll copied-production-node
objdump -d --demangle \
  --disassemble='node::AsyncWrap::EmitDestroy(node::Environment*, double)' \
  copied-production-node
gdb -q -batch -ex 'file copied-production-node' \
  -ex 'ptype /o struct epoll_event' -ex 'p sizeof(struct epoll_event)'
```

The exact executable calls `operator new(0x1b0)` for `TCPWrap`; the retained
heap snapshot reports its V8 `TCP` peer as 56 bytes. `uv__io_poll` reserves
`0x3d38` bytes and saves six 8-byte words, so the whole compiled frame is
15,720 bytes. `struct epoll_event` is 12 bytes. `EmitDestroy` uses the
environment's startup-reserved 512-double vector and allocates one 32-byte
callback when the list changes from empty.

```sh
cc -O2 -Wall -Wextra -o malloc-extent-probe malloc-extent-probe.c
docker run --rm --entrypoint /probe/malloc-extent-probe \
  --volume "$PWD:/probe:ro" \
  gcr.io/distroless/nodejs22-debian12@sha256:8a3e96fe3345b5d83ecec2066e7c498139a02a6d1214e4f6c39f9ce359f3f5bc
```

The helper uses only GLIBC_2.34-or-older symbols and prints
`request=432 usable=440` under the attested libc. The corresponding glibc
chunk is 448 bytes. The source and executable SHA-256 values are
`41da906ab4ff41bc7e1912ba3faeaed5396ab939a9ae4c86ab70947fe3d46e47`
and `d17ec4f6ae980c429c8dcf35bb4e2269cd728f34c43c7cc7cf5a143a2b83a259`.

## Maximum fixed drop graph

```sh
docker run --rm --user 1000:1000 --entrypoint /nodejs/bin/node \
  --volume "$PWD:/probe" \
  gcr.io/distroless/nodejs22-debian12@sha256:8a3e96fe3345b5d83ecec2066e7c498139a02a6d1214e4f6c39f9ce359f3f5bc \
  /probe/drop-graph-layout-probe.cjs
```

The probe uses the exact three null-prototype shapes in `lib/net.js`, two
maximum 45-code-unit address strings, two maximum 16-bit ports and `IPv6`.
The snapshot SHA-256 was
`da3d59677f81b838aec39c099a139d67b8721e8ff223ab6eb7e8cd92905a282e`.
Parsed self sizes are 72 bytes for the three objects, 768 bytes for their
property arrays, 152 bytes for distinct value strings and 72 bytes for the
shared map, 1,064 bytes total. Small integers have no heap node. The retained
probe SHA-256 is
`b8f3e5912fe6df7275a23782a7a77b4c70ed6faaced81851d8228fccec70d2ed`.

