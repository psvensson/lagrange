# Engineering Doctrine

## Document Role

This document states the short-form implementation doctrine for all coding
work in the project.

The doctrine is intentionally simple:

1. One semantic owner per concern.
2. One ingress per semantic decision plane.
3. One authoritative contract shape per durable concern.
4. Evidence is normalized before policy decisions.
5. Slower under pressure, never less correct.
6. Shrink porous boundaries when bugs cluster.
7. Resource lifetime is owned and bounded.
8. Sharpen work before changing code.

## One Semantic Owner Per Concern

Every durable concern must have one semantic owner. Callers submit intent to
that owner; they do not reproduce the owner's logic locally and they do not
maintain shadow state for the same concern.

When two owners appear to make the same decision, stop and decide which owner
is authoritative before adding code.

## One Ingress, Not Many Helpers

There may be multiple semantic owners, but there should not be many equivalent
ingress paths for the same decision.

Prefer one structural path per plane so pressure, retry semantics, validation,
diagnostics, and ownership rules are universal. Do not create a new helper just
because the existing owner path is awkward; improve the owner path.

## One Contract Shape Per Concern

When the same concern appears as several near-synonymous caches, helpers,
snapshots, outputs, or API shapes, the design has started to drift.

Prefer:

1. One operationally authoritative contract.
2. Additional views only when their roles are explicit and non-overlapping.
3. One declared consumer set per shared surface.
4. One declared list of forbidden reinterpretations.

## Normalize Evidence Before Decisions

When one decision depends on several signals, separate observation from policy.

Required shape:

1. Collect evidence.
2. Normalize it into one immutable snapshot per entity.
3. Let one canonical adjudicator emit state, reasons, and retryability.
4. Treat weaker or cross-plane signals as degraded evidence unless the spec
   says they are equivalent.

If fixes keep arriving as new boolean exemptions, the decision boundary is not
modeled yet. Replace the branch pile with an explicit state model or decision
table.

## Slower Under Pressure, Never Less Correct

Under pressure, the system may slow down, defer work, reject edge work with
structured retry semantics, or coalesce work. It must not become less correct.

Pressure must not become hidden drops, unbounded memory growth, silent partial
success, or timeout-only ambiguity. Pressure policy belongs at canonical
ingress boundaries, not scattered call sites.

## Shrink Boundaries When Bugs Cluster

When multiple bugs appear at the same boundary, assume the boundary is wrong
until proven otherwise.

After repeated bugs at one boundary, the next fix should reduce the number of
paths, states, or owners that can cross it. Do not keep patching symptoms while
leaving the boundary porous.

## Resource Lifetime Must Be Owned

Every queue, buffer, subscriber set, cache, retry registry, deferred-work map,
single-flight registry, or temporary file set must have:

1. One owner.
2. One capacity or bounding rule.
3. One teardown or expiry rule.
4. One diagnostic or inspection surface.

If a resource can grow without a named owner and plateau condition, the design
is not finished.

## Sharpen Work Before Changing Code

Implementation work should be as bounded as runtime design.

1. A human idea becomes either a sharpened roadmap item or a bounded work
   package.
2. Broad ideas do not go straight into code.
3. Active implementation targets one executable concern per package.
4. Package status lives in filenames under `work/`.
5. A package is complete only when the hot path, tail consumers, diagnostics or
   reporting, deletion work, and required proof are all closed or explicitly
   split.

If the proposed change cannot be described as one bounded concern with clear
ownership, invariants, and completion criteria, it is not ready for active
implementation yet.
