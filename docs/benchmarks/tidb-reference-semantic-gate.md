# Scenario A semantic evidence gate

Status: executable item-10 sub-contract; not full comparative evidence

The Scenario A semantic profile defines the database-independent correctness
contract. The semantic evidence gate tracks whether both compared systems have
actually proved every system-owned requirement in that profile.

The canonical owners are:

- `oltp-scenario-a-comparison-systems.js` for the two comparison identities;
- `oltp-scenario-a-semantic-profile.js` for the immutable semantic contract and
  semantic-profile digest;
- `oltp-scenario-a-semantic-gate.js` for proof completeness and gate evidence.

## Fail-closed result

A new gate starts `incomplete` with `semanticEquivalent: false`. Missing proof is
not treated as success.

For each system, the gate reports:

- passed proof ids;
- failed proof ids;
- missing proof ids.

Any failed required proof makes the gate `failed`. The gate becomes `passed` and
`semanticEquivalent: true` only when both systems have passed every required
system proof derived from the canonical profile.

The semantic gate intentionally does **not** emit `comparable: true`. A passed
semantic gate is only one input to the later paired execution owner. Full
comparability additionally requires the topology/resource contracts, exact sweep
identity, repeated counter-balanced execution, valid-run classification, and the
statistical evidence required by `tidb-reference-scenarios.md`.

## Proof records

A proof artifact may satisfy one or more canonical proof ids. Each proof record
contains:

- comparison-system identity;
- evidence id;
- pass/fail status;
- SHA-256 digest of the proof artifact;
- the exact canonical proof ids demonstrated by that artifact.

Unknown proof ids, unknown systems, malformed artifact digests, duplicate proof
ids, duplicate evidence ids, and multiple results claiming the same proof id for
the same system fail closed.

The gate normalizes proof ordering before hashing, so the gate-evidence digest is
stable under input-order changes.

## System-owned proof surface

The required system proof ids are derived from the semantic profile rather than
maintained as a second hand-written contract. They cover:

- each required isolation/visibility property;
- the externally visible retryable-conflict SQLSTATE mapping;
- every forbidden anomaly;
- failure atomicity; and
- every success invariant for new-order, payment, order-status, delivery, and
  stock-level.

Harness-owned policy such as retry ceilings, backoff, ambiguous-commit treatment,
and open-loop request-clock accounting remains proven by its existing dedicated
owners and is not duplicated as a database-specific proof obligation here.

## Next proof slices

Live semantic probes should be added as independent artifacts. A useful first
contention probe is two concurrent new-order logical requests for the same
district on distinct workers: TiDB may serialize through locking while Lagrange
may surface a write conflict and retry, but the shared externally observable
contract requires both logical requests to commit without a lost order-id update
or partial effects.

Additional probes must cover the remaining profile requirements. Until all are
present for both systems, semantic evidence remains incomplete and the benchmark
must remain non-comparative.
