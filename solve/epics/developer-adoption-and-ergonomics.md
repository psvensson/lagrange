---
id: developer-adoption-and-ergonomics
status: done
proof: deterministic
roadmapRow: null
doneWhen:
  probe: test-receipt
  args:
    file: solve/quests/developer-adoption-and-ergonomics/evidence/receipt.json
quests:
  - developer-adoption-and-ergonomics
authorizes:
  - src/cli
  - examples/call-binding-account-summary
  - docs
  - README.md
  - test
  - solve
---

# Developer adoption and ergonomics

## Intent (why now)

Following the `0.2.6` release, the code-first WASI service compiler,
partition-local `distributed({sql, run, reduce})` execution model, and
co-located service placement engine are live and verified across the
repository. However, a developer evaluating or adopting Lagrange for the first
time hits four concrete friction points:

1. **Multi-partition partial-key collision in `lagrange service init`:**
   `src/cli/service-wasm-scaffold.js` currently scaffolds a `lagrange.service.js`
   whose `summarizeRun` ignores `{accountId}` (even though `src/handler.js`
   forwards `{accountId: body.accountId ?? null}`) and emits a static key
   `emit('total', totalCents)`. Because `mergeDisjointPartialRows` in
   `src/runtime/sql-query-loop-parallel-reduce.js` enforces disjoint partial keys
   across contributing partition shards (`SHARD_OVERLAP`), a developer who runs
   their newly scaffolded service against any table with two or more partitions
   immediately hits a runtime failure (`call_cell_reduce_incomplete`).
2. **Scaffolded project script and engine-floor gaps:**
   The scaffolded `package.json` declares `"node": ">=22.0.0"` instead of the
   repository's `>=22.12.0` floor and only defines `"test": "node --test"`,
   omitting `npm run build` (`lagrange service generate . && lagrange service build .`),
   `npm run generate`, and `npm run deploy`.
3. **Invisible data-locality payoff in `npm run demo:account-summary`:**
   The flagship quickstart (`examples/call-binding-account-summary/run-call-binding-account-summary.js`)
   prints the final reduced JSON payload (`contributingShards: 2`,
   `transactions: 50`, `totalCents: 63575`), but does not surface the
   quantitative locality execution summary (150 table rows scanned across 2
   local partitions, 50 matching account rows aggregated in-place, 8 scalar
   partial pairs emitted to the reducer, and 0 raw rows transferred across
   the reducer boundary).
4. **Application-vs-harness and repository orientation framing:**
   Newcomers opening `examples/call-binding-account-summary/` or the root of the
   repository see a 460-line in-process cluster harness alongside `architecture/`,
   `test/`, and `src/` without an immediate map separating the 169-line service
   definition (`lagrange.service.js`) and public evaluation surfaces from the
   in-process test harness and formal specification directories.

## Sealed design decisions

1. **Multi-partition-safe scaffold by default.**
   `src/cli/service-wasm-scaffold.js` projects `SELECT id, account_id, amount_cents FROM account_activity`,
   honors the optional `{accountId}` filter in `summarizeRun`, tracks the
   minimum matching `row.id` as the partition `shardKey`, and emits
   `count:<shardKey>` and `total:<shardKey>` partials when `matched > 0`.
   `summarizeReduce` aggregates `transactions`, `totalCents`, and distinct
   `contributingShards` across all partitions and returns
   `{accountId: accountId ?? null, contributingShards, totalCents, transactions}`.
2. **Preserve explicit CLI pipeline boundaries while adding npm convenience scripts.**
   `lagrange service generate`, `lagrange service build`, and
   `lagrange service deploy` retain their explicit single-stage refusal
   contracts (pinned by `test/cli/service-pipeline-command.test.js`). The
   scaffolded `package.json` adds `"generate": "lagrange service generate ."`,
   `"build": "lagrange service generate . && lagrange service build ."`, and
   `"deploy": "lagrange service deploy ."`, and aligns `engines.node` to
   `>=22.12.0`.
3. **Measurable locality summary in `demo:account-summary`.**
   `examples/call-binding-account-summary/run-call-binding-account-summary.js`
   exports a pure `buildLocalityExecutionSummary(rows, partitions, summary)`
   helper, attaches `locality` to the returned JSON report, and logs a phase
   line showing the row-to-partial reduction (`150 rows scanned across 2 local
   partitions -> 8 numeric partials -> 1 reduced JSON response (0 raw rows
   transferred)`).
4. **Clear orientation in public documentation.**
   `README.md`, `docs/README.md`, `docs/tutorials/first-hour.md`, and
   `examples/call-binding-account-summary/README.md` clearly distinguish the
   authored service (`lagrange.service.js`) from the in-process cluster harness,
   explain why `<metric>:<shardKey>` partial keys keep multi-partition
   reductions disjoint, and provide a concise repository layout table.

## Owner boundaries and workstreams

| Deliverable | Owner surface | Verification witness |
| --- | --- | --- |
| 1. Multi-partition-safe `service init` scaffold & `{accountId}` filtering | `src/cli/service-wasm-scaffold.js` | `test/cli/service-init-wasm-scaffold.test.js`, `test/service/service-compiler-editor-typings.test.js` |
| 2. Scaffolded `package.json` scripts (`generate`, `build`, `deploy`) & Node `>=22.12.0` | `src/cli/service-wasm-scaffold.js` | `test/cli/service-init-wasm-scaffold.test.js` |
| 3. Quantitative data-locality summary & phase trace in `demo:account-summary` | `examples/call-binding-account-summary/run-call-binding-account-summary.js` | `test/examples/service-compiler-account-summary-parity.test.js` |
| 4. Public onboarding docs & repository orientation | `README.md`, `docs/README.md`, `docs/tutorials/first-hour.md`, `examples/call-binding-account-summary/README.md` | `npm run audit:doc-ascii`, `npm run audit:doc-audience`, `npm run audit:documentation-current` |

## Current summary

- Status: done (1 bounded quest: `developer-adoption-and-ergonomics`).
- Scope: `src/cli/service-wasm-scaffold.js`, `examples/call-binding-account-summary/**`, `docs/README.md`, `docs/tutorials/first-hour.md`, `README.md`, and their paired unit/parity tests.
