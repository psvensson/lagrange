# Cache ingress: bounded independent design recommendation

Reviewer: `subagent:/root/independent_review`, 2026-11-06, rule-set revision 5.
Reviewed source is unchanged from `8b08183a7adf89f279e7816f70410e48414cc728`
through the fixture-only checkpoint `2b446a7ce`. No source edits or tests were
performed by this reviewer.

**Design verdict: consolidate at the existing gateway cache-reconciliation
owner.** The direction below is approved for implementation review; this is
not approval of an unwritten source patch or acceptance evidence.

## Observed boundary

`control-plane-system-table-gateway-query-execution.js` directly writes the
cache in three places: row UPSERT at 130, committed CDC application at 535,
and authoritative-absence DELETE at 571. The established sanctioned module
`control-plane-system-table-gateway-cache-reconciliation.js` has two further
direct calls at 291 and 318. The guard at
`test/config/system-cache-write-callsite-guardrails.test.js:11-40,98-131`
permits the latter owner, with an exact count of two, and no query-execution
writer. This is an actual ownership mismatch, not justification to add an
allowlist entry.

Immediate paths and semantics are:

| Input path | Current caller | Semantics to preserve |
| --- | --- | --- |
| Authoritative changed rows | SQL metadata refresh `applyTableResultToStore` (464-467); runtime definition refresh (185-199) | Per-row UPSERT; invalid row is skipped; apply exception is debug-logged and the next row is attempted. No complete-table observation receipt is minted. |
| Authoritative absence | SQL metadata `evictStoreRow` (470-481); runtime definition eviction (57-75) | DELETE with `AUTHORITATIVE_ABSENCE_RECONCILIATION`; preserve the cache owner's tombstone/causal behavior. No CDC observation timestamp is fabricated. |
| Committed partition CDC | `partition-cdc-obligation.js:77-103,247-250` | Runs after commit; forwards original table, operation, data, causeId and one owner timestamp for the batch. The helper propagates an apply exception to the existing per-event partition catch. Obligations, ACKs and retry ownership are unchanged. |
| Full cache reconciliation | `reconcileAuthoritativeCacheRows` | Existing canonicalization, comparator, supersession, delete policy, mutation counts and receipt validation/publication remain owned here. Apply failures currently propagate; they must not be swallowed by the moved best-effort helper. |

There are existing method ladders in this same interaction. The exported
authoritative-upsert function first invokes an optional gateway
`applySystemTableRowsToCache` method, otherwise writes directly. Both SQL
metadata absence and runtime definition absence try cache `delete` / `remove`
before the owner helper. Keeping these would leave multiple mutation routes
even after the three direct calls moved files.

## Minimal complete implementation

1. Put a **single private direct cache-apply primitive** in the existing
   gateway cache-reconciliation module. It calls the supplied writable port's
   `applySystemTableChange` once, passing operation/data/options unchanged;
   it does not catch or reinterpret exceptions. Route the existing two full
   reconciliation calls and the moved CDC/subset/absence wrappers through it.
   Distinct input provenance and error policies remain explicit wrappers in
   this owner, not alternate mutation authorities.
2. Move the authoritative-row and absence functions to that owner and wire
   their existing public gateway exports to it. Move committed CDC application
   there and update the partition import. Delete the old query-execution
   exports/mutation method and the optional-method fallback ladder; do not
   retain a compatibility re-export or probe for an old gateway method.
3. Use one private writable-target resolution at this owner. Preserve the
   actual explicit writable-capability / gateway-owned CDC mutation-target
   composition rule, including read-only cache views. Reuse it for existing
   reconciliation target selection; do not duplicate writable-port discovery
   in query execution or make caller `delete`/`remove` methods alternatives.
   Missing writable authority remains a no-apply/unavailable result according
   to the existing entry contract; it never grants a writable capability.
4. Route the immediate SQL and runtime absence callers through that canonical
   ingress only. Their read/classification policies and the separate runtime
   definition eligibility repair remain outside this unit. Real cache objects
   have no need for the old fixture `delete`/`remove` adaptation. Update affected
   fixtures to supply the declared writable cache port or actual cache owner,
   without mutating supplied read-only/real ports.
5. Keep the primitive private. Do not turn it into a public generic bypass
   around the full-reconciliation receipt owner. Subset repairs and committed
   events must **not** be sent through full-table reconciliation: that would
   add comparison/filtering/receipt behavior they do not currently have.
