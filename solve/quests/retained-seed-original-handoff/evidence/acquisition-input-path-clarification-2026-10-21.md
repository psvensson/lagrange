---
audience: development
documentClass: current
---

# Acquisition input: dependency source path clarification

Date: 2026-10-21. Evidence HEAD is
`e69db481f37ab5633d64de7b6e7345426d9286b3`; product source remains
`393f411ca09449898465cc3cb7320c03fba2aba8`.

The frozen [acquisition input](preparation-acquisition-custody-input-2026-10-21.md)
is preserved byte-for-byte at SHA256
`995c603e3c211954ca196c1c8576a23df4f6ef3aff3ecedb2c29c9d36d409335`.
Its line 28 native-open reference (range 468–519) and line 39 native-source
reference are relative to the inspected better-sqlite3 dependency, not to the
repository root. Both refer to
`node_modules/better-sqlite3/src/better_sqlite3.cpp`, whose inspected SHA256 is
`551abc7d9feea0ad2acb97f33125c5e8800d6d84a1da4390512d08743f924b1e`.
No source result, native-binary attestation, or custody conclusion changes.

The canonical owner is `scripts/check-documentation-current-state.js`, exposed
as `npm run audit:documentation-current`. Its read-only exported
`validateDocumentationCurrentState()` reported 1,204 files and 294 errors in
this worktree: 292 inherited findings plus these two raw-input path references.
The full unmodified report is retained locally at
`test-output/original-handoff-correspondence/documentation-current.json`.
The audit remains unresolved. This clarification does not suppress its findings,
reclassify the raw record, or change a baseline or the frozen input manifests.
It is not a clean documentation-audit or landing-readiness claim.
