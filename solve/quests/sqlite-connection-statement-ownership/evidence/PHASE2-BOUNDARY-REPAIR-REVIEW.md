# Phase2 boundary repair frozen for independent review

Status: repair candidate, **NOT APPROVED**, no landing or migration-complete
claim. This packet follows the exact independent REJECT by
`subagent:01a1cec3-bbef-7f71-86de-41c00c07da42`, appended verbatim to this
Quest before any source/test edit. The old `PHASE2-REVIEW.md` and manifest remain
unchanged historical records.

## Candidate and scope

- Worktree: `/mnt/data/peter/projects/lagrange-codex-statement-owner-20261112`.
- HEAD remains `1b51362e0f7af24a5e373b8a57619d4cf13ec706`.
- Rules revision 5, source `2fca51dc9a2f0344e23f0535dfa50fe0e000b674`.
- Rejected manifest SHA256:
  `73327edb822156b7ef395bdd8da6db8c1c43528463f005b55faa10238e3f66d6`.
- Rejected source tree: `6c4cc931f37e859e3fd70a429229a569027b5f09`.
- Repaired source tree: `e005dfa408f0b84c6e81cc0cb2ff869e4a182c5d`.
- With local generated metadata: `cd53dbea6c7fe2d18e885469e0e131e67b131b50`.

The repair changes five source/test paths within the existing 95-path Phase2
delta. Approved Phase1's four files are byte-unchanged. The 55-file F carry-in
remains separately identified; three repaired modules already overlap F
(participant store, committed outcome, lifecycle owner). No additional F
construction, freshness, birth, receiver or permission semantics were changed.

| Changed path | Repair |
| --- | --- |
| `src/partition/partition-participant-transaction-store.js` | Assert ownership first in origin-history, origin-in-snapshot and participant-census entrypoints. |
| `src/raft/raft-rs-replica-lifecycle-owner.js` | Assert first in original-allocation issuance, before commit/pragma/catch work. One comment line compressed to retain the size limit. |
| `src/partition/partition-cdc-obligation-ledger.js` | Assert before retained obligation/progress census SQL and successful absence. |
| `src/partition/partition-committed-statement-outcome.js` | Assert before retained census and before failed settlement reads `open`, converts an error or registers rollback work. |
| `test/storage/sqlite-connection-production-boundaries.test.js` | Extend real boundary negatives with native SQL traces, NORMAL pragma setup, foreign getters and open raw transactions; retain raw uncached commit/rollback positive. |

Only seven assertion calls change executable production ASTs. The canonical
private-brand/cache/close owner and generic `commitDurably` module are
byte-unchanged. No fallback, adoption, statement registry or new authority was
introduced. Existing raw uncached utility contracts remain available.

`test/shards/impact-graph-seal.json` and `test/shards/subsystem-classes.json`
were regenerated separately. Other generated files remain unchanged from the
rejected candidate. Parent must regenerate metadata after composition.

## Causal and sibling review

`phase2-boundary-repair-audit.json` binds inspected source, historical commits,
the seven entrypoints and sibling dispositions. The shared failure was relying
on nested cache validation after outer transaction, pragma, snapshot or
settlement work. History traces that assumption to the prior raw-adopting cache
and its consumer migrations; the repair reuses the accepted private brand at
the actual entry boundaries.

The audit includes all 14 Phase2 production modules, schema/release census,
uncached snapshot mechanics and direct retained-effects callers. Constructors,
other original-row operations, cached readers and reservation paths already
validate before database effects. The existing schema/release-census conversion
to UNAVAILABLE happens after brand validation with no foreign DB effects.
File/backup/serialization utilities remain distinct uncached operations. This
is bounded source inspection plus the named runtime witnesses, not a
whole-program or hostile-host-JavaScript proof.

## Executed proof and first failures

The retained red run executed 64 cases: 46 passed and 18 failed for the intended
seven entry gaps. It measured the reviewer's exact BEGIN/ROLLBACK and
PRAGMA/FULL/BEGIN/ROLLBACK/restore sequence, four sibling snapshot readers'
getter/SQL access, and failed settlement's `open`/rollback-callback effects.
The raw `commitDurably` positive already passed on the rejected source.

