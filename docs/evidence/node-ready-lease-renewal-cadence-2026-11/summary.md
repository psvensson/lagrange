---
audience: evidence
recorded: 2026-11-14
quest: node-ready-lease-renewal-cadence
---

# Evidence Summary: node-ready-lease-renewal-cadence

## Problem Statement and Root Cause

During the 3-node Docker formation journey (`fresh-formation-user-table-routability`),
joining nodes experienced recurring 100-710 ms `READY` lease lapses
(`leaseExpiredForMs=111..707ms`), and `JOINING` nodes logged bogus
`leaseExpiredForMs=1794661095516` (`~1.79e12 ms`).

Systematic root-cause analysis across `src/` identified two coupled defects:

1. **Split READY-Lease Renewal Cadence Ownership**:
   - `NodeReadyLeaseAuthority` (`src/control-plane/node-ready-lease-authority.js`)
     owns `DEFAULT_READY_LEASE_MS = 15000`.
   - `HEARTBEAT_DEFAULT.INTERVAL_MS` (`src/control-plane/heartbeat-service-constants.js`)
     was `5000`, but `HEARTBEAT_DEFAULT.NODE_METADATA_MIN_UPDATE_INTERVAL_MS` and
     `HEARTBEAT_DEFAULT.NODE_METADATA_MAX_STALENESS_MS` hardcoded `10000` (2/3 of
     the 15s TTL).
   - Because `10000 ms` suppressed the `+5000 ms` heartbeat write
     (`coalesced_unchanged`), a node had only one renewal opportunity at
     `+10000 ms`. Sub-millisecond negative timer jitter (`elapsedMs = 9998 < 10000`)
     suppressed the `+10000 ms` tick as well, deferring renewal to `+15000 ms` -
     the exact instant the 15s lease expired. Raft commit and CDC propagation
     latency (`100-700 ms`) then caused peers' `SystemTableCache` to observe an
     expired lease (`holdsLiveLease === false`).

2. **Systematic `Number(null) -> 0` Timestamp Coercion Across `src/`**:
   - In JavaScript, `Number(null)` is `0`, `Number.isFinite(0)` is `true`, and
     `0 <= nowMs` is `true`.
   - When a node row had `ready_lease_expires_at: null` (e.g. `JOINING`,
     `CONNECTED`, `DISCONNECTED`, `STOPPED` nodes) or `last_heartbeat: null`,
     coercing with `Number(...)` turned `null` into epoch `0` across
     `NodeReadyLeaseAuthority`, `LeaseService`, `node-readiness-policy.js`, and
     `message-group-target-resolver.js`.

## Production Repair

1. `src/control-plane/node-ready-lease-authority.js`:
   - Exported `DEFAULT_TTL_MS = 15000`, `DEFAULT_RENEWAL_CADENCE_DIVISOR = 3`,
     `DEFAULT_RENEWAL_INTERVAL_MS = 5000`, `resolveRenewalIntervalMs(ttlMs)`,
     and `parseLeaseExpiresAt(row)`, and set `this.renewalIntervalMs` on
     `NodeReadyLeaseAuthority` instances.
   - Updated `isExpired(row, now)` and `holdsLiveLease(row, now)` to use
     `parseLeaseExpiresAt(row)` so `ready_lease_expires_at: null` returns
     `false` for both predicates.
2. `src/control-plane/heartbeat-service-constants.js`,
   `src/control-plane/heartbeat-service-lifecycle-methods.js`, and
   `src/control-plane/node-lifecycle-publication.js`:
   - Derived `HEARTBEAT_DEFAULT.INTERVAL_MS`,
     `HEARTBEAT_DEFAULT.NODE_METADATA_MIN_UPDATE_INTERVAL_MS`, and
     `HEARTBEAT_DEFAULT.NODE_METADATA_MAX_STALENESS_MS` from
     `DEFAULT_RENEWAL_INTERVAL_MS` (`5000 ms`), and replaced magic divisor `3`
     with `DEFAULT_RENEWAL_CADENCE_DIVISOR` and `resolveRenewalIntervalMs`.
3. `src/control-plane/lease-service.js`:
   - Used `parseLeaseExpiresAt(node)` in `noteLeaseSkipObservation` so
     `leaseExpiredForMs` is `null` when `ready_lease_expires_at` is `null` or
     absent, and `sweepExpiredLeases` never sweeps `JOINING` nodes with
     `ready_lease_expires_at: null`.
4. `src/node/node-readiness-policy.js`:
   - Updated `getFiniteNumber(value)` to return `null` for `null`, `undefined`,
     `''`, and booleans before numeric coercion.
   - Added and exported `getNodeReadyLeaseExpiresAt` and `getNodeLastHeartbeat`,
     updated `isNodeRecordReady` and `wasNodeRecordReadyWhenWritten` to use them,
     and fixed `isNodeReadyLeaseExplicitlyCleared` so
     `{ status: 'STOPPING', ready_lease_expires_at: null }` and
     `{ status: 'active', ready_lease_expires_at: null }` return `true`.
5. `src/message-group/message-group-target-resolver.js`:
   - Extracted and exported `isReadyNodeRow(nodeRow, nowMs)` that rejects
     `ready_lease_expires_at: null` and requires a finite positive timestamp
     `readyLeaseExpiresAt > now`.

## Verification

- Sealed red on `e9cb79dd449f11a8dd6524ed571992110a91585e` with
  `node --test test/control-plane/node-ready-lease-renewal-cadence.test.js`
  failing 35 assertions across suites `R1`-`R5`.
- After the production repair, `node --test test/control-plane/node-ready-lease-renewal-cadence.test.js`
  passes 43/43 assertions across suites `R1`-`R5`.
- Control-plane, node, bootstrap, message-group, and rebalancer unit test suites
  pass with zero regressions.
