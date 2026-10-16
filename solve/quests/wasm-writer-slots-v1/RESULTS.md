# Preserved source and first counterexample execution

- Base: `cdcb9c95f4bdb90e709ed4d20058b51cb193625f`.
- Test-only checkpoint: `26cded6cb74594b8d38bce24e6a862302b605e23`.
- Frozen WIP source / executed checkpoint: `9b53962f2e7b8402b2a6a02a4a24b45985cd3563`.
- Review branch: `review/wasm-writer-slots-v1-20261016`.
- Exact changed paths, blobs and SHA256 values: `evidence/checkpoint-identities.json`.

## First measured result

The independently reviewed `test/wasm-service/wasm-writer-recreation-origin-v1.test.js` ran once on locked `lenovo-laptop`, Node v22.23.2, through the existing classified lab executor. Whole file: FAIL, exit1; 3 tests, 2 pass, 1 fail, none skipped/cancelled. Classified duration663ms. No retry, changed threshold, source correction or timeout adjustment followed it.

The semantic assertion was exactly `OLD_WRITER_REVIVED_AFTER_RECREATION` (actual true, expected false). The diagnostic records original and fresh real SQLite states, identical canonical old commands and resulting receipts, with the original closed database SHA256 unchanged. Original INIT/ENROLL/write succeed; replaying them against a separately fresh same-service application reinstates the old incarnation, slot generation and sequence and writes the old value. Supplied application positions are component inputs. This is NOT a native RF3 execution or end-to-end service recreation. It is a defect in the new proposed initialization contract/prototype, not an attributed predecessor regression.

Two positive controls pass: clean same-file reopening returns the exact original receipt without another effect; different serviceId refuses old INIT/enrollment/write and leaves the fresh state unchanged. Neither control proves process-loss, power-loss or snapshot recovery.

Command:

```sh
LAGRANGE_LAB_AGENT=codex:wasm-writer-slots-v1 LAGRANGE_RETRY_FAILED_ONCE=0 \
node /tmp/lagrange-runtime-correction-20261015/run-group-capture.mjs \
  /mnt/data/peter/projects/.worktrees/wasm-writer-slots-v1-20261016 \
  /tmp/lagrange-wasm-writer-v1-20261016/recreation-first \
  9b53962f2e7b8402b2a6a02a4a24b45985cd3563 lenovo-laptop \
  test/wasm-service/wasm-writer-recreation-origin-v1.test.js
```

The raw first TAP, request with exact source/test identity and summary are mirrored in `evidence/`; the archive also retains orchestration, discovery, locked run log and exit file.

## What was not executed

The separately prepared RF3 v1 completion companion (2 tests), state controls (11), caller controls (9), completion/lifecycle controls (7), completion-only source mutation and changed-path proof cone remain unexecuted. The native companion received pre-run approval only. No new v1 completion GREEN is claimed. The historical original-format WASM RED, F1 and W07 bytes/evidence are unchanged; no completed comparison was repeated.

## Static and preservation status

Scoped source ESLint: exit0 after initial formatting corrections, before the recreation freeze. Impact registry: PASS, 63 contracts/34 coupled pairs. Diff whitespace check: exit0. All touched source files remain below800 lines.

Normal source pre-commit: exit1. It reports six new literal findings; six decision findings (four matched inherited baseline, two new in caller validation); and three new scoped complexity violations in validateCallerRecord/submit/validateSlot. Inventory refresh also reports aggregate complexity and duplication ratchet failures; the wider duplication attribution is not established. No ratchet was raised and these are NOT excused as inherited greens.

The documented `.githooks/pre-commit` WIP route preserved the source after this refusal; the test-only checkpoint used its documented inventory-defer route because source was intentionally unstaged. Normal metadata producers subsequently refreshed the combined candidate. This permits non-main preservation, not Quest landing or correctness approval.

The independent review qualified its earlier design approval after the creation-origin counterexample. `STOP-DECISION.md` gives the required existing-owner interaction. The source remains incomplete and frozen; no main merge, F1 supersession or full release activation/seal is authorized.
