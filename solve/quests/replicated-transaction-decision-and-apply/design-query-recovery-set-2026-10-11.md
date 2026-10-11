# Query recovery participant authority — proposed R2 refinement

Status: accepted by root owner on 2026-10-11 before protocol edits. Acceptance
binds proposal SHA256 `d6aeb3f49fbc86328552e3142cbf208c946e1c1a1494d7f68d0b8bfdcc554a30`.
Implementation requires independent review; no readiness or receipt claim.
Additional acceptance conditions: prove late QUERY against actual participant
serialization/PREPARE/terminal fences for both COMMIT and ROLLBACK schedules;
stale FAILED/terminal discovery cannot exclude owed decisions; NULL old rows
block release until the existing drain proves them safe. The query schema and
semantic dependency has been communicated to the 5a release owner.
Base: query proof `18381e3b30674e2b38ff0ec78ab590ed649600d6`, branch HEAD
`be99622d6b21162e9cc459104d7f1b5d8cd3830d`; accepted participant increment 4
`e7c89f4b5` remains the participant contract. The accepted v10 decision and
prepare-first protocol stay authoritative. This changes the query coordinator's
enlistment/recovery interaction with its existing `sql_transactions` row.

## Measured defect and missing authority

Independent R2-D/E start from an old ACTIVE/OPEN/count-0 cache row, while the
authoritative row already holds COMMIT for one participant. Recovery performs
no authoritative read, sends an empty unbound rollback, reports resumed, and
overwrites the durable status/set/count with ROLLED_BACK/OPEN/0. A later restart
then omits the still-owed COMMIT. R2-A/B/C independently expose stale transaction
identity across the request FIFO; those are being repaired in the existing owner.
Evidence: candidate `test-output/continuation-20261011/queryr2-adversarial-final.tap`
and `queryr2-composed-scratch/test/query/transaction-review-adversarial.test.js`.

Current durable schema has identity, deadline, phase and frozen count, but no
complete admitted participant set or durable execution owner/boot/lease. An OPEN
row's count is always zero. Enlistment sends BEGIN before participant persistence
and only later updates the transaction row. Its update is unconditional. Two
equal transaction-row reads surrounding participant/write reads therefore do
not establish a complete census. A local FIFO does not exclude another process.

## Sole authority and encoding

Add `participant_set_text` to the existing `sql_transactions` row. Its canonical
bytes are a code-unit-sorted JSON array of unique `[participantId, partitionId]`
pairs; every participantId must equal the existing identity owner's derivation
from this exact transactionId and partitionId. BEGIN inserts `[]` once. This
column is the admitted set, including admissions whose participant rows or BEGIN
answers have not arrived yet. It is append-only while OPEN, immutable once
FROZEN. No second ledger, coordinator, lease or inferred cache authority.

All set mutations use the existing authoritative gateway and exact row CAS:
immutable transaction/session/epoch identity, OPEN, previous exact set text,
and no recorded decision. The set text itself prevents ABA: additions never
remove members and the phase never reopens. Generic status persistence stops
writing identity, phase, set, mode or frozen count after the initial INSERT.
Only the enlist/freeze owner may change those columns. A late status update
cannot erase a decision or reopen admission; status remains a progress hint.

## Live admission and freeze

1. Under the existing session FIFO, plan the complete statement participant set.
   CAS its union into the row BEFORE any new participant BEGIN or any QUERY.
   Already-listed participants still require a current OPEN admission read.
2. A failed/lost CAS answer rereads that same authoritative row. Exact intended
   set membership while OPEN permits continuation; FROZEN/decided refuses new
   statement work; missing, malformed or unreadable stays typed unavailable.
   A refused admission is never counted as a completed statement.
3. COMMIT freezes the exact admitted set by the same OPEN/text CAS, writing
   FROZEN, prepare-first mode and its count together. Only a frozen set can
   PREPARE. All retained members are driven; a partially created participant
   may refuse PREPARE, which chooses a bound ROLLBACK for the complete set.
4. An admitted request already past its final read can arrive after freeze.
   Its participant was retained before dispatch. Staging is volatile and cannot
   commit by itself. A recorded bound ROLLBACK creates the accepted participant
   TOMBSTONE even before BEGIN/PREPARE; late BEGIN/PREPARE cannot resurrect it.
   This is the existing participant owner, not a new deadline revocation claim.

