# Focused proof

Base: `59f3427c1557618c65f8dcd36d506826e8ffcbcf`

Candidate hashes:

- `test/service/minimal-deployment-request-cell-routing.test.js`: `880ddcbe7366d99c4bc28eca27ce6478316f31c33057a888f0414c7dccfc1907`
- `test/service/minimal-deployment-request-cell-routing-fixture.js`: `97cd223cdebf29c4071822cec0452dcd0ea30e37ec653edd390799c973c586d1`
- `solve/changes/global-owner-debt-inventory/inventory.json`: `e0b070d07224fa2538c52ea88c772efb9f207e2f595d89429e663b5c0e81d1d5`
- `test/shards/impact-graph-seal.json`: `5f268c9a488ffc3d97f1350c32d9faac5da15fa275fdaa7dc82a73ca004c61b3`

## Baseline failure classification

At the sealed base, `node --test test/service/minimal-deployment-request-cell-routing.test.js`
passed all five semantic tests but breached the existing two-second authored-node
limit: the durable-fence leaf took 2402.919 ms, the genuine-HTTP leaf took
3649.870 ms, and the authored suite root took 6331.755 ms. The independent
full-proof census measured the same categories at 2674 ms, 2605 ms, and 6311
ms. The failure was therefore excessive real-time waiting and redundant worker
startup inside an otherwise passing blocking test, not a product failure.

## Owner fidelity

The durable-fence test still constructs two real `ServiceRuntimeLifecycle`
owners over one real in-memory SQLite `wasm_operations` table and its production
unique identity index. A typed `RuntimeDriver` replaces only the two redundant
WASI workers for this storage race. Both actual empty SQLite reads cross a
two-party barrier before either production journal owner attempts its insert.
The witness proves two insert attempts for one canonical operation id, exactly
one driver invocation, the losing `INVOCATION_AMBIGUOUS` classification with
`invoked: true`, and journaled replay with the original value through both
lifecycle owners.

The HTTP witness still uses two genuine `WasiComponentCellRuntime` instances,
two `MessageRouter` instances, `RuntimeServiceHandler`, and `BootstrapAPI`
injection. After all production owners are started, mocked `Date` governs the
late request's adapter, dispatcher, and pending-ledger absolute deadline phase.
Only the real pending-response ledger's one configured 1000 ms `setTimeout`
registration uses the mock scheduler; unrelated runtime and recovery timers
remain native. The witness waits for both the actual timer arm and genuine WASI
handler completion, advances exactly 1000 ms, observes the ambiguous 502, then
releases the held response and waits for the real
`recordServiceResponseDisposition({classification: 'late_after_timeout'})`
path. Replay returns the recorded 201 result without a second component
invocation.

All new owner-event and settlement awaits use one failure-only 750 ms bound.
Its native timer functions are captured before mock-clock installation and the
timer is cleared immediately on settlement. Failure raises a named Node
`AssertionError`, not a product error. Durable cleanup releases both gates,
settles attempts and both lifecycle stops within the same bound, and preserves
the primary assertion when cleanup also fails. A controlled negative that
withheld the second SQLite-read arrival failed on the named missing event at
750 ms (786.156 ms leaf, 788.874 ms root, 1458.462 ms process) rather than
hanging; cleanup did not replace the assertion.

Two controlled cleanup negatives exercise the rejection boundary itself. With
an otherwise successful body, a rejecting second lifecycle stop failed the
test with the exact `controlled durable lifecycle stop failure` error
(31.580 ms leaf, 32.024 ms root, 724.279 ms process). With the second actual
SQLite-read arrival also withheld, the same rejecting stop did not replace the
original named 750 ms owner-event `AssertionError` (782.249 ms leaf,
783.674 ms root, 1466.470 ms process). The cleanup implementation uses explicit
sentinels for both primary and cleanup outcomes, so falsy thrown or rejected
values are not mistaken for success.

No runtime source, request deadline, retry, backoff, concurrency, cadence,
runner timeout, shard class, selector, or ratchet changed. The five original
leaf-test names remain byte-identical. The former catch-all suite was divided
only at its existing adapter-lifetime, durable-lifecycle/storage, and genuine
HTTP-routing owner boundaries after a deliberately concurrent diagnostic left
the single aggregate root above two seconds. The same existing path remains
selected by all five request-cell scenario owners and remains classified
`unit`/`ordinary`/`services-runtime`.

## Fresh focused verification

- Three consecutive direct executions after the final regeneration: 5/5 leaf
  tests and 3/3 owner roots green each time. Adapter roots
  2.548/2.548/2.652 ms; durable roots 309.585/316.837/333.059 ms; genuine-HTTP
  roots 307.952/318.779/308.051 ms. Every authored node is below two seconds.
- `npm run test:file -- test/service/minimal-deployment-request-cell-routing.test.js`:
  PASS, classified ordinary, 8/8 TAP assertions. Its TAP output recorded owner
  roots at 2.744/903.920/932.938 ms.
- `node scripts/run-minimal-deployment-request-cell-routing-scenarios.js`:
  PASS, 5/5 canonical guard files and 83/83 assertions. Its retained TAP
  artifact records this file's roots at 2.607/904.488/984.696 ms; report
  SHA-256 `49aa0032a4f5dd5766fb902a1094fb85aa022cbb3b615adb2ed20805c7e0815a`.
- `node scripts/check-fast-static.js --base 59f3427c1557618c65f8dcd36d506826e8ffcbcf --explain`:
  PASS, all 14 checks, including dependency boundaries, changed-file ESLint,
  scoped ratchets, shards, impact contracts, runtime grammar, and closure ledger.
- `npm run test:metrics:scoped:strict -- <two changed test files>`: PASS,
  cyclomatic threshold 12 and cognitive threshold 20.
- `npm run audit:file-size:strict -- <two changed test files>`: PASS,
  no new source or test oversized-file debt.
- `npm run test:owner-debt:prepare`: PASS with no ratchet increase
  (complexity 1822/1822, cognitive 161/161, cycles 0/0, source duplication
  57/57 and 1845/1845 lines, test duplication 793/793 and 30519/30519 lines).
- Canonical import-graph verification: PASS; graph byte digest
  `8a6fee241ffeb9f20aceae7266199d0ce4f1ac277229d2e02e908dff63944f5d`,
  snapshot digest
  `2969fb899d9ac6ece485a645c6f4171595d3f7ef3170b4b968eafd6f3a2df1e3`.
- `npm run audit:shards`: PASS, 2068 primary-classified tests; resource digest
  `fnv1a32-89dfc943`, subsystem digest
  `fnv1a32-d947c88f` as reported by the command.
- `npm run audit:impact-contracts`: PASS, 19 contracts and 10 coupled pairs,
  registry SHA-256
  `97cc5d7924cfc89c679661341d890867311af6471f354fa93f24e558ed49b888`.
- `git diff --check`: PASS.

The outer Node process includes module/worker startup and reported roughly
2.2 seconds in the three direct runs; the canonical classified wrapper reported
3.779 seconds. The binding duration rule and census measure authored node:test
leaves and suite roots, all of which remain below one second in both retained
canonical artifacts.
