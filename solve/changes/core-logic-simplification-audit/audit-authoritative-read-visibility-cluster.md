# Audit: authoritative-read / operation-visibility cluster

Scope: the read-escalation + read-mode machinery around `replica_operations`
visibility. All line cites are from the working tree at audit time. **No source
was edited.** Every "dead" / "always same value" claim below was verified by
grep across `src/**` excluding `*.test.*`.

## 0. Cluster map (what talks to what)

Two *different* read-mode enums coexist:

| Enum | Values | Where | Role |
| --- | --- | --- | --- |
| `CONTROL_PLANE_AUTHORITATIVE_READ_MODE` (5) | `OWNER_LOCAL_ONLY`, `OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC`, `OWNER_RPC_PREFERRED`, `OWNER_RPC_PREFERRED_SQL_FALLBACK`, `OWNER_RPC_REQUIRED` | `src/control-plane/control-plane-system-table-gateway-constants.js:117-124` | Gateway-wide read contract; resolved to a 5-field boolean tuple by `resolveAuthoritativeReadModeContract` (`control-plane-system-table-gateway-read-contracts.js:136-187`). |
| `REPLICA_OPERATION_VISIBILITY_READ_MODE` (3) | `CACHE_ONLY`, `CACHE_PREFERRED_SQL_FALLBACK`, `OWNER_RPC_REQUIRED` | `src/rebalancer/replica-operation-repository.js:390-394` | The rebalancer-facing 3-tier read mode for incomplete/entity/visibility reads. |

Four frozen query-option presets bind an `authoritativeReadMode` to a base
option bag (`src/rebalancer/replica-operation-repository.js:400-431`):

- `REPLICA_OPERATION_LOCAL_OWNER_READ_QUERY_OPTIONS` → `OWNER_LOCAL_ONLY` (:400)
- `REPLICA_OPERATION_LOCAL_VISIBILITY_READ_QUERY_OPTIONS` → `OWNER_LOCAL_ONLY` (:405)
- `REPLICA_OPERATION_VISIBILITY_READ_QUERY_OPTIONS` → `OWNER_RPC_PREFERRED_SQL_FALLBACK` (:410)
- `REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS` → `OWNER_RPC_REQUIRED` (:415)
- (+ `..._CANONICAL_STATUS...` → `OWNER_RPC_PREFERRED` (:420), `..._LOCAL_STATUS...` → `OWNER_LOCAL_ONLY` (:424) — used only by the status-probe path, `replica-operation-repository-observation-methods.js:224-232`.)

The single low-level read entrypoint is `executeReplicaOperationsRead`
(`replica-operation-repository-read-methods.js:50-128`). Everything else is a
wrapper that picks one of the presets and post-processes the result.

Read helpers in scope and their callers (grep-verified, non-test):

- `queryAuthoritativeOperationVisibilityObservation` (`read-methods.js:284`) — the core one-read helper. Direct callers: mutation-persistence (5 sites), `rebalance-coordinator-ledger-interlock-admission.js:290`, and the thin coordinator pass-through `rebalance-coordinator-operation-read-methods.js:44`.
- `queryAuthoritativeOperationById` (`read-methods.js:416`) — `.operation`-only projection of the above. 9 caller sites.
- `getOperationByIdVisibilityObservation` (`read-methods.js:425`) — the above + owner-persisted/cache fallback. **10 caller sites / 9 files.**
- `queryReplicaOperationPersistenceAuthorityObservation` / `...Operation` (`mutation-persistence-methods.js:392` / `:383`) — explicit local-then-authority two-read escalation used by persistence-confirmation paths.

---

## 1. Enum redundancy (Q1)

**The 5-value `CONTROL_PLANE_AUTHORITATIVE_READ_MODE` is NOT dead and NOT
collapsible at the gateway level.** Each value resolves to a *distinct* contract
tuple (`read-contracts.js:139-186`) and each is reached live:

