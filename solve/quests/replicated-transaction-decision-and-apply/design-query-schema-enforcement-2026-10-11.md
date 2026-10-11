# Query schema enforcement at control-cohort release

Status: accepted by root owner on 2026-10-11 before composed implementation.
Acceptance binds proposal SHA256
`1296cace40a7cf6e432b9c363db0dd477c6943dd77bfd34d5fc875b4e8432d4d` and
the accepted settlement interaction. No new command, ledger, wire version,
global hold or receipt change. Implementation and proof still require
author-distinct independent review.

## Distinct preconditions

The fresh bootstrap schema already contains nullable `participant_set_text`
and the immutable decision columns. Its empty census can be read and drained
before origin. No trigger is required to read that census while the actual
cohort's mutation admission is closed and admitted proposals/suffixes drained.

A supported old table without those columns cannot contain a valid retained
manifest. It is an incompatible schema, not an empty manifest. Existing rows
remain unknown legacy obligations. Their release requires the outstanding
legacy exclusion/discharge protocol; this refinement does not supply one.
The new recovery algorithm is never invoked against absent manifest columns.
Thus origin is not used to make pre-origin recovery possible.

An empty supported old table can prove actual empty census under the closed
cohort, using its actual rows and schema. That is a narrow query-owner schema
classification (`empty_legacy_schema`), not general `clear`: it authorizes only
fixed nullable schema installation after all local legacy/session/proposal
debt has drained. No old row receives `[]` or any inferred participant set.

## Exact ordering

1. The release owner closes the actual sql_transactions cohort, drains
   admitted ordinary proposals and uncertain durable suffixes, and measures
   its current membership/generation/build and local participant/session debt.
2. Query census measures actual schema and all rows. Fresh/current complete
   manifests settle through the fixed lane and actual participant replies.
   Missing columns with any row, NULL/malformed manifests, failed reads or
   unavailable participant answers remain held. Empty old schema is the
   narrow migration eligibility above. Existing origin does not waive this.
3. The same live release invocation proposes the existing pinned generation
   origin command. If origin is already present but the fixed enforcer is
   absent, it proposes a new log entry with the same pinned origin identity.
   This requires the step-1/2 current cohort proof. A prior origin answer or
   command-cache hit alone does not certify schema enforcement.
4. Committed origin apply calls the query owner's fixed schema installer on
   the actual sql_transactions database inside the existing application
   transaction. Missing coordinator columns are added nullable (never
   backfilled); the fixed insertion enforcer is installed. On an existing
   origin, preserve its original origin index/term and write generation.
   First origin retains its current semantics. Unexpected schema/storage
   failure rolls back origin/schema/outcome/applied-index together.
5. Every replica's actual post-apply census verifies exact required columns
   and exact trigger SQL, plus the same cohort/build and original origin.
   Reopen only after this current proof. Dependent group release consumes the
   reconstructed current control-owner fact and its own local drain.

## Fixed enforcer and migration paths

The owner exports fixed SQLite trigger SQL, installation and read-only
verification. BEFORE INSERT requires a canonical newly minted transaction
identity, nonempty session, valid epoch/deadline, known transaction mode,
ACTIVE/OPEN/NOT_SELECTED/count0, exact `[]`, and all decision fields NULL.
INSERT OR REPLACE may not replace an existing transaction identity. This
checks actual NEW row values, including INSERT SELECT/UPSERT/REPLACE paths;
no caller label, arbitrary SQL or permission field is accepted.

The statement owner currently rejects CREATE/DROP TRIGGER on ordinary and
committed paths, but its MIGRATION path admits ALTER TABLE. The interaction
must refuse caller-directed ALTER of the coordinator ledger after origin;
only its fixed versioned schema owner may change that protected contract.
Other tables' schema migrations retain existing behavior.

Source admission and committed ordinary SQL apply both verify the exact
installed owner enforcer after origin before a coordinator-table write.
Missing/altered trigger or protected schema is a typed refusal. Final census
uses the same owner verifier. No boolean schema marker becomes authority.
The fixed settlement helper separately validates actual lineage and only
performs its approved fixed CAS; it cannot insert a row or restore `[]`.

## Duplicate paths requiring explicit change

`enableParticipantTransactionAdmission` currently returns immediately for a
recorded origin. It may take that shortcut only when the actual enforcer is
already verified; otherwise the release invocation must satisfy the same
drain before a new proposal. `applyGenerationOrigin` currently returns before
mutation when origin exists: fixed schema reconciliation precedes that
return, without changing origin or g. Any retained command-outcome shortcut
must likewise not claim enforcer completion without current verification.

## Proof obligations

- Fresh empty, empty old schema, old schema with rows, NULL terminal hints,
  current complete rows, and existing-origin missing-enforcer schedules.
- Real SQL old INSERT/INSERT SELECT/REPLACE/UPSERT refusal after install on
  every replica; canonical BEGIN positive; pre-pause insert included in drain.
- Duplicate new entry preserves original origin/g; lost answer/restart reads
  current enforcement; same entry outcome never invents installation.
- Source check then enforcer removed before apply: committed apply refuses;
  protected ALTER and CREATE/DROP TRIGGER never remove enforcement.
- Installer/enforcer/outcome/applied-index fault rolls the full transaction
  back. Existing NULL rows stay byte-for-byte unchanged.

Self-participation is separately refused before a new BEGIN at the actual
sql_transactions participant owner, using the query owner's shared predicate.
Accepted PREPARED settlement remains available. This prevents a coordinator
from reserving the same partition it must update to record its decision.
