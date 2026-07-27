---
categories: [adversarial-js-intrinsics]
---

# Verification Template: Adversarial JS Input / Intrinsics Independence

For guard, contract, integrity, and diagnostics modules that validate
externally supplied objects and must stay correct against hostile or
polluted JavaScript environments. Run this as ONE pass before the first
verification round: on `comparative-efficiency-opportunity-calculator`
these items surfaced one per rejection round across 11 rounds (2026-07-27
event log) — the whole list is cheaper than any two of those rounds.

Each item requires an evidence path (file:line of the defense, or the test
that pins it).

1. **Numeric edge lattice.** For every numeric field: non-finite
   (`NaN`, `±Infinity`), negative zero, and beyond
   `Number.MAX_SAFE_INTEGER`. Show each is rejected or normalized — and
   that derived arithmetic (ratios, sums, deltas) cannot RE-INTRODUCE a
   non-finite or unsafe value after input validation passed.
2. **Own-property discipline.** Field reads must not accept inherited
   properties: a hostile `Object.create({expected: value})` payload must
   fail. Evidence: `Object.hasOwn`/`hasOwnProperty` at the read site or a
   null-prototype canonicalization step.
3. **Accessor traps.** Getters on input objects (`{get field() {...}}`)
   must not execute more than once per read path, must not observe
   intermediate state, and must not return different values on re-read
   (TOCTOU). Prefer copying into null-prototype plain records first.
4. **Prototype pollution.** The module's behavior must be unchanged when
   `Object.prototype`, `Array.prototype`, and `Map`/`Set` prototypes carry
   hostile enumerable properties. Fixtures must set AND restore pollution.
5. **Boxed and exotic primitives.** `new String(...)`, `new Number(...)`,
   `new Boolean(...)`, and Symbol keys must be rejected where a primitive
   is expected — `typeof` checks pass primitives only; `instanceof` and
   duck-typing let boxes through.
6. **Mutable intrinsic methods.** Any use of `String.prototype.trim`,
   `.replace`, `.toLowerCase`, `RegExp.prototype.test`, `Array.prototype`
   iteration helpers, `JSON.stringify`, or `Number.isFinite` on hostile
   input is a seam: a frozen-at-module-load reference (or `Reflect`/
   primitive-op equivalent) is required, or a test must pin behavior with
   the intrinsic replaced.
7. **Digest/serialization coercion.** Values that feed hashes, digests, or
   canonical serializations must be type-pinned BEFORE coercion —
   `String(x)` on an object invokes hostile `toString`/`Symbol.toPrimitive`.
8. **Array authenticity.** Where an array is expected: `Array.isArray`,
   length as an own data property within bounds, and no reliance on
   iterator protocol (a hostile `Symbol.iterator` can lie while indexed
   reads tell the truth, or vice versa).

Verifier instruction: report ALL items that fail in this pass, not the
first found; the rejection round must be category-complete.
