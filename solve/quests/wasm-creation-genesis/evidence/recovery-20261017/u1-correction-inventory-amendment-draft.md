# Draft narrow replacement for inventory/removal correction

This is a reviewer recommendation for a revised proposal, not an approved design or implementation. It addresses F1/F2/F3 in `u1-correction-design-verdict.md`, whose reviewed proposal digest is `90d98bb2bae217faaeff848200bc684ccfc20a9ac4c2c1a22fc8b759b8a61d34`.

## Replace proposal lines 70–77 with the following contract

The startup inventory retains obligations by the original creation operation and immutable intent/token, not by the canonical replica ID. Multiple distinct creation rows may name the same canonical replica; all remain obligations. The canonical `localReplicas` entry is only the current memo. Ownership of that memo conditions a memo write, never whether an older exact RETIRED creation is allowed to finish retirement and its journal completion.

The manager's separate PENDING and IN_PROGRESS reads can observe the same operation twice. The journal half folds duplicate operation identities before effect planning. Identical observations produce one entry. Differing observations of the same operation are resolved through the manager's existing authoritative journal reader and immutable-intent checks; a terminal reread is no longer a recoverable entry, a current recoverable row produces one entry, and an unavailable reread leaves startup unapplied and retryable. Conflicting immutable bodies are a typed corrupt/conflicting journal entry, never whichever duplicate happened to sort last. This remains the same `recoverPendingOperations` scan entry point, with no metadata, reservation or local effect.

The handler preserves every deduplicated exact plan in its one startup task. An old RETIRED plan acquires the existing per-canonical-replica removal gate with the same atomic admission/settlement method as coordinator REMOVE. The gate admits at most one retirement for that replica at a time. A plan that finds the gate busy remains owed and resumes after that gate's exact settlement while the handler is alive; caching successful inventory application does not discard the plan. Shutdown fences a waiter before it can admit work. No retry timer, new durable record, or independent removal registry is added.

The admitted startup retirement uses only the old creation's original journal, immutable token and instance-qualified path. It may run while a successor owns the canonical memo. The old plan writes REMOVED/FAILED only if the memo still names the old creation and its removal; otherwise it leaves the memo unchanged. A startup plan emits no executor outcome. A coordinator REMOVE that already acquired the gate retains its own request identity and outcome. A coordinator request encountering a startup-owned gate follows the existing IN_PROGRESS/retry protocol, without overwriting the startup entry.

Initial memo application must be explicit for a group of plans sharing one canonical replica. In the concrete valid case of one successor re-entry plus one or more older RETIRED plans, the successor owns the ordinary re-entry memo and each old RETIRED plan remains an independent exact cleanup obligation. If there is no ordinary re-entry candidate, a RETIRED plan may seed its REMOVING memo for visibility; other exact retired obligations still run without owning it. Do not select current authority by journal array order, `created_at`, or operation ID. If the census includes multiple non-RETIRED candidates for one canonical replica, the revised proposal must provide their owner-mediated continuation table; this draft does not silently declare one of those valid rows discardable.

## Add to physical/manager ownership paragraph

Exact physical retirement does not imply ownership of the manager's canonical replica-state projection. The manager preserves the existing exact origin through retirement. STOPPING/STOPPED changes over its canonical key apply only when that key still belongs to this creation, checked at each relevant write. Historical cleanup for a different origin still completes its own retirement and original journal while leaving successor state unchanged. Implementation should extend the existing manager state ownership representation or provide a named historical-cleanup projection behavior; it must not add a second physical-ownership authority or infer currentness from a state string.

The manager's existing state map should remain its one state owner. A record containing state plus original creation identity, with the existing public state getter continuing to project the state, is a coherent representation. A parallel identity map requires an additional ownership rationale and is not recommended. Any physical-current observation alternative must travel through an existing driver/adapter read contract and must not turn a handler memo into physical authority.

## Add one retirement-completion fact