- `OWNER_LOCAL_ONLY` — live (local reads, status probes, persistence local arm).
- `OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC` — live, but **only** produced dynamically by the query engine's own empty-confirmation logic: `sql-query-engine-select-execution.js:317-326` sets `confirmEmptyLocalReadWithOwnerRpc = this.shouldConfirmEmptyAuthoritativeSystemTableRead(...)` (:362). No *named* caller passes this mode; every explicit `confirmEmptyLocalReadWithOwnerRpc` option-setter passes `false` (`message-group-forwarding-owner-constants.js:184`, `authoritative-control-plane-view.js:538`, `replica-operation-repository.js:344,430`). ⚠️ So it is reachable, but *only* through one internal producer — see proposal C3 (low priority, gateway-wide, needs its own verification).
- `OWNER_RPC_PREFERRED` — live at `membership-publication-planning-evidence.js:209,249` and the canonical-status preset (`replica-operation-repository.js:422`). Distinct from `..._SQL_FALLBACK` only in `allowSqlFallback:false` vs `true` — a real behavior difference. Keep.
- `OWNER_RPC_PREFERRED_SQL_FALLBACK` — live (planning profile, replica-op visibility default).
- `OWNER_RPC_REQUIRED` — live (diagnostics profile, strict reads).

**The real redundancy is localized to the replica-operation visibility helper.**
The mode selector at `read-methods.js:300-311` only branches on *two* of the
five values and collapses the rest to the default:

```
authoritativeReadMode === OWNER_LOCAL_ONLY      → LOCAL_VISIBILITY preset
requireOwnerRpcRead || === OWNER_RPC_REQUIRED    → STRICT_VISIBILITY preset
everything else (incl. the 2 unhandled modes)   → VISIBILITY preset (OWNER_RPC_PREFERRED_SQL_FALLBACK)
```

So within this helper only **3 tiers** are reachable
(`local-only` / `preferred-sql-fallback` / `rpc-required`), which is *exactly*
the 3 values of `REPLICA_OPERATION_VISIBILITY_READ_MODE`
(`CACHE_ONLY`≈local, `CACHE_PREFERRED_SQL_FALLBACK`≈preferred, `OWNER_RPC_REQUIRED`≈required).
`buildReplicaOperationVisibilityReadOptions` (`replica-operation-repository.js:479-492`)
maps the 3-value enum onto the *same three presets*. The two enums are two
spellings of one 3-tier concept for `replica_operations` reads — but they are
**consumed by different call surfaces** (id-visibility vs incomplete/entity),
so a merge is a naming/clarity win, not a dead-code deletion (see C2).

Verified distinct authoritative-mode values that actually flow into the
selector: only `OWNER_LOCAL_ONLY`, `OWNER_RPC_PREFERRED_SQL_FALLBACK`,
`OWNER_RPC_REQUIRED` (via `requireOwnerRpcRead:true`) are ever passed by callers.
`OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC` and `OWNER_RPC_PREFERRED` are **never**
passed into `queryAuthoritativeOperationVisibilityObservation`.

---

## 2. Helper overlap (Q2)

Three helpers implement local-first → owner-RPC escalation, at **different
altitudes**, and they do NOT trivially collapse:

- `queryAuthoritativeOperationVisibilityObservation` (`read-methods.js:284-414`)
  does **one** gateway read; the local→ownerRPC→SQL escalation happens *inside*
  the gateway based on the selected preset. It owns the deferred-outcome
  bookkeeping (owner-persisted witness, priority-recovery).
- `queryReplicaOperationPersistenceAuthorityObservation`
  (`mutation-persistence-methods.js:392-444`) hand-rolls a **two-read**
  escalation: `OWNER_LOCAL_ONLY` read (:404-412), check
  `isReplicaOperationVisibilitySatisfied`, then
  `OWNER_RPC_PREFERRED_SQL_FALLBACK` read (:422-432).
- `confirmReplicaOperationVisibility` (`mutation-persistence-methods.js:498-592`)
  is a **retry loop** doing the *same* two-read local→authority escalation each
  iteration (:505-548) until a deadline, plus `sawVisibilityMismatch` /
  `deferredOutcome` tracking.

The duplicated core is the "read local, test satisfied, else read authority,
test satisfied" pair, appearing verbatim twice (`:404-432` and `:505-548`). A
single private helper — e.g. `readLocalThenAuthorityObservations(operation,
observationOptions)` returning `{localObservation, authorityObservation}` —
could factor that pair; the loop and the tie-breaker stay in their callers. This
is a **moderate** refactor (behavior-preserving only if the ordering, the
`preferOwnerRpcReadLeader:true` on the authority read, and the satisfied-checks
are preserved bit-for-bit).

⚠️ **Do NOT collapse the explicit two-read escalation into a single default-mode
call.** The explicit local-first exists to keep local evidence when the escalated
read is unreachable — see the guarding comment at
`mutation-persistence-methods.js:436-443`: *"A failed/deferred/empty escalated
read means 'authority unreachable', not 'row absent': keep the local evidence so
a locally visible divergent row still drives terminal-conflict rejection..."* The
single gateway call returns only the final answer and cannot express that
tie-breaker. This is a genuine reason to stay separate.

