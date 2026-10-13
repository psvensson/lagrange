# Native stale-refresh witness V10 retained-directory report

Binding: HEAD `3ebc7da41a92ed4196bf87eb8aaf039ef604dfc4`; V8 review `db96fd5d05d9a932e6b11aa8d16549190a36e0a2583cd5cb9c3f25b3980bef48`.

The only owned code change remains `test/partition/participant-release-native-application-order.test.js`, V10 SHA-256 `01518ea0132c2806d268c265e642fd9e2a54a3f05568ef49256f8acf4698c8c2`, 1353 lines. Its exact V9 predecessor is `a8c86a338b3b01c86fa08e522d59b45d61fadb8dda2f3e7f4017757db1cbefba`; `v9-to-v10.diff` is the complete V10 delta.

When exact borrowed-port restoration fails, cleanup now derives the actual admitted-group directory from `path.dirname(group.dbFileOf(MEMBERS[0]))` before group disposal. The existing `retainDirectory` seam preserves that directory, and the existing final `AggregateError` carries it as `retainedDirectory` alongside the unchanged original primary cause and cleanup failure identities. No extra failure is fabricated. Replacement ports remain untouched and the borrowed native port is never closed separately.

V9's retained exact carrier settlement correction is unchanged. Syntax, exact ESLint, scoped strict complexity (cyclomatic 12/cognitive 20), strict file-size (test threshold 1500), repository diff whitespace, and V9-to-V10 no-index whitespace checks completed with the recorded statuses in `checks.json`. The no-index checks return 1 solely because the files differ; their whitespace logs are empty. No behavioral tests, lab runs, metadata refresh, production edits, fixture edits, impact edits, Quest edits, commits, or pushes were performed.
