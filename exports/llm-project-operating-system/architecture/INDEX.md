> Method kernel — portable. Keep the mechanism; this file is domain-neutral.

# Architecture Index

This is the canonical entrypoint for system architecture. Keep architecture
**decomposed**: a short INDEX that routes to the narrowest domain file, rather
than one monolith. Add domain files as the system grows; keep each one focused on
one owner boundary.

## Domain files

<!-- Replace these placeholders with this project's real domain files. -->
- `overview.md` — global architecture role, principles, single-path ownership contract.
- `<domain>.md` — one file per major subsystem / owner boundary.

## Supporting structure (the durable pattern worth keeping)

- **`contracts/`** — durable failure-class contracts. Each binds an invariant to
  one owner, the authoritative state, the runtime path, and archived evidence.
  Start from [`contract-record.template.md`](contract-record.template.md). A
  contract is where a hard-won invariant is recorded so it cannot silently
  regress — pair it with a guard (a test or a `tooling/validators/` checker).
- **`models/`** — executable or structured models that move *with* the
  owner-boundary code they describe (state charts, decision tables, and where it
  pays off, formal models such as TLA+/Alloy). A model earns its place when it
  catches a class of bug review keeps missing.

## Relationship to the rest of the operating system

- Architecture says *who owns what* and *what must always hold*.
- The **closure ledger** ([`../ledger/`](../ledger/)) tracks one violated
  invariant at a time when those guarantees break under churn.
- The **steering packs** ([`../steering/packs/`](../steering/packs/)) compile the
  always-on rules; cite a contract from a rule when the rule defends an invariant.
