# A0 finality counterexample checkpoint

State: **MEASURED EXPECTED RED; independent checkpoint review pending. U1 remains REJECT.** This checkpoint changes no production bytes and approves no finality implementation, B inventory contract, U2, activation, certification or merge.

The conversation authorized this bounded unit of the existing `wasm-creation-genesis` Quest after independent review of the checkpoint plan. It is work by the current conversation's agent in an isolated branch, not an accepted Harnessd execution task or a synthetic PROVEN state. Historical admission HOLD notes remain true of their original managed-task proposal; this existing-Quest checkpoint does not reinterpret them or the parent seal.

Base: `a1c3cde54fcb46471791062bcae4a6000ae484e0`, branch `test/rs-raft-a0-finality-witness-20261018`. Source tree remains `97388f76ab4468da91b4a7eb9badc8b3c1804e62`. The only test change appends the first diff from the preserved independent patch: three F1 witnesses plus the journal-only inventory control. Its exact patch SHA256 is `fe5b0776d58641f9f88e4f0a7db74a57898845e7ca84132391c18ae72a867df7`. The original 29 tests remain byte-for-byte as the prefix. Resulting test SHA256: `656e5e2ca870d68ec78b9f004d7bb94cd872c3f6f9259ad964af2b77a1071cc2`.

Official measurement, 2026-10-18T10:44:53Z–10:44:57Z:

```sh
npm run test:file -- test/service/service-consensus-creation-intent.test.js
```

**Raw exit 1: 33 semantic tests, 30 pass, three fail, zero skipped/cancelled/todo.** `matrix.json` enumerates every exact case name/status and the three diagnostic states. Temporary TARGET_ALREADY_OWNED and INVALID_EXPECTED_STATE witnesses each fail `CANCELLED_JOURNAL_WITH_DELAYED_ADMITTED_RESOURCE: unresolved obligation lost`; the real future selection fails `FUTURE_BINDING_CANCELLED_BEFORE_EXACT_REQUEST_BECAME_ADMISSIBLE`. Every failure reaches its intended ERR_ASSERTION after real SQLite authority CAS, delayed original request and blocker-close/actual-selection preconditions. All original positive tests and the new zero-resource-resolution-read control pass. No assertion or owner answer was weakened to obtain a success badge.

Runtime is Node v22.23.2, native ABI127, SQLite3.49.2. Thermal gate reports CPU44C/NVMe68C; it was not disabled. `provenance.json` binds executable, native SQLite bytes, runner environment, original/adopted test, source tree and lock hashes. Existing shared dependencies are read-only prerequisites: all 1,190 nonroot base lock package version/integrity entries match the installed lock; extra packages exist, so this is not a hermetic installation claim. No shared native dependency was rebuilt. Actual MovieLens u.data was provisioned only as an ignored metadata-generator prerequisite, SHA256 `06416e597f82b7342361e41163890c81036900f418ad91315590814211dca490`; no classification change hides missing data.

`classified-runner.stdout.log`, `classified-runner.stderr.log`, `test-output.tap`, `test-output.tap.stderr` and `run-result.json` preserve full raw execution. `adopted-first-diff.patch` preserves adopted input bytes. `manifest.json` binds retained evidence. Expected-red reproduction is a measured counterexample checkpoint; it is not a green production proof or parent Quest terminal. Independent review must bind the actual committed checkpoint, unchanged src tree, test bytes, matrix and raw evidence before preparing A1 on its exact SHA. No push is authorized or performed here.
