# CDC transfer owner PO-5 correction

Date: 2026-10-12 Europe/Stockholm.

This bounded increment corrects PO-5 from independent round-two report
SHA-256
`bf5ad7fea043d07c929dca7ab5a649182583b928aaf3d64ca4636a413aeb9c0a`.
It does not change the approved resource design, caller2de, MessageRouter,
pool limits, retry ownership or runtime support policy.

## Exact subject

| File | SHA-256 |
| --- | --- |
| `src/cdc/cdc-coverage-transfer-owner.js` | `d487b36efcbbbc1194205c02d405729f07b1e56b1dd321b7a9248b6d8818c33f` |
| `test/cdc/cdc-coverage-lifecycle-owner.test.js` | `a7e75a502a57828db634988adff765fb4e9e621a720908c99bbcd7edb2a6fefe` |
| `test/shards/subsystem-classes.json` | `cfc1f79e47cff18887d1918b9cc15f7a4163738f58b2f81ff4c5956ec8c3ee2f` |
| closed caller `src/cdc/cdc-coverage-reconcile-owner.js` | `0d844cff666dfcd3e7aa58246b782cad5ccfdd5f321e7b5af8d795fdc949218a` |

The baseline is the preserved round-two snapshot
`7a8dfa2822c15dd6ee497933669d835da832c561`. `source-review-delta.patch`
is an exact diff from that snapshot for the two changed files. Metadata is
unchanged in this increment.

## Capture, acquire and settle

`transferCdcCoverageListenerToTerminal` now performs one bounded interaction:

1. It rejects an already stale internal claim before inspecting caller input.
2. It captures `shutdownRecord`, `terminalize` and `descriptor` once by own
   property descriptors. Accessors and inherited values are refused without
   executing getters. Proxy descriptor traps are caught on throw.
3. It captures the eight terminal descriptor scalars once under the existing
   bounds. Proxy descriptor traps remain acknowledged callouts.
4. Only after every capture callout, it reacquires the owner and exact claim
   and checks active state, active node claim, shutdown identity, terminal
   check and release capability.
5. It changes the exact claim to TRANSFERRING and invokes only the captured
   callback. No caller object or descriptor is read again.
6. Throw or wrong-result restores the same reachable claim. Success consumes
   the exact capability, terminalizes bounded custody, returns listener bytes
   once and runs the existing fixed wake snapshot.

If any options or descriptor Proxy trap completes the old claim and admits a
successor, the outer operation fails the post-capture reacquisition. It returns
false without invoking its callback, changing the completed state, returning
credit or touching the successor.

PO-1 through PO-4 remain intact: scalar descriptor custody is unchanged,
retirement cannot orphan ACTIVE or TRANSFERRING claims, individual wake
failure cannot truncate the bounded snapshot, and endpoint-free diagnostics
still project the standing node charge.

## Verification result

- All ten retained owner counterexample/control observations pass.
- All nine descriptor boundary refusals remain exact.
- Eleven capture schedules pass: four reentrant Proxy positions, three
  accessor refusals followed by valid retry, two throwing Proxy recoveries,
  exact-once ordinary Proxy capture, and nonexpanding wake registration.
- Selected runtime focused test: one file, 171 assertions, pass.
- Cumulative owner tests: five files, 495 assertions, pass.
- ESLint, impact contracts, shard audit and whitespace checks pass.

The selected executable is Node v22.22.0, V8 12.4.254.21-node.33, libuv
1.51.0, Linux x64, executable SHA-256
`1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`.

`metadata-evidence-clarification.md` corrects the prior unsupported statement
about 11 omitted tests: the retained metadata comparison adds two observed
imports and no test classification.