---

## 3. Dead / always-constant options (Q3)

Grep-verified across `src/**` (non-test):

| Option | Verdict | Evidence |
| --- | --- | --- |
| `allowFallbackQuery` | **DEAD** — never passed by any caller. Only read at `read-methods.js:445`. The `=== false` branch (suppressing the cache fallback query) is unreachable; the cache fallback always runs. | grep: single hit, the read site itself. |
| `requireOwnerRpcRead` on `getOperationByIdVisibilityObservation` | **Always `false`** across all 10 callers. Combined with `authoritativeReadMode` never being passed, this helper *always* selects the default VISIBILITY preset. | all 10 call sites pass `requireOwnerRpcRead:false`; none pass `authoritativeReadMode`. |
| `allowPriorityRecoveryDeferredVisibility` on `getOperationByIdVisibilityObservation` | **Always `true`** across all 10 callers. | 10/10 sites pass `true` (`executor-outcome:682`, `reservation:324`, `recovery-timeout:227`, `transition-retry:102`, `recovery-observation:373`, `owner:653`, `dispatch-response-reconcile:689`, `dispatch-rearm:436,525`, `dispatch-observation:418`). |
| `allowOwnerPersistedTransitionDeferredVisibility` on `getOperationByIdVisibilityObservation` | **NOT dead** — 9 callers rely on the `!== false` default (`true`); exactly **one** caller passes `false` (`operation-workflow-dispatch-rearm-evidence.js:437`). Keep the param. | grep: only that one explicit `false`. |
| `preferOwnerRpcReadLeader` | **NOT dead** — passed `true` by the persistence authority/confirm paths (`mutation-persistence:430,546`). | live. |
| `authoritativeReadMode` vs `requireOwnerRpcRead:true` | **Redundant encodings** of the same tier: both resolve to `OWNER_RPC_REQUIRED` at `read-methods.js:307-309` and `read-contracts.js:119-120`. Callers use them interchangeably (`intent-methods:203` passes the mode; `observed-state:151`, `replace-replay:30` pass the boolean). Not dead, but two ways to say one thing. |

---

## 4. Dead code (Q4)

No helper in scope has zero live callers — all four named functions
(`queryAuthoritativeOperationVisibilityObservation`,
`queryAuthoritativeOperationById`, `getOperationByIdVisibilityObservation`,
`queryReplicaOperationPersistenceAuthorityObservation`/`...Operation`) have
non-test callers.

Dead *branches* (not whole functions):

- `read-methods.js:445` — the `allowFallbackQuery === false` branch (dead per §3).
- `read-methods.js:300-311` — the implicit default branch absorbs
  `OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC` and `OWNER_RPC_PREFERRED`, but since
  neither is ever passed here, no *observable* branch is dead — it is just
  broader than its live inputs.

---

## 5. Ranked consolidation proposals

Ordered safest/highest-clarity first. All are behavior-preserving as scoped.

### C1 — Remove the dead `allowFallbackQuery` option  ⭐ safest
- **Files/lines:** `read-methods.js:444-445` (the `allowFallbackQuery === false ? null : ...` ternary) → replace with the unconditional `await this.queryOperationById(operationId)`.
- **Merge:** delete the option branch; drop `allowFallbackQuery` from the JSDoc/contract if documented.
- **Invariant preserved:** the cache fallback query already always runs today (no caller sets it false), so removing the branch changes nothing observable.
- **Blast radius:** 0 callers (grep-confirmed single hit = the read site).
- **Risk:** near-zero. Guard: add/keep a test that a missing authoritative row still returns the cache fallback.

### C2 — Collapse `getOperationByIdVisibilityObservation`'s always-constant params into a fixed contract  ⭐ high clarity
- **Files/lines:** `read-methods.js:425-436`; call sites listed in §3.
- **Merge:** `requireOwnerRpcRead` (always `false`) and `authoritativeReadMode`
  (never passed) can be dropped from this helper's option surface — it always
  uses the default VISIBILITY preset. `allowPriorityRecoveryDeferredVisibility`
  (always `true`) can be defaulted to `true` internally instead of being passed
  at 10 sites. Keep `allowOwnerPersistedTransitionDeferredVisibility` (one real
  `false` caller).
- **Invariant preserved:** current behavior is exactly "default preset +
  priority-recovery-deferred on"; encode that as the default and delete the
  redundant per-call args.
