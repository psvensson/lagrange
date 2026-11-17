---
audience: development
documentClass: planning
---

# Q0 first observation — independent implementation portability

Status: **IN PROGRESS, document/contract census and bounded read-only source
spot checks; not a completed audit, public capability verdict, Quest receipt
or runtime certification**.

Baseline: `main` `f3a1be1eb79e5e6347ddc969968036eda49dcaf2`
(2026-11-17 03:31:53 UTC). Scope of this first pass: versioned
architecture/public documents, WIT, generated capability declaration, model
inventory, existing plan/Quest owners, and selected source-owned implementations
for P01-P05. No production changes, lab runs, source-candidate executable
proofs or independent reviews were performed.

The governing [plan](independent-portability-plan-2026-11-17.md) belongs to
the existing [core convergence epic](../core-architecture-convergence.md).
The separate `core-convergence-rs-raft-readiness-baseline` Quest retains its
own original cutover `doneWhen`; this audit does not rename or re-seal it.

## Existing material worth preserving

| Evidence surface | Observation | Portability treatment |
| --- | --- | --- |
| `architecture/` and `architecture/contracts/` | 52 architecture files and 13 contract files at the frozen tree | Core ownership semantics belong to their existing contract owners; implementation-specific class names are bindings, not API promises |
| `architecture/contracts/invariants.json` | 32 recorded invariants, 21 with explicit model references | Useful bounded safety/liveness obligations, not a complete protocol model |
| `models/` and `architecture/models/` | 111 files under `models/`; high-resolution models cover selected past design failures | Preserve counterexamples and fairness assumptions; do not relabel model proof as physical recovery |
| `docs/postgres-compatibility-matrix.json` | 71 cells: 35 supported, 36 unsupported, 9 negative controls | Reuse the admitted/refused coverage; no blanket PostgreSQL/ORM compatibility claim |
| `wit/world.wit` | Defines `service-cell-v2` ABI and guest-visible types | Exact public interface is reusable; host-owned errors need a portable vocabulary |
| `solve/specs/spec-led-runtime-modularization/module-contract-template.md` | Already covers owner, scalar variants, absence, evidence, total decisions, effects, deletion and proof | Extend owner contracts rather than inventing another generic template |
| `docs/development/documentation-lifecycle.md` | Separates current source claims, planning, generated views, steering and immutable proof | Keep target contract and actual supported capability distinct; no second state ledger |

Counts describe tracked files in the named directories, not a completeness
score. Source consistency and physical evidence remain separately unverified.

## First discrepancy and gap register

These are **questions**, not findings that the implementation is defective.
The selected source spot checks below are not complete production-binding or
public-ingress proof. The first five directly affect the public service slice.

| ID | Observed difference or gap | Initial classification | Existing owner / next evidence |
| --- | --- | --- | --- |
| P01 | `docs/execution-semantics.md` describes a pre-v2 single distributed operation, while `docs/current-capabilities.json` names the v2 zero/one/many target. | Current-vs-pre-v2 scope **unclear** | Service compiler/runtime owners; inspect production binding, exact compiled component and public witness |
| P02 | Execution/operations prose says one nested distributed call per request, while the capability source states bounded sequential calls. | Apparent documentation drift | Invocation owner; compare admission and nested-call production tests on this head |
| P03 | Execution/architecture prose describes finite numeric partials; the capability source declares bounded canonical finite JSON v1. | Apparent documentation drift | Partial encoding/reduction owner; check current emit/reduce validators, canonical vectors and public proof |
| P04 | Execution/operations prose says no caller cancellation; the capability source says invocation-owned cancellation with waiter detachment. | Possible semantic-scope distinction | Invocation/cancellation owner; specify whether caller detach cancels work, only waiting, or durable settlement |
| P05 | `docs/support-envelope.json` names `node-transport-mtls-v1` and verified drill receipts while `docs/current-capabilities.json` declares plain trusted-network WebSocket and no mTLS node identity. | **Version/target scope unresolved**, not yet a same-version contradiction | Pilot support-envelope and transport owners; bind exact version, source, real proof and intended scope before any security claim |
| P06 | `wit/world.wit` explicitly makes `binding-call-error.code` a closed host-defined set located in `src/runtime/` rather than a complete language-neutral enum. | Missing public error vocabulary in standalone ABI | Service ABI owner; produce versioned error-code registry and positive/negative vectors at the interface owner |
| P07 | `architecture/contracts/core-system-logic.md` explicitly describes a low-resolution model with subsystem-specific protocol residuals. | Intentional proof-scope limitation | Contract/model owners; choose one complete vertical interaction instead of counting model files as protocol coverage |
| P08 | `architecture/rebalance.md` describes snapshot/log schemas predominantly by implementation-file references; this document alone does not define interoperable byte layouts. | Portability target decision required | Raft/SQLite custody owners; specify logical durability now, physical-format compatibility only if requested |
| P09 | Existing core-convergence planning text describes earlier Liferaft defaults but labels them as historical and instructs a fresh Q0 census. | Historical evidence; **not a current defect claim** | Original cutover Q0 and Raft integration owner; re-check present source and terminal proof separately |

