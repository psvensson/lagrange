---
audience: development
documentClass: evidence
---

# Construction audit measurement

Date: 2026-10-21. Unit: `decision-audit-dependency-construction`.
This record describes an audit correction, not a runtime or release verdict.
The isolated execution base was
`92ae06ef40df6610cb2163edd7d6476cd65bb3ef`.

## Engaged old-classifier evidence

Both runs used the canonical lab API (`labTestCommit`, the classified test
planner and `runLabTest`), machine-wide locking on `lenovo-laptop`, and
`LAGRANGE_RETRY_FAILED_ONCE=0`. No test deadline was increased. The exact
committed test tree was sent through the normal lab bundle and runner.

| Commit | Test SHA256 prefix | Cases | Leaf assertions | Result |
| --- | --- | --- | --- | --- |
| `96741ee014f2ca441b8d93ef3e894b310bcd0549` | `540ca8f5` | 43 pass, 3 fail | 95 pass, 3 fail | Intended red |
| `f0084d02ac421ea85f36be3de28eaf29dc49b019` | `49895c1c` | 44 pass, 3 fail | 96 pass, 3 fail | Intended red |

Only the three construction positives failed: the actual bridge acquisition,
equivalent renamed construction/publication, and constructor/type labels.
Existing tests, injected-read pairs, adversarial reads and the later added
delegated-policy control passed. The runner totals of 144 and 146 assertions
include the 46 and 47 subtest results respectively. The raw controller TAP,
input, result and copied per-file ledger are preserved in the corresponding
`baseline-*` evidence directories. Setup failures are not counted as this red.

The second witness adds one independently requested control without changing
any earlier assertion. Its full frozen SHA256 is
`49895c1c463bc91c52233767b4bcd684941e594a7d4021b39d90de5ed8474f18`.
The old classifier was verified byte-identical between both baseline commits.
Both commits were preserved on the non-main branch and their remote SHA was
checked. This is not publication or main-merge proof.

## Census and scope

The complete initial collector census scans `src` and `scripts`: 2,260 files,
791 raw findings, 753 matched inherited findings and 38 unresolved findings.
The canonical default collector has the same scope and counts on this base.
These counts must not be confused with a runtime-only scan on another branch.

An intermediate broader label predicate removed ten mixed-source identities.
The author and independent reviewer rejected its omission of conservative
delegated fallback-policy evidence. That intermediate census remains in
`after/`; the narrower census remains in `after-narrowed/`.

The final implementation census in `after-final/` scans 2,261 files, including
the new helper. It has 790 raw findings, 753 inherited findings and 37
unresolved findings. The full multiset delta contains exactly one removal:

`src/bootstrap/owners/seed-runtime-bridge-owner.js`,
`acquireSqlQueryEngine`, `mixed_cache_and_sql_decision`.

Every other finding identity and count is unchanged, including all other
decision kinds. The baseline file remains byte-identical (SHA256
`f38ebcf505e7c73ac57c59184f2a0a4005d32d9b46614c7ffbf84c5fe786eebf`).
Final source hashes and the complete identity delta are recorded in
`after-final/delta.json`.

## Gates and remaining work

`gates-final/results.json` records passing lint, strict scoped complexity for
the new helper and frozen test, scoped literal/decision/ambient/silent-catch
audits and impact-contract validation. Earlier introduced helper violations
were corrected with named AST constants and module-load intrinsic captures;
the failed reports remain in `gates-candidate/`.

The full decision-boundary gate exits 1 with 37 existing unresolved findings.
The main checker also retains five pre-existing cyclomatic and one cognitive
complexity violations in unchanged functions. No full-static clean result is
claimed and no baseline was increased. Exact independent implementation
review, candidate lab measurement and final evidence reconciliation remain
pending at this record's creation.

The proof is a bounded syntactic classifier correction. It does not prove
arbitrary JavaScript constructor/setter effects, proxies, dynamically installed
code, runtime cache/SQL correctness or any rs-raft acceptance. Unsupported
bindings and field uses remain conservative evidence. Object-key omission is
limited to direct constructor-option objects, with descendants still scanned.
