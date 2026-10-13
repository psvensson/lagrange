# Native V11 before-exit diagnostic freeze

Binding: current worktree HEAD `9d8f03b9938bac8935b7adf94a6e411aeb5aa39a`, source tree `7cf388f79e6afccf3d4311a475147147106e15a5`, approved design review `ab11aa08a29980e4656c7e897719b9fa4d0cdd0fbd4141f1e507ed204a2e5cdf`, and prior V10 witness SHA-256 `01518ea0132c2806d268c265e642fd9e2a54a3f05568ef49256f8acf4698c8c2`.

The sole tracked change is `test/partition/participant-release-native-application-order.test.js`, V11 SHA-256 `775d81bb256787a75adba839f3e68ce9e2201000ecdb165ead38c783bed26c03`, 1,429 lines and 60,352 bytes. Production source and metadata are unchanged.

One exact `process.once('beforeExit')` listener is installed after the admitted group, release owners, carrier gate, membership treatment, and route observer exist, immediately before the original `releaseOnce` call. Existing await sites set a scalar phase before awaiting; the original race result sets the scalar edge kind. The callback emits at most one `t.diagnostic` line containing only bounded test-owned scalars: partition/phase/edge, cleanup and release settlement, route counts/completeness, carrier counts/custody flags, and fixed follower capture/carrier/progress/current/route flags. It performs no owner read, promise settlement, timer, ref, sleep, delegate call, progress subscription, status/facts/database read, proposal, or tick.

The callback catches its own failure. Existing cleanup marks cleanup entry, retains the callback failure as an independent cleanup cause, and removes the exact listener idempotently through `captureCleanup` after all other custody attempts. Original primary errors and every existing cleanup cause remain unchanged. The V10 promises, release acceptance, clocks, budgets, fault physics, transport restoration, and native application assertions are unchanged.

Final syntax, exact ESLint, scoped strict metrics, strict file-size, and diff whitespace checks pass. The first scoped-metrics attempt honestly failed because the diagnostic branches raised `cleanupNativeWitness` from complexity 12 to 14; `cleanupExitDiagnostic` was extracted as one cohesive custody concern, after which the final strict check returned to the existing thresholds (cyclomatic 12, cognitive 20). The initial static red remains in `strict-metrics-initial-red.log`.

No behavioral test, lab run, metadata refresh, source edit, fixture edit, Quest edit, commit, or push was performed. Any later instrumented result remains diagnostic evidence and cannot count as candidate acceptance.