## Bounded source observations (not public-path certification)

- **P01:** `src/service/service-entry-generator.js` explicitly implements
  `service-cell-v2` operation-ID dispatch in addition to the pre-v2 entry;
  the maintained execution document's *current pre-v2* wording does not
  describe that newer contract. Confirm default compiler selection and an
  original public invocation witness before revising current guarantees.
- **P02:** `src/service/request-cell-call-bridge.js` defines sequential
  multi-call fan-out with one outstanding child, depth one and a default
  request budget sourced from `DEFAULT_REQUEST_HOST_CALL_BUDGET` (16) in
  `src/runtime/cell-host-call-protocol.js`. That same protocol has a raw
  client default of one, so the standalone specification must distinguish
  raw-host default, request-invocation budget, and depth rather than flatten
  them into an unqualified count.
- **P03:** `src/service/call-canonical-partial-codec.js` owns
  `lagrange.partial.v1`, finite-JSON canonicalization and explicit depth,
  byte, field and array bounds. Numeric-only prose is not sufficient for
  the current codec, but source presence does not by itself prove the public
  producer/consumer composition.
- **P04:** `src/runtime/request-cell-invocation-owner.js` and
  `src/service/request-cell-http-adapter.js` manage waiter detach, last-waiter
  invocation abort, and explicit cancellation, including an uncertain-outcome
  marker after dispatch. The public contract must distinguish cancellation
  of a wait, worker work and already durable effects; a blanket statement
  that cancellation is unsupported is not a safe replacement specification.
- **P05:** `src/transport/cluster-trust-provider.js` and
  `src/transport/message-router-server-lifecycle.js` contain conditional
  mTLS/TLS support, but this scoped search found no production construction
  of `ClusterTrustProvider` under `src/`. That does **not** establish
  integrated authenticated transport; the current capability declaration
  remains the narrower checked-in claim pending startup composition and
  source-bound lab evidence. Version-qualified envelope proof is still open.

These observations narrow the documentation gaps, but no one has yet
demonstrated them through the required exact-source supported public journey.

## Authority and risk boundaries

1. **No independent contract owner is invented.** Formation, CDC,
   transactions, SQL, runtime and Raft each retain their existing semantic
   owner. The portability effort composes their contracts; it cannot rewrite
   their decisions in a planning document.
2. **Do not treat generated capability declarations as executable proof.**
   The documentation lifecycle requires public-ingress and integrated
   exact-source witnesses, beyond a source-consistency checker.
3. **Do not infer deployment or mixed-version guarantees from a support
   envelope file alone.** Version-qualified positive claims require their
   original proof and currently supported backend.
4. **Do not freeze a future port around private implementation detail.**
   Public observable behavior and intended shared persistent/wire formats are
   separate from internal JavaScript/SQLite layout.
5. **No broad runtime work starts through this file.** Cutover/convergence
   predecessor gates and the existing 0.4.1/0.5 ordering still govern.

## Q0 continuation and measurable closure proposal

Next inspection (read-only):

1. Resolve P01-P04 through the actual default compiler, runtime composition,
   public invocation and original test evidence at the pinned source; the
   static source observations above do not settle public support.
2. Resolve P05 against the actual startup composition, version pair, transport owner,
   original source-bound security drill receipts and currently wired ingress.
3. For the first storage vertical slice, inventory durable command identities,
   persisted/applied state, acknowledgments, snapshot replay and failure
   assumptions without creating a new Raft or SQLite abstraction.
4. Map each remaining high-priority unknown to the pre-existing owner and one
   falsifiable current-source witness; decide the first narrow successor Quest
   only after this census. Do not pre-create Q1-Q6 Quest records.

Proposed first formal Q0 acceptance (not yet sealed): all first-slice authority
and discrepancy rows have exact source-bound evidence and a typed verdict
(`resolved`, `version-scoped`, `not-yet-defined`, or `blocked`) with a named
owner; the selected next Quest has a genuinely measuring red falsifier.
Until that evidence and probe exist, Q0 remains **IN PROGRESS** and cannot be
reported as complete or certified.

Draft Quest proposal (not yet a Solver record):

- Proposed id: `independent-portability-q0-specification-census`.
- Owning epic: `core-architecture-convergence` (no expansion of its terminal
  certification claim).
- Statement: classify the first behaviorally portable write/recovery slice's
  authoritative contracts and public/current discrepancies at one exact head,
  using read-only source and original evidence.
- Present red counterexample: P01-P05 have source/document observations but
  lack exact public-composition evidence and version-scoped owner verdicts.
- `doneWhen` design: a purely read-only, binary contract-inventory checker
  requiring each selected gap to retain an exact candidate, owner, evidence
  link, and typed classification; prove the checker rejects a deliberately
  unresolved, stale-source or contradictory row before sealing. The existing
  Solver probe owner must approve the actual supported probe shape.
- Permitted change: planning/contract inventory and bounded read-only checks;
  no `src/`, source-default, runtime test, sealed acceptance or release change.
