---
audience: development
documentClass: current
---

# Exact-handler fixture custody

This test-only child of raft-rs-full-cutover preserves the historical fixture
obligation separately from seed-release-failure-custody. The live PR and
source assessment is in that Quest's
[fixture reuse assessment](../seed-release-failure-custody/evidence/fixture-reuse-assessment-2026-10-21.md).

The positive address and demux fixtures currently cannot answer exact handler
identity. Reuse their existing PR139 Map-backed adapters and preserve their
behavioral assertions. The negative fixture must continue to lack identity
at its first retirement: its current success expectations contradict the
typed refusal already required by the production owner.

For each negative child, the operation is: ordinary shutdown or retirement
trigger; captured handler plus current transport identity capability;
refusal without destructive removal; retained handler/resource obligation;
same-owner retry after the fixture supplies genuine exact identity;
successful retirement and resource close; fixture storage release. There is
no durable product mutation in this change. The native database and its
ordinary lifecycle owner retain all product persistence obligations.

Capture the WASM database object after actual initialization. The initial
shutdown must reject with REFUSED_NO_IDENTITY, leave that same DB open and
the replica in CLEANUP_REQUIRED, and report the retained handler. Restore
exact identity methods over the same registration Map, retry the same
replica's shutdown, then observe the original DB closed, the replica DB
discharged, handler retired and STOPPED. Delete the directory only after
successful closure. Teardown must preserve an earlier thrown primary error;
if cleanup also fails, aggregate both. TAP assertion failures remain failures.

Required proof is preserved original red, independent amended fixture
review, same-host exact-candidate positives, a targeted custody negative,
applicable bounded owner audits and generated metadata. Existing exact
identity/successor controls remain. No production edit is planned. PR139's
generated seal and historical green do not prove this current composition.
