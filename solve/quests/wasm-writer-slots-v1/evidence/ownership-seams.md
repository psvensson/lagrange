# Writer slots v1: existing ownership seams

Read-only subagent `/root/completion_consumers` audit at `cdcb9c95f4bdb90e709ed4d20058b51cb193625f`, isolated writer-slots tree. No source/test edits or executions. Loaded actual AGENTS/rules/router. User-selected finite reusable slots, generation/sequence/receipt acknowledgement, identityless STRONG refusal, versioned schema, alpha clean break and separate snapshot dependency are accepted inputs, not reopened decisions.

**Finding:** the selected protocol fits the existing WASM lifecycle → replica request → committed application → same-database storage ownership. Extend these owners explicitly; do not introduce a permit service. There is no preexisting slot administration API or replicated service-wide incarnation to reuse verbatim. Their addition is within the selected schema/profile implementation, provided the contract distinguishes trusted local administration, replicated CAS/result, and local replica lifecycle.

## Fresh-service incarnation / INIT

- `WasmServiceLifecycle.createReplica` (`src/wasm-service/wasm-service-lifecycle.js:182–218`) owns creating the exact replica instance and selecting its service/replica database path; `startReplica:253ff` and exact-instance `stopOwnedReplica:465ff` own its lifetime. `DataDirectoryManager.getWasmServiceDbPath:181` derives a per-service/per-replica filename; directory existence is storage placement, not incarnation authority.
- `wasm-service-models.js:18–40` contains service ID/profile/runtime metadata but no service-incarnation field. Service ID is not evidence of a fresh reincarnation. A binding version or runtime generation is also not that identity.
- Native `RaftRsReplicaLifecycleOwner` (`src/raft/raft-rs-replica-lifecycle-owner.js:120–156,176–230`) has an incarnation, but it is locally minted for `(group,peer,replica)` and guards local native opening. RF3 replicas have distinct such incarnations. **Do not use it as the common application service incarnation.** It remains useful to fence a local waiter/continuation against replacement.
- A first explicit application INIT command, emitted by the lifecycle's trusted admin entry point and committed through the ordinary WASM group, can establish the common service incarnation and fixed profile once. Every replica consumes the same immutable incarnation/profile bytes in `WasmServiceReplica.applyCommittedEntry` → existing application transaction (`raft-rs-application-transaction-owner.js:50–100`). Do not independently generate an application incarnation on each replica or on every restart.
- INIT requires explicit expected UNINITIALIZED application state, exact version/profile/incarnation content, and a retained init receipt/binding. Same exact INIT replays its original accepted result; a different token/profile cannot overwrite it. Retained reopen reads this record. Missing/corrupt marker in a retained v1 database is HOLD, not another INIT opportunity.
- Alpha old-format refusal belongs before the normal `new SessionKVStore()` schema creation in `wasm-service-replica-lifecycle.js:76–80`. Schema creation must not quietly bless a preexisting legacy `_kv_store` or unknown application history as v1. Existing old state remains untouched. The selected explicit recreation must create a new application incarnation and preserve ordinary native identity/destructive-loss rules; no lifecycle method currently grants raw wipe/reuse of an established voter.
- The current WASM consensus request (`wasm-service-consensus-port.js:140–168`) supplies genesis membership but not the port request's host `identityExisted` / `identityRecorded` facts (`raft-operation-port-request.js:19–39`). Do not claim application INIT fixes complete native destructive-loss safety. For this unit, distinguish an explicitly created fresh application from retained/unknown history and keep destructive native replacement with its existing owner.

## Authorized enrollment/recycle ingress

The existing lifecycle is a trusted in-process management interface: `createReplica/startReplica/stopReplica` act on exact owned instances and do not perform per-tenant authentication. Runtime startup actually constructs it (`runtime-startup-wiring.js:74–78`); `wasm-component-driver.js:396–417,508ff` uses it for consensus replicas. Stale architecture prose claiming no production initialization is not current authority.

The proposed local lifecycle administration API is therefore a reasonable **new named interface on this existing owner**, under the user's explicit authorization. Its trust model must be clear:

1. Ordinary `WasmServiceReplica.handleMessage` (`replica.js:320–337`) continues to dispatch data requests and Raft envelopes; reject enrollment/recycle/INIT operations there. A caller-supplied `authorized:true` or role field is not a grant.
2. The trusted lifecycle method resolves the exact current live replica for service ID, captures that instance before any await, validates command inputs and requires the existing leadership/proposal path. It may return typed not-leader/unknown, but must not silently retarget a replaced instance or forge remote admin authority.
3. That method supplies immutable admin intent to the same replica codec/admission and same Raft log. Application deterministically checks common incarnation/profile and exact expected slot state. Local management permission controls creation of intent; actual slot ownership changes only in committed application.
4. No preexisting tenant/admin authorization callback or slot permit exists in this lifecycle. Do not describe local API presence as already authenticated external administration. Exposing an HTTP/network admin endpoint would require its own real authorization integration and is not necessary for the selected trusted-local scope.
5. `meta-command-handlers.js`/`operation-lifecycle.js` govern module/service management SQL and `wasm_operations`; they are not this group's atomic slot owner. Routing admin changes through their cache or interpreting an async workflow record as slot enrollment would create a second authority.

