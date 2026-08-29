---
audience: development
---

# Solver Content-Addressed Fast Path

The Solver's safety boundary is the exact candidate content, not the serialization
of a Git diff and not the wall clock of a deterministic receipt.

## Normal path

For routine Quest work the operator surface remains:

```sh
node scripts/solve.js start --id <quest>
node scripts/solve.js continue --id <quest>
# edit + run the focused proof
node scripts/solve.js continue --id <quest> --summary "<what changed>"
node scripts/solve.js land --id <quest>
# independent verifier reviews the returned review id
node scripts/solve.js land --id <quest> --review <review-id> \
  --verifier <id> --verdict approve --receipt <ref>
```

Manual `diff:` artifacts and `ingest-evidence` remain diagnostic/compatibility
surfaces. They are not routine steps when `continue` can capture the change and
the Quest's declared probe produced the evidence.

## Identity model

New landing reviews use schema v3 and bind a scoped content manifest. Every
reviewed path contributes:

- normalized repository path;
- present/deleted state;
- Git mode (`100644`, `100755`, or `120000`);
- byte length and SHA-256 when present.

The manifest also binds the recorded base commit, exact path set, attempt range,
and coupled-pair registry digest. Filesystem timestamps and diff serialization do
not define review identity.

A diff remains useful as a human explanation of `base -> candidate`; it is not
the verifier-facing identity for a new review.

## Candidate workspace

Landing proof is run in a detached worktree materialized from the recorded base
plus the exact candidate path union. Ambient untracked or modified files from
other Quests are absent. Proof code is read-only with respect to tracked
candidate bytes: a mutation raises `PROOF_MUTATED_CANDIDATE`.

This is the protection against the historical failure where a proof harness
regenerated a test-classification shard from foreign untracked tests and thereby
changed the candidate it was meant to prove.

## Evidence identity

Evidence has an explicit class:

- `deterministic`: semantic content + semantic probe arguments own identity;
- `live`: filesystem/run freshness remains part of the legacy time-sensitive
  identity unless the probe explicitly provides stronger semantics;
- `external`: remains explicit and conservative.

A deterministic test receipt owns its semantic serialization and excludes its
`generatedAt` field. Raw artifact SHA and timestamp metadata remain available for
forensics, but touching/copying the same deterministic proof does not create new
proof meaning.

Never apply generic JSON rules such as "ignore every timestamp-looking field".
Only the probe that owns an artifact may define its semantic evidence bytes.

## Candidate versions versus measurements

Attempt events remain measurements. Multiple live runs against identical source
bytes remain multiple measurements and continue to count independently for
consecutive/statistical gates.

Separately, Solver can reconstruct the content identity exercised by each attempt
and group measurements by source version. Therefore "same source, another live
measurement" is representable without pretending that a new source candidate was
created.

## Terminal readiness

Landing preflight collects independent repairable failures in one pass. Dependent
checks still fail closed: for example proof-cone work is not trusted when its
canonical import graph is invalid. The operator receives one combined terminal
readiness failure instead of repeatedly discovering one independent prerequisite
per invocation.

Passing preflight remains content/input keyed. A changed checker, lockfile, model,
or other declared proof input invalidates the reusable result even when source
bytes are unchanged.

## Verification compatibility

Append-only v2 verification history is not rewritten.

- Existing schema-v2 review ids continue to use their legacy diff fingerprints.
- New schema-v3 review ids are content-addressed.
- When a v3 verdict is recorded, Solver first revalidates the content review,
  then derives the current v2 ledger fingerprint from current state. The review
  file cannot supply or override that bridge.
- The durable verification finding records the content review id/fingerprint in
  addition to the legacy ledger receipt.

After an approved schema-v3 landing commits, Solver recomputes the content
identity from committed `HEAD` over the reviewed paths. A mismatch raises
`COMMITTED_CANDIDATE_IDENTITY_MISMATCH`.

## Safety rule

The migration follows one rule:

> Content changes invalidate content-bound proof. Time does not. External-world
> changes invalidate world-bound proof. Bookkeeping changes invalidate neither.

The rule does not permit proof reuse when relevant proof inputs changed, does not
deduplicate live measurements, and does not remove the exact final commit check.
