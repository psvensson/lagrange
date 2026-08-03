---
epicContractVersion: 2
id: services-doc-tightening
roadmapRow: null
graduatesTo: null
---

# Tighten the documentation around one service story

## Intent (why now)

The public docs currently tell several evolutionary stories at once: the
README opens with "distributed database and execution platform" and a
three-way adoption table that presents OCI, ported WASM, and native operations
as peer paths. The product decision (Peter's brief, 2026-08-03) is one story:
**Lagrange is a distributed runtime for data-intensive services** — author one
service (endpoints, partition functions, and reducers together), deploy it as
WASM, and Lagrange runs each part of a request on the partitions holding the
relevant data. OCI demotes to a compatibility path in level-4 docs. The full
normative brief (terminology, tone, layering, deliverables, consistency-sweep
terms) is preserved verbatim in
[`docs/development/services-doc-tightening-brief.md`](../../docs/development/services-doc-tightening-brief.md);
this epic frames the Quest decomposition and the honesty questions the rewrite
exposes. It does not restate the brief.

## Surfaces in scope (inventory seed)

- Front door: `README.md`, `docs/start-here.md`, `docs/dockerhub-overview.md`,
  `docs/native-programming-model.md`,
  `docs/tutorials/{first-hour,rewrite-a-hot-path}.md`.
- Cost story: `docs/performance-and-cost-estimation.md`,
  `docs/infrastructure-cost-estimation.md` — keep the mechanical calculations
  (they already match the brief's cost-language rules); realign the framing.
- Architecture: `architecture.md`, `architecture/INDEX.md`, plus the
  conceptual-hierarchy preamble the brief requires (service → endpoint →
  execution plan → partition functions → partitions/replicas, with subsystem
  owners). `architecture/oci-runtime-host-contract.md` stays, re-labeled
  compatibility/internal.
- Examples: `examples/README.md` and the six example dirs; the first example a
  reader meets must produce a small result from data spread across partitions,
  not demonstrate infrastructure.
- New: an execution-semantics contract doc (retries, idempotency, partial
  failure, timeouts, cancellation, ordering, limits, movement) — decided
  semantics stated tersely, undecided ones marked unresolved, none invented.
- Final consistency sweep over the brief's term list (OCI, container, runtime,
  service, WASM, ctx.call, stored procedure, scheduler, near the data,
  compute to the data, deployment mode).

## Options under discussion

- **Quest decomposition.** (a) One Quest for the whole rewrite — a single
  consistent voice, but a diff too large to review or subagent-verify.
  (b) Staged Quests: Q1 inventory + README + start-here (seals the story and
  vocabulary), Q2 flagship end-to-end example + examples audit, Q3
  architecture intros + execution-semantics doc, Q4 OCI/multi-product
  relocation + final consistency sweep. Recommendation: (b); later Quests
  inherit Q1's sealed vocabulary.
- **First example's code truth.** RE-BASELINED 2026-08-03: the call-cell
  scope has landed end-to-end (foundation `5c374e6c8`, orchestration
  `e723e30f5`, production wiring `c9fe4c4ad`, data-local activation
  `9c60dc142`, hardening `bf9bf34c1`, reduce-lease expiry `cd1033d8e` — see
  `solve/changes/HANDOFF-call-cell-invocation.md`). An authenticated pgwire
  CALL binding now drives per-partition shard dispatch on the partition-host
  nodes, missing-cell activation via `call_activation_leases` + planner pins,
  and reduce coordination over dedicated system tables. The flagship example
  can therefore show the real invocation path; only surfaces that remain
  intended-API (e.g. any `ctx.call({query, run})` sugar not yet exposed to
  guests) are labeled pseudocode. Never present intended API as shipped.
- **Where demoted OCI content lives.** A new level-4 home (e.g.
  `docs/compatibility/`) vs in-place re-labeling within `architecture/`.
  Trade-off: a new directory needs start-here/INDEX plumbing and link-audit
  updates; in-place re-labeling risks readers still meeting OCI early.

## Open questions

The original execution-shape questions were all resolved during the
2026-08-03 implementation (layering mapped onto the existing audience zones
with no new directories; `docs/execution-semantics.md` written from verified
code; the adoption table replaced by one-product mechanisms with the ranges
kept; flagship = runnable `examples/call-binding-account-summary`; no
steering-pack sources in scope; edition/doctrine docs re-framed in place).
What remains are product/API questions the rewrite exposed:

- Structured (non-numeric) partials and pushdown ingress: roadmap 2.0;
  structured partials ordered first (most constraining limit), with a
  host-provided shard-identity primitive riding whatever touches the
  `emit` contract.
- No public single-node split path (demo needs internal scaffolding:
  replica-count minimum 3, split quorum ≥ 2) — a demo-profile question.
- CALL result projection (reduced JSON as a string in `rows[0].result`):
  deferred, to be decided together with the client SDK.

## Decision log

- 2026-08-03 — Epic authored from Peter's product-story brief. Direction is
  decided by the brief (service-first, WASM packaging, OCI demoted to a
  compatibility path, one execution-path diagram); the brief is saved verbatim
  at `docs/development/services-doc-tightening-brief.md` as the acceptance
  authority for graduated Quests. The open items above are execution-shape and
  honesty-labeling questions, not direction questions.
- 2026-08-03 — Standing gates for every graduated Quest: keep accurate factual
  detail, never rewrite undecided features as implemented, subagent-verify the
  diffs against the brief before handoff, and run the brief's final
  consistency grep sweep as part of closure.
- 2026-08-03 (later) — Capability re-baseline after the call-cell landings
  (`5c374e6c8` … `cd1033d8e`): the "call adapter not implemented" premise is
  retired; `docs/current-capabilities-and-limitations.md` is itself stale on
  this point and joins the rewrite scope. Peter directed immediate direct
  implementation with parallel subagents plus an independent verification
  agent, superseding the staged-Quest decomposition; the four-stage split
  survives as the file-ownership partition for the parallel agents.
- 2026-08-03 (implemented) — Executed as six parallel subagents over a
  recon fact sheet, ~40 files changed. Highlights: README + start-here +
  guides + tutorials + architecture intros rewritten to the one story; new
  `docs/execution-semantics.md` (code-verified); capabilities regenerated
  through `docs/current-capabilities.json` + a generator fix (rendered the
  hardcoded "request-only" sentence from `publicInvocation`); new runnable
  flagship `examples/call-binding-account-summary` proven green (real
  `CALL BINDING $1`, two partitions, reduce, auth-refusal case); OCI and the
  legacy callback surface demoted to compatibility/internals.
- 2026-08-03 (verified) — Independent verifier: zero factual falsehoods in
  the changed surface, all doc checkers green, 257 links unbroken. Its punch
  list (stale `ctx.call` ownership rule in `architecture/overview.md`,
  database-first sentence in `system-model.md`, evolutionary 2.0 framing in
  both roadmaps, adoption-ladder leftovers, `transport_failed` unraised,
  `manifest_digest` provenance) applied same-day; checkers re-run green.
- 2026-08-03 (Peter) — Triage decisions approved: the binding-declared
  statement is the durable selector model (bounded parameterization may be
  added; `ctx.call()` is future client-SDK sugar over `CALL BINDING`, not a
  different execution model); caller cancellation parked with the written
  "deadline is the only bound" position; result projection deferred to the
  SDK decision. Quests queued: shutdown-timer leak, WIT-world publishing +
  `reduce` manifest declarability, caller idempotency key on CALL.
  EXCEPTION: parallel shard fan-out is pulled off the roadmap and
  implemented now, together with cluster-owned artifact storage, per
  `docs/development/cluster-owned-artifacts-parallel-dispatch-brief.md`.