The generic public JavaScript `proposeEntry` and trusted-host direct object access are not an adversarial security sandbox. Application still validates the committed command. Rejecting remote raw admin operations protects the actual service-message seam; do not claim resistance to malicious trusted-host code unless separately required.

## Lost admin reply / concurrent administration

Use bounded replay within the same fixed slot state, not a new global admin ledger. Each slot needs sufficient immutable information about its latest accepted enrollment/recycle transition (expected predecessor, admin request identity/content binding, resulting generation/owner, original result and application position). INIT needs its own fixed service record. These records count toward the chosen profile.

Necessary semantics for contract review:

- `ENROLL(slot, expected free/generation g, admin A, owner X)` versus competing `B/owner Y`: only one deterministic CAS wins. B must not report A's success merely because the slot is now at g+1. Content and request identity distinguish exact replay from conflict.
- Lost response to A, unchanged current generation: exact A replay returns its accepted receipt and never increments generation or re-enrolls.
- A followed by later authorized recycle C: old A must be fenced/historical-unavailable, never re-executed or answered with C's receipt. Perpetual exact admin history is not required if explicit historical-unavailable is selected and the generation proves non-reexecution.
- A rejected expected-state request cannot later become fresh merely because user data sequence advances or local retry state disappears. Admin expected generation/state needs a monotonic discriminator; never recycle generation numbers. Counter/generation overflow must refuse before wrap.
- A new recycle cannot cancel/retag an incumbent command whose outcome is unknown. If recycling is allowed to fence an old-generation outstanding write, the actual log order must decide whether it applied before the fence or is rejected after it; absence of a local waiter is not discard. Contract must state the caller consequence, preserve any established effect, and not return false exact outcome for retired detail.
- Enrollment replay metadata must survive ordinary writes and acknowledgement retirement if those do not themselves change the admin generation. Otherwise “enroll; write; lose enrollment response; replay enrollment” could lose the only exact binding while still in the same generation. One separate fixed per-slot admin receipt is bounded and does not require a new semantic owner.

This is implementation of the selected explicit, Raft-applied admin CAS with bounded retained answers. It is not another permit protocol or a demand to reopen writer-slot policy.

## Snapshot/application image owner

Current actual files remain `raft/snapshot-checkpoint-store.js` (image creation/validation), `snapshot-checkpoint-format.js` (descriptor), `snapshot-catchup.js` (existing source/receiver orchestration), `snapshot-install.js` (closed-handle installation), `raft-rs-runtime-owner.js` (native Ready), `raft-rs-durable-store.js` plus `raft-rs-application-transaction-owner.js` (durability/application), and `raft-rs-replica-lifecycle-owner.js` (receiver incarnation admission).

The inspected `prepareRaftRsCheckpointCopy:262–275` invokes `scrubRaftRsCopy:302–312`, removing application tables except peer identity. `requestSnapshotInstall:555–576` requires actual fresh CREATE/receiver admission. Neither is a completed WASM application-state image/import. Do not remove the scrub or retain tables by name as a shortcut.

WASM must provide owner-declared image contents: service incarnation and immutable profile/version, all fixed slot state including current/acknowledged sequence frontiers and generation fences, retained current write binding/result/receipt, retained admin binding/result, and KV state at the same actual applied boundary. Receiver-local waiter/role/runtime identity is excluded. Supported image restore must preserve these together before replay/admission; otherwise old generation/sequence could regain authority after restore. Intact same-file restart can be implemented and proven independently while shared application snapshot support remains explicitly unavailable/held.

Preserved existing snapshot work refs freshly read locally (not active leases):

- `handoff/rs-raft-salvage-20261008-snapshot-catchup-ownership-wip` → `9554f689ef1fd4560e23ed8ca4f386266539f83f`.
- `handoff/rs-raft-salvage-20261008-snapshot-content-format-wip` → `458076e64b4e36ac1525f93f6daa41bbf3fadc5c`.
- `handoff/rs-raft-salvage-20261008-snapshot-dependency-b-wip` → `2384216d16d11dc6d62a682ffef192dc944a7a15`.

Existing decision record: `solve/quests/seed-control-current-proof-amortization/evidence/release-decision-closeout-20261015/SNAPSHOT-DECISION.md`. It assigns application inventory/provenance to application owners and Ready-bound atomic import/continuation to the shared snapshot interaction. No snapshot implementation is taken over here.

## Review disposition

No incompatible existing owner requires rejecting the selected bounded-writer protocol. Proceed to exact contract review with the above concrete mappings. Do not label the new trusted admin interface, durable common incarnation or slot receipt state as preexisting behavior. The concrete pitfalls to reject are local-peer-incarnation reuse, retained-marker absence as fresh authority, implicit network admin permission, competing-admin winner borrowing, loss of admin replay binding on ordinary write, and unsupported snapshot restoration of only KV. Those are addressable within the selected existing owners and fixed profile; they do not justify another general design round.