The existing retirement interaction decides terminal retirement once: either the owner explicitly acknowledges CLOSED, or exact durable local retirement together with the authoritative HISTORY_UNAVAILABLE result proves the old resource can no longer be live. The result preserves raw `close` detail. It must not describe the history case as a successful CAS. Runtime, manager and handler consume this same terminal fact in the existing order: physical retirement fact, physical services-row STOPPED projection, original creation-journal completion, then handler settlement. Remove the handler-only HISTORY_UNAVAILABLE completion classification.

The revised proposal must also say what one startup attempt does when an old exact cleanup remains nonterminal. That debt stays in the original journal and one retained startup-plan record, but it must not indefinitely prevent a safe successor from receiving its ordinary HELD re-entry. The per-replica removal gate owns only an admitted removal task, not an unlimited wait for a future successful metadata close. When that attempt settles unresolved, its gate releases; the successor can re-enter through its normal authority checks, and the old debt retains a defined existing retry trigger. No busy loop or new timer follows from an unresolved metadata answer.

## Required concrete witnesses

1. An old creation reaches local RETIRED and metadata CLOSED, but its IN_PROGRESS journal completion is interrupted. A legitimate successor then exists with the same canonical replica and a different physical group. Restart inventories both. Old completion reaches terminal exactly once; successor memo, manager state, driver bookkeeping, physical replica, endpoint and services rows remain those of the successor. Run with both journal enumeration orders.
2. Repeat with two old RETIRED obligations and one successor; each old original operation completes. A single canonical memo must not cause either obligation to disappear.
3. Suspend either the startup old retirement or a coordinator REMOVE at the existing gate. Deliver the other. Assert one gate owner, no overwritten in-flight entry, old exact debt is resumed after release, startup emits no executor outcome, and the coordinator retains its own request/outcome identity.
4. Move one original row PENDING→IN_PROGRESS between the manager's two list reads. The inventory produces one current exact entry and schedules one continuation. Add identical duplicate delivery and immutable-body conflict controls.
5. Stop the handler while a plan waits on the gate. Settling the old gate afterward cannot admit new work. An already admitted physical task remains joined by lifecycle shutdown, as separately specified.
6. Mutation controls: require the old plan to own the current memo; drop gate-busy plans; omit duplicate folding; apply manager STOPPED unconditionally; and delete another request's gate entry on stale settlement. Each must fail its corresponding witness for the intended reason.
7. Advance past the old binding/slot so the real owner closes with HISTORY_UNAVAILABLE. Exact local RETIRED must lead to the one shared terminal fact, old physical-row removal and original journal completion. Raw close evidence remains HISTORY_UNAVAILABLE; successor state stays unchanged.
8. Keep an old close unresolved while a successor can safely be HELD. After the old admitted attempt settles, the successor re-entry must run without waiting for the old owner to become available. The old exact debt remains retained with its named retry trigger.

## Source anchors

- Dual journal reads: `/workspace/scratch/6d2a7b72384f/lagrange/src/service/service-lifecycle-manager.js:522–543`.
- Current all-entry memo application and plan start: `/workspace/scratch/6d2a7b72384f/lagrange/src/node/runtime-service-restart-inventory.js:109–178`.
- Coordinator removal gate: `/workspace/scratch/6d2a7b72384f/lagrange/src/node/runtime-service-handler.js:525–543,627–701`.
- Unconditional manager STOPPING/STOPPED: `/workspace/scratch/6d2a7b72384f/lagrange/src/service/service-consensus-bootstrap.js:118–131`.
- Existing exact driver cleanup guard: `/workspace/scratch/6d2a7b72384f/lagrange/src/runtime/wasm-component-driver-consensus.js:84–115`.
- Existing exact physical retirement: `/workspace/scratch/6d2a7b72384f/lagrange/src/wasm-service/wasm-creation-retirement.js:30–54,120–147`.
- Canonical versus instance-qualified identity: `/workspace/scratch/6d2a7b72384f/lagrange/src/rebalancer/runtime-service-replica-identity.js:78–87`.
