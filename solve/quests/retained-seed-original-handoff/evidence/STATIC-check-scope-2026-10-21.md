---
audience: development
documentClass: current
---

# Canonical static check scope after capacity recovery

Parent: 51fa486bbf4640a45d96ecdb3230cdaff1366917. Production bytes are unchanged.
This test-only continuation invokes the existing package commands test:deps,
audit:impact-contracts and audit:shards exactly once each, sequentially, through
a CLI integration test admitted by the lab's canonical test-files route.
No manifest generator, automatic fix, install, shell, source rewrite, baseline
change, timeout relaxation or publication occurs. The full returned output is
retained in the lab log; invocation errors, signals and nonzero exits fail.
The wrapper is not a replacement for any canonical checker and does not make a
narrow test result full static/corpus certification. Applicable other gates and
independent review remain required. Raw failures must be classified against the
parent and their actual producer rather than presumed inherited.

This is WIP preservation only. All sealed receipt and acceptance bytes remain
unchanged. The new wrapper itself adds a test path, so generated classification
may legitimately report that addition along with earlier outstanding paths.
Run the metadata producers in an isolated checkout before any landing; never
edit their output by hand to conceal an unclassified test.
