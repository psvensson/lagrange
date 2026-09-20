# The raft-rs 0.7 WASM binding the `raft-rs-wasm` backend loads

This directory is the **experimental backend's binding**: the Rust fork, its
pinned toolchain, its build recipe, the built artifact the backend loads, and
the raft-rs 0.7 sources the host contract is cited against.

It lives under `src/raft/` and not under `test/` because the backend it serves
is selected by production configuration through the provider seam
(`src/raft/raft-backend-selection.js`). Production code may not import from the
test tree, so a binding a production seam can select is production
infrastructure. Selecting it is still explicit and never the default; see
`src/raft/raft-backend-constants.js`.

Its immediate history is the fork built for the exhausted quest
`raft-backend-evaluation`, kept at the tag
`raft-backend-evaluation/round-3-rejected-tree` under
`test/raft/backend-evaluation/raft-core/`. `pkg/raft_wasm_bg.wasm` and
`pkg/raft_wasm.js` here are byte-for-byte the artifact from that tree; the two
digests in `artifact-digest.json` are the proof, and a test re-computes them.
That evaluation is uncertified historical evidence: nothing here is an oracle,
a baseline or a source of expected values.

The fork starts from raft-logic's `native/raft-wasm` crate (raft-logic 0.3.14,
repository head 918d481) and adds the raft-rs configuration and persistence
primitives that binding does not have. The owner's raft-logic repository is not
modified and nothing here is upstreamed.

## Exact toolchain the checked-in artifact was built with

| Tool | Version |
| --- | --- |
| rustc | `rustc 1.98.0 (88d9e12ae 2026-08-18)` |
| cargo | `cargo 1.98.0 (797e8a9bc 2026-08-05)` |
| wasm-pack | `wasm-pack 0.13.1` |
| wasm-bindgen (crate) | `0.2.104` |
| target | `wasm32-unknown-unknown` |

`rust-toolchain.toml` pins the channel and the target, so a rebuild on this
machine uses the same compiler without being told to.

## The crate under integration, and its checksums

Taken from `Cargo.lock` in this directory. These are the crates.io checksums
of the exact sources the artifact was compiled from.

| Crate | Version | Checksum (sha256, as crates.io records it) |
| --- | --- | --- |
| raft | 0.7.0 | `f12688b23a649902762d4c11d854d73c49c9b93138f2de16403ef9f571ad5bae` |
| raft-proto | 0.7.0 | `fb6884896294f553e8d5cfbdb55080b9f5f2f43394afff59c9f077e0f4b46d6b` |
| protobuf | 2.28.0 | `106dd99e98437432fed6519dedecfade6a06a73bb7b2a1e019fdd2bee5778d94` |
| wasm-bindgen | 0.2.104 | `c1da10c01ae9f1ae40cbfac0bac3b1e724b320abfcf52229f80b547c0d250e2d` |
| serde-wasm-bindgen | 0.6.5 | `8302e169f0eddcc139c70f139d19d6467353af16f9fce27e8c30158036a1e16b` |
| base64 | 0.22.1 | `72b3254f16251a8381aa12e40e3c4d2f0199f8c6508fbecb9d91f575e0fbb8c6` |
| getrandom | 0.2.16 | `335ff9f135e4384c8150d6f27c6daed433577f86b4750418338c01a1a2528592` |
| slog | 2.8.2 | `9b3b8565691b22d2bdfc066426ed48f837fc0c5f2c8cad8d9718f7f99d6995c1` |

## The build command

```sh
wasm-pack build --release --target nodejs
```

Run from this directory. Output lands in `pkg/`; `pkg/raft_wasm.js` and
`pkg/raft_wasm_bg.wasm` are committed, `target/` is not. wasm-pack writes a
`pkg/.gitignore` containing `*`, which is removed after each build so the
artifact can be checked in.

Fetching the dependencies needs network access once (`cargo fetch`). The
checked-in artifact was NOT rebuilt when the binding moved here: moving files
cannot change their bytes, and the digests prove it.

## The raft-rs 0.7 sources under `raft-0.7.0/`

`raft-0.7.0/` holds the raft-rs files the host contract in
`src/raft/raft-rs-host-contract.js` cites, vendored so a citation resolves
from the repository alone rather than from whatever a machine happens to have
in its cargo registry. They are third-party sources under the Apache-2.0
licence kept beside them in `raft-0.7.0/LICENSE`, unmodified.

The provenance chain is recorded in `artifact-digest.json` under
`citationSources` and is checked by a test:

1. `raftCrateChecksum` is the sha256 crates.io records for the published
   `raft 0.7.0` `.crate` tarball, and it is also what `Cargo.lock` records for
   the dependency this artifact was compiled from.
2. Each vendored file was extracted from that tarball, and its own sha256 is
   recorded under `citationSources.files`.

Vendored: `src/lib.rs` (the crate's documented Ready-loop contract and its
safety note), `src/raw_node.rs` (what `advance_append` and `advance_apply`
do), `src/raft_log.rs` (the refusal a restart makes when applied runs past
commit) and `examples/five_mem_node/main.rs` (the reference loop). Where the
documented steps and the example disagree, the safety note governs; the host
contract cites both sides.

## Artifact integrity and build reproducibility are separate

A digest test proves the `.wasm` the backend loads is the `.wasm` recorded in
`artifact-digest.json`. That is required, and the loader refuses a mismatch.

Whether the recipe reproduces byte for byte is a separate, measured question,
recorded in `artifact-digest.json` under `reproducibility`. It is reported as
found and is not required to be identical.

## What this binding exposes, and what it deliberately does not

Added over upstream, all raw raft-rs operations:

- `propose_conf_change_v2`, `apply_conf_change`, `decode_conf_change_entry`,
  `conf_state`, `set_conf_state`
- `persist_commit_index` (the LightReady commit index upstream could return
  but not store), `export_persisted_state`
- `status` extended from `{lead, raftState}` to the full raft-rs `Status`
  including `term`, `vote`, `commit`, `applied`, `pendingConfIndex`,
  `promotable` and per-peer `progress`
- `create_node` now honours `bootstrap.confState` (upstream decoded and
  discarded it), a `learners` list, and `applied`
- `wasm_memory_bytes` and `handle_count`, measurement primitives

Not added, on purpose: `addNode`, `removeNode`, `addLearner`, `promote` or any
other membership convenience. Adding a learner, waiting for it to catch up,
promoting it and removing the old voter is Lagrange policy, not binding
policy, and a test asserts that no such name exists in the built glue.

## Fixes this fork makes to the upstream binding

Each was found by driving the binding and is measured before and after:

1. **`with_node` no longer holds the handle-table borrow across the call.**
   A raft-rs `fatal!` (for example `to_commit N is out of range`, reachable
   from a peer's heartbeat) panics; on `wasm32-unknown-unknown` the panic
   strategy is abort, so nothing unwinds and the `RefCell` guard is never
   dropped. Upstream then trapped `RefCell already borrowed` on EVERY later
   call on EVERY handle, `create_node` and `free` included - one group's
   fatal killed every group sharing the runtime. The node is now taken out
   of the table for the duration of the call, so a fatal costs exactly the
   group that caused it.
2. **`decode_conf_change_entry` errors on undecodable base64.** Upstream's
   `unwrap_or_default()` turned corrupt bytes into an empty change list,
   which is a valid request to LEAVE a joint configuration.
3. **`pending_conf_index` crosses as a decimal string**, like every other
   sixty-four-bit value.
