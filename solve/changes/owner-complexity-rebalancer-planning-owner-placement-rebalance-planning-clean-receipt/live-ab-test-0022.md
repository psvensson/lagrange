# TEST-0022 live fixed/reverted A/B

## Binding

- Source receipt:
  `sha256:60acd0e6aa6062cd1607e4393faf6dd307b6ccc355ed5ca64029fc8160022657`
- Fixed source-tree fingerprint: `8acf2555b2155474`
- Fixed Docker image:
  `sha256:3284e5261b2d5a132f1b9e95e0aca722c33892e69764af30b79a15ea96d2ca38`
  (`ddb.git-hash=744c6d09250d`, dirty because the exact receipt was not yet
  committed)
- Reverted commit: `0482c98630ddb8bbb97e077e63b134c0280bddc6`
- Reverted source-tree fingerprint: `3c718e2544dedf5e`
- Reverted Docker image:
  `sha256:ef8c8a5cf71f8232ca2d46975e7147cdd5a022e1fa5e48c33bddbedfdfc177ed`
  (`ddb.git-hash=0482c98630dd`, clean)

The source receipt remained unchanged throughout the four runs. Both arms used
fresh three-node clusters, the same Docker host, the Liferaft provider, and the
canonical `node-failure-rebalance` scenario with `--no-fast-local` and captured
logs. The scenario kills one node under sustained write load, then checks
recovery convergence, survivor consistency, acknowledged-write visibility,
post-rebalance closure, and client error classification.

Before the A/B, the required `gate:preflight` was run with the question:

> Does the planning-owner refactor preserve live node-failure rebalance
> outcomes without increasing touched-path client/runtime error counts versus
> the exact reverted HEAD?

The deterministic limitation was recorded as:

> Focused deterministic parity proves individual decisions, but TEST-0022
> requires sampling aggregate retry/recovery interactions under real cluster
> failure churn.

## Runs

| Arm | Run | Timestamp | Outcome | Hard load failures | Retryable control-plane pressure | Node-admission blocked | Timeout waits | Node-slot unavailable |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |
| fixed | 1 | 2026-07-18T20:45:26.419Z | fail: published active-node sets disagree | 68 | 36 | 5,272 | 91 | 168 |
| fixed | 2 | 2026-07-18T20:48:23.586Z | fail: fewer than two queryable survivors | 135 | 36 | 5,254 | 176 | 390 |
| reverted | 1 | 2026-07-18T20:51:22.464Z | fail: fewer than two queryable survivors | 108 | 36 | 5,356 | 142 | 300 |
| reverted | 2 | 2026-07-18T20:54:30.445Z | fail: publication epochs disagree | 153 | 36 | 5,168 | 204 | 5 |

The counts are the failure bundles' machine-readable `reasonCounts`. This is
used consistently because some failed runs terminated before the scenario
could attach its final `loadMetrics` object.

## Aggregate comparison

| Signal | Fixed N=2 | Reverted N=2 | Fixed minus reverted |
| --- | ---: | ---: | ---: |
| Passed outcomes | 0 | 0 | 0 |
| Failed outcomes | 2 | 2 | 0 |
| Hard load failures | 203 | 261 | -58 |
| Retryable control-plane pressure | 72 | 72 | 0 |
| Node-admission blocked | 10,526 | 10,524 | +2 |
| Timeout waits | 267 | 346 | -79 |
| Node-slot unavailable | 558 | 305 | +253 |

The live run does not establish that `node-failure-rebalance` is healthy: both
arms failed 0/2 on broader publication/authoritative-snapshot convergence.
It does establish the controlled TEST-0022 comparison for this refactor:
outcomes were equal; retryable control-plane pressure was identical;
node-admission blocking differed by two events across more than 10,000 per arm;
and hard load failures and timeout waits were lower in the fixed arm.
`nodeSlotUnavailable` was higher in the fixed arm and is reported without
suppression; it is the load generator's undispatched-slot counter, not an
internal planning/recovery error.

No product change was made in response to these live observations.

## Immutable artifact identities

| Artifact | SHA-256 |
| --- | --- |
| `test-output/reports/owner-planning-live-ab-fixed-run1.report.json` | `26f4e25567e19e316846836e7257e9b24bfb3c1509a31689f88e1fd945f79ec4` |
| `test-output/reports/owner-planning-live-ab-fixed-run2.report.json` | `18bf9da75a18847ea11de06877ed72d48f61a01e40a27223c8c9dba5887e23d8` |
| `test-output/reports/owner-planning-live-ab-reverted-run1.report.json` | `6c2523b07cd79c1b30385914ba0e36d9507519c4888e16094428be53f516446c` |
| `test-output/reports/owner-planning-live-ab-reverted-run2.report.json` | `0f97fe2f5950a55b2d2bdb36b80f1e316653cfbe588f9a7f86b0e79898a96dc7` |
| fixed run 1 failure bundle | `6bb93b138279b2cc60413835eafc1bb800f1df9113e8e6812781d0a93ab52a2b` |
| fixed run 2 failure bundle | `d7edd82dc89d297d1080c7fe4190d701d7bca85a96df703b4793829bc3f39e41` |
| reverted run 1 failure bundle | `d1149d2c8bb1c423e90eaa91f009162a393c5e0be80798f1f8a9e82fc02bbef5` |
| reverted run 2 failure bundle | `7463d07a03c85a55715413a5aa1e85834155a00c76f43c7987923e5a31da12df` |
| fixed run 1 status | `0f3cbf89b06369b936dd3f40350b42bf7b3b48cbda8723ac1f0727c238a10a56` |
| fixed run 2 status | `7626fdd01249a13f443187c83029cb2dbc66db2212cf98a4109f3c149430dde1` |
| reverted run 1 status | `52c64fd8dda4001069d24fcc9f4fd5486478d3b178d983c122b61e69e47918f4` |
| reverted run 2 status | `2cbdedc01867250b4f172a43b912633d89c5aa518d728168286889beb9a43a0b` |
