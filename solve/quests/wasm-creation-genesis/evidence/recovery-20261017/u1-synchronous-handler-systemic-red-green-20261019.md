# U1 exact-handler shutdown ordering — systemic red/green preservation

Date: 2026-10-19. **Research and partial executed evidence only.** Not U1 acceptance,
source independent approval, release gate, U2 authorization, or a `main` merge.

## Authority and invariant

The WASM service replica's own lifecycle must close admission and retire the
**exact registered handler in the same synchronous shutdown call**, before any
`await`. An old generation may not remain addressable while its cleanup joins
opening/reconciliation. Physical resources and durable retirement/journal debt
are separate obligations: they may only settle after their own authorized owners
finish. The exact handler identity is captured at the fence; never unregister
by address or remove a successor handler. A registration that was never made
must remain a distinct already-absent outcome.

Source owner: `src/wasm-service/wasm-service-replica-lifecycle.js`, using the
existing shared identity owner in
`src/node/replica-transport-handler-identity.js`. No new lock, retry owner,
background reconciler, lifetime timeout or transport implementation.

## Frozen evidence sequence

| Fact | Immutable binding | Observation |
| --- | --- | --- |
| Test-only negative witness | [54950e99](https://github.com/psvensson/lagrange/commit/54950e9969f91c73ce7af1bc294db8eef41195e6) | Adds synchronous unregistration test only; original production source unchanged from 25cb5b1f. |
| Original source negative execution | [Lab #419](https://github.com/psvensson/lagrange-lab/issues/419) | FAIL as intended; existing 1,884-interleaving model and new synchronous fence witness both report old handlers still addressable after shutdown call. One file failed; 35 of 41 Node TAP cases passed, 6 failed. |
| Isolated production correction | [a1d3b056](https://github.com/psvensson/lagrange/commit/a1d3b056d75e85f257646da6388b0c003a45b30b) | Move identity-unregistration invocation ahead of all opening and reconciliation awaits; immediately attach settled success/failure handlers, but still await both custody joins before physical release. |
| Source correction execution | [Lab #420](https://github.com/psvensson/lagrange-lab/issues/420) | New exact-handler oracle and all 1,884 model schedules PASS; one file overall RED because four older committed-entry fixture cases remain invalid. Do not count as a full-file pass. |
| Inherited fixture correction | [69f59709](https://github.com/psvensson/lagrange/commit/69f597091071c4bbb254179939d7e8ea771b7a1a) | Correct synthetic `effects` to the real `{afterCommit,afterRollback}` shape and require applied-index publication only when the successful-commit callback is run. Production code unchanged from a1d3b056. |
| Complete immediate gate | [Lab #422](https://github.com/psvensson/lagrange-lab/issues/422) | PASS 1/1 file, 54 runner-reported assertions, exact SHA 69f59709 on tv-dator. Includes successor delivery, exact retirement, 1,884 model schedules and post-commit assertion. |
| U1 13-file focused subset | [Lab #423](https://github.com/psvensson/lagrange-lab/issues/423) | Submitted on 69f59709; terminal receipt and failed-case review must be obtained before any credit. |
| U1 23-file compatibility subset | [Lab #424](https://github.com/psvensson/lagrange-lab/issues/424) | Submitted on 69f59709; terminal receipt and failed-case review must be obtained before any credit. |

The prior, independently reviewed **15-focus + 23-compatibility** checkpoint
described in the agent handover was locally hook-checked but its two new
inventory/execution files and resulting published exact commit could not be
recovered remotely at the time of this review. The *13* focus files submitted
in #423 are the earlier preserved profile, **not a substitute for that 15-file
acceptance checkpoint**. Neither #423 nor #424 can close the missing-witness
gate. No inferred approvals or inherited PASS claims.

## Separate inherited fixture failure: confirmed at original base

At both original U1 base `381750de29af647d446b19adedf1da53eb712093`
and pre-correction `25cb5b1fb487485f2789d63d9b0fcb150788890c`,
`test/wasm-service/wasm-service-replica.test.js` uses the identical blob
`631646270414d57357ac5f6726625ccdcd1eaa82` with
`committedRecord.effects = []`. The corresponding production
`src/wasm-service/wasm-service-replica.js` is also byte-identical at blob
`cf3bb0040dc683c0cb53f3e969142eadedf8d33f` and accesses
`committed.effects.afterCommit.push`.
The real authoritative producer
`src/raft/raft-rs-application-transaction-owner.js` supplies an object
`{afterCommit: [], afterRollback: []}` inside the SQLite transaction and
runs callbacks after commit/rollback respectively. Thus changing the
production recipient to accept `[]` would be the wrong boundary fix.
The corrected test still asserts the same KV outcomes and adds the
post-commit visibility invariant. This establishes inheritance and the
fixture's contract violation, **not** a general release of transaction
or rollback proof obligations elsewhere.

## Systemic defect archaeology, not just the failing line

Earlier Lagrange incidents in
`systemic-defect-review-20261019.md`: competing leadership projections
([d5e18ea3](https://github.com/psvensson/lagrange/commit/d5e18ea3f0d5826d3151444e9a3cb882209699b3)),
dropped wake / ambient clock
([154628ee](https://github.com/psvensson/lagrange/commit/154628eed689a5e42dcc3187c40c565230db0941)),
stale-progress timeout
([50520f6b](https://github.com/psvensson/lagrange/commit/50520f6b5ccfcf74af77746c6ef9751bf0b76fbd)),
and late callback cleanup
([3b27482c](https://github.com/psvensson/lagrange/commit/3b27482c6641e04a409b651b82767e0bdc08cda6)).
A shutdown state alone never proves transport admission has closed.
An asynchronous handler release can outlive the generation and conflict
with successor registration; the shared transport API exists to prevent
that exact older class of error.

External analogues to *apply selectively*:
[Kubernetes finalizers](https://kubernetes.io/docs/concepts/overview/working-with-objects/finalizers/)
retain a terminating resource until cleanup debt is satisfied rather than
equating deletion request with cleanup completion;
[FoundationDB deterministic simulation](https://apple.github.io/foundationdb/testing.html)
tests adversarial interleavings and failures in repeatable schedules, together
with real hardware validation;
[etcd/raft Ready/Advance](https://pkg.go.dev/go.etcd.io/etcd/raft/v3)
separates ordered committed-state effects from acknowledgement of progress.
These support separate admission, durable commit, handler identity, retained
physical debt and re-drive owners; they do **not** authorize copied timeouts
or a second source of lifecycle truth.

## Follow-through / explicit remaining gate

- Review #423/#424 exact receipts, terminal/runner status and every first failure
  against source and original-base behavior; preserve unchanged failing controls.
- Recover or reconstruct and independently review the two missing inventory and
  execution witness files; pin their bytes, refresh canonical metadata and run
  the original 15+23 profile at *one* candidate commit.
- Prove handler unregistration failure preserves resource cleanup/debt and an
  exact later retry; check successor registration survives late settlement and
  post-await ordering. Keep source-only negative mutations tied to the final
  tree, not just the initial #419 reproduction.
- Run required whole-U1 fast static and generated checks from explicit base
  `381750de29af647d446b19adedf1da53eb712093`, normal hooks and independent
  source/test approvals. Do not substitute the 36-file subset for the ordinary
  1,896-file selected change cone or the publisher's own gate.
- Complete separate seven-step U1 acceptance checklist and only then consider
  U2, activation or `main` merge. Source branches remain intentionally WIP.

All references here are exact published Git objects and lab Issues, not
self-certification. Unfinished cells remain OPEN.
