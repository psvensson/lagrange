# Fallback Inventory

This directory is the canonical artifact set for codebase fallback analysis.

The primary source of truth is [`fallback-register.csv`](./fallback-register.csv).
[`file-coverage.csv`](./file-coverage.csv) is the proof artifact that the
source-tree scan was actually reviewed file by file.
All other files in this directory are derived views or cluster notes.

## Intent

This inventory exists to answer one question precisely:

Which fallback situations in the codebase are legitimate semantic boundaries,
and which are owner-path violations that should be removed or converted?

Current coverage baseline:

1. `src/` files scanned: `680`
2. `src/` files with fallback-related match signals: `165`
3. Files without fallback-related match signals are considered scanned and
   unmatched; only the matched files appear in `file-coverage.csv`.

## Row Model

Each row in `fallback-register.csv` represents one semantic fallback
situation, not one grep hit and not one helper function.

Required fields:

1. `fallback_id`
2. `subsystem`
3. `concern`
4. `semantic_question`
5. `files`
6. `current_owner`
7. `caller_sites`
8. `trigger`
9. `fallback_kind`
10. `guideline_violation`
11. `why_not_one_path`
12. `proposed_canonical_path`
13. `disposition`
14. `follow_on_package`
15. `status`

## Categories

Use one of these `fallback_kind` values:

1. `irreducible_sync_async_boundary`
2. `duplicated_caller_policy`
3. `stale_read_repair_path`
4. `degrade_mode_transport_or_discovery`
5. `legacy_compatibility_bridge`
6. `non_architectural_default_or_helper`

## Dispositions

Use one of these `disposition` values:

1. `remove`
2. `convert`
3. `wrap`
4. `keep`
5. `split_later`

## Statuses

Use one of these `status` values:

1. `seeded`
2. `inventoried`
3. `classified`
4. `packaged`
5. `implemented`
6. `verified`

## Fallback ID Format

Use stable IDs in the form:

- `FB-CP-###` for control-plane
- `FB-RB-###` for rebalancer
- `FB-BS-###` for bootstrap
- `FB-TR-###` for transport
- `FB-QR-###` for query
- `FB-CDC-###` for CDC
- `FB-TP-###` for topology

The ID must stay stable even if the implementation file moves.

Additional subsystem prefixes used by this pass:

- `FB-AD-###` for admin
- `FB-MG-###` for message-group
- `FB-PT-###` for partition

## File Coverage

`file-coverage.csv` contains one row per fallback-matching `src/` file.

Fields:

1. `path`
2. `match_count`
3. `assessment`
4. `register_ids`
5. `notes`

Use one of these `assessment` values:

1. `register_violation`
2. `register_boundary`
3. `register_bridge`
4. `register_degrade_mode`
5. `helper_or_default_only`
6. `degradation_term_only`
7. `single_path_guard_only`
8. `doc_or_comment_only`

## Derived Views

1. [`violation-queue.md`](./violation-queue.md) lists the currently known
   guideline violations from the register.
2. [`accepted-boundaries.md`](./accepted-boundaries.md) lists fallbacks that
   are retained for now with explicit justification.
3. [`rollout-packages.md`](./rollout-packages.md) lists proposed follow-on
   implementation packages.
4. [`file-coverage.csv`](./file-coverage.csv) records matched-file coverage
   and whether each file maps to one or more semantic register rows.
5. [`cluster-notes/`](./cluster-notes/) contains subsystem-specific analysis
   notes.
