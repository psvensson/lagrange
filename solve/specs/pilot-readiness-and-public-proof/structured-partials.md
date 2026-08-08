# Detailed design: Bounded structured partials

Quest: `call-bounded-structured-partials` (Q4). Requirements contract:
[`requirements.md`](requirements.md) "Structured partials". Epic:
[`solve/epics/pilot-readiness-and-public-proof.md`](../../epics/pilot-readiness-and-public-proof.md);
binding decisions cited as D1–D12.

## Owner boundaries touched

- `src/service/call-cell-routing-contract.js` — first fail-closed validation
  gate today (`normalizeEmittedPartialEntries`, finite-number rule); becomes
  the first gate for the structured grammar.
- `src/runtime/call-cell-reduce-coordinator.js` — second fail-closed gate and
  merge owner; keeps the cross-shard disjoint-keys `SHARD_OVERLAP` refusal.
- `src/runtime/call-cell-context-host.js` and
  `src/runtime/call-cell-value-mapping.js` — guest emit path and value
  marshalling; structured values cross the guest/host boundary here.
- `src/service/service-source-contract.js` and
  `src/service/service-typings-generator.js` — code-first declaration and the
  generated `runtime-types.d.ts` editor types for the partial shape (D2).
- One new shared codec module (placement **open**, see below) used by both
  gates — the "one canonical encoding owner"; the routing contract and reduce
  coordinator remain the validation/merge owners and no second partial codec
  may exist (D11).

## Contract shape

### Type grammar (closed, versioned)

Structured partial value grammar, version 1 (D5):

- `null`, `boolean`
- safe integer (|n| ≤ 2^53−1, no fraction/exponent)
- finite float (no NaN, no ±Infinity, no −0 distinct from 0 after encoding)
- string (bounded UTF-8 bytes)
- bounded list of grammar values
- bounded record: string field names, **lexical field order**, no duplicate
  fields, no `__proto__`/`constructor`/`prototype` field names

Nothing else: no dates, no binary blobs, no undefined, no arbitrary object
prototypes, no executable data. Extending the grammar is a new version, not
a relaxation of version 1.

### Canonical encoding (sealed: canonical JSON)

The single encoding owner is **canonical JSON** (JCS-style): lexically
sorted record fields, shortest-round-trip float serialization, integers
without fraction/exponent, escaped strings in one normal form, no
insignificant whitespace. Rationale over canonical binary: the existing
partial path is JSON-adjacent, receipts stay human-diffable (D7), and byte
stability is achievable with a small closed grammar. The envelope is
`{"v":1,"value":<grammar value>}`.

Byte stability rules: encode(decode(bytes)) must equal bytes for every
accepted input (non-canonical input is refused, not normalized); replay and
journaling store the canonical bytes; reducer input is decoded to frozen
structures in field order, so reduction is deterministic.

### Budgets (explicit, typed)

Per-entry maximum encoded bytes; per-shard maximum entry count and total
partial bytes; maximum nesting depth; maximum list length; maximum record
field count; maximum string bytes. All are named constants at the
composition root, refused with typed errors — never truncated (D5). Numeric
defaults are **open** (below).

### Cross-shard key semantics

First release keeps the existing semantic: group keys must be disjoint
across shards; duplicate keys are the `SHARD_OVERLAP` fail-closed refusal.
No silent merge, no double-counting (D5). An algebraic merge contract
(commutative/associative declared merges) is explicitly out of this Quest
and would be its own spec.

### Backward compatibility

Previously valid numeric-key partials remain a valid subset: a bare finite
number continues to validate and reduce unchanged through both gates. The
structured envelope is additive. The account-summary example
(`examples/call-binding-account-summary/lagrange.service.js`) moves to one
structured record per shard as the product evidence (D2, D6); generated
editor types for the partial shape are exposed from the compiler.

## Failure semantics (D12)

Both gates enforce the identical contract from the one shared codec module.
Fail closed, typed, at first violation:

- Malformed bytes, unknown envelope version, grammar violation.
- Oversized: any budget breach (bytes, count, depth, list, fields, string).
- Non-canonical: decode-then-re-encode mismatch, unsorted or duplicate
  record fields, non-shortest float form.
- Prototype pollution: `__proto__`/`constructor`/`prototype` keys refused at
  parse; decoded structures are null-prototype and frozen before reaching
  the reducer (`adversarial-js-intrinsics` template applies).
- NaN/Infinity/−0, unsafe integers, undefined.
- Duplicate cross-shard keys: `SHARD_OVERLAP`, unchanged.

Red-on-revert (sealed by the Quest): silently merging duplicate cross-shard
keys (double-counting) and accepting any of the malformed classes above must
fail the live scenario deterministically.

## Non-goals and edition boundaries

- No second partial codec, no per-channel encoding variant (D11).
- No algebraic merge, no reducer-visible mutation, no schema evolution
  beyond the version tag in this Quest.
- No raw-Binding-JSON closure: raw Binding tests stay diagnostic (D2, D6).
- Community/AGPL scope; no edition-matrix change implied (D8/D9).

## Open decisions left to the Quest

- Codec module placement (e.g. a `src/service/` sibling reachable from both
  `src/service/` and `src/runtime/` without creating a cycle) — must remain
  the single owner used by both gates.
- Numeric budget defaults and their composition-root wiring.
- Whether legacy bare-number entries are internally tagged as v0 or decoded
  as grammar floats (observable behavior must be unchanged either way).
- Exact generated TypeScript surface for structured partials in
  `runtime-types.d.ts` (shape naming, readonly depth).
