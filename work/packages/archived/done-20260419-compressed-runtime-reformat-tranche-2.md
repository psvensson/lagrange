# Compressed Runtime Reformat Tranche 2

## Status

Complete on 2026-04-19.

## Why

After the smallest compressed files are cleaned up, the repo still has a
second tier of compressed runtime files that remain under the `1500` line
limit or sit near it, but still violate the formatting rule and block safe
review.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Reformat the next compressed-runtime tranche without semantic change:
   `src/partition/partition-cdc-delivery.js`
   `src/control-plane/priority-recovery-snapshot.js`
   `src/control-plane/membership-publication-coordinator.js`
   `src/control-plane/heartbeat-service.js`
   `src/service/service-lifecycle-manager.js`
   `src/topology/cdc-group-propagation-service.js`
2. Keep the pass formatting-first so larger owner decomposition can follow on
   readable files.

## Scenario Targets

1. `node-join-under-load`
2. `rolling-restart`
3. `seed-restart-under-load`

## Residual Closure Inventory

- [x] The tranche-2 compressed runtime files are readable and consistently
      formatted.
- [x] Focused owner-path tests cover the touched files.
- [x] Follow-on decomposition work no longer needs a preliminary formatting
      pass on those files.
