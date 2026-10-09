# Canonical package corrections and handoff — 2026-10-09

Status: implemented, canonically measured and published as bounded WIP.
Author implementation/self-review, not independent approval, Solver landing,
FreshMG closure, main integration or release certification.

Original reviewed product: `8ece20f70392314ceba49e4e787b800bc14d07d6`.
Initial corrective source: `8bb15433c15d28626b36e016176aabcfe8b0d766`.
Final source and mutation-target correction:
`550da8777bebed5cf6929f1f7034e5d86bfe80f8`.
Evidence-bearing published head:
`83425904621c1575c5c1d2910d3e04b68e2dd0d0`.
This document adds no code to that measured source.
Branch: `work/issued-action-recovery-corrections-20261009`.

## Completed review recommendations

### F1 — negative proof must identify the actual failure

The diagnostic now consumes structured node:test events alongside ordinary
TAP. A mutation requires the exact designated failed test, ERR_ASSERTION and
its assertion message in that test's error/cause chain. Wrong test surfaces,
setup failures, cancelled or skipped tests cannot satisfy it. The previously
successful false-positive attack now fails the checker: historical-term tests
fail while the designated malformed-record test passes. This is exercised
with actual native-test outcomes, not fabricated mutation success.

### F2 — coherent record acquisition has an existing owner

RaftRsDurableStore.observeMembershipAction acquires its requested group's
record through its own connection in one read-only SQL transaction. It
refuses a caller's already-open transaction, so uncommitted local writes do
not become durable evidence. The context codec remains subordinate and is
explicitly not a complete verifier of arbitrary caller-provided records.

The store checks the receipt-specific acquisition envelope: snapshot <=
applied <= committed, no committed frontier beyond covered/retained history,
contiguous post-snapshot indices, and nonregressing terms no greater than the
current term. A legitimate snapshot-covered missing prefix is allowed, but
does not manufacture the absent action provenance. This is not a second Raft
protocol, disk-authenticity checker, or check of every identity/ConfState rule.

Eight store cases use actual disposable SQLite rows and the existing native
fixture. Corrupt progress, an interior gap and regressing terms refuse. A
second actual connection commits between hard-state and later table reads;
the observer retains the old coherent snapshot, then refuses the corrupt
record on its next invocation. Record bytes and total_changes prove that the
observer itself does not write. A wrong group cannot borrow the first group's
receipt; wrong action remains unresolved. Actual same-file reconstruction
recovers identical historical evidence.

### F3 — reconstruction and persistence settings must actually engage

The eight original history cases remain. Every default history-fixture open
checks its observed WAL journal and FULL synchronization. Reconstruction
checks that the old SQLite connection is closed and the native handle is
invalid before reopening, then checks fresh connection/store objects over
the same file. Numeric native handles are allowed to be reused. Removing WAL,
close or reopen now fails a named assertion. This is same-process resource
reconstruction, not an OS/process-loss or power-failure claim.

### F4 — diagnostic safety and evidence retention

Both diagnostic entrypoints invoke the repository's existing probe guard
before output creation or source mutation. An actual LAGRANGE_PROBE=1 launch
refuses without creating its output directory or changing source. A real
killed child retains stdout/stderr and an explicit timeout result; the source
restoration finally block is exercised by an actual timeout during mutation.
Existing evidence filenames cannot be overwritten. Normal dependencies are
the default; the original node:sqlite adapter now requires an explicit flag.

## Canonical execution and remaining limits

Actions 37899510376 reproduced the correction using the normal locked
better-sqlite3 dependency and actual vendored core, without the diagnostic
loader. Its archive exposed one new raw zero-string literal reported by the
literal checker even though JSON-mode execution returned zero. Functional,
mutation and strict-complexity results from that run remain valid; the command
exit did not establish literal-audit success.

The followup uses the existing RAFT_RS_ZERO_INDEX constant and explicitly
requires the decision, grammar and literal reports' totalViolationCount to be
zero. It does not raise a baseline, ignore a finding or rewrite the first run.
The original canonical archive is nested, byte-identical, in the final proof.

Actions **37900322515** completed successfully with Node 22, canonical locked
dependencies and the existing one-worker cap on GitHub-hosted Ubuntu.

