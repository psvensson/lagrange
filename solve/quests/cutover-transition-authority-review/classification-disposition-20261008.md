# C0 classification disposition after operator J1 decision

Status: OPEN, submitted for exact-head independent review. This document is
not runtime acceptance. Product source remains
82b54ef9b7c8d6be9f2d6450cbc5e6713ade00af. The terminal and strengthened crash
witnesses were measured on ae20b6601ca27bcab7758840bc4830945558b524.

## Current receipt truth

The authoritative current status is [evidence/receipt.json](evidence/receipt.json):
workflow/restart classification and deterministic measurement are true;
replacement/source-target classification, snapshot classification and the
independent-review receipt are FALSE. Review 5454259637 rejected premature
completion of the two classifications. Review 5454504761 resolves its two
substantive findings but identifies stale disposition/review-request text;
it is not an explicit category-complete approval. Neither review is converted
into approval by this document.

The following exact contracts answer those findings and await acceptance:
- [Exact promotion authorization](exact-promotion-authorization-contract.md).
- [Exact snapshot transition owners](exact-snapshot-transition-owners.md).

The PR review request must name its then-current pushed head, checked against
the remote immediately before requesting review. Historical attempt `at`
values identify those recorded attempts, not the head of a future review.
Do not rewrite old logs or historical reviews to manufacture exact-head proof.
A changed review packet needs a new review; a request alone is not approval.

## Operator-selected policy and actual durable authorization

[The operator decision](operator-decision-20261008-j1.md) selects forward
recovery once promotion of the exact fresh target T is durably authorized.
No automatic target rollback follows that boundary. Before it, failed-learner
removal must definitively resolve/fence outstanding ADD/PROMOTE work.
Successful replacement removes old source S, not T. Membership subject,
executing-runtime incarnation, target progress incarnation and physical
CREATE/cleanup generation remain separate identity dimensions.

The exact promotion contract specifies one conditional operation-row commit
from the exact committed learner basis to PROMOTE-in-flight phase/permit.
It names the canonical repository, live owner lease, immutable O/S/T tuple,
prior phase/permit/stamp, nonterminal predicate, mutually exclusive abort CAS,
monotonic direction and unknown-result recovery. The row commit precedes the
separate membership-Raft commit. Missing permit code is implementation work,
not a claim that the integrated product already performs this transaction.

Irrecoverable promoted-target loss retains the exact obligation and exposes
an explicit operator-required blocker. This is not itself a complete operator
repair mechanism, and no original FreshMG failure control is weakened.

## Workflow classification and terminal obligation

The actual commit is repository.persistOperationUpdate under the existing
operation transition lane. The earlier callback validates the local mirror;
it does not execute the SQL write. The existing publication fence owns prefix
freshness. Workflow mirrors and operation_progress are disposable projections.

Run 37751962572 passed six real-repository/file-backed SQLite SIGKILL/reopen
cases, with assertions for the named cut, actual update count, writer-visible
row, open transaction, local committed marker and SQLITE_READONLY. Run
37751962637 passed terminal ordinary owner entrypoints without the earlier
terminal prefilter: exact membership debt survives reopen and a competing
operation loses the unique group lane. No physical/transport call occurred.

armCoordinatorCreatedOperation may return true for a terminal-record effect;
that is not a dispatch grant. Its measured projection is terminal with
dispatched=false; observed-progress skips the terminal row. The original
37751224863 assertion error is retained as a harness error, not a runtime fix.

These fixtures replace distributed SQL/Raft with file-backed SQLite and
supply admitted membership history. They do not prove power-loss safety,
changing remote leases, full startup or actual promotion/CREATE. Resuming
membership debt is missing FreshMG product work; the ordinary terminal record
path must not erase debt or pretend to execute that missing driver.

## Snapshot classification at concrete existing boundaries

Read exact-snapshot-transition-owners.md for the method-by-method table, not
just the four gate labels. LOCAL_OPEN, KNOWN_WIPE, INSTALL_ADMISSION and
READ_UNAVAILABLE remain separate. The table identifies current boot/lifecycle,
checkpoint/transfer, CREATE installer, native Ready and application transaction
methods, their real durable records, commit points and restart paths.

The missing intact-import interaction is assigned to the existing
raft-rs-application-transaction-owner boundary: application image, accepted
native Ready and exact local generation must commit coherently without a
nested independently synced persistReady transaction or a counterfeit CREATE
grant. Missing callback consumption and shutdown-before-refusal behavior are
recorded product gaps. Legacy-image refusal and fresh-learner components do
not establish successful intact application catch-up.

## Next product unit and review ceiling

After bounded contract review, resume the existing
message-group-fresh-identity-membership Quest with all eight receipts intact.
The first implementation is its repository/runtime authorization interaction,
then the actual CREATE claim/worker path. Do not unpark planner or handler
merely to turn an incomplete positive fixture green. No new progress ledger,
queue, generic workflow, or caller-selected recovery permission is needed.

C0 classifies and discriminates; it forbids runtime repairs. A concrete missing
implementation is assigned to its product Quest; UNKNOWN authority still
blocks C0. The two exact contract responses require review before their
receipts change. C0 terminal landing, source approval, physical off-seed proof,
cutover completion and A1-v13 compatibility remain separate gates.
