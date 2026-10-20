# U1 1,898-file RED: finite comparative triage (2026-10-20)

This record is **not a new test or scheduling authority**. The ordinary
source/test/lifecycle ownership remains the Lagrange runner and the
rs-raft U1 acceptance checklist. **No main merge** and no automatic
test weakening are allowed.

## Current hard facts

- Exact candidate: `be25caa5f0c3612feec662d4feaa9ba28f8f34df`.
- Original sealed ancestor: `381750de29af647d446b19adedf1da53eb712093`.
- [GCP full selected cone run 39393585693](https://github.com/psvensson/lagrange/actions/runs/39393585693)
  executed **1,898/1,898** files using the unchanged classifier:
  **1,779 PASS, 119 FAIL, 76,425 assertions**. 21 classified batches
  accounted for every selected file. Complete red evidence is
  [artifact 12256004857](https://github.com/psvensson/lagrange/actions/runs/39393585693/artifacts/12256004857).
- All three GCP jobs reached terminal: initial wake **PASS**,
  selected corpus **FAIL**, physical VM stop/verify **PASS**.
  The cleanup log specifically records
  `GCP_CORPUS_CLEANUP_STATUS=TERMINATED`. No VM leak was observed
  in this run.
- The 119 exact filenames, without relying on parsed prose for
  failure attribution, are preserved in
  `verification/u1-20261020/gcp-corpus-119-red-files.txt`
  on `verify/u1-gcp-20261020`. This list belongs to the
  source-bound GCP run, not a new set of test definitions.

### Distribution of the 119 failed files

| Source test owner | Red files |
| --- | ---: |
| integration | 26 |
| partition | 21 |
| query | 18 |
| raft | 10 |
| rebalancer | 9 |
| bootstrap | 9 |
| node | 6 |
| scripts | 6 |
| control-plane | 4 |
| index-management | 2 |
| runtime | 2 |
| wasm-service | 2 |
| address | 1 |
| config | 1 |
| message-group | 1 |
| workflow | 1 |
| **Total** | **119** |

Treat these as failed *files*, not independently proven product defects.
Some emit cancelled nested TAP cases after an unresolved setup promise.
A timeout or setup cancellation must not become evidence of any
unexecuted assertion.

## Source-anchored inherited/red differential

The pre-U1 lab baselines proved 0/3 red Raft files
([#543](https://github.com/psvensson/lagrange-lab/issues/543)) and
6/7 red node/partition files
([#551](https://github.com/psvensson/lagrange-lab/issues/551)).
A single shared file name or RED status does not prove identical
underlying cause.

[The bounded GCP predecessor differential run 39405963549](https://github.com/psvensson/lagrange/actions/runs/39405963549)
was triggered, naming **exactly those 119 candidate-RED file names**
at original `381750de`. It records whether each path exists at
the predecessor and sends only existing files through that exact
predecessor's unchanged classified runner, with a finite GCP VM
lifecycle and evidence retention on either result. No hidden
test-loop retry or automatic corrective mutation was authorized.
**A running request is not terminal proof; final counts and reasons
must be read from the original Actions run before classification.**

The differential is evidence triage, not acceptance. Exact test
blobs, first expected assertion, timing, and source owner must be
reconciled before classifying any file:
1. **Same source/test bytes + same substantive failure:** inherited.
2. **Changed test bytes:** classify as oracle/expectation movement,
   never auto-suppress; require independent owner design interpretation.
3. **New failure on same test bytes:** potential regression;
   isolate the owner and prove a red-on-revert mechanism.
4. **Absent predecessor test file:** new coverage, no historical
   baseline; prove directly at final candidate with an original
   negative or lower-owner witness.
5. **Timeout/thermal/unknown:** not a clean PASS nor an automatic
   product failure. Preserve the unresolved resource boundary and
   read first relevant diagnostic before deciding on a rerun.

No change should expand U1's sealed acceptance scope to fix
unrelated baseline red files. Unrelated inherited debt remains visible
for the release gate and its owning epic.

## Separate V4 closure and remaining obligations

[Actions V4 pair 39405150063](https://github.com/psvensson/lagrange/actions/runs/39405150063)
is **PASS/meaningful source-only RED**: the original C6 named
ordinary HELD J wake test ran **1 PASS, 0 FAIL** on original U1
production bytes; the direct child one-source mutation of
`memo.wakePending=true` ran **1 FAIL** with
`ORDINARY_J_WAKE_WAS_LOST_BEHIND_F`. Other neighboring
integration cases were not executed. This **closes the bounded
V4 lost-wake discriminator**, not every V4 liveness or
physical generation assertion.

[Topology dry-run 39404974119](https://github.com/psvensson/lagrange/actions/runs/39404974119)
confirmed the eight canonical physical GCP scenarios can be planned;
it provisioned **zero** VMs. Do not spend on live multi-host
topology until deterministic RED first causes are classified and
the right owner fixes are independently reviewed.

Still OPEN: distinguish 119 RED file causes, complete original
55-item U1 review and independent final source/oracle approval,
native physical/distributed scenario witnesses, U2 and activation
dependency, ordinary publication and main merge.