6. Tighten the existing guard's sanctioned reconciliation count from two to
   one if this implementation has one direct call. Keep the exact allowed-file
   set unchanged. Do not evade detection with a computed method name or a
   `.call` variant. The count decrease records consolidation, not broader
   authorization.

The current upsert helper has an inconsistent boolean: the gateway-method
branch can apply via the gateway's CDC target but returns whether the original
argument was writable; the fallback returns whether its resolved target was
writable. Name and test the single resulting contract when removing that
ladder. A consistent “usable target accepted the row batch” boolean is not
proof of every row changing or durable progress, since per-row failures remain
logged/contained. Preserve ordinary valid-target return behavior and explicitly
cover the read-only-view / gateway-owned-target case. Do not silently promote
the boolean into authoritative metadata or receipt evidence.

## Discriminating proof

Retain the original red guard and establish all of the following at the actual
owner boundary, not merely through a new helper that returns a supplied result:

* Each source path reaches the single sanctioned primitive with exact row
  identity, operation and metadata. CDC INSERT/UPDATE/DELETE are not normalized
  into UPSERT. `causeId` and explicit `observedAtMs` (including zero) survive;
  absence keeps its mutation mode without acquiring CDC timing fields.
* A throwing writable port distinguishes error custody: best-effort rows log
  and continue per row; the committed helper throws and the actual partition
  caller logs/continues as before; full reconciliation still propagates.
  No new ACK, delivery, completion, retry or receipt is inferred from a catch.
* A real `SystemTableCache` demonstrates stale-row absence/tombstone behavior
  and CDC merge/provenance. Preserve receipt-gated complete reconciliation,
  equal/newer-row controls, invalid/duplicate-key refusal and nonpublication
  after failed reconciliation. Do not publish a complete observation from a
  subset repair.
* Missing/read-only mutation ports do not write; a correctly composed gateway
  CDC target is used once. Former `applySystemTableRowsToCache`, `delete` and
  `remove` test doubles must not provide alternate success. A deliberately
  throwing retired method can prove it is no longer consulted.

Useful existing witnesses: the cache-write guard; gateway reconciliation tests
and tail cases; `system-table-cache-anti-entropy-sweep.test.js`;
`system-table-cache-tombstone-time-authority.test.js`;
`system-table-cache-cdc-provenance.test.js`; `partition-cdc-obligation.test.js`;
`sql-query-engine-provision-partition-waits.test.js` (1260 onward covers real
SQL/runtime authoritative absence); `sql-query-engine.test.js` and its execution
cases; `runtime-service-handler.test.js` (1310 onward). The SQL execution fixture
at lines 656-664 currently supplies the retired gateway mutation method and
must be reconciled with the canonical port. The admin read-only snapshot test's
old mutation spy can be retired while retaining its actual cache-write and
query-call negatives.

Use the normal impact selector after implementation. This bounded design does
not close CDC delivery acceptance, runtime-definition authority, R17 node-floor
work, broad corpus failures, E8 or E9.

## Source fingerprints (SHA-256)

| Path | Digest |
| --- | --- |
| `src/control-plane/control-plane-system-table-gateway-query-execution.js` | `0fa30bf7f89363db795097c1526c3df50cff83ebea8ea6263e5fa57c0b75600a` |
| `src/control-plane/control-plane-system-table-gateway-cache-reconciliation.js` | `0ea64112f47a8647d23e675173e291afc8b6e453fbeef2419e92f9b7529d33ca` |
| `src/control-plane/control-plane-system-table-gateway.js` | `1ec1e0dd13438b1a48186aa58495039f3921e8512160239a12261576d510024f` |
| `src/query/sql-query-engine-metadata-authority-refresh.js` | `ddeb80c67cd5a2440c6bdffad53454b83c4d1e934ff05c81861c4e8315086d2e` |
| `src/node/runtime-service-definition-resolution.js` | `b77302c32517be34f5cf2dd28a0a68f6aa6cf13f90006017170e08410988e768` |
| `src/partition/partition-cdc-obligation.js` | `c74fbd0d2cc948041b8f4216395a5ab2879a8f5371b7218baad7ea6ce288f601` |
| `test/config/system-cache-write-callsite-guardrails.test.js` | `8eec6952c99185ade3497611a12575a885c361f56edfa3f67c8f7bb2a1ebde9e` |
