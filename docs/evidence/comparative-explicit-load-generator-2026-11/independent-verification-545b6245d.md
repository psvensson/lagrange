---
audience: evidence
recorded: 2026-11-14
quest: comparative-explicit-load-generator
---

# Independent Verification Pass 1 (`545b6245df9a31e597ef571ac40e22bb686133ce`)

VERDICT: REJECT 545b6245df9a31e597ef571ac40e22bb686133ce

## Findings
1. BLOCKS (test evidence, attack 6). The property says the flag is refused when its value is option-like. The production guard (`docs/benchmarks/cloud/run-comparative-benchmarks.mjs:191`, `/^[^\s-]\S*$/u`) is correct, but no test covers it. Mutant m4 weakened the regex to `/^\S+$/u` and **survived**: lab-default passed 8/8 (job 78c3400d). Under m4, `--load-generator --dry-run` swallows `--dry-run`, so a real campaign runs discovery before it refuses "not registered". Repair: add a CLI control for an option-like value, for example `--load-generator --dry-run` and `-x`, asserting the usage error and that no plan is printed.
2. Non-blocking (attack 6). A repeated `--load-generator a --load-generator b` silently keeps the last value (parser `:205-209`, the same rule as every value flag). The host selected is still one the operator named, and nothing is substituted, but this is untested. Consider refusing a repeated flag.
3. Production logic is otherwise correct by reading. In `explicitLoadGenerator` (`comparative-benchmark-lab-hosts.js:252-265`), every unusable path throws `refused_load_generator_selection` with `{loadGeneratorName, reason}`. `requested ?? chooseLoadGenerator` reaches automatic selection only when the name is `null`.

## Matrix
1. Substitution: unknown, non-harness, unreachable/absent from fresh discovery, docker, thermal, checkout, Node, disk and alias all throw. The `??` chain only picks the reason. Killed m1. Tests: lab-hosts 15, 17, 18 and lab-default 5. Covered.
2. Reservation: the named host is filtered out before `chooseDataHosts`. Automatic mode already allowed a disk-low client, so nothing was relaxed. Data-host disk policy is unchanged (test 19). Killed m2. Covered.
3. Held host: the recorded lock is kept and the existing hold owner decides (test 16). Covered.
4. Forwarding: both call sites (`:395`, `:434`). The real campaign selects before `holdLabBenchmarkHosts`. Killed m3 (lab-default 7). Covered.
5. Flag absent: `filter(entry !== null)` keeps every host and the client comes from `chooseLoadGenerator`, so selection is identical to the base. D25 tests 1-4 are unchanged and test 19 checks automatic mode. Covered.
6. CLI: GCP rejection (test 8) and empty value (test 6) are covered. **Option-like value: HOLE (m4 survived).** Repeated flag: see finding 2. The help text is truthful.
7. Recorded output: `plan.labHosts`/`wouldLock` (test 5) and the existing `hosts` role records. No new schema. Covered.
8. Tests: control 4809bcf0 is `39d76c1b` = `35fc8fc3` with the two production files from the base, which I confirmed with `git diff`. In the control all 13+4 existing tests passed and the 10 new tests failed. The candidate log shows 19/8 tests passing. The fixture was moved to the shared `recordedThermalFacts` with a body identical apart from `PYTHON` (`/usr/bin/python3`, same value). The only test changes are intrinsics swaps; no assertion was removed or weakened. Covered.
9. Ratchets and rules: no baseline files in the diff. No `typeof` dual path or alias was added. Scope is the CLI, the selection owner, the two test roots and the shared fixture. Covered.
10. Records: job ids, shas and the log sha256/bytes (`e3946739...`/9677 and `f42bbe11...`/45696) match the evidence files. The canonical and independent receipts are left outstanding. Covered.

## Planted defects
| Mutant | Killing test / assertion | Job | Result |
|---|---|---|---|
| m1: refusal returns null (falls back to automatic) | lab-hosts 15 (:367), 17 (:409), 18 (:417); lab-default 5 (:126), 7 (:148) | a4570c20 adam-laptop | killed |
| m2: named host not removed from data candidates | lab-hosts 14 (:358 deepEqual roles), 19 (:434 throws); lab-default 5 (:119) | aa24367d carinas-windows | killed |
| m3: real campaign does not forward the name | lab-default 7 (:148 refusal-type match) | 0bb54c1e adam-laptop | killed |
| m4: option-like value accepted | none | 78c3400d carinas-windows | **survived** |

## Independent green run
Job 9f591323 on carinas-windows at 545b6245d: COMPLETE, exit 0. lab-hosts 19, lab-default 8, campaign 21 and native-thermal-client 8 all passed (4/4 files, 56 tests).

## Out of property
- At the base, the lab-default D25 fixture used the pre-native `thermal` field. The candidate repairs it.
- `state.nodes ?? {}` in `unselectableReason` is a defensive default and is harmless.
