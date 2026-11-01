# fresh-formation-user-table-routability: before / after (2026-11-01/02)

Scenario from `wip/formation-serve-lane-repro-20261101` (8068c7650). The lab harness refuses a single-host
(three-process) run (`TOO_FEW_HOSTS`), and only two lab machines were free, so both runs are 3 nodes on 2
machines (`--nodes-per-host 2`, base `test/distributed/config/local-three-node.json`). The two runs used
different machine pairs, and each is one run, not a streak.

| | before (base src, 8068c7650) | after (change, 6356b9f3f = 73884a5b7 + scenario) |
| --- | --- | --- |
| machines | carinas-windows, tv-dator | adam-laptop, carinas-windows |
| first unmet predicate | a-serve-lane-open | a-serve-lane-open |
| time-to-serve-lane | never (bound 420 s) | never (bound 420 s) |
| f: no learner_address_unresolvable on a committed row | FAIL | met |
| g: projection agrees with authority / observation-integrity | FAIL / FAIL | met / met |
| priority spread by authority (cpp, replica_ops, schema_ops, sql_tp, sql_tx, sql_wo) | 3/3, 2/3, 1/3, 1/3, 1/3, 1/3 | 2/3, 2/3, 1/3, 2/3, 2/3, 2/3 |
| leader-side proof refusals | 18 x request_invalid/learner_address_unresolvable | 61 x not_in_configuration |
| learner deferrals (proof reasons) | request_invalid 19, progress_behind 15, not_leader 2 | not_in_configuration 61, progress_behind 5 |
| proof grants | 3 | 5 |
| first refusal -> grant per learner | 10.2 s, 14.4 s, 10.6 s, one never | 10.3 s, 1.8 s, 18.2 s, 24.4 s, 30.2 s |
| peer_not_in_configuration / node-id conflicts / stamp refusals | - | 0 / 0 / 0 |

Reading:
- The defect the quest names is gone: no refusal for a learner the leader admitted; the address of every
  partition peer comes from its committed node (no transport refusal in any node log).
- The wait moved, it did not vanish: every `not_in_configuration` refusal is for a learner the leader had not
  admitted yet, because the admission itself is still triggered by the leader's services-cache row (rows are
  discovery, A8), and that row was missing from the seed's cache (`No row found for CDC update` for the
  learner's key: the INSERT never reached the cache, only later UPDATEs). Example: sql_write_operations-p1-r4,
  refused 22 times from 22:45:56, granted 22:46:26.
- The serve lane still never opens (C5/C7 and the admission trigger above are the next links).

Evidence: `scenario-before-base-20261101T2310Z/` and `scenario-after-20261101T2244Z/` in-tree: run status,
generated config, lab console, `routability-summary.json` (the scenario's predicates, timings and log
observations extracted from the harness report). The full harness reports (> 1 MB) and full node logs
(`full-logs/*.log.gz`) are refused in-tree by the solve binary guard; they are kept untracked at the same
paths in this worktree for `node scripts/solve.js evidence add` once the quest is sealed. The comparison script output
above was computed from those node logs.
