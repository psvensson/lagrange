---
audience: development
documentClass: current
---

# Original preparation: acquire into custody before formatting

Date: 2026-10-21. Product input393f411ca; no runtime/test/seal/receipt change.
This adds the precise constructor-failure boundary to
[the frozen correspondence](pre-source-owner-correspondence-2026-10-21.md).
The [independent acquisition input](preparation-acquisition-custody-input-2026-10-21.md)
is preserved byte-for-byte at SHA256
`995c603e3c211954ca196c1c8576a23df4f6ef3aff3ecedb2c29c9d36d409335`.
Its locally inspected better-sqlite3 source is not a lab-binary attestation.

The chosen owner operation first creates a strongly retained resource slot in
the existing lifecycle/preparation owner, before raw open. The slot records
exact declared file/member identity and acquisition state, and is neither
allocation permission nor another operation ledger. Its state is set to opening
before invoking the dependency. Immediately after `new Database` returns, assign
the exact returned DB to an ordinary private data field in that slot, with no
callback, logger, getter/proxy, pragma, formatter or owner construction between
return and assignment. Then run owner-only formatting/preparation. A final
prepared-owner result does not start custody; the resource slot already owns it.

The peer registry, lifecycle and durable-store constructors borrow DBs and can
throw after partial format writes. They do not own close. A metadata-only
preparation seam reuses their exact format/loss semantics without invoking the
operation port's native dispatcher. Its preparation operations are held inside
the reviewed synchronous non-reentrant section; no external mint callback,
SQLite verbose hook or arbitrary observer runs in that section. Pre-mint
immutable identities before it and validate them as owned plain data. Set the
attempt's in-progress/closed state before any operation that might reenter;
retained-resource assignment itself must not call a consumer.

On any later formatter/commit/readback failure, the existing preparation owner
closes every acquired exact slot. A successful close deletes only that exact
slot/DB association. A throw preserves the DB and slot strongly, retains the
original failure plus cleanup failure, invalidates native admission and blocks
directory release. No clearing in finally and no by-path current-owner lookup.
Existing same-owner cleanup retry may close that exact object; the public startup
ledger itself has no second unwind and returns no recovery handle. A failed
public cleanup therefore retains resources until a real retained owner path or
process termination, without claiming automatic retry progress.

If raw `new Database` itself throws, no application DB handle was returned.
The inspected better-sqlite311.10.0 native open/deserialization failure paths
close their internal handle before returning; the application slot can retain
the acquisition failure but cannot retry an inaccessible native handle. Keep
that dependency ceiling separate from successful raw open followed by formatter
failure. This design does not claim recoverability from fatal native allocation
or an unreturned dependency resource, and does not rewrite the dependency.

Required distinct witnesses are: actual raw-open refusal before formatting;
actual successful raw open then formatter throw; that same formatter failure
plus actual exact exposed DB close throw; same-owner retry after close restoration;
and normal successful preparation. Positively assert slot retention before the
formatter fault, exact object identity, zero native Raft entries/ISSUE success on
failure, preserved primary and cleanup errors, retained directory custody, and
discharge only after confirmed exact close. Injecting an exception before open
does not prove the formatter window; a swallowed close does not prove custody.
Preserve all PREPARING/partial-format durable evidence as nonauthorizing HOLD.

These choices complete the proposed acquisition seam for independent review.
They do not themselves prove cohort atomicity, cold incomplete-issue progress,
native I/O behavior, or implementation correctness.
