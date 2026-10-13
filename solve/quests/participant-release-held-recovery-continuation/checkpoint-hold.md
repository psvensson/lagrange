# Participant release recovery preservation checkpoint

Status: HOLD. This is a reviewed, measured non-main WIP checkpoint, not Quest land, publication or main merge approval. The Quest remains OPEN with four of five receipts satisfied (metric 1). The caller worktree contains only this bounded recovery unit over preserved TX1 parent d35d8828c630d1b9675b47f511c477b3cc9ee991.

The change retains one bounded existing-owner wake while the canonical raft-rs status is held by host recovery. It reuses the existing classifier, pending/running maps, shared timer and canonical cutover. Healthy nonleaders remain event-driven. Canonical resume refuses actual shutdown or replacement across status reads and awaits. Last-current-host departure clears that partition's observation debt and diagnostics without cancelling other partitions' work. No runtime reconstruction, election, origin, membership, drain, census, retry budget or deadline authority is duplicated or weakened.

## Exact evidence

- Tested candidate: cd589405e6febadf7dbef339b6806e15426e837f, tree 11f617117cc648f22cc8ba34d8364773a22c9914.
- Identical-test source-only control: c2307d3dc827d8c1293ad3a87ed8f3753f324b8b, tree 6c1f12c96538b2f54320bd523f01ace0583adea5. Exactly two source paths differ; all other tracked bytes are identical.
- Final result: evidence/paired-result-v3.json, SHA256 a09c2b0a9973597fbdb485ea0fff61331da5c6cc1c938ec9d7b31a7355fb2f01. It binds 64 retained raw artifacts.
- Independent review: evidence/implementation-review-v3.md, SHA256 b86a953cf45b62742bf5b19cc4e23f83038f3ff6d0fe8d0eaf3ec1e97bd3f495. All 50 applicable items are addressed; the prior R1-R4 rejection and corrections remain append-only evidence.
- Four locked lab hosts: candidate 17/17 files and 219 runner assertions; control 15/17 files, with intended native and focused failures. All 15 surrounding regression files pass on both inputs.
- Deferred native recovery: candidate 1170.220289 ms; source control 10181.186015 ms, exhausting the unchanged healthy 10000 ms bound with zero post-heal reconstruction or consensus observations. No manual post-heal status read, sleep, tick or repeated release supplies progress.
- Actual handler/service lifecycle and scheduling: focused 15/15 candidate versus 3/15 control. The isolated lifetime cleanup negatives were measured separately against unchanged V2 production before correction; the full d35 source control fails their earlier held-observation premise and is not misreported as an isolated cleanup falsifier.

The preservation commit adds evidence and review material after the tested candidate. Compare architecture/src/scripts/test bytes against the candidate before using this checkpoint; do not label its eventual commit SHA as the executed lab input. Neither exact-main certification nor a full corpus run is claimed.

## Remaining gates

The static gate stays red: inherited fresh-create local_retry_loop in the touched recovery owner; the same three dependency findings in candidate/control; 1463 unused exports versus the 1416 baseline; and test duplication at 697 groups/26415 lines versus 697/26369. The full clone scan finds zero groups touching the four changed JS paths; production duplication is exactly 47/1462. Syntax, ESLint, strict source complexity/cognitive, file size, the six other scoped guidelines, impact contracts and shard metadata pass. No baseline was raised.

Separate C2 checkpoint 406ceac1c40bdf57da1a6668806d0f3b38526cb9 removes the two orphan promotion modules and their exclusive support. That change is not in this standalone recovery input. Compose the reviewed bytes in the isolated integration worktree, regenerate metadata with its producer, and measure the exact resulting input.

The known seed-release failure remains a system issue. A three-file same-host C2/recovery startup intersection is being measured: participant release protocol; membership claim-cache startup on adam-laptop; and bootstrap consistency on adams-gamla. The C2-only checkpoint still fails seed bootstrap, yielding downstream HTTP 503 assertions rather than proving intended successful join behavior. Keep internal deadline exhaustion, blocked drain facts and joined-attempt age/trigger distinct until owner evidence establishes the cause. Do not raise timeouts, add alternate release logic or claim seed closure from isolated recovery green.

Broader TX1 application/crash and snapshot custody, FreshMG, CDC, integrated distributed startup/recovery, full static/corpus/release evidence and the main publication gate remain open. Origin/main was re-read at 599e9224b7ec9e2439bc5f6fb3ceebb4aaa1b68a; it was not modified.