## Recovery and immutable decision

Cache rows discover exact IDs only. Recovery reads the exact authoritative row
before any stage, validates immutable identity, canonical set and decision, and
reconciles the retained workflow under the session FIFO without replacing a
newer session owner. Missing participant rows do not lose an admitted identity:
the set supplies it. Participant rows supply PREPARE evidence/progress; they
never establish the set. Recovery re-drives exact terminal decisions even when
progress rows are absent or stale, relying on participant durable idempotency.
Write-operation rows remain diagnostics; they are not a complete-set authority.

For undecided OPEN, there is no durable proof that a different coordinator died.
Startup therefore waits for the persisted deadline; the existing sweep retries.
After expiry, recovery may close admission using the same exact OPEN/text CAS,
then record bound ROLLBACK for all admitted identities. Deadline expiry permits
this attempt; it never proves decision absence or makes an unknown outcome abort.
Missing/invalid deadline is a typed retained obligation, not an invented timeout.

An undecided FROZEN row does not manufacture a fresh COMMIT from missing write
or PREPARE evidence. If every retained participant has durable exact positive
PREPARE evidence, the existing decision protocol may choose COMMIT. Otherwise
the expired recovery attempt records bound ROLLBACK for the complete set; it
does not recreate volatile statements or prepare an unknown partial statement
history. An unexpired undecided row without such positive proof remains held
for its live owner and the deadline sweep. A decision write is insert-once and
guarded by exact frozen set/identity as well as null
decision. If another coordinator recorded first, follow its immutable text and
digests. ABSENT means a valid authoritative row explicitly has no decision;
missing/unavailable/malformed must remain distinct and cannot authorize a write.
After a possible decision submission, only a readable recorded decision resolves
the uncertainty; do not infer absence from status or reconstruct its bytes.

Every failed read/freeze/decision retains the exact ID for the existing sweep.
FAILED/terminal progress hints with an unresolved discovered obligation cannot
skip authority or remove its enrollment: stale status is no discharge proof.
Fresh authority can replace stale restored metadata on the next invocation.
Completion removes only that obligation and only its exact ownerKey binding.

## Crash/race witnesses required before approval

- Add-before-freeze and freeze-before-add: exactly the admitted set is closed;
  the loser sends no new participant request. Lost addition/freeze answers
  resolve via exact readback, never guessed success.
- Process loss after set admission but before BEGIN/participant-row persistence:
  expired OPEN recovery binds ROLLBACK to that retained identity and tombstones
  it; a late BEGIN/PREPARE cannot revive it. Include partially persisted rows.
- A current live request delayed past freeze can only affect volatile staging;
  decided rollback/commit follows the participant owner and remains idempotent.
- Stale ACTIVE/empty projection over durable COMMIT, authoritative ROLLBACK and
  undecided FROZEN: no status rewrite before authority; exact participant fanout.
- Missing, unreadable, malformed and unavailable authoritative rows HOLD with
  zero fanout and no terminal status. Restored fresh authority then completes.
- Competing COMMIT/ROLLBACK decisions use one exact frozen set and insert-once
  winner. A lost answer never causes reconstruction or a second decision.
- Unexpired OPEN discovered on another engine remains live; expiry wakes the
  existing sweep and finishes without a new coordinator/periodic loop.
- Late generic status writes cannot change phase/set/decision. Same-session reuse
  remains bound to the old workflow identity for replay and terminal cleanup.

## Compatibility and proof limits

The nullable column has no migration default. Only a newly inserted BEGIN may
write `[]`; schema/provisioning must leave old rows NULL. Pre-refinement rows
lacking the set cannot silently become `[]`. Retain them as
incomplete and use the existing cutover drain/barrier to exclude them from the
new protocol; schema migration alone cannot manufacture the admitted set. The
root/5a cutover owner must include this column/semantic version in its release
contract. Ordinary direct autocommit stays on its unchanged participant route.

Required independent review categories: admission-gating, recovery-replay,
concurrency-serialization, owner-interaction, transport-delivery, retry-loops,
sweep-timer, formation-circularity and harness-fidelity. SQL/Raft durability of
the coordinator tables remains the existing authoritative gateway owner; a
SQLite gateway witness alone is not cross-host durability or the eight receipts.
