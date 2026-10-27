# Independent F1 transport witness review R1

Reviewer: `/root`, independent of author `/root/retained_effects_review`.
Verdict: **APPROVE the exact test source for its declared component and real-ws
positive scopes. Runtime and semantic mutation evidence remain unexecuted.**

Manifest `/tmp/mg-f1-transport-witnesses-r1-20261023/manifest.json` SHA256
`995e2d7ccc4d2bc86fa2ff53e0c79dfac2fe8392275e9dafa32a31f767bf165d`.
All four live/frozen files and thirteen listed artifact hashes match. Reviewed
all four test/helper bodies against the actual delivery-lifetime, ACK owner,
pending ledger, outbound registration, inline-ACK handling and encoding paths.

| Category | Binding and limits |
| --- | --- |
| Transport and outcome | Custody tests use actual MessageRouter registration/IDENTIFY and ACK processing. Their transportProbe is explicit transport payload; it never claims a native CDC receipt. The response tests distinguish matched application rejection from expiry/cancellation and bind disposition to the actual promise winner. Missing-handler/no-connection and native acceptance remain regression/composition obligations. |
| Concurrency and cleanup | The first custody test requires one actual outbound in-flight slot, a queued successor and a retained genuine invocation. Two completion orders, CLOSE, send-throw, repeated old callback and same-ID successor test resource ownership separately from response completion. Slot/record observations are not substitutes for durable authority. |
| Lifecycle and time | Shutdown/reinitialize is performed on the actual router. A held old local handler must fail its old invocation gate while a fresh handler works. Delayed timer controls advance observed time without firing due callbacks, so the enforcing check must decide expiry. Distinct receiver clock origin tests remaining duration, not synchronized wall clocks. |
| Encoding and input | Tests engage the actual encoder, late scalar stamp and router preparer. They compare complete event bytes, Unicode and no-padding frame length; changed non-scalar fields and nonfinite/boxed/inherited/accessor duration inputs refuse. The controlled elapsed interval is not claimed as measured serialization CPU time. |
| Harness fidelity | The socket wrapper delegates real in-process handoff before holding callback notification. Both exported pair paths are exercised and required to be identical. This tests callback-owned custody, not retained kernel/compression memory. The real ws positive observes text-frame delivery through an actual loopback server/client. All held callbacks/handlers have teardown release and router/invocation cleanup. |
| Owner interaction | No new production grant, native status, connection record, receipt or ledger row is fabricated. Pressure and stale/fresh lifecycle invariants are paired in the same component cases. Impact registration and exact-source lab measurement remain root integration work. |

The suite contains twenty authored cases, not twenty measured passes. Required
runtime evidence must show the intended preconditions and assertions engage;
setup failures or outer timeouts cannot count as semantic negatives. Restoring
ACK-only cleanup, predictive pending settlement, renewed grants or a second
body pass has a concrete discriminating assertion in the cases reviewed.

The real ws positive does not cover a held ws compression/kernel-write failure.
The fixtures do not prove actual source SQL debt, native application, source
CDC_DELIVERED, W7/W9, recovery authorization or the composed two-start scenario.
Those limits are retained from the author dossier. No runtime, publication,
Quest landing or merge approval follows from this source review.
