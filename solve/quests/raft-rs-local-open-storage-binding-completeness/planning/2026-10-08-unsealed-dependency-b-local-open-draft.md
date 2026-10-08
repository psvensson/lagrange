# Dependency B local-open Quest draft

Recorded 2026-10-08 in isolated exact-82b54 planning worktree. This is
unsealed planning only (`UNSEALED_FALSE`). It creates no source authority, no
Quest seal, no receipt, no commit and no final snapshot catch-up closure.

The adopted owner judgment is Astra's decomposition packet
`/tmp/raft-rs-takeover-20261008/snapshot-quest-decomposition-owner-judgment-astra.txt`,
SHA256 `b68ad5cbcd270d015915eef2ccf5a60f2508a9e2784b9c4ef770676101f0cd21`.
It permits an independent Dependency B for local-open storage
binding/completeness while preserving one later coupled live exchange and final
seven-scenario certification Quest.

This draft scopes Dependency B to LOCAL_OPEN, KNOWN_WIPE, READ_UNAVAILABLE and
intact cold restart. It deliberately excludes sender publication, transfer,
receiver Ready admission, accepted-image atomic transaction, cleanup/deletion,
FreshMG and wiped-voter replacement. It also excludes the late
pre-create_node observer mutation as a CAS oracle per Astra ruling
`bbe59d6caca2051d088ccd9bc5f9b6ad1de17b857d9229fc09a8072944ef7c14`.

The receipt plan uses the existing binary runner
`scripts/quest-evidence/harness-runtime.js` and the `test-receipt` probe. The
required receipt IDs are:

- `local-open-per-fact-storage-binding`
- `known-wipe-current-db-hold-replays`
- `read-unavailable-does-not-fabricate-absence`
- `three-voter-intact-cold-restart`

Baseline evidence is expected to use the R4 matrix genuine owner reds and
positive controls already frozen in `/tmp/raft-rs-takeover-20261008`, then be
rerun through concrete future-green tests before seal. The final coupled Quest
must rerun this dependency evidence on its own exact head; Dependency B receipts
do not satisfy final R1-R7 catch-up acceptance.
