# Duration census of the final selected router proof

Source attempt: 2026-09-11T08:43:42.592Z on
59f3427c1557618c65f8dcd36d506826e8ffcbcf, ordered 26-path digest
cf8c71934b243341db2aaed8966a52c93ad5e11b3dafd4b8423a906bfc1a5378.
Independent read-only census: subagent:verify_final_cdc_formation_system.
The completed nonoverlapping canonical proof selected 233 files and passed
7707 runner assertions. This is behavioral evidence, NOT duration acceptance.

The verifier matched all 2110 authored TAP nodes in the 233 current result
files (mtime >= 2026-09-11 10:43:50 CEST), with zero unmatched nodes.
There are 21 hard duration violations: 15 causal leaves and six authored
aggregate containers. File-wrapper elapsed time alone is not a violation.

## Causal leaves

| File / contract | ms |
| --- | ---: |
| message-group-multi-join-formation integration | 158299 |
| complexity-ratchet-closure: cyclomatic | 14240 |
| complexity-ratchet-closure: cognitive | 7614 |
| check-fast-static: read-only | 12139 |
| check-fast-static: timing | 11704 |
| check-fast-static: shared changed paths | 11104 |
| model-tlc-mode-selection: all registered CLI models | 5889 |
| no-silent-delivery-failures: valid transport property | 3423 |
| message-delivery-reliability: simultaneous delivery | 3177 |
| message-delivery-reliability: transport | 3169 |
| minimal-deployment-request-cell-routing: durable fence | 2674 |
| minimal-deployment-request-cell-routing: genuine HTTP | 2605 |
| local-leader-row-visibility-model-contract: real TLC | 2631 |
| test-timeout-declarations: derived cap | 2119 |
| test-timeout-declarations: lane floor | 2025 |

## Authored aggregate containers

| Contract | ms | Interpretation |
| --- | ---: | --- |
| complexity root | 21857 | Includes two slow leaves above |
| minimal request-routing root | 6311 | Includes two slow leaves above |
| analyze-topology root | 3869 | 29 children, maximum 255ms |
| router chunk3 root | 3034 | 61 children, maximum 1027ms |
| run-test-files root | 2455 | Children maximum 571ms |
| RPC timeout root | 2252 | Children maximum 589ms; repeated real sleeps |

`check-operation-dispatch-completion-owner` is NOT a violation: its 10.2s
file wrapper contains ten independent authored roots of 0.922–1.344s.

## Explicit follow-on boundaries, not exemptions

- Process isolation owns multi-node formation, preserving all seven nodes,
  real entrypoints and the 30-second successful scenario limit.
- Durable-fence proof must retain real shared SQLite and two lifecycle
  owners, using the existing RuntimeDriver contract with a deterministic
  two-party gate; its separate genuine HTTP witness retains real WASI.
- HTTP late-response proof retains its real 1000ms router deadline; replace
  wall sleeps with controlled clock and actual timer/handler/disposition gates.
- Existing physical router semantic modules can have independent fixture-owned
  roots. Do not divide assertions arbitrarily to conceal real waits.
- Whole-repository static subprocess and real Java TLC cases need an explicit
  classification judgment based on their actual integration boundary, never
  a rename justified only by slowness. Preserve blocking selection.
- Fake Java process-selection tests must preserve actual invocation order and
  all model coverage; timeout-runner tests preserve every negative child proof.
- Transport properties must bind real registered local targets and assert exact
  delivered/ACK states. Existing owner sleep seams may control retries, without
  changing production retry budgets or property run counts.
- RPC timers require deterministic owner-clock witnesses. Topology and runner
  aggregate fixtures require semantic grouping with unchanged CLI proof.

No change described here has been implemented or accepted by this census.
The router Quest remains unlanded and its duration/static/full-proof receipt
remains false until these discovered blockers are explicitly resolved.
