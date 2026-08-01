---
epicContractVersion: 2
id: callback-axis-retirement
roadmapRow: null
graduatesTo: null
---

# Callback-axis retirement

## Intent (why now)

The `partition_callback` execution axis (admin-websocket upload of JavaScript
callback modules with the `ctx.emit` / `ctx.call({kind: 'reduceByKey'})`
surface) is documented as "a separate legacy/internal execution axis"
(`docs/current-capabilities-and-limitations.md:72`), yet it remains the only
externally drivable demonstration of partition-local fan-out/reduce, and the
`wasm_component` lifecycle scaffolding still rides on its JavaScript-envelope
rehearsal. That means the legacy axis cannot simply be deleted: today it
carries real regression coverage and the only runnable fan-out story. This
epic records the exact conditions under which the axis becomes deletable, so
retirement is an ordered plan rather than folklore, and no new work accretes
onto a surface already conceptually superseded by Artifact / Binding / Cell
plus the internal query-loop runtime (`src/runtime/sql-query-loop-*.js`).

## Retirement conditions (the ordered ladder)

1. **Public native invocation exists.** `call` and `pushdown` Bindings gain
   public invocation adapters and a context rich enough to express what the
   callback ctx expresses today: partition-scoped input, bounded emit of
   partials, and reduction. Delivery of this rung is owned by the
   "Non-request source invocation" follow-on
   (`docs/steering/agpl-feature-map.md` Phase 0 table; plan:
   `solve/epics/minimal-deployment-surface.md`) — this epic consumes that
   proof, it must not duplicate the plan. The capability comparison that
   defines "rich enough" is: batch iteration, `emit(key, value)`,
   reduce-by-key, nested bounded call, and guardrail enforcement, as
   exercised by `examples/distributed-sql/01..05`. The internal
   `WasmCallAdapter` (`src/query/wasm-call-adapter.js`), a purpose-built
   DB.call→`partition_callback` adapter with only test consumers today, is
   the closest existing sketch of this rung's internal shape — rung-1 work
   should either absorb or delete it, not leave it parallel.
2. **Lifecycle coverage re-anchors on genuine components.** The
   `wasm_component` routing/failover/lifecycle scenarios that currently
   execute the `js_wasm_component_v1` envelope rehearsal
   (`test/distributed/scenarios/wasm-service-failover.js`, example
   `06-wasm-remote-replica`, the four `test/runtime/runtime-callback-*`
   suites importing `CallbackExecutionHost`) are re-expressed against real
   component Cells deployed through `INSTALL SERVICE` / `CREATE BINDING`, so
   deleting the envelope removes no coverage. The genuine
   compile-JS-to-component path already exists
   (`examples/js-request-binding-deployment`).
3. **External demonstrations migrate.** `examples/distributed-sql` is
   replaced by (or rewritten as) a native `call`/`pushdown` example set with
   equivalent pedagogy (iterator → batching → reduce-by-key → nested call →
   guardrail failure), and the runner stack
   (`scripts/examples/{build-upload-run,example-execution,admin-ws-client,
   examples-runner-constants}.js`) plus the `examples-catalog` distributed
   scenario follow the new surface.
4. **The axis is deleted and the record updated.** Remove all of
   `src/query/callback/` (9 files: dispatcher, execution host, context,
   stage executor, validator, runtime-driver registry, module artifact with
   the `js_wasm_component_v1` envelope, and both constants modules); the
   `EXECUTION_MODE.PARTITION_CALLBACK` branches in `src/query/sql-request.js`,
   `sql-query-engine-request-dispatch.js`,
   `sql-query-engine-lifecycle-and-callback-dispatch.js` (+ shared/initializer
   references and the `src/query/index.js` export); the admin-websocket
   surface (`src/admin/admin-websocket-api-base.js`,
   `admin-service-message-adapter.js`, `admin-constants.js`);
   `WasmCallAdapter` if rung 1 did not absorb it; the `code` /
   `module_manifests` upload path if nothing else consumes it; and the
   callback column of the execution-axis table in
   `docs/current-capabilities-and-limitations.md` plus axis mentions in
   `architecture/{overview,process-request-routing,query-runtime,
   runtime-lifecycle}.md`, `docs/admin-api-reference.md`, and
   `docs/wasm-services-user-guide.md`. The portability claims gate pins axis
   files and wording (`scripts/checks/service-portability-claims-contract.js`
   reads `callback-runtime-driver-registry.js`;
   `docs/service-portability-capabilities.json` records the envelope), so
   both are updated in the same change or the gate breaks.

