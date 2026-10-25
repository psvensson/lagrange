# F-ADMIN-1 owner-effect correction

Base: a97f79c35b7e1f6428032493918e16e623339688. Source worktree: /mnt/data/peter/projects/.worktrees/codex-admin-owner-outcomes-20261025. Normal-hook checkpoint and independent review are pending. Original frozen checkpoints remain untouched.

The two semantic owners now require the canonical gateway classifier to confirm one applied row before returning success, incrementing successful config writes, invalidating the policy cache or emitting POLICY_UPDATED. A single shared confirmation gate owns this effect check. Owners supply only their zero/unknown vocabulary; the admin adapter adds static 409 mapping, with no row truth or readback. Failed receipts remain the exact error cause, retaining outer write identity and nested cause; thrown dependency errors retain object identity. Zero is changed (409), while unknown count or pending visibility is unconfirmed (503), never evidence of noncommit. No lifecycle, retry, timeout, seeding or D2 policy algorithm changes.

The preserved independent review source reproduced six false-success assertions on a97: red-reviewer.log. green-reviewer-r1.log records the original reviewer test after correction. green-r2.log records the final five-file canonical cone: 5/5 files, 848 assertions, retries disabled, lane cap 1; the 199-assertion new witness exercises actual Fastify -> DynamicConfigService/TablePolicyService -> real gateway with controlled CDC outcomes for config insert/update and policy update. Negatives cover deferred, rejected, zero, missing/malformed count and pending visibility; positives cover subsequent confirmed application and exact side effects. Original negative source/log remain in /tmp/codex-admin-admission-independent-review-20261025.

Two existing fixtures now return affectedRows:1 (one used changes:1 and one omitted count); production has no compatibility fallback. function-metric-delta.json compares every function in each changed source file to exact a97 using threshold-zero ESLint/Sonar measurements. Every existing function is unchanged; new helper functions are complexity 1 and 11, cognitive 0 and 5. No baseline increased. Scoped lint and git diff --check passed. The named interaction is registered for inventory regeneration by the normal hook.

Composition must preserve accepted integrated D2 table-policy/CREATE guards: this author base predates D2. This packet does not authorize copying old policy files over those integrated guards. Source approval here will not close other admission callers, marker physical fault proof, or release acceptance.

## Current manifest

- docs/admin-api-reference.md
- solve/quests/admin-owner-mutation-outcomes/evidence/receipt.json
- solve/quests/admin-owner-mutation-outcomes/log.ndjson
- solve/quests/admin-owner-mutation-outcomes/quest.json
- src/admin/admin-owner-operations.js
- src/config/config-constants.js
- src/config/dynamic-config-service.js
- src/control-plane/control-plane-single-row-confirmation.js
- src/policy/policy-constants.js
- src/policy/table-policy-service.js
- test/admin/admin-owner-mutation-outcomes.test.js
- test/config/dynamic-config-service.test.js
- test/policy/table-policy-service.test.js
- test/shards/impact-contracts.json
