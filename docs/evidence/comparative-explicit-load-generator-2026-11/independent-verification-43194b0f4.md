---
audience: evidence
recorded: 2026-11-14
quest: comparative-explicit-load-generator
---

# Independent Verification Pass 2 (`43194b0f4bdd2c3e854fdb465d8b68a8572faa52`)

VERDICT: APPROVE 43194b0f4bdd2c3e854fdb465d8b68a8572faa52

## Findings
- **The delta is confined to the two requested changes.** The only commit after the candidate, `35f1fb3ad`, touches `log.ndjson` alone. Nothing under `docs/benchmarks`, `test/` or `scripts/` changed. The only change to an existing line is the `VALUE_FLAGS` key, which now uses a constant whose value is the same string. No assertion was removed or weakened. Other flags parse exactly as before.
- **One edge case, which does not block.** `rejectRepeatedLoadGenerator` counts every argv token equal to `--load-generator`, including a token that is the value of another flag. That only produces a stricter usage error, so the property is unaffected.
- **The writer's m4-kill evidence holds.** I fetched commit `06c6ba4e` from the job bundle; it is exactly the regex weakening. In job f81818af, case 7 fails at `:149` with actual 3 (REFUSED) against expected 1, which means selection ran on `'--dry-run'`.
- **What the option-like test proves.** It checks the exit code, an empty stdout, the usage-error text, and that no `refused_` or `diagnostic:` line appears, so it proves that no selection ran and no plan was printed. It does not directly observe that discovery did not run, because the inventory has no ssh targets and discovery would be inert anyway. That part rests on reading: `parseCliArgs` throws before `loadState` or discovery in `main`. I accept that.
- **Guard table rows.** I could not find the writer's guard table on disk. I chose the two guards I judged weakest that had not yet been mutated: the gap check on a named eligible host (m6) and the use of the exclusion reason (m7).

## Mutants
| Mutant | Killed by | Job (host) |
|---|---|---|
| m5: repeated-flag refusal removed | lab-default 8 (`:159`) | 52e5012b (carinas-windows) |
| m6: named host skips `loadGeneratorGap` | lab-hosts 17 (`:409`) | b12e41c3 (adam-laptop) |
| m7: exclusion reason replaced by registration reason | lab-hosts 17 (`:409`), 18 (`:417`); lab-default 5 (`:129`), 9 (`:173`) | c7b7b7be (carinas-windows) |
| m4 (writer's): option-like value accepted | lab-default 7 (`:149`) | f81818af (carinas-windows), verified above |

## Green run
Job c25c44a0 on carinas-windows at 43194b0f4: COMPLETE. lab-hosts 19, lab-default 10, campaign 21 and native-thermal-client 8 passed (4/4 files, 58 tests). This matches the writer's run 8fdfaeef.

## Still unproven
Nothing within the property. The canonical-cli-role-binding receipt (a real-lab dry run with `--load-generator adam-laptop`) is still outstanding, as the quest records.
