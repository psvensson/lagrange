# Independent complete-cohort readback review

Reviewer: `/root`, separate from the original implementation author and the resumed intrinsic-repair author. Date: 2026-10-25.

## Verdict

**APPROVE the bounded complete-cohort source change and the capture-only test correction at the source hashes below.** The corrected test still requires its applicable classified execution. This source verdict does not close the Quest, approve composition, or establish distributed acceptance.

The preserved patch was restored on `a97f79c35b7e1f6428032493918e16e623339688` and independently matched its original Git tree `2cae3124f76c41e05f30c3f473aef797f5c52372`. The original patch SHA256 is `2b107cc280596bcb881c69a6c785fe72a620632baf192618ff9bfb71805bf6ef`. The resumed author changed only the reported ambient-intrinsic calls in the new witness before adding preservation notes. No production source correction was needed in this review.

| Reviewed semantic file | SHA256 |
| --- | --- |
| `test/distributed/scenarios/postgres-baseline-comparison-benchmark-table-load.js` | `a3d2f5d9ba09e03c106b1c1ff413000b1e39b36a9469c60a2bc43e8e8c244dff` |
| `test/distributed/scenarios/postgres-baseline-comparison-constants-and-imports.js` | `8b4d49fec00379183f0157e465b468e200c63001bd5e9bc6cac86841c83f2b07` |
| `test/distributed/harness/__tests__/admin-partition-cohort-readback.test.js` | `0d7dbbaec93c29025580b19a4088ca284776aa521960696525bdbdd879fb8aec` |

The full original-file and correction binding is in the author's `cohort-review-source.json`. Generated inventory/registry updates and append-only Solver notes are preservation metadata, not replacement semantic evidence. This verdict applies to a later commit only while the reviewed source bytes remain exact.

## Owned behavior and causal evidence

The readiness owner first resolves the requested table's catalog ID, then selects the complete partition cohort using that ID. The query projects `partition_id`, `table_id`, and `table_name`. Every returned row must carry the resolved ID and the exact requested name. An incomplete or conflicting row causes immediate typed-message refusal even if a second row is correct. An empty catalog or cohort follows the existing readiness wait; it cannot become success through another lookup.

The old by-name early return and its now-unused SQL builder/export are deleted. The new check performs no repair write, changes no provisioning authority, adds no metadata source, and retains existing time budgets and transient-read classification. It does not claim that metadata alone proves application readiness, leadership, replication, or physical convergence.

The recovered predecessor witness reaches the actual readiness owner with one complete row and one nameless row. The old by-name shortcut accepts it, so the expected refusal assertion fails. This is an engaged semantic negative, not an import or setup failure. The replacement witness exercises missing, null, wrong-name, folded-name and wrong-table identities; complete rows after an empty read; absent catalog identity; and permanent/transient read failures. It asserts the complete projection, absence of a by-name query, and SELECT-only operation alongside the outcome.

The fixture cone was reviewed separately from the semantic change. Twenty existing fixture files add canonical `table_id`/`table_name` fields to their existing partition rows. Nineteen files are byte-identical to their predecessors after removing those field insertions. The remaining post-load file adds the same two fields to two multiline mapped rows as well as its ordinary rows; its inspected diff changes no assertion, scheduling, fault or operation selection. The automated comparison is retained in `cohort-fixture-delta-review.json`; its one false result is this explained multiline comparison limitation, not a hidden implementation exception.

## Original executable evidence and its limits

The user recovered the original archive with SHA256 `3a78d417eeeb62fc643b31131e000d9fa7555d05592e42a503d48d412b0d0fdf`. Both original manifests match the committed manifests, and all 32 omitted manifest-bound artifacts match their pre-existing lengths and SHA256 values. The following historical cohort logs were inspected; no new runtime execution is represented here.

| Log | Observed outcome |
| --- | --- |
| `raw/partition-readback/red-reviewer.log` | The mixed complete/nameless cohort is wrongly accepted by the predecessor. |
| `raw/partition-readback/green-r2.log` | Two files pass, 41 runner-reported assertions/cases, including the 35-count new witness and six-count provisioning witness. |
| `raw/partition-readback/green-fixture-cone.log` | Sixteen files run; fifteen pass and post-load fails because two fixture rows still omit the now-required identity. The reported count is 139; this intermediate failure remains preserved. |
| `raw/partition-readback/green-post-load-final.log` | The corrected post-load file passes with eleven runner-reported cases. |

These overlapping runs reconcile to seventeen distinct files and 174 runner-reported assertions/cases after replacing the failed post-load result. They are the original implementation evidence, not a fresh result for the capture-adjusted witness or the eventual integration. Runner counters are retained in their native convention instead of being relabelled uniform leaf assertions.

## Intrinsic correction and systematic scope

The original blocked normal-hook log reports fourteen new ambient-intrinsic findings in this one new test. The resumed author captured the four existing prototype functions at module load and substituted all fourteen direct calls. The arguments, predicates, event sequence, tested owner and assertions are unchanged. The same scoped checker then reports zero new findings. No checker, baseline, allowlist, threshold, timeout, retry or runtime path was changed. This evidence proves the hook failure's local scope; it does not localize the original metadata-identity problem by assumption.

The complete-cohort change closes the specific false-readiness interaction across its caller/fixture cone. Other existing scenario routing, metadata policy and fallback-named mechanisms are not approved by this bounded review. The resumed user direction requires their actual ownership and supported-capability census before any whole-codebase no-fallback claim. In particular, generic name matching is not a sufficient basis to remove fault-handling behavior without tracing its contract.

## Remaining acceptance

Run the corrected witness through the existing classified test and lab owner, retaining its exact source identity and terminal outcome. Compose only the bounded semantic and fixture changes onto current integration, preserving already-integrated CDC D2 and Q6 behavior; regenerate shared metadata through its existing owner. Select and execute the composed affected proof. No physical scenario, final static/corpus result, main merge, publication or release credit follows from this source review.
