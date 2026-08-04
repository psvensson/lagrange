---
epicContractVersion: 2
id: code-first-service-compiler
roadmapRow: null
graduatesTo: null
---

# Code-first service compiler

## Intent (why now)

Today a WASM service is wired by hand: the flagship example
(`examples/call-binding-account-summary`) hand-builds its manifest, Binding,
and access policy in `call-binding-example-contract.js` and repeats the raw
binding name `summarize-account-activity` across three sites that must stay
in sync; `componentize()` is duplicated inline at 13 call sites with the same
option bag; and `lagrange service init` scaffolds an OCI/Dockerfile project
that contradicts the WASM service product story. Peter's proposal
(2026-08-04, claims verified against the code) replaces this with a
compiler: one `lagrange.service.js` authored with `defineService()`,
`distributed()`, and `http.post()` from a guest-safe library is normalized
into an immutable IR and compiled into everything else — generated component
entry, deployment records, access policy, and eventually editor typings.
Invocation mechanics stay owned by the sealed minimal-deployment-surface
owners; this epic owns the authoring surface, the IR, the generator, and the
handler-aware ABI evolution the compiler needs.

## Sealed design decisions

1. **Identity from explicit object keys only.** Route and operation
   identities come from descriptor object keys — never `Function.name`, HTTP
   path, SQL text, or array position.
2. **Generated names are implementation output.** Binding names (e.g.
   `account-summary--call--summarize-account-activity`) are minted by the
   generator and recorded in `deployment-plan.json` as a logical-id map;
   developers never author or read them in source.
3. **Existing validators are the final authority.** The generator produces
   deployment records only by feeding the existing manifest validator,
   Binding contract (`deployment-binding-contract.js`), and access-policy
   normalizer; no contract rule is duplicated. Deployment flows only through
   `INSTALL SERVICE` / `CREATE BINDING` / `CONFIGURE SERVICE ACCESS`.
4. **No source rewriting.** The generated entrypoint statically imports the
   developer's `lagrange.service.js` and handler modules; `Function.toString`
   serialization is prohibited. Rung 1 exists to prove this module shape.
5. **Generic dispatch, not per-service WIT exports.** `service-cell-v2`
   keeps a fixed export surface — `handle-request(handler, request)`,
   `run(operation, ...)`, `reduce(operation, ...)` — with dispatch tables in
   the generated component. Binding schema v3 targets declare
   `interface` (`request_v2`/`call_v2`) + `handler_id` and drop
   developer-supplied `export_name`; the runtime maps interface → fixed
   export (`component-export-resolution.js` stays the single mapping owner).
6. **Pre-v2 bridge is honest.** Under the current `service-cell` world,
   multiple HTTP routes ride method+path dispatch inside `handle-request`
   (the serialized request already carries both); exactly ONE distributed
   operation per component, enforced fail-closed at IR validation. No
   hidden-operation-tag workaround, ever.
7. **Backward compatibility throughout.** Binding schema v2, `*_v1`
   interfaces, and the existing worlds keep validating, activating, and
   invoking unchanged at every rung.
8. **One reference, three artifacts.** A handler's `calls: [opRef]` is the
   single source generating handler wiring, the access-policy `calls`
   allowlist entry, and the Call Binding.

## Quest ladder

1. `service-compiler-componentize-module-shape-spike` — GATE. Prove the
   generated-entry import shape under real ComponentizeJS + jco.
2. `service-compiler-source-contract-ir` — authoring library + one
   normalization owner emitting the immutable IR; mechanical after rung 1.
3. `service-compiler-deployment-record-generation` — deterministic
   `.lagrange/` records through the existing validators; mechanical.
4. `service-compiler-account-summary-parity` — GATE. Flagship example built
   solely from `lagrange.service.js` under the current ABI; hand-built
   deployment builder deleted. Rungs 5–7 do not execute until this lands.
5. `service-cell-v2-generic-dispatch-world` — additive v2 WIT world +
   generated dispatch tables (component side only).
6. `binding-schema-v3-handler-interfaces` — Binding v3 + manifest `*_v2`
   interfaces through the existing owners; placement/readiness only.
7. `handler-aware-runtime-invocation` — request path passes `handler_id`,
   `CallCellInvoker` passes resolved operation id; single-operation
   restriction removed for v2 components.
8. `service-cli-generate-build-deploy` — CLI pipeline over the compiler and
   the existing pgwire lifecycle grammar (RM-0.5-dw-cli-wasm-deploy).
9. `service-init-wasm-first-scaffold` — WASM-first scaffold; `--oci` compat;
   `dev-install` demoted (RM-0.5-il-service-init-scaffold).
10. `service-compiler-editor-typings` — generated `.d.ts`/JSDoc; mechanical.

Rungs 1 and 4 are the real gates; 2–3 are mechanical once the module shape
is proven, and 5–7 execute only once rung 4 proves the compiler subsumes
hand wiring at parity. 8 can run parallel to 5–7 (it targets the current
ABI); 9–10 are product surface over a proven core.

## Options under discussion

- **Budget declaration.** `EMIT_BUDGET`/`NESTED_CALL_BUDGET` are invoker
  defaults today, not Binding fields. Compiler-declared per-operation budgets
  (new optional Binding budget fields) vs keeping invoker defaults until a
  user needs to raise them. Leaning: defer; record the field shape at rung 6.
- **`.lagrange/` commit policy.** Fully gitignored (regenerate always) vs
  committing `deployment/` records for reviewability. Leaning: gitignore all
  of it; determinism (rung 3) makes review possible via regeneration.
- **`service dev` mechanics.** Watch + rebuild + reinstall vs the roadmap's
  hot-reload row; decide when rung 8 lands, as a separate later rung.

## Open questions

- Does the sealed IR + `.lagrange/` layout graduate to an `architecture/`
  contract doc (setting `graduatesTo`), as native-call-context did?
- How the v2 typed-payload future (native-call-context typed-API ladder)
  intersects generated `runtime-types.d.ts` — JSON strings remain the ABI
  here; typing is editor-level only until that ladder moves.

## Decision log

- 2026-08-04 — Epic authored from Peter's service-compiler proposal after an
  independent verification pass confirmed its code claims (world exports at
  `wit/world.wit:89-97`, hardcoded run/reduce names in `call-cell-invoker.js`,
  Binding v2 / manifest v3 / policy v2 shapes, method+path availability in
  the serialized request, the 13 inline componentize sites, and the OCI-only
  scaffold). Decisions 1–8 sealed by the proposal. All ten rungs drafted
  up-front at Peter's direction; the gates control execution order, not
  authoring order. Rung 1 is the admission gate: if ComponentizeJS cannot
  statically link the generated entry against an unmodified developer
  module, the architecture returns to this epic before any authoring-library
  work. Rungs 5–7 stay unexecuted until rung 4 parity deletes the hand-built
  example builder. In-flight uncommitted work in `src/partition`,
  `src/rebalancer`, and `src/logging` is unrelated and out of bounds for
  every rung.
