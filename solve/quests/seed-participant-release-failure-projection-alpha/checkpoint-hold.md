# Diagnostic checkpoint: OPEN / HOLD

This is a non-main WIP preservation checkpoint, not Quest landing or merge approval.
The diagnostic implementation and bounded evidence are independently approved;
10 of 11 receipts are supported. The static receipt remains false. Startup repair
is a separate unresolved owner investigation.

## Exact executed inputs

- Base integration: `a3b5c63451c3cf968b3d7ec807a0381261d4b61f`.
- V2 candidate: `3231b1311ad79fb933d059877c97fc296b951e5d`, tree
  `b3adccaa73f0bb401144a7e212916446ec370d44`.
- Same-test source-only control: `38b43ed7167435fc22dd4e95dc1d519cf06c64bd`,
  tree `a17d32d6ec67e5835126fa7848a6f116b41309b8`.
- Ten production/test/registry/generated file hashes:
  `evidence/frozen-implementation-v2-hashes.json`.
- Audited78-artifact manifest: `evidence/paired-result-v2.json`, SHA256
  `f384ac8e64005fbcc6e4b1240c7fb7ce9940f38a1243848d21a3a0554dd1d38a`.

The WIP commit adds evidence/receipt/log documentation after measurement. Its ten
non-Quest changed files are byte-identical to the executed V2 input; the eventual
checkpoint commit is not falsely presented as the SHA executed by the lab.

## Measured and reviewed

Five locked physical lab hosts measured20 candidate files. Eighteen pass with225
runner assertions, including native recovery, transaction application, admission,
runtime and diagnostic witnesses. The two startup files remain red with58 runner
assertions. Bootstrap raw TAP has49 leaves:43 pass,6 fail (three seed failures and
three downstream HTTP503 failures). Claim-cache fails in seed setup before its
intended T1 bodies. No executed-file retry, runner timeout, skip or cancellation
is reported. Actual startup budget exhaustion remains a system failure.

The two diagnostic controls use identical test bytes on the same hosts. Seven
older protocol cases pass; six new diagnostic groups fail after owner behavior
engages. They are meaningful behavioral controls, not import/setup failures.
Source and evidence reviews are retained separately, including historical V1
rejections and the V2 correction. The initial all-false receipt is retained.

## Unresolved gates and next question

- Static gates retain two Facts/Pause/Contract cycles, test clone excess46 lines,
  eight scoped literal findings and existing retry/complexity debt. No baseline
  was raised. No full-corpus green or exact-main certification is claimed.
- Two dependent startup DRAIN_PENDING answers fit the final post-ENABLE census
  branch by source elimination. Their exact rejected work fields are not retained.
- Native public write completion waits through the Ready drain and registered
  pending-outcome cleanup. A private early commit notification does not establish
  that ENABLE returns early. Do not repair based on that unproved mechanism.
- Next measurement must identify the exact canonical rejected member/work tuple
  in the real startup workload. Preserve owner authority, observation ordering,
  the one shared budget and retry policy. No OPEN shortcut or local wait follows
  from current evidence.
- Broader TX1/C2/recovery, FreshMG, snapshots/CDC, runtime, integration and full
  release acceptance gates remain open as recorded in the parent checkpoint.

## Operator continuation boundary

Continue toward rs-raft main readiness. At work checkpoints inspect live included
quota usage; extra-credit balance is separate. Below5percent remaining, stop new
implementation, commit and WIP-push current changes and prepare an exact-SHA
handover with evidence, blockers and verified/unverified next steps. Last local
usage reading at2026-10-13T17:47:40Z was47percent used,53percent remaining.
