# Set B: measured adjacent source boundary, 2026-10-19

The selected three-file Set B experiment now has an executed PASS at `26cded6cb74594b8d38bce24e6a862302b605e23` and its retained FAIL at the exact immediate child `9b53962f2e7b8402b2a6a02a4a24b45985cd3563`. Both originals were run on `tv-dator`, each selected the same three files and reported 64 runner assertions. This closes the remaining source interval for these observed failures at the writer-freeze commit. It does not certify the writer feature or all rs-raft tests.

## Original evidence

| Measurement | Exact source | Physical original | Result | Full raw log |
| --- | --- | --- | --- | --- |
| Parent | `26cded6cb74594b8d38bce24e6a862302b605e23` | [#316](https://github.com/psvensson/lagrange-lab/issues/316#issuecomment-6260677572), request `be1836d0a54315383c38c6e89e644961` | PASS, exit 0, 3/3 files, 64 runner assertions; completed 2026-10-19 05:54:06 UTC | `lab-316-executor.log`, 1,315 bytes; SHA256 `b4e63ba0d5b0c9edeb335d67c163bb7bfaf51b91dcd315c32f72b8e5240a525d` |
| Child | `9b53962f2e7b8402b2a6a02a4a24b45985cd3563` | [#192](https://github.com/psvensson/lagrange-lab/issues/192) | FAIL, exit 1, 1/3 files passed, 64 runner assertions | `lab-192-executor.log`, 23,846 bytes; SHA256 `08641ce3ee8557722c12d00374d513fdb49d2da6caeabf484f4178d31ff1d740` |

The parent original's untruncated log is the entire 1,315-byte log, not a summary substituted for missing TAP. Its returned length and SHA256 match the daemon's original result. The physical request digest and controller identity were independently checked, its source/ref/three-file selection matches the signed cloud intent, and the read-back cloud comment equals the locally preserved signed body byte for byte.

The parent was a distinct, explicitly authorized measurement under current session `d30801bb-9f75-4221-89d9-769681c74259`, generation 5, cloud request `a2e41c89-ca37-4f00-93fd-bf849346501f`, [control post 6260632336](https://github.com/psvensson/harnessd-control/issues/12#issuecomment-6260632336). Its original intent advanced to physical #316 and terminal OBSERVED_PASS on the same identity.

## File-by-file comparison

| Identical selected file | Parent #316 | Child #192 |
| --- | --- | --- |
| `test/raft/raft-rs-backend/operation-port-boundary.test.js` | PASS, 7 runner assertions | PASS, 7 runner assertions |
| `test/raft/raft-rs-backend/wasm-service-group-on-raft-rs.test.js` | PASS, 4 runner assertions | FAIL, 2 failed leaves; legacy write acceptance is undefined versus expected true, and the restart replication predicate is false versus expected true |
| `test/wasm-service/wasm-service-replica.test.js` | PASS, 53 runner assertions | FAIL, 4 failed leaves; each attempts `committed.effects.afterCommit.push` against the old fixture shape and raises TypeError |

The two group failures use the old write payload and old `accepted` expectation. Exact child source routes strong writes through the new writer command/completion contract. The four replica failures exercise old committed-record fixtures with `effects: []`, while the writer-freeze source expects an `afterCommit` collection. These source-level explanations agree with the observed named assertions; the raw logs do not prove complete correctness of either old or new write contracts.

## Source and runner controls

The immutable GitHub commit object and local git objects agree that the child's sole parent is exactly the measured parent. `set-b-parent-child-source-verification.json` records matching git blob identities for all three selected test files, `package.json`, `package-lock.json`, `scripts/run-classified-test-files.js`, and `scripts/run-test-files.js`. No target assertion, package/lock file or repository runner file changed across this adjacent source edge.

The same JSON lists the eleven changed production files, all under `src/wasm-service`. The retained source census had identified this writer freeze as one of only two production-changing commits in the prior 35-commit interval. The new parent PASS rules out the need to execute another midpoint merely to locate these selected failures. It does not make the earlier finite-inbound-capture change universally correct.

The two measurements were taken at different times. Matching host, source-controlled tests, package/lock and runners are verified; no claim is made that all deployed host or daemon state was byte-identical across dates.

## Older pending intent

The older control #3 cloud UUID `332dacf2-b14a-43de-a6f4-bf1a2703d324` for source `c425ef42e18236ff1187e1112a971588bb02b496` remains untouched and nonterminal. Its generation-1 session is fenced and cannot authorize a new dispatch under the inspected owner contract; no physical lab request was reported. This parent measurement was not presented as a retry, cancellation or completion of that older intent. The exact public receipts and protocol reasoning remain in `old-set-b-relay-fence-audit-20261019.json`.

## Remaining scope

The measured Set B source interval is now adjacent and localized to the writer-freeze commit for these six leaf failures. Any repair of those fixtures or writer behavior belongs to the corresponding writer workstream, with independently reviewed contracts and original failure preservation. This report makes no U1 approval, U2 activation, merge certification or broad regression claim.
