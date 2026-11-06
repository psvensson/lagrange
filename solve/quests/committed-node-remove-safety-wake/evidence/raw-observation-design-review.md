# R17 raw observation and notification scope clarification

Reviewer: `subagent:/root/independent_review`, 2026-11-06.
Source: `8b08183a7adf89f279e7816f70410e48414cc728`.
This supplements `independent-r17-floor-wake-correction-and-design.md`
(SHA-256 `ac108ed2b51e5cc9247d2ee9bf430f2080b4abf713b2e711bf5471353be99608`).
It is design applicability, not implementation or acceptance approval.

The author's raw-observation finding is confirmed by source inspection.
`serve-eligibility-owner.js:247-257` converts a non-array rows field to an empty
array, ignores rows lacking a usable node identity, and indexes repeated
identities with `Map.set`. Thus null/missing identities disappear and duplicate
identities overwrite one another before `answerCommittedNodes()` returns the
array. A consumer validator cannot reconstruct those erased facts. Sparse
arrays can likewise lose their holes through iteration/indexing. Existing
`readCommittedTables` checks success flags but not this row contract (374-389).

Validation therefore belongs at the existing readiness owner, before NODES
indexing or filtering. Require the owner-defined canonical array/member/node
identity contract, density, and unambiguous identity before admitting the
record. Do not validate a filtered subset or add an alternate direct reader.
The unavailable outcome must be the existing typed failed-read route, not an
invented empty-success/NO_RECORD result.

Preserve `adoptReadResult`'s existing policy (422-452): a failed read does not
itself revoke a previously valid committed record. Initial malformed evidence
must remain unavailable; an existing valid record, its lease, supersession,
and monotonic epoch rules remain the readiness owner's decision. Tests must
distinguish these two cases rather than requiring all failed refreshes to
revoke authority. A caller must not recover filtered rows from a cache.

The notification part of the same owner interaction must reflect the canonical
node-liveness semantic result used by the new floor. Reuse
`projectNodeLivenessSemantics` at the owner's captured instant; do not implement
a new local lease parser for the notification signature. Retain serve/publication
notification obligations while adding the changed canonical node meaning.
Unchanged lease renewal must not manufacture perpetual semantic changes.

These are necessary placements of the already-approved malformed-observation
and lease-only wake obligations, not new acceptance gates. Prove them with the
actual committed owner and raw authoritative boundary: initial invalid data,
mixed/duplicate/sparse observations, retained-valid-record behavior, and
canonical-invalid-to-valid recovery whose ordinary serve decision alone would
not distinguish the node transition. Disable the required trigger in the
bounded negative. Keep source read, trigger, and permission ownership separate.

The reviewed `serve-eligibility-owner.js` SHA-256 remains
`02c907fd954943d524ddef6bf7191582e7f0868713d1b88aa44255e4b146b33e`.
No production changes or tests were performed by this reviewer.
