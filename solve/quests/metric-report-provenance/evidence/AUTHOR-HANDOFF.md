# Metric provenance author freeze

Source is frozen, staged, uncommitted in `/mnt/data/peter/projects/.worktrees/codex-metric-provenance-20261025`, branch `work/codex-metric-provenance-20261025`, base/HEAD `ddc34a6a6272a94415b989d33ad79968426aac71`. Integration and Q6 trees were not edited. Parent requested this yield to free an independent-review slot while broad refresh/hook capacity is held.

Exact custody:
- 14 JavaScript files; source manifest digest `084f0f7f63fc82d945a4a9f8690867ee36544600ea24cd7ad20cdabbc97d5323`.
- 17 staged paths total, including the standalone sealed Quest and receipt.
- `candidate-manifest.json` SHA256 `9ced8c485e55c7c97c0c600563d4b0b656bb85bd674313ba79593bf7d8b208c4`.
- `candidate.patch` SHA256 `5819d1b70a3e2a3198e7822a5a5b8db75d35fae103a2208a4f9e1c353becf856`; binary diff against exact base includes all new files.
- `evidence-manifest.json` hashes retained logs and reproduction script.
- No owned process remains running. No broad metric refresh, hook, commit, push or publication was launched.

## Changed interaction

`metric-report-constants.js` owns the five reports/four producers and refresh recipes. `metric-report-inputs.js` binds bytes under measured roots, producer/helper scripts, root configuration, actual installed package/dependency closure and Node executable/runtime identity. It conservatively includes source files rather than duplicating analyzer selection. The only generated-input exclusions are imported canonical graph/test-classification output paths, preventing self-invalidation.

`metric-report-provenance.js` captures before measurement, compares after measurement, seals payload content, atomically publishes, validates, and refreshes only stale reports. No unsealed fallback or report-mtime authority. A scoped seal cannot satisfy full scope. Ratchet exit 1 is consumable only with a valid current measurement; absent/partial output fails. Duplication accepts a target selection so refreshing one stale report does not rerun its current sibling. All four producers use this owner; the old writer/root wrapper and unconditional refresh command list are deleted.

Both consumers use the same owner: inventory and the complexity-closure oracle. Inventory identities hash validated semantic payloads, excluding local provenance, so host/runtime-specific cache custody does not infect committed deterministic inventory. The existing duplication statistics projection remains unchanged. Actual runtime-option remeasurement proves identical inventory identities with different valid local seals; source/count and threshold-payload changes prove identities still change where appropriate.

## Evidence

- Exact-base actual-producer/actual-consumer discriminator: before complexity 0, changed test source with restored mtime plus fresh canonical graph still returned 0, actual checker measured 1. `red-confirmed.log`; `reproduce-base.mjs` reconstructs relevant scripts from exact base.
- Final candidate: provenance suite 30/30 assertions, input-identity suite 14/14, existing inventory suite 19/19, existing ratchet suite 4/4 cases. Logs adjacent.
- Provenance matrix covers all producer seals, selective refresh, matching-input no rewrite, source/config identity changes, host-independent semantic identity, unsealed/null/malformed/tampered/cross-scope reports, pre/post mutation rejection with prior bytes preserved, crash without output, crash after partial unsealed output, and a real cycle-ratchet exit 1.
- Input matrix covers source, producer, lock configuration, installed tool and transitive dependency bytes with preserved mtimes; identical relocated checkout with shared node_modules; generated metadata exclusion; matching inputs and unrelated docs.
- Final ESLint and staged-scope literal/decision-boundary/ambient/silent-catch checks all exit 0. New owner scoped cyclomatic/cognitive checks each report 0 violations. `git diff --cached --check` passes.
- Prior history: `f9f9fb797d4662223641b360346822f60d3c1fe8` records actual PG-wire stale jscpd inventory at `316d18ac3`; `b8a51c1e8cbaff17c626895ef4165870b2fd643f` removed shared jscpd cache nondeterminism; `954caf5543025997daf5485fb0790ff2041856b4` preserves usable measurements despite red ratchets.
- Primary comparable-cache research: Bazel remote caching (declared action inputs/tool/output identity) and Gradle build-cache concepts (implementation/input configuration, relocation, cache hits). URLs and precise application are retained in the Quest receipt.

## Resume sequence / limits

1. Verify manifest bytes and staged scope before editing. Source changes invalidate this freeze and need applicable proof/review updates.
2. Obtain parent heavy-window scheduling, then run `node scripts/generate-global-owner-debt-inventory.js --refresh` in this isolated tree with durable log/process custody. This migrates unsealed local reports and generates the graph/inventory. Preserve exact red ratchet results; do not raise baselines or claim unrelated regressions.
3. Time a second normal generator call and compare report bytes/inodes plus deterministic inventory bytes to prove the real-repository matching-input fast path does not rerun producers. No mtime is used as cache authority.
4. Refresh the receipt's broad evidence and perform the authorized normal-hook non-main WIP checkpoint. Stage only this owned scope plus hook-owned generated artifacts. Do not bypass hooks. Record exact SHA and renewed source/evidence manifest.
5. Parent assigns independent review of this complete changed interaction and applicable gates. Quest receipt intentionally remains FAIL on `independent-review-and-applicable-gates`; no solver land, acceptance, main merge or publication is authorized here.

Conservative script/configuration hashing can refresh more reports than a minimal dependency graph. Source/tool/configuration must remain quiescent during measurement; pre/post byte snapshots detect observed changes, not an intervening mutate-and-restore cycle. These limitations are explicit in the receipt. This author freeze is not full-corpus proof.
