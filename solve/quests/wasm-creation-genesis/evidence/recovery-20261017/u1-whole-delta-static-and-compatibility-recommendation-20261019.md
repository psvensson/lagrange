# U1 whole-delta static range and bounded compatibility recommendation

Reviewer: `subagent:/root/lifecycle_design_research`, 2026-10-19.

This is a read-only selection/source review and an operational recommendation.
No behavioral test, static gate, generator, source mutation or publication was
executed by this reviewer. It does not accept U1 or replace the actual ordinary
change-proof selector with a curated list.

## Exact subject and static base

The current published candidate is
`25cb5b1fb487485f2789d63d9b0fcb150788890c`, tree
`88bb88c4ae7475de26e6cba8f8363c95d1868269`.

**Use `381750de29af647d446b19adedf1da53eb712093` as the explicit whole-U1
static base.** The original U1 implementation was the single production
commit `a251ce4fd9c980a78c0fd33d8a5f873161f90870` on that base. The original
independent recovery verdict names that exact comparison. The current net
delta contains 36 production paths, not just the generic REMOVE correction
after `a55ab412`.

```sh
node scripts/check-fast-static.js \
  --base 381750de29af647d446b19adedf1da53eb712093 --explain
```

`check-fast-static.js:150-171` consumes the shared changed-path derivation;
`changed-paths.js:220-240` includes the committed range, staged/tracked edits
and nonignored untracked paths. A final result therefore also needs its
actual HEAD and worktree binding. A successful narrow a55-to-candidate run
cannot substitute for this range.

Generated classifications and the seal must be produced normally and retained
at the final candidate. CI's producer/check sequence is
`.github/workflows/ci.yml:175-192`. The fast static program is read-only and
checks expected generated state; it does not repair it while proving it.

## Actual ordinary selection: what widens and why

The canonical ordinary selector is `scripts/select-change-tests.js`, the
`npm test` entry in `package.json:47`; its documented read-only inspection is:

```sh
node scripts/select-change-tests.js \
  --base 381750de29af647d446b19adedf1da53eb712093 --explain
node scripts/select-change-tests.js \
  --base 381750de29af647d446b19adedf1da53eb712093 --list
```

These two options return before execution (`select-change-tests.js:627-669`).
Do not pipe the list into a runner merely to inspect it.

In this sandbox the CLI's subprocess Git call fails with `spawnSync git EPERM`.
The reviewer therefore read the actual range/worktree/untracked paths using
shell Git, then supplied those unchanged path strings to the exported
`buildExecutionPlan` with unchanged current metadata. No package or lockfile
changes exist in this range; neither was treated as an unknown comparison.
This is a selection census, not a successful CLI gate. Root is independently
using the normal outside-sandbox runner.

The resulting actual plan is **WIDENED: 1,896 unique files, 32 safety-spine
members, 1,893 selected members, and two convergence probes observed elsewhere**.
The sorted newline-terminated selected path list SHA256 is
`7a2365706557b68f229b4bef7521728eec6e05355d8d5b09a37e062aa6cf7ffe`.
There are no selection refusals. These numbers do not record executed tests.

The mechanism is explicit in `change-selection.js:1-34,405-455,608-646`:
each changed product source selects its entire owning subsystem; a touched
coupled pair selects each opposite endpoint's entire owning subsystem.
It is not a minimal per-function dependency cone.