Rungs 2 and 3 can run in parallel after rung 1; rung 4 requires all three.

## Dependency census (sweep-based; re-verified 2026-08-01)

A fixed file list rots; the census is defined by the sweep, and rung-4 scope
sealing MUST re-run it:

```sh
grep -rln "partition_callback\|partitionCallback\|PARTITION_CALLBACK\|js_wasm_component_v1\|CallbackExecutionHost\|callback-execution-host" \
  src/ test/ scripts/ examples/ docs/ architecture/
```

Current shape (2026-08-01): 9 files under `src/query/callback/`; 5 more src
files reachable only via the uppercase `EXECUTION_MODE.PARTITION_CALLBACK`
constant (`wasm-call-adapter.js`, `sql-request.js`,
`sql-query-engine-request-dispatch.js`, `admin-websocket-api-base.js`,
`query/index.js`) plus the engine dispatch/shared/initializer chain, admin
adapter/constants, and debug trace scope; ~20 test files (including four
`runtime-callback-*` suites, `wasm-call-adapter{,.integration}`,
`once-binding-compilation`, throughput metrics, and the claims-contract
test); the examples runner stack; and the docs/architecture mentions listed
in rung 4. The MovieLens query-loop runtime modules share no code with the
callback host (verified: zero cross-references in either direction), and the
public request-component path does not touch the axis.

## Options under discussion

- **Deprecation posture before rung 1 lands.** Resolved 2026-08-01: freeze
  now, enforced by the landed accretion guard (see decision log).
- **Fate of the internal `native_js` callback path.** The execution-axis
  table lists `native_js` callbacks as "internal supported path." Either the
  kernel keeps a private callback-shaped hook after external retirement, or
  rung 4 deletes it too and internal consumers (if any exist — see open
  question) move to the query-loop runtime. Lean: delete; the sweep found no
  production owner invoking the axis (`WasmCallAdapter` is exported but
  instantiated only by tests).
- **Example migration shape.** Rewrite `examples/distributed-sql` in place
  vs. a fresh `examples/native-call` directory with `distributed-sql`
  deleted. Lean: fresh directory; the upload/runner mechanics differ.

## Open questions

- ~~Minimum emit/reduce context contract for rung 1~~ — resolved: WIT-first,
  language-neutral; shape owned by
  `solve/epics/native-call-context-wit-contract.md` (sketch, typed ladder).
- Guard token-set follow-up: extend the accretion guard's tokens with the
  hyphenated `partition-callback` form, `PartitionCallback` class prefix,
  `CallbackStageExecutor`, and `query/callback/` path references — the
  landed guard catches the dominant `EXECUTION_MODE.PARTITION_CALLBACK`
  vector but not class-name/filename imports (verifier-classified residual).

## Decision log

- 2026-08-01 — Epic created from a code-verified dependency census. Framed
  retirement as four ordered rungs; rung-1 delivery explicitly owned by the
  minimal-deployment-surface "Non-request source invocation" follow-on to
  avoid duplicating an executable plan across planning homes.
- 2026-08-01 — Adversarial verification corrected the draft census (6 of 9
  callback-dir files, five uppercase-constant sites incl. `WasmCallAdapter`,
  ~10 test files, runner constants, docs mentions were missing). Census
  restated as sweep-defined; `WasmCallAdapter` pulled into rungs 1 and 4.
- 2026-08-01 — Census questions sealed by quest
  `callback-axis-accretion-census-v2` (SOLVED, verified): WasmCallAdapter is
  export-only in production (test-only consumers); `code`/`module_manifests`
  have non-axis consumers (`wasm-service-lifecycle`,
  `service-definition-validator`, `function-registry`) so rung 4 excludes
  their removal; the trace-collector coupling is a source label, not
  execution. The deprecation freeze (option a) is now machine-enforced:
  `test/contract/callback-axis-accretion.test.js` pins the 20-file
  allowlist and fails on new production accretion.