- **Blast radius:** 10 call sites simplified (no behavior change); 1 site keeps
  its `allowOwnerPersistedTransitionDeferredVisibility:false`.
- **Risk:** low-moderate (touches 9 files, but each edit only deletes
  always-constant args). Verify each call site still passes the one non-constant
  flag where present.

### C3 — Unify the two 3-tier read-mode spellings for `replica_operations`  (naming/clarity)
- **Files/lines:** selector `read-methods.js:300-311`; the parallel
  `REPLICA_OPERATION_VISIBILITY_READ_MODE` (`replica-operation-repository.js:390-394`)
  and its preset map `buildReplicaOperationVisibilityReadOptions` (:479-492).
- **Merge:** both express `{local-only, preferred-sql-fallback, rpc-required}`.
  Route the id-visibility helper through `REPLICA_OPERATION_VISIBILITY_READ_MODE`
  (or vice-versa) so there is one 3-tier vocabulary for op-row reads, instead of
  a 5-value gateway enum being partially re-interpreted at :300-311.
- **Invariant preserved:** the three presets must map 1:1 to today's selections
  (`OWNER_LOCAL_ONLY`→LOCAL_VISIBILITY, default→VISIBILITY, `OWNER_RPC_REQUIRED`→STRICT).
- **Blast radius:** the id-visibility helpers + their callers; does **not** touch
  the gateway enum (which must stay 5-valued — see §1).
- **Risk:** moderate. This is a rename/routing change; easy to introduce a subtle
  tier mismatch. Lower priority than C1/C2. Keep the gateway's 5-value enum intact.

### C4 — Factor the duplicated local-then-authority two-read core
- **Files/lines:** `mutation-persistence-methods.js:404-432` and `:505-548`.
- **Merge:** extract `readLocalThenAuthorityObservations(operation, observationOptions)`
  returning `{localObservation, authorityObservation}`; leave the retry loop
  (`confirmReplicaOperationVisibility`) and the tie-breaker
  (`queryReplicaOperationPersistenceAuthorityObservation`) in place.
- **Invariant preserved:** ordering (local first), the authority read's
  `preferOwnerRpcReadLeader:true` and `OWNER_RPC_PREFERRED_SQL_FALLBACK` mode, and
  the `isReplicaOperationVisibilitySatisfied` gates must be byte-identical. The
  local-evidence tie-breaker at :436-443 must stay in the non-loop caller.
- **Blast radius:** 2 call sites within one file.
- **Risk:** moderate — the two copies differ in surrounding control flow
  (single-shot vs deadline loop with `sawVisibilityMismatch`/`deferredOutcome`).
  Only the inner read pair is safely shared. Prove with the existing
  persistence-confirmation DT before/after.

### C5 (flag only, do NOT action without a dedicated gateway-wide pass) — `OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC`
- Appears to have **no named producer** — every explicit setter passes `false`.
  It is reached *only* via the query engine's internal
  `shouldConfirmEmptyAuthoritativeSystemTableRead`
  (`sql-query-engine-select-execution.js:317-326,362`). **Not safe to remove**
  from this audit's evidence: the query-engine producer is live for some tables.
  Listed here so a future gateway-scoped audit can confirm whether that producer
  ever returns `true` in production and, if not, retire the mode + its contract
  branch (`read-contracts.js:139-147`) + the query-engine consumer together.

---

## 6. Things that only LOOK redundant — keep separate

- **The explicit two-read escalation in `queryReplicaOperationPersistenceAuthorityObservation`** vs the single default-mode gateway call. Reason to stay: local-evidence preservation when authority is unreachable — guarding comment `mutation-persistence-methods.js:436-443`. (§2)
- **`REPLICA_OPERATION_LOCAL_VISIBILITY_READ_QUERY_OPTIONS` vs `REPLICA_OPERATION_LOCAL_OWNER_READ_QUERY_OPTIONS`** — both `OWNER_LOCAL_ONLY`, but built on different base bags (`..._CRITICAL_RECOVERY_...` vs `..._READ_...` at `replica-operation-repository.js:401,406`). Different pressure/priority defaults; not a duplicate.
- **`OWNER_RPC_PREFERRED` vs `OWNER_RPC_PREFERRED_SQL_FALLBACK`** — differ only in `allowSqlFallback`, a real behavioral fork (`read-contracts.js:148-165`). Keep both.
- **The 5-value gateway enum itself** — all 5 values reach distinct live contracts; only the *replica-op helper* under-uses it. Do not shrink the gateway enum.
