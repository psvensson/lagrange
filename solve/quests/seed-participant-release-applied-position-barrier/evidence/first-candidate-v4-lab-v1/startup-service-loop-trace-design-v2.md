# Seed service-loop trace: capture-safe test-only design V2

## Binding and correction

This supersedes only the output-retention section of V1 (`58c8b2c29baecff99a35efbe8a6e926687a991ac28db1df30820a03c1c3b5e6a`). Its unchanged source, existing `routerFactory`, exact-original-Promise wrapper, custody, authority, and claim limits remain binding.

The retained baseline trace is not complete record evidence. `startup-trace-v2/adam-laptop.raw.log` is 132,227 bytes; line 16 is cut at 62,864 bytes in the middle of its records. Its complete prefix proves only the header counters: 380 matched, 380 recorded, 380 completed, zero dropped, zero capture errors, and zero incomplete calls. It does not prove which actions, partitions, or terminal answers occupy the missing suffix. Root's newer candidate prefix analogously proves its reported 654 matched/recorded/completed counters, but its cut record array cannot prove the terminal chain.

The owner is `scripts/run-test-files.js`: it retains the first and last 64 KiB of each stdout/stderr artifact (`OUTPUT_EXCERPT_EDGE_BYTES`), inserting an elision when the file exceeds both edges. The lab raw log contains that runner excerpt, not an unlimited copy of the placement TAP artifact. V1's 256 full-record suffix could therefore recreate the same unusable middle cut.

## Physically bounded replacement

Reuse the existing `createParticipantReleaseDeliveryTrace`; do not add another tracer or classifier. Keep its one non-async wrapper, exact delegate call, original result/error identity, and current pending-call cap. Replace only the retained/output shapes:

- Retain a completed suffix of 16 fixed-field records. The measured terminal attempt used 11 records; 16 provides bounded margin, not a completeness assumption. Record every suffix eviction.
- Keep global action counts and a compact partition/action aggregate capped at 160 keys. Count aggregate overflow rather than retaining another key. Each entry contains identifiers plus call/completion/outcome/reason counts, never a request/response graph.
- Each suffix record keeps only the previously approved bounded owner scalars needed to bind entry and settlement: call/completion ordinals, installation/router/node, address, action/trigger, partition/replica, release/attempt/target/build/deadline identities, the two owner-clock observations, delivery scalars, and the terminal answer's outcome/phase/reason/missing fact/control identity plus bounded generation/work/origin/membership/blocked-drain/join projection.
- Preserve total matched/admitted/completed/synchronous-throw/pending counts, dropped/evicted/capture-error counters, retained ordinal range, installations, restoration state, and pending identities. These counters qualify the trace; they do not make an evicted history complete.

Serialize one object once after the existing bootstrap and cleanup attempts. Write one newline-terminated line synchronously to stderr, isolated from TAP stdout, with a hard UTF-8 ceiling of 48 KiB including the newline. This is below one 64 KiB runner excerpt edge, so the canonical runner can retain the line whole without increasing its cap. If the full summary plus 16-record suffix exceeds the ceiling, emit a fixed summary-only overflow record under the same ceiling with total counters, aggregate/suffix sizes, byte count, and `serializationOverflow: true`; that attempt remains HOLD and cannot establish terminal answers. A serialization/write error remains an independent cleanup failure. Do not split a logical record across lines or silently truncate a string.

Observation remains passive: no status/facts/database read, tick, proposal, timer, ref, sleep, retry, fresh delivery, or changed Promise/handler authority. The output can establish repeated natural service-loop calls and a retained terminal suffix only when overflow, drops, capture errors, pending calls, and custody failures are all zero. It cannot by itself prove why the owner chose a branch or authorize iteration, budget, or production changes.
