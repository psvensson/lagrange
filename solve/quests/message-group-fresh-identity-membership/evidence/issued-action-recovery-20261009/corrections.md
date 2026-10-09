# Issued-action package corrections — 2026-10-09

Scope: F1–F4 in the attached adversarial package review. Original package SHA256
84d1695157be6bac82fccbf7c8ddcbfed0597956d60509767333de97a4b0a55b.
Original review archive SHA256
828462e72f58b63f7163fc8e11eeb3ec5601fadc64b120fb5b6368927c9513aa.
Base: 8ece20f70392314ceba49e4e787b800bc14d07d6. Source remains WIP,
not independently approved or an activation/main/release candidate.

The mutation checker now binds real structured node:test failures to the exact
named case, ERR_ASSERTION and assertion text. The original unrelated-failure
attack is rejected; a passing designated test is not negative proof. Output
paths cannot overwrite prior measurements. The checker separately rejects
setup errors and cancellations, and retains ordinary TAP plus structured data.

Every native-history fixture open asserts WAL/FULL. The reconstruction control
checks closed old SQLite resources, native-handle invalidity BEFORE reopening,
and a new connection/store over the same file. Handle-number reuse is legal.
Omitting WAL, close or reopen must fail a designated assertion. This is still
same-process reconstruction, not a process-kill or power-loss claim.

The diagnostic invokes the existing probe guard before creating output or
mutating source. Timeout stdout/stderr and a typed failed result are preserved;
finally restores source. The checker tests actual probe refusal and an actually
killed timeout child. Canonical dependencies are now the default; diagnostic
node:sqlite substitution requires an explicit option and records its limit.

RaftRsDurableStore now owns observeMembershipAction: it selects its group's
whole durable record in one read-only SQL transaction, refuses an already-open
transaction, and checks the evidence-specific suffix/frontier consistency.
The context module remains subordinate. Tests corrupt actual disposable SQLite
rows to exercise impossible progress, interior gaps and regressing terms. A
second real connection commits between record-table reads; the observer must
retain one snapshot, then refuse the newly corrupted record on a later read.
A snapshot-covered missing prefix is accepted but produces no invented receipt.
No schema, native proposal, cancellation/reissue, physical CREATE or operation-
repository phase transition is added. The production operation port is not
wired by this increment. Readiness and retention after compaction stay open.

A separate committed-learner-origin branch was discovered at f258bade6....
This corrective branch does not overwrite its workflow or implement a competing
permanent receipt ledger. Integrate the selected native/application/checkpoint
representation explicitly before enabling the operation's receipt update.

Original review.md describes the previous unpublished packet and remains
historical. This note records the correction; measured run/source identifiers
will be appended by the canonical evidence workflow. No prior rejection,
lab FAIL, duration gate or independent-review requirement is overridden.
