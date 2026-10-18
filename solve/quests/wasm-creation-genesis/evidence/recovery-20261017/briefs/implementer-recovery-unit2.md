# Implementer brief, recovery stage UNIT 2: the unconfirmed grant, the bounded window, the C9 child process (DRAFT: launch after unit 1 is verified)

Role, rules, worktree, binding texts: as `implementer-recovery-unit1.md`
(same lane worktree; unit 1's changes are then present, verified; read the
unit-1 report and its verifier verdict first). Design clauses of this unit:
R1-C (as superseded by R2-B, R2-C, R2-D, R3-A, R4-A, R4-C, R5-A), R1-F,
R1-I/R2-H/R3-G/R4 proof rows P-R2, P-R3, P-R3b-h, P-R4 (owner reachable
variant already in unit 1), P-R10, P-R15 (ledger half).

A. **Manager pass-through (R2-B).** `resolveRetainedAdmission`: owner
   UNAVAILABLE (readState UNAVAILABLE or a thrown owner read, one catch) ->
   `ADMISSION_RETAINED` with `phase: UNAVAILABLE`; no new outcome value;
   `continueRetainedCreation` continues on it.
B. **Opening module decides (R2-B, R2-C).** `resolveWasmCreationAdmission`:
   its own owner read; UNAVAILABLE -> by-path local answer (unit 1's reader):
   PUBLISHED -> metadata phase `GRANT_UNCONFIRMED`, the claim is NOT skipped
   (journal read), open RETAINED; ADMITTED -> open RETAINED, HELD (bootstrap
   recovery, no serving); ABSENT_UNCLAIMED -> typed UNAVAILABLE refusal
   (deferral); ABSENT_CLAIMED -> CREATION_STORAGE_MISSING; RETIRED ->
   CREATION_RETIRED; CORRUPT_STATE/CONTENT_CONFLICT their codes. Owner
   reachable: D2' unchanged except metadata ADMITTED + local PUBLISHED ->
   refused CORRUPT_STATE (supersedes D2' :451-452 / `openServingState :54-58`).
C. **Serving state (R1-C 3).** `openServingState(PUBLISHED, GRANT_UNCONFIRMED)`
   -> SERVING with `grantConfirmation: UNCONFIRMED`; the writer of CONFIRMED
   is the publication run on GRANTED (lifecycle grant CAS answered PUBLISHED)
   plus the per-instance "confirmed in this process" latch consulted by
   `admitsNativeWake` (R2-D, R4-A).
D. **Lifecycle answer + confirmation (R1-C 4-6, R4-C).** `boundStartResult`
   answers the new `CONSENSUS_BOOTSTRAP.PUBLISHED_UNCONFIRMED` for a serving
   instance with UNCONFIRMED grant; `confirmPublishedAuthority` consumes it
   (CONFIRMED -> the PUBLISHED path; CONTRADICTED -> existing retire by
   creation; UNRESOLVED-with-UNAVAILABLE -> `PUBLISHED_UNCONFIRMED` for every
   serving answer incl. PUBLISHED_UNPROJECTED (N21); other UNRESOLVED reasons
   keep `UNKNOWN{reason}`); the handler maps `PUBLISHED_UNCONFIRMED` to the
   HELD decision (memo HELD, CREATE_HELD).
E. **The release path and its bound (R1-C 7, R3-A, R4-A, R5-A).**
   Subscriptions stay bound after a RETAINED reopen until the first confirming
   run (the `publish :98` suppression lifted for RETAINED reopens; exactly ONE
   OBSERVED wake, then unbind); APPLIED_PROGRESS filtered only once genesis is
   OBSERVED in this process; every K-th APPLIED_PROGRESS admitted for every
   instance whose genesis is OBSERVED and whose last grant attempt answered
   UNAVAILABLE (K = `UNCONFIRMED_RECONFIRM_EVERY_WRITES` at the reconciliation
   owner, per-instance in-process counter, value chosen and named with its
   reason, N16); formation events admitted as before; the handler RECORDS
   every GRANT_HELD wake with `grant.outcome === UNAVAILABLE` for any memo with
   no immediate re-entry and no `wakePending` (unit 1 made the pending-wake
   rule key on reason AND detail; verify).
F. **Embedding (R1-F, R2-H).** Owner fault modes at the metadata gateway
   (UNAVAILABLE, RELEASING, CLOSED, ADMITTED-with-local-PUBLISHED); the
   `restartHost` boot-incarnation bump (unit 1) is asserted by P-R2's endpoint
   row incarnation.
G. **C9 child process (R1-I P-R10, R2-H, D-R10).** A harness script the
   fixture owns runs ALL THREE hosts in a child `node` process over a
   FILE-BACKED shared component DB (`createCreationSqliteFixture` with a
   `databasePath`), reaches local PUBLISHED on one host (a durable observable
   the parent reads through a second connection), is SIGKILLed (recorded);
   the parent restarts ALL THREE directories, re-forms, then asserts the
   killed host's same B, old INIT refused, serving confirmed; labelled
   "actual child process evidence"; precedent
   `replica-lifecycle-durable-generation.test.js:90-105`. P-R15's ledger half:
   a failed startup cleanup keeps the lock through the ledger path (labelled).

Witnesses (red first; `bound-creation-restart.integration.test.js` + owner
units): P-R2 (re-entry before re-formation -> HELD -> one OBSERVED wake ->
ACTIVE; endpoint row at the new incarnation; INIT count unchanged), P-R3
(UNCONFIRMED serving; owner back within K writes -> CONFIRMED -> ACTIVE
without explicit re-entry), P-R3b (UNAVAILABLE + local ADMITTED -> HELD
reopen; + ABSENT -> deferral), P-R3c (N writes, owner down -> ceil(N/K) runs,
zero re-entries), P-R3d (CONTRADICTED at confirm -> retire by creation),
P-R3e (completing APPLIED_PROGRESS admitted while genesis unobserved), P-R3f
(two HELD followers beside a serving-unconfirmed leader), P-R3g (quiet group:
no confirmation until the explicit re-entry), P-R3h (UNRESOLVED at confirm
on a serving answer -> PUBLISHED_UNCONFIRMED), P6a `:550/:553` superseded by
appending with a census of every SERVING-open subscription assertion, P-R10,
P-R15 ledger half. Mutations from the design (TENTATIVE as a new outcome;
claim skipped; UNCONFIRMED for ADMITTED; UNCONFIRMED treated as CONFIRMED;
subscriptions unbound at reopen / wake suppressed; K-th trigger removed;
filter removed; filter before genesis observed; K-th bound on serving only;
RECORDED on serving only). Statics as unit 1; cone -> `reports/lab-selection-recovery-u2.txt`;
report -> `reports/implementer-recovery-u2-report.md`. Must-not lists of
units 1 and 2 bind. Never claim "done".
