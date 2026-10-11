#!/bin/sh
set -eu

HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
OUT="$HERE/node-v22.22.0-libuv-v1.51.0"
mkdir -p "$OUT"

fetch() {
  url=$1
  output=$2
  curl -fsSL --proto '=https' --tlsv1.2 "$url" > "$OUT/$output"
}

NODE='https://raw.githubusercontent.com/nodejs/node/v22.22.0'
LIBUV='https://raw.githubusercontent.com/libuv/libuv/v1.51.0'

fetch "$NODE/LICENSE" node-LICENSE.txt
fetch "$NODE/lib/net.js" node-lib-net.js.txt
fetch "$NODE/lib/_http_server.js" node-lib-http-server.js.txt
fetch "$NODE/lib/_http_common.js" node-lib-http-common.js.txt
fetch "$NODE/lib/internal/streams/writable.js" node-lib-internal-streams-writable.js.txt
fetch "$NODE/lib/internal/streams/readable.js" node-lib-internal-streams-readable.js.txt
fetch "$NODE/src/env.cc" node-env.cc.txt
fetch "$NODE/src/stream_wrap.cc" node-stream-wrap.cc.txt
fetch "$NODE/src/stream_base.cc" node-stream-base.cc.txt
fetch "$NODE/src/node_http_parser.cc" node-http-parser.cc.txt
fetch "$NODE/src/connection_wrap.h" node-src-connection-wrap.h.txt
fetch "$NODE/src/connection_wrap.cc" node-src-connection-wrap.cc.txt
fetch "$NODE/src/tcp_wrap.cc" node-src-tcp-wrap.cc.txt
fetch "$NODE/src/handle_wrap.cc" node-src-handle-wrap.cc.txt
fetch "$LIBUV/LICENSE" libuv-LICENSE.txt
fetch "$LIBUV/src/unix/stream.c" libuv-unix-stream.c.txt
fetch "$LIBUV/src/unix/core.c" libuv-unix-core.c.txt
fetch "$LIBUV/src/unix/tcp.c" libuv-unix-tcp.c.txt
fetch "$LIBUV/src/unix/linux.c" libuv-unix-linux.c.txt

sha256sum "$OUT"/*.txt > "$OUT/SHA256SUMS"