| Selected subsystem | Files with its subsystem reason | Actual triggering changes or opposite owners |
| --- | ---: | --- |
| bootstrap-membership | 316 | Nine `src/node/runtime-service-*` and bootstrap binding paths: handler, bound route, generic route, execution, message dispatch, inventory, constants, guarded handler and setup. |
| control-plane | 216 | `service-instance-metadata.js`, `service-instance-state.js`, `replica-dispatch-service.js`; resource/intent couplings also reach this owner. |
| query-sql | 184 | `runtime-replica-state-projection-owner.js`; the bound/publication couplings also reach it. |
| services-runtime | 150 | Fifteen changed runtime/service paths, including manager, recovery, adapter, bootstrap, origin, canonical state record, driver and projection handoff. |
| wasm-toolchain | 73 | Seven changed WASM paths: operation lifecycle, custody, opening, retirement, constants, physical lifecycle and replica lifecycle. |
| runtime-primitives | 22 | `src/constants/service-instance.js`. |
| test-infrastructure | 143 | Five `test/shards` metadata files and the embedding fixture. Changed support code also adds its three actual importers. |
| placement-rebalance | 268 | Opposite owners `runtime-service-replica-identity.js` and the repository/read/visibility files, through retained-native-bootstrap and the explicit legacy-removal coupling. |
| storage-partition | 189 | Opposite `data-directory-manager.js` through retained-native-bootstrap; partition lifecycle through replica-host-cleanup-custody. |
| storage-raft | 134 | Opposite committed-membership owners through retained-native-bootstrap; runtime entry owners through raft-rs-runtime-lifecycle-entry; operation port through cleanup custody; application transaction owner through writer completion. |
| transactions | 16 | Opposite `owner-key-reconcile-queue.js` and its constants through retained-native-bootstrap. |
| transport-messaging | 95 | Opposite message-group lifecycle cleanup through replica-host-cleanup-custody. |

The counts in this table are reason counts, not additive disjoint execution
totals. Exact direct production path membership is reproducible with
`git diff --name-only 381750de29af647d446b19adedf1da53eb712093 HEAD -- src`.

Two broad registry witnesses independently add breadth: `bootstrap-contract`
names 205 bootstrap tests, and `runtime-service-placement` maps `src/runtime/`
to all 107 `test/runtime/` tests. Narrow named interactions contribute 5
selection/resource witnesses, 2 original-intent witnesses, 15 retained-native
witnesses, 7 bound-route witnesses, 3 cleanup-custody witnesses, 9 lifecycle-entry
witnesses and 5 writer-completion witnesses. Fourteen changed test files and
three embedding importers are included. The hundreds of retained evidence
documents also select their existing directory observers; they introduce no
U2 product source or new requirement to execute later U2 experiments.

## Scope disposition and finite next compatibility run

**Recommend the existing 13-file U1 focus run followed by the 23 additional
existing files below, on the same immutable source candidate.** This is a
finite 36-file union for U1-focused behavior and the named compatibility
obligations. It is not represented as all 1,896 files passing or as a newly
certified replacement selector.

The governing text is `TEST-PLAN.md:51-57`: required focused/new-profile
evidence, prepared writer-v1 state/client/completion controls, relevant existing
catalog/Cell/lifecycle/identity/storage tests and the actual changed-path cone,
with **no full unrelated cone or old F1/W07 attribution rerun**. The recommendation
retains the actual cone as a measured selection and makes the relevant owner
compatibility selection explicit. It does not silently change the cone's
membership or claim that size alone waives a required owner witness.

| Compatibility obligation | Additional existing files and reason |
| --- | --- |
| Catalog/selection boundary | `service-install-catalog-owner`, `service-lifecycle-command-owner`, `service-installation-reconciler`, `service-instance-selection-admission`. The actual ACTIVATION_UNSUPPORTED/no-activation oracle is in the reconciler test at lines 175-229; catalog storage alone would not cover it. |
| Request Cell separation | `minimal-deployment-request-cell-runtime-readiness`, `minimal-deployment-request-cell-routing`, `node-shutdown-cell-worker-teardown`, `request-cell-definition-classification`. The readiness file actually loads/runs pinned Component bytes; the teardown file covers existing shutdown order and actual live-worker teardown, not the newly found queued-START interval. |
| Driver, generic lifecycle and adapter compatibility | `wasm-component-driver`, `wasm-driver-contract-conformance`, `service-type-adapter`, and the three `service-runtime-lifecycle*` files below. This covers unchanged generic behavior through the modified shared method owners and preserves the earlier required conformance-file disposition. |
| Physical identity, local storage and publication | `wasm-service-replica`, `wasm-creation-publication.integration`, `wasm-creation-local-record`, `data-directory-manager`, `data-directory-validation.property`. These cover the physical owner and its unchanged foreign identity/path owners without adding a new C9 child-process claim. |
| Strict legacy repository producer | `replica-operation-repository`. The new strict dispatch test remains a scripted consumer; the existing producer contract must not disappear merely because the dispatch consumer is green. |
| Prepared writer-v1 compatibility | `wasm-writer-state-v1`, `wasm-writer-client-v1`, `wasm-writer-completion-v1`, expressly named by the sealed test plan. This does not reexecute the old F1/W07 attribution investigation. |

