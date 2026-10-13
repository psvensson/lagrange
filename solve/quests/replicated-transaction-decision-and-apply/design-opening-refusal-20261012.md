# Shared replacement to production initialization — bounded correction

Status: WIP; no independent source approval or Quest landing.
Input: `bc0c5314563b488f6b7029b2a18d5aa539ddf4fc`, exported without production
changes at `789002b06462c238ac57510b08865c812aa9ac12`.
Review: PR117 comment 4247007955, independent Copilot review 5489491066.

## Interaction and complete transition

The runtime owner refuses a new opening during UNHEALTHY/REPLACING before
admitting a runtime group, with the canonical immutable `error.consensus`
HOST_FAILURE. The existing groups own recovery and its original clock/deadline;
a refused new constructor cannot run recovery, acquire a native handle or
publish its membership reservation callback. Existing durable identity rows are
not erased on refusal: they are not consensus participation or new permission.

`raft-operation-port.js` owns recognition of named constructor failures, shared
by partition, message-group and WASM-service initialization. Recognize the three
existing non-success outcomes (CORE_REFUSED, CORE_FATAL, HOST_FAILURE), not a
truthiness check or arbitrary unknown outcome. Each existing startup adapter
wraps recognized errors in its own existing initialization refusal and carries
the exact consensus answer unchanged, including phase and remaining retry time.
Unrecognized/unrelated throws remain the original error. No shared retry loop,
error-to-success translation, new code taxonomy or rewritten deadline is added.

Acquisition owner: `raft-rs-operation-port.js` currently registers the logical
membership reservation callback before `createRuntimeDispatcher` can refuse.
Move that publication until the port has actually been constructed. In
particular, a refused same-name opening must leave an earlier live registry
entry untouched; unregister-after-overwriting would NOT restore that entry.
The successful port's existing exact-callback unregister remains its release.

Cleanup: partition's existing open helper awaits `service.shutdown()` before
surfacing the recognized init refusal. Message-group and WASM replica lifecycle
owners already release their port and database when open fails. Those owners,
not another cleanup path in the adapters, keep that obligation. A later ordinary
initialization may succeed after an existing group recovers the shared core.
No change to the sealed TX1 acceptance terms or preservation branches.

## Consumed surfaces at input

- `src/raft/raft-rs-runtime-owner.js:createRuntimeDispatcher`, existing shared
  gate and `runtimeRecoveryOutcome`; unchanged by this correction.
- `src/raft/raft-rs-operation-port.js:209-237, 369-480`: lifecycle/registry
  acquisition, runtime construction and exact-callback release.
- `src/raft/raft-operation-port.js`: canonical operation/answer shape.
- `src/partition/partition-consensus-port-opening.js:39-49`: awaited cleanup.
- `src/message-group/message-group-consensus-port.js:146-169`, with
  `message-group-service-raft-lifecycle.js:167-203`: conversion and release.
- `src/wasm-service/wasm-service-consensus-port.js:183-199`, with
  `wasm-service-replica-lifecycle.js:77-105`: conversion and release.

## Witnesses, invalidation and remaining limits

Native tests exercise all three real service initializers while the core is
unhealthy and during its real shared retry window, checking unchanged remaining
budgets, typed errors, no native entry, released connections, absent
registry callbacks and subsequent successful opening on the same file. Separate
native-boundary tests open during REPLACING and UNHEALTHY, with and without an
existing same-name owner. In the collision case, the original database must
receive subsequent reservation work, never the rejected opening's database.
Baseline and source-only revert retain identical tests and fail for the intended
behavior. Existing refusal, lifecycle, native replacement and service consensus
tests remain selected. The impact contract and coupled-pair lists retain the
witness; generated indexes are refreshed only through their producer.

No new persistent state, cache, retry or scheduling handle. The only reordered
publication is a volatile callback whose absence is tested at refusal and whose
exact identity is tested across same-name replacement. The integration fixtures
use actual raft-rs/SQLite and a real in-process MessageRouter, not physical hosts
or a full distributed SQL/CDC startup oracle. Independent review and static
failures remain separate gates.