Five focused files report **162 passing cases**, no retries, skips or todos:

| Focused file | Reported cases |
| --- | ---: |
| `test/storage/sqlite-connection-production-boundaries.test.js` | 64 |
| `test/partition/participant-origin-retained-history.test.js` | 35 |
| `test/raft/raft-rs-original-allocation-store.test.js` | 34 |
| `test/bootstrap/seed-retained-effects-preparation.test.js` | 9 |
| `test/partition/committed-statement-outcome.test.js` | 20 |

Every execution used `node scripts/checks/wait-for-thermal-headroom.js`, then
`flock /tmp/lagrange-local-test.lock nice -n 15 node scripts/run-test-files.js
--jobs 1 FILE`. No broad sweep ran. Boundary64 and original-allocation34 also
passed on the final frozen workspace inputs. The other three passed before
the lifecycle comment compression and metadata refresh; normalized AST evidence
proves the only runtime-source difference is that comment. Their measured
hashes and exact applicability differences are retained, not relabelled.

Nine final checks pass: scoped ESLint, metrics, literals, decision boundaries,
runtime grammar, strict size, strict test cyclomatic/cognitive checks and the
impact registry. Metadata generation also verified its import graph. No
baseline was raised. Two first static failures (103-column test import and
801-line lifecycle owner) were preserved before formatting-only correction.
A read-only inventory-helper shape error is also preserved separately.
`phase2-boundary-repair-verification.json` names commands, hashes, full TAP,
stderr, thermal records and proof limits. These are author-executed checks,
not independent approval or a claim of higher model tier.

## Evidence applicability and HOLD

The earlier 15-file/187-case results, all twelve native-child receipts, both
235-module closures and the 724-member archive remain intact. **Each native
closure includes all four changed production modules. Its old execution does
not certify this repair tree.** The packet records their old/new member hashes;
native child execution on the composed candidate remains pending with parent.
Prior Phase2 results are retained for their measured candidate rather than
counted as additional final repair passes.

Remaining HOLD: fresh independent review; receiver72 UNRUN on repaired bytes;
complete affected cone and production/lab composition; renewed native-child
proof; separate permission no-skip composition; six inherited guideline sites.
The hydration and lifecycle-observation bytes containing those six sites and
the permission file are unchanged. The Quest remains incomplete, metric3,
with production-composition, independent-review and static-guards receipts
false. No reviewer is claimed to be working on this new candidate yet; parent
owns assignment and integration.

## Preservation and reproduction

Before editing, 180 manifest inputs were hash-verified. The new external
rejected-candidate archive has 804 members, each reopened and hash-verified:
`/tmp/lagrange-sqlite-phase2-boundary-repair-20261112/rejected-candidate.tar.gz`,
SHA256 `fbd38aa7705811aac02ef4cbe56ce0c4cf58911ee2b4425a9ed4ba2169e78164`.
It includes the prior preservation archive without replacing any original.

The same external directory contains:

- `repair-only.patch`: five-path delta from the rejected source tree, SHA256
  `ab9800f2c5a6b0199c54f8c7efe10e7ddba9aa69b930bee832341e705681dbee`.
- `phase2-repaired-only.patch`: complete 95-path delta from approved Phase1+F
  tree `671776ed958372170c1bbcd643f5d55c32cb9e45`, SHA256
  `1bcb129917c79b5c1119ca0248d6cc4e10c8fdbb3c231d9d36558e59789b9955`.
- Separate generated-only patch and exact source/input/check manifests.

Both source patches were independently reapplied through external temporary
indexes and reconstructed the same repaired source tree. New tree/blob objects
are stored only in the external `objects/` directory; `source-freeze.json`
records the Git object/index environment required to inspect them. These are
trees, not commits. The real worktree index remains byte-identical.

`phase2-boundary-repair-manifest.json` binds the final artifacts, final external
archive/inventory, source identities and changed paths. Keep the previous
compact required-proof packet as historical evidence and add these four new
review files plus the append-only Quest log. Do not stage historical raw
corpora. Parent owns canonical evidence-store retention/upload; none is claimed
here. No primary/integration/other-worktree edit, commit, push or landing was
performed by this repair.