Executable additional selection, using the existing classified runner entry:

```sh
npm run -s test:file -- \
  test/control-plane/service-install-catalog-owner.test.js \
  test/control-plane/service-instance-selection-admission.test.js \
  test/service/service-lifecycle-command-owner.test.js \
  test/service/service-installation-reconciler.test.js \
  test/runtime/minimal-deployment-request-cell-runtime-readiness.test.js \
  test/service/minimal-deployment-request-cell-routing.test.js \
  test/runtime/node-shutdown-cell-worker-teardown.test.js \
  test/runtime/request-cell-definition-classification.test.js \
  test/runtime/wasm-component-driver.test.js \
  test/runtime/wasm-driver-contract-conformance.test.js \
  test/service/service-type-adapter.test.js \
  test/runtime/service-runtime-lifecycle.test.js \
  test/runtime/service-runtime-lifecycle-journal.test.js \
  test/runtime/service-runtime-lifecycle-idempotency.test.js \
  test/wasm-service/wasm-service-replica.test.js \
  test/wasm-service/wasm-creation-publication.integration.test.js \
  test/wasm-service/wasm-creation-local-record.test.js \
  test/storage/data-directory-manager.test.js \
  test/storage/data-directory-validation.property.test.js \
  test/rebalancer/replica-operation-repository.test.js \
  test/wasm-service/wasm-writer-state-v1.test.js \
  test/wasm-service/wasm-writer-client-v1.test.js \
  test/wasm-service/wasm-writer-completion-v1.test.js
```

This command is a recommendation, not a submission or claimed execution.
Use the authorized immutable-candidate placement mechanism. Classify an
existing failure on exact predecessor/candidate evidence; the historical seven
driver-conformance reds are not automatically current inherited reds.

U1-3 still needs the whole-delta static result and final generated metadata
binding. U1-6 still needs these actual compatibility results and the final
independent review's explicit disposition of the relevance-reviewed cone.
Neither a thirteen-file PASS nor this document marks those gates complete.

The ordinary selector's broad output and the publication corpus gate remain
separate truths. `change-selection-constants.js:224-250` makes a curated
impact-contract edit a publication full-corpus trigger, and a cone larger than
half the corpus is another trigger. `solver-runbook.md:143-148` explicitly
allows non-main WIP preservation without that local proof gate. This candidate
is such a preservation branch. No main merge, full publication, full corpus,
new U2 implementation, A5 completion consumer or full activation proof is
authorized or required by this review. Do not automatically launch 1,896 tests
or a publication corpus because this read-only census exposes the larger plan.

## Byte bindings

| File | SHA256 |
| --- | --- |
| `test/shards/impact-contracts.json` | `71bc3de5e94fc2d7e5835c4e5df88d9d870cf719aef06b78189dcdaa5f857d50` |
| `test/shards/impact-graph-seal.json` | `e8a5994946972884a5e6fa3f84b74240cea43df11388156678873ef6c9aa01ec` |
| `test/shards/subsystem-classes.json` | `595baf86ad9ca4fb795fbb0fcd1708b9f743d3e71a0728e7e006521883ac14e3` |
| `test/shards/primary-classes.json` | `3ccccb766acc4c3f0f2aa8b61629e6f57e09132635181960f2a4ab5065b5becd` |
| `test/shards/resource-classes.json` | `8e3d7ed34cf87995a9e124736c35701d5347e13449657824c483971e174230e0` |
| `scripts/check-fast-static.js` | `434aea67069753d59cbffb7e78edce1aba5cd507e5966501d120faeda603931f` |
| `scripts/select-change-tests.js` | `f2c117556241418994e3f3ea8b4e7b2b7c8da721c9f2ad20099f9d969b0599a0` |
| `scripts/checks/change-selection.js` | `bcfb7c27c2b94114a045f4c5cb45fecb54cc92972a5079ba908c1ab9d963bb1b` |
| `scripts/checks/change-selection-constants.js` | `b55ff7d131ed80c153bcf10116f5a2e699c83c86999995fb29fcc37109ffa71f` |

The complete source and test assertions remain the published candidate's
bytes. Later additive oracle drafts require their own freeze, metadata and
positive/negative evidence before being included in the accepted profile.