| File | Reported assertions | Before commit / exact commit ms |
| --- | ---: | ---: |
| issued-action-recovery.test.js | 8 | 366 / 362 |
| durable-store-membership-action.test.js | 8 | 369 / 389 |
| durable-store-committed-entries.test.js | 5 | 156 / 155 |
| message-group-learner-runtime-authorization.integration.test.js | 26 | 2054 / same tested source bytes |

Each unit file remains below 2000 ms; the integration file remains below
30000 ms. Total distinct reported assertions in this focused selection: 47.
The latter integration measurement precedes the commit of unchanged tested
source plus Quest log; it was not separately rerun after that commit.

Both source files and both new test files pass strict cyclomatic/cognitive
checks. Scoped decision, grammar and literal reports are all zero. Lint and
regenerated metadata/shard checks pass. This is not a complete static suite,
full shared-helper/change-cone gate, or repair of prior restart timing debt.

Thirteen deliberate source/omission mutations fail the required assertion.
Four restored positive executions plus those thirteen make seventeen retained
mutation-run measurements. Six additional checker controls pass: unrelated
failure rejection, setup rejection, cancellation rejection, probe refusal,
timeout-output preservation and restoration after a mutated timeout.

The native histories still use the historical low-level Ready test driver,
not the actual registered production operation-port/receipt route. Snapshot
coverage is exercised at the durable-store boundary, not by a physical native
snapshot installation. No real process-kill, multi-host SQL/CDC, currentness,
ordered reissue, repository phase recording or CREATE acceptance is claimed.

## Integrity and publication

The three-part transfer was decoded only after checking the complete patch
SHA256 b7c4cff4f3e34c588ce8cd72d08d0b42f4e77ed8d8c9ba0ae5828268c81ae36b.
Identified transcription insertions were corrected in transfer encoding;
the decoded input exactly matched the locally prepared patch before applying.
No unknown bytes were executed. Transfer details are retained in the first
archive, not omitted from provenance.

Downloaded Actions 37899510376 archive:
6fabcc612f005005f4fc747c13f3463af8e7d2881c102c4de669dacef96f1375.
All 191 named manifest members were independently rehashed.
Downloaded Actions 37900322515 archive:
da71a04a804606c6342c71876811de90123cadfcb9113ab8e27a159436f1cda3.
All 152 named manifest members were independently rehashed.
The nested earlier canonical ZIP rehashes to
b24ef22afe37c945d37800401cbd5d52c85eb5b2fa0f3fc7d6a28b0e1d67c42a.
Final canonical Solver ZIP:
044953a236b98ba467c61092e1e07bf6de580445af331bb02b21606dc41fb482.
The upload is recorded by Solver. No separate download of that final distinct
canonical ZIP is claimed. Both final measured checkout statuses are empty;
normal non-force pushes checked expected-before and exact-after remote heads.

The input package and review archives remain identified by their hashes in
corrections.md. This claim covers new canonical correction evidence, not an
unperformed GitHub upload of the original user ZIPs. The original review.md
is intentionally preserved as historical, not silently updated to new claims.

## Next production boundary — avoid competing receipt paths

An existing origin/checkpoint continuation was found at
`work/freshmg-committed-learner-origin-20261009`, contract commit
`f258bade6dedde2b10b6c73d035f2b942b493b5e`. Its operations workflow and branch
were not changed. The corrective scanner/store reader must not be registered
as a parallel fallback beside permanent committed-origin observation.

Reconcile through that existing native/application/checkpoint owner:
1. Record original action provenance atomically with committed application.
2. Recover it when the reply or native lifetime is lost, without reproposal.
3. Preserve and verify provenance across actual checkpoint/install/reopen when
   the source log entry is absent.
4. Bind conditional replica_operations recording to the exact original action
   and current holder, retaining ordinary-terminal membership debt.
5. Only then address ordered successor attempts and current CREATE eligibility.

Transfer the false-positive-proof tests and coherent-acquisition obligations
into that owner-path witness; select one production representation explicitly.
No merge of this WIP or speculative log-scan retry loop is authorized here.
PR109, main, salvage refs, the existing full lab FAIL and duration/global-boot
findings remain unchanged. Exact-main cutover and A1-v13 gates stay blocked.
