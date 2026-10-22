---
audience: development
documentClass: evidence
---

# Startup transport absence: oracle correction after lab #769

## Observed result and preserved evidence

Exact candidate `7fa4d79ae0a2cdb806bf073f8cb3e0578b0d576f` produced
79 runner-reported tests: 75 passed, 4 failed, zero cancelled, skipped or todo.
The original result remains RED. Its full 21,297-byte worker log has SHA-256
`c2116fe04a9e48a11919865b822d01a0e3f9cdb506a24f9f3d90c79365bd26ec`
and is retained in RAW-startup-candidate-7fa4d79a-2026-10-22.txt.

MEASURE-startup-full-log-7fa4d79a-2026-10-22.json retains the original receipt,
the read-only #777 recovery and #781 evidence receipt. This appends to the
earlier candidate record; its then-pending recovery state is not rewritten.

All four first divergences are strict Boolean comparisons of an existing
predicate: actual undefined, expected false, at old witness lines 238, 426,
667 and 721. The continuation case stopped in its first loop iteration.
The remaining five continuation calls and later assertions in all four cases
were not measured by #769.

## Existing owner contract and correction

The unchanged owner in src/transport/message-router-delivery-behaviors.js
reads the current node's connection and returns the conjunction of that
entry, its self-connection marker and its CONNECTED state. An absent entry
therefore returns undefined. The existing setup witness at
test/bootstrap/shared/message-router-setup.test.js and transport tail witness
at test/transport/message-router-tail-more-test-cases.js already assert
falsiness for listenerless initialization.

At exactly the four identified sites, the new witness now asserts both:

```js
assert.ok(!router.hasSelfConnection());
assert.equal(router.nodeConnections.has(router.nodeId), false);
```

The continuation loop uses the corresponding f.service.messageRouter
expressions. Exact map-entry absence additionally rejects a retained entry
whose state or marker makes the predicate falsy. The strict server-null
checks and every admission, typed-refusal, native-operation, durable-right,
resource-custody, shutdown-join, cadence and other cleanup assertion remain
unchanged. Production source is unchanged; the owner is not modified to meet
the erroneous literal-Boolean expectation.

Independent reviewer /root/opening_review approved this causal classification,
the four-site correction, its stronger absence observation and its provenance
limits. Its content-bound verdict is appended in
REVIEW-startup-lifetime-2026-10-22.md. This is not a runtime pass; the revised
witness requires a fresh exact-candidate seven-file run.

## Revised witness and historical correspondence

The revised test/bootstrap/seed-original-attempt-lifetime.test.js is
35,941 bytes, SHA-256
`2421740ecafb0c9dcb457be3e1ef8286321645a426d23f7814d2d9a91d1e086f`,
Git blob `e87f872e32cca602d1055e6514437d49ec36ec10`.

The original 14-case baseline at
`3fa20cefeca622ec2060509903a921979d32a082` is 20,600 bytes with SHA-256
`e4afdcabc63bd3397b992978a5cdaa7da136122d4802eb203482b3e975a72790`.
Those exact bytes are also the prefix of the original 21-case candidate at
7fa4d79a, whose full-file hash remains
`3ef091d21e2e67af4ae40f06e6061fa1334f29a88583a6aa4a5d9547584018c7`.

Two oracle corrections fall inside that old prefix. The revised first
20,600 bytes have a different SHA-256:
`bad72ffc8cfc36555d27e30e754e0237390f4985a6472022e3d11391e1adf5ab`.
The comment above the seven appended cases now describes the historical
preservation without claiming the revised prefix is unchanged.

Both selected baseline admission case bodies remain byte-identical to
3fa20cef and 7fa4d79a. Lab #766 remains their valid engaged RED baseline;
both passed on #769. The six existing opening/participation/custody/inspection
test files are unchanged. No old failure evidence, acceptance seal, handoff
receipt, gate baseline or runtime owner has been relaxed.
