# Verification Template: Concurrency / Locking / Single-flight

For changes to single-flight keys, claim CAS, serialization gates, or
concurrent create/dispatch paths. Each item requires an evidence path.

1. **The synchronous gate vs the async observer.** Concurrent creates
   cannot be serialized by async row observation alone (rows mid-persist
   are invisible) — show the synchronous in-memory gate AND the async
   backstop (run-20 interlock pattern: ensureOperationLedgerSelfMoveSerialized
   + runOperationLedgerInterlockAccountedCreate).
2. **TOCTOU after awaits.** Every check-then-act separated by an await must
   re-validate after the await or prove single-writer.
3. **Single-winner claims.** Multi-driver dispatch (wakes, replays,
   planner) must funnel through one claim CAS on durable state; extra
   drivers must be no-op nudges.
4. **Reentrancy from timers.** Actions invoked from setInterval/setTimeout
   callbacks: what in-flight operations on the same entity can they
   interleave with, and why is that safe (or gated)?
5. **Lock scope honesty.** Mutex keys: is the KEY the resource actually
   contended (an inert budget classification on the wrong key serializes
   nothing — run-21 verifier finding)?
