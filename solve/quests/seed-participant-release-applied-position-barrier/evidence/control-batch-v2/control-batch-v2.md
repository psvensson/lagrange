# Applied-position controls V2

Status: **TEST-ONLY CONTENT FROZEN; behavioral and composition receipts HOLD.**

This batch is based on HEAD `ad23d75d58e320ca2fe58f8baa9b0a941a8158e2` and addresses the bounded C1-C4 and C6 findings in independent review `a8a595e16eb34dd5b32e8e7c24c1460a8cfa777eb836914143ae1b7db1b4e082`. It changes only the two selected existing tests and their existing shared participant fixture. No production, native witness, query case, Quest, registry, generated metadata, commit, push, behavioral test, or lab run is included.

## Closed content findings

- **C1 membership coherence:** `participant-transaction-fixture.js:434-481` now derives one canonical ConfState/key and exposes the same membership generation through status and committed-membership reads. Ordinary application changes only applied/commit position. `participant-release-protocol.test.js:1092-1131` pairs a real ordinary application with stable configuration identity. `replica-handler-release-recovery.test.js:409-462` changes an actual member set through that shared owner, not a suffixed key or patched reply.
- **C2 single fixture composition:** `participant-transaction-fixture.js:519-590` is the sole shared owner for listener observation, held committed-membership reads, canonical observation request construction, and registered-route dispatch. Both selected tests consume it.
- **C3 cleanup custody:** `participant-release-protocol.test.js:81-199,242-327` acquires resources under custody, aggregates each owner/settlement failure, does not force-commit the pending write, and retains directories when retirement fails. Shared `shutdownAll` at fixture lines 663-677 reports every service failure. `replica-handler-release-recovery.test.js:58-68,147-201` independently preserves assertion, gate restoration, handler shutdown, service shutdown, and artifact failures.
- **C4 lifetime and clock engagement:** `participant-release-protocol.test.js:760-946` uses a counted scripted sender clock at the real client seam, covers a safe maximum-derived deadline and unsafe derived arithmetic, and keeps the receiver clock real. Lines 948-1041 hold a fresh successor while the expired attempt's held callback finishes, then use a registered conflicting request to prove the successor listener and timer remain owned before allowing its exact-generation success.
- **C6 typed identities and timing:** every added refusal binds its request partition/action/release identity; every added OBSERVED result binds the requested generation without inventing refusal-only fields. Handler/service shutdown and replacement controls at `replica-handler-release-recovery.test.js:314-509` await actual returned operations and gate continuations; the earlier fixed four-microtask settlement assumption is absent from these controls.

## Intentionally open C5 scope

- A genuinely stale native committed-membership observation plus retained APPLIED_PROGRESS wake is not represented by this controllable fixture. It remains the separate native stale-refresh plan.
- The older-origin/later-work recipient combination remains distinct from the existing real pending-work preservation witness.
- The final query proof remains its separately reviewed query/participant/release composition. No mutable-row or fabricated post-drain acceptance was added here.

These controls import approved future `OBSERVE_APPLIED_POSITION`, `observationDeadlineAtMs`, and `RAFT_EVENT.APPLIED_PROGRESS` surfaces. Their current source-absent state is not claimed as a behavior red. Locked candidate/source composition and independent implementation review remain required.

## Static verification

All recorded commands exited 0:

- syntax: all three changed files;
- exact ESLint: all three changed files;
- `git diff --check`;
- strict scoped cyclomatic threshold 12 and cognitive threshold 20: zero violations.

Exact commands, exits, hashes, file hashes, and the binary diff hash are in `frozen-control-batch-v2-hashes.json`. No behavioral command was run.
