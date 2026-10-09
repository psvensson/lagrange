# Issued-action recovery: corrective implementation — 2026-10-09

Status: IMPLEMENTED AND DIAGNOSTICALLY MEASURED LOCALLY; NOT PUBLISHED, NOT
INDEPENDENTLY APPROVED, NOT WIRED INTO PRODUCTION MEMBERSHIP PERMISSIONS.

Base: `8ece20f70392314ceba49e4e787b800bc14d07d6` in psvensson/lagrange.
The user approved the prior package review's recommendations. This is the
finite corrective increment under message-group-fresh-identity-membership.
It does not change any sealed receipt, release scope or original lab verdict.

## Implemented changes

F1: `run-diagnostic.py` now consumes actual per-test Node events through a small
observation-only reporter. It matches the exact file, test name, failure type,
ERR_ASSERTION and assertion message; all expected tests and the final summary
must agree. A passing title, another failure, cancellation, skipped/todo result,
setup/import failure or timeout cannot earn the designated mutation credit.
The adversarial term-2 substitution again fails two OTHER tests while the
claimed malformed-record test passes. The corrected checker rejects that
attribution. It does not invalidate the original five genuine mutant results.

F3: the existing eight-case test asserts observed WAL/FULL on each connection.
It checks actual close/free and subsequent new connection/store acquisition,
then compares restored native term and durable record. Raw numeric handles
need not differ. Omitting close, omitting reopen and omitting WAL each fail the
specific engagement assertion. The diagnostic SQLite adapter now exposes the
engine's actual isOpen/isTransaction values, rather than its own booleans.
The fixture remains same-process reconstruction, not SIGKILL/power loss.

F4: the Python diagnostic asks the existing `probe-guard.js` owner before any
output creation, fixture execution or temporary source replacement. A marked
invocation refuses with the original source intact and no output directory.
TimeoutExpired retains both partial streams and an explicit timeout record;
source is restored. A controlled Node child tests that path, without lowering
any product test budget. Importing the Python checker starts no measurements.

F2: the existing RaftRsDurableStore now owns
`readMembershipActionEvidence(groupId, action, decodeEntry)`. It acquires its
own complete group record within one SQLite read transaction, rejects any
already-open transaction (caller, raw BEGIN or store-owned), and validates
the positional invariants required by the historical evidence read. It refuses
progress beyond the stored frontier, interior gaps and decreasing terms. A
persisted snapshot may replace the prefix; covered actions without retained
provenance remain UNRESOLVED. A complete post-snapshot suffix remains supported.
The pure context codec is not promoted to an arbitrary-record integrity oracle.

One test commits an actual second-connection writer between the SELECTs:
the first read stays on its old view, while the next read observes that commit.
Other cases damage actual fixture tables, exercise missing tables and decoder
failure, and prove that no DDL/writes/persistence-journal entries occur in the
read. Connection instrumentation and the second writer are restored/closed in
finally, including assertion failures. The old generic record read is unchanged.

This is the first implemented storage acquisition boundary for the next native
outcome read. It is NOT yet an actual semantic-port operation, a coherent
multi-group transaction, checkpoint provenance, operation-row receipt update,
noncommitment certificate, successor attempt or current CREATE permission.

## Measurements

- 8 original native-history cases: PASS, still exercising both original outcomes
  across leader replacement, wrong action, malformed data and snapshot cut.
- 9 new storage-owner read cases: PASS.
- 5 existing committed-entry reader cases: PASS.
- Combined native diagnostic: 22 passed, 0 failed/cancelled/skipped.
- 5 original codec mutations: correct assertion failures, source restored.
- 7 storage mutations: frontier, continuity, term order, read snapshot, active
  transaction, covered-prefix handling and group binding; designated assertions
  fail and restored positives pass.
- 7 proof-checker regression tests: PASS. This includes real unrelated-failure,
  omitted close/reopen/WAL, probe refusal and captured timeout cases; synthetic
  event edits separately test wrong-assertion/setup/cancellation rejection.
- Scoped source/test file-size guard: PASS. Four code files introduce no new
  oversized path. The existing global count remains 28/27 source, 21/21 test,
  identical to the compared base; a global green is not claimed.
- JavaScript/Python/shell syntax and 100-column checks: PASS.

The first checker attempt exposed two apparatus problems and remains retained:
asserting equality of native DB objects lost its nested assertion metadata when
Node serialized the error, and the Python timeout child did not start printing
inside the tiny apparatus window. Identity comparisons now assert booleans
(the SAME identity condition), preserving structured ERR_ASSERTION data. The
controlled timeout uses Node, whose actual partial output is observed. No
product timing, quorum, assertion semantics or durability level was weakened.

A capability-only source revert to the original store yields nine missing-method
failures. This is a missing-capability red, NOT nine existing production bugs.
The seven source mutations establish why the new checks matter independently.

## Canonical and publication limits

All native measurements use the disclosed node:sqlite adapter and historical
low-level Ready driver with the actual vendored Rust/WASM core. They are not
normal better-sqlite3, production runtime/Ready or distributed SQL/CDC proof.
Snapshot tests manipulate persisted store views, not real native snapshot
creation/install/compaction. The test fixture/callbacks are controlled inputs.

Normal dependencies are not available: an offline locked install failed
ENOTCACHED (and reported a locked native package's Node engine requirement).
The actual strict complexity/decision checks stopped on missing ESLint-related
packages. Lint, metadata generation, full static and canonical timing gates are
therefore NOT claimed. `run-canonical.sh` is a syntax-checked, unexecuted
measurement entry for the existing Actions/GCP route; it has no push, cloud
provisioning, permissions change or release action.

GitHub was read before and after work and still pointed at the base above.
The available connector has read/search/download actions, not a publisher or
workflow dispatch. The installed-plugin search found no alternate publisher;
ordinary CLI access still failed DNS resolution. No credentials were sought or
permissions expanded. No remote branch or Action changed in this increment.
The archive is a complete combined patch against the published base, not a
patch requiring the previous unpushed packet to have been applied first.

## Required next boundary

Run the normal dependency/static/generated checks, retain failure evidence and
publish through the existing expected-head route. No source approval is issued
by this author implementation or its local tests.

Then wire the native owner's bound group and native decoder to this store read
and complete the same owner interaction through application/checkpoint retained
provenance and exact conditional operation-row recording. The decisive test is
commit followed by interruption before the operation receipt write. Recovery
must recognize the original action without reissuing and preserve terminal debt.
A real snapshot/install/reopen with pruned action history is still required.

Only an independently established fenced/noncommitted predecessor can enable
an ordered successor attempt. UNRESOLVED does not grant sequence 2 or refreshed
native fences. A historical ADD must still satisfy current descriptor and exact
CREATE admission. Global boot/action semantics, original lab FAIL, restart
budget debt, independent review, off-seed proof and final-main certification
remain open. No additional workflow, ledger, queue or recovery coordinator was
introduced.
