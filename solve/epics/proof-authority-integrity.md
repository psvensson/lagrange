---
id: proof-authority-integrity
status: open
proof: deterministic
roadmapRow: null
doneWhen:
  probe: test-receipt
  args:
    file: solve/epics/proof-authority-integrity/evidence/receipt.json
    requiredReceipts:
      - pushed-ref-is-explicit-subject
      - proof-runs-on-immutable-subject
      - non-import-observers-registered
      - observer-selection-fails-closed
      - dirty-worktree-and-multiref-falsifiers
quests:
  - pushed-ref-proof-subject
  - immutable-push-proof-worktree
  - observation-dependency-contract
  - observation-surface-census
  - observation-aware-proof-selection
  - proof-authority-integrity-falsifiers
authorizes:
  - .githooks/pre-push
  - scripts/session-worktree.js
  - scripts/select-change-tests.js
  - scripts/run-project-hardening-acceptance.js
  - scripts/checks/changed-paths.js
  - scripts/checks/change-selection-constants.js
  - scripts/checks/helper-import-closure.js
  - scripts/checks/impact-contract-registry.js
  - scripts/checks/push-gate-change-proof.js
  - test/manifests/project-hardening-proof-postpush-manifest.json
  - test/shards
  - test/scripts
  - test/config
  - solve/epics/proof-authority-integrity
---

# Proof authority integrity

The ordinary change gate may become cheaper only after it proves the exact tree
being published and its impact model covers dependencies that do not appear in
the JavaScript import graph. This epic closes those two correctness holes before
any later epic is allowed to narrow proof or provision less environment from a
selected cone.

The 2026-09-13 verifier review found two independent problems. First, the
pre-push hook receives the local SHA of the ref being pushed but its final
behavioural proof still executes in the caller's live worktree; uncommitted or
untracked bytes can therefore affect a verdict for a different committed tree.
Second, the full-corpus canary exposed a real architecture guardrail failure in
`test/config/control-plane-gateway-registry-guardrails.test.js`: that test walks
and reads `src/**/*.js` rather than importing the source files it validates, so
an import-closure-only selector cannot represent its dependency.

This epic is a correctness follow-up to `lean-push-gate`, not a reversal of its
change-scoped design. The governing rule remains "prove the change"; the change
must now have one immutable subject and a complete-enough dependency model.

## Binding invariants

- **One proof subject.** An authoritative push proof names the exact commit tree
  it proves. It never silently substitutes the live worktree.
- **Ref input is authoritative.** Git's pre-push ref lines determine the tree or
  trees being published. The first ref on stdin is never treated as a semantic
  owner merely because it arrived first.
- **No hidden observer edges.** Imports, subsystem ownership and boundary
  consumers are not assumed to cover tests/checkers that enumerate, glob, read
  or otherwise inspect repository files dynamically.
- **One impact authority.** Observation edges extend the existing impact
  contract/proof-cone authority; they do not create a second path taxonomy in
  a hook or workflow.
- **Fail closed.** If a changed path reaches an observer whose surface cannot be
  represented safely, selection refuses and the push gate takes the existing
  full-corpus branch.
- **No proof-result cache here.** This epic does not implement per-test receipts,
  exact-proof reuse or any other skip cache. It makes future reuse safe enough
  to discuss.

## Quests, in strict order

**pushed-ref-proof-subject** — make pushed-ref identity explicit. The hook
parses every pre-push input line into a subject record. A main update uses the
local SHA paired with `refs/heads/main` and its paired remote SHA as the change
base; tag-only pushes of commits already on `origin/main` keep the existing fast
path. A push containing multiple distinct unpublished branch trees either
proves every distinct subject or refuses with the refs and SHAs listed; it
never proves whichever ref happened to be read first. Probe: test-receipt with
falsifiers for main+tag, two equal branch trees, two distinct branch trees and
tag-only deletion.

**immutable-push-proof-worktree** — run the authoritative pre-push proof on the
subject tree, not on live editor state. Reuse the existing session/snapshot
worktree mechanism and materialise each distinct subject at most once; the
static stages and behavioural stage for that subject share the same immutable
checkout. Interactive `npm run check` remains a worktree-aware developer tool.
The red test is a committed failure masked by an unstaged local fix: the push
must stay red because the fix is not in the pushed SHA. A complementary test
shows an untracked file cannot make a committed push red or green unless it is
part of the subject.

**observation-dependency-contract** — extend the canonical impact contract
model with non-import observation edges. A test/checker that inspects files
outside its static import closure declares the observed surface and the reason
for it (for example a source-tree guardrail scanning `src/**/*.js`). The
selector consumes the same canonical registry that owns coupled producer /
consumer boundaries today. A declaration is dependency metadata, not a new
subsystem tag. Changes to the declaration schema or its producer are selection
machinery and therefore force the conservative/full branch.

**observation-surface-census** — inventory repository tests and gate checkers
that can observe files without importing them. Start from tree-enumeration and
dynamic-observation primitives (`readdir*`, glob/walk helpers, repository-root
scans, dynamic `readFile*`, and child processes whose contract inspects the
checkout), then review each hit. Every relevant observer is either registered
with a bounded surface or has a recorded proof that all external bytes it can
observe are already represented by an existing canonical edge. The census is
a verifier aid; the registry remains the authority. The known gateway-registry
guardrail must emerge from the census without being hand-special-cased in the
selector.

**observation-aware-proof-selection** — the ordinary proof is the union of the
existing safety spine, source/subsystem ownership, boundary consumer closure,
helper/import closure and the reverse closure of observation edges. Changing
`src/bootstrap/shared/runtime-service-handler-setup.js` must select the gateway
registry guardrail even though that test does not import the file. Removing or
corrupting the required observation declaration makes selection refuse rather
than quietly omit the test. No YAML or shell path classifier is added.

**proof-authority-integrity-falsifiers** — final adversarial packet and epic
receipt. Required falsifiers: an unstaged fix cannot satisfy a pushed failing
SHA; an unstaged regression cannot condemn a clean pushed SHA; a multi-ref push
cannot choose an arbitrary first subject; a dynamically observing guardrail is
selected from a source-only change; deleting its observation edge refuses or
widens to full corpus; modifying the selector/observer machinery itself takes
the full-proof branch. The receipt records the exact subject SHA and proof-plan
identity for each case.

## Relation to other epics

`apparatus-release-consolidation` remains owner of release publication, script
count, repository-size budgets and source-shape policy. Its solved
`lean-push-gate` quest established change-scoped testing; this epic repairs the
subject and dependency semantics discovered by verification afterward.

`gate-work-consolidation` may land its mechanically safe de-duplication work in
parallel, but its quests that *skip* a check, narrow a proof, or provision an
environment from the selected cone are blocked until this epic is done.
`test-file-content-receipts` stays parked: no cache is introduced as a shortcut
around these correctness obligations.

## Guardrails

- Any implementation change to selection machinery receives independent
  verification newer than the last attempt before landing.
- Do not add a second registry for observation edges if the existing impact
  contract schema can express them with a compatible extension.
- Do not move broad source observers into the safety spine merely to make the
  symptom disappear; encode the dependency that makes them relevant.
- Do not weaken the existing whole-corpus fallback while this epic is open.
- If exact-subject execution reveals a pre-existing red that the live-worktree
  path hid, stop and repair or explicitly attribute that red before continuing.
