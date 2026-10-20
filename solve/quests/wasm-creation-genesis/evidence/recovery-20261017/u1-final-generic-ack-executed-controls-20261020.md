# U1 final generic ACK execution controls (2026-10-20)

Exact positive source/test SHA:
`be25caa5f0c3612feec662d4feaa9ba28f8f34df`.
Exact Git tree: `3ee5dafe4e862d101acf0def7766c78fc97655b2`.

**Positive evidence at that precise SHA**
- [Lab #513](https://github.com/psvensson/lagrange-lab/issues/513):
  PASS 1/1 static diagnostic, canonically refreshed/verified impact-graph
  seal, 2,413-test classifications, whole-U1 fast-static PASS against
  original base `381750de` (718 changed paths, 55 JavaScript paths).
- [Lab #514](https://github.com/psvensson/lagrange-lab/issues/514):
  PASS 15/15 focused files, 421 runner assertions on tv-dator.
- [Lab #515](https://github.com/psvensson/lagrange-lab/issues/515):
  PASS 23/23 compatibility files, 958 runner assertions on lenovo-laptop.

**Source-only negative controls.** Each mutation directly parents the
exact positive SHA above and changes exactly one source file, leaving all
test bytes unchanged:
- [Commit b590d4cb](https://github.com/psvensson/lagrange/commit/b590d4cb5bb34b6e09acd1089608ab2ead89418d):
  removes exact request identity checking for generic execution-gate joins.
  [Lab #517](https://github.com/psvensson/lagrange-lab/issues/517)
  RED as intended at
  `FOREIGN_REMOVE_WAS_ACKNOWLEDGED_WITH_NO_OUTCOME_OWNER`.
- [Commit 4c61a4ce](https://github.com/psvensson/lagrange/commit/4c61a4cef1ebf43fdd39ea45757b1dfd88b5669b):
  promises `IN_PROGRESS` from an unowned nameless `CREATING` memo.
  [Lab #518](https://github.com/psvensson/lagrange-lab/issues/518)
  RED as intended at
  `UNOWNED_CREATING_MEMO_ACKNOWLEDGED_WITHOUT_SCHEDULING_RECOVERY`.
  Original raw log excerpt is preserved at
  [evidence #520](https://github.com/psvensson/lagrange-lab/issues/520):
  received `in_progress`, expected `initiated`.

Both negative controls prove bounded wrong-acknowledgment
discrimination at the generic handler owner, **not** native physical
generation, distributed convergence, or independent source approval.

**Unfinished gates:** exact full changed-owner selector/corpus
([selector #521](https://github.com/psvensson/lagrange-lab/issues/521)
submitted), V4 wake/progress source-only discriminator, independent
source/oracle review, 55-item combined U1 acceptance, ordinary
publication hooks, and later U2/activation/main merge remain open.
No test was skipped and no source mutation is to be merged.
