# Native stale-refresh witness V9 custody correction

Binding: HEAD `3ebc7da41a92ed4196bf87eb8aaf039ef604dfc4`; V8 review `db96fd5d05d9a932e6b11aa8d16549190a36e0a2583cd5cb9c3f25b3980bef48`.

The only owned code change is `test/partition/participant-release-native-application-order.test.js`, V9 SHA-256 `a8c86a338b3b01c86fa08e522d59b45d61fadb8dda2f3e7f4017757db1cbefba`, 1346 lines. Its exact V8 predecessor is `56de6d74e80e9d07228af9a9eb23a90fe9d47932017fbfa8b0b66db94d048066`; `v8-to-v9.diff` is the complete delta.

- R1: each exact forwarded carrier now installs one passive observer that retains its original fulfillment value or rejection in the existing membership-read state. The stage race then inspects that retained record through `requireTreatmentRecord`; route or outer-release callback order cannot substitute a different outcome. Observer rejection is owned by the existing passive-task cleanup.
- R2: membership-read cleanup returns whether any exact borrowed-port restoration failed. That custody result both remains in the existing cleanup error aggregate and activates the admitted group fixture's existing `retainDirectory` seam. Restoration still refuses to overwrite a replacement and never separately closes the borrowed native port.

Syntax, exact ESLint, scoped strict complexity (cyclomatic 12/cognitive 20), strict file-size (test threshold 1500), repository diff whitespace, and V8-to-V9 no-index whitespace checks completed with the recorded statuses in `checks.json`. The no-index checks return 1 solely because the files differ; their whitespace logs are empty. No behavioral tests, lab runs, metadata refresh, production edits, fixture edits, impact edits, Quest edits, commits, or pushes were performed by this correction.
