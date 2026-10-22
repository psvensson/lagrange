---
categories: [concurrency-serialization]
---

# Verification Template: Concurrency / Locking / Single-flight

For changes to single-flight keys, claim CAS, serialization gates, or
concurrent create/dispatch paths. Each item requires an evidence path.

1. **Actual serialization boundary.** Async row observation alone cannot
   serialize concurrent creates while persistence is pending. Show the actual
   atomic claim or gate across that interval, including its process and durable
   scope. The run-20 in-memory interlock plus durable backstop is one pattern,
   not a requirement to introduce a second gate where the existing owner
   already serializes the operation.
2. **TOCTOU after awaits.** Every check-then-act separated by an await must
   revalidate after the await or prove that ownership, identity, and the
   necessary preconditions cannot change across that interval.
3. **Single-winner claims.** Multi-driver dispatch (wakes, replays,
   planner) must funnel through one claim CAS on durable state; extra
   drivers must be no-op nudges.
4. **Reentrancy from timers.** Actions invoked from setInterval/setTimeout
   callbacks: what in-flight operations on the same entity can they
   interleave with, and why is that safe (or gated)?
5. **Lock scope honesty.** Mutex keys: is the KEY the resource actually
   contended (an inert budget classification on the wrong key serializes
   nothing — run-21 verifier finding)?
6. **Custody through uncertainty.** After timeout, cancellation, restart, or
   lost response, which owner retains an admitted obligation and prevents a
   second conflicting effect? Prove eventual release or recovery under the
   contract's finite-failure assumptions, plus bounded waiters and retained state.
