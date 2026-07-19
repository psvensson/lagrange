# Direct ACTIVE executor outcome reproduction on HEAD

- Recorded: `2026-07-19T10:08:43.238Z`
- HEAD: `956a31abf8e74e58ac3d51c985660f51b9d59e4a`
- Test-only diff SHA-256:
  `b07049f3d1e27f1c1f59f3d05d000972e973852e0e50c264eea5b919b93c9aa6`
- Command:
  `npm run test:file -- test/rebalancer/operation-workflow-active-cache-handoff.test.js`
- Result: failed as required before runtime changes, with 44/51 assertions
  passing and 7 assertions failing in the new direct-outcome guard.

The locally owned priority REPLACE received
`REPLICA_CREATE_ACTIVE`/`ACTIVE` through the real
`reconcileExecutorOutcome` method while its complete authoritative SERVICES
row was ACTIVE and its planning-cache row remained SYNCING because the
production repair mutation was silently dropped. Current HEAD:

1. called `reconcileReplaceActualActive` immediately;
2. did not call the shared terminal-handoff owner;
3. retained neither the ACTIVE executor payload nor a bounded outcome timer;
4. left the planning-cache row SYNCING; and
5. called the source-retirement continuation again on a second direct outcome.

The existing recovery-driven tests in the same file remained green. This
isolates the defect to direct executor completion dispatch bypassing the
already-established authoritative terminal-handoff decision.
