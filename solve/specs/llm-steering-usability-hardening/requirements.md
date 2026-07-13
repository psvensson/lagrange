# LLM Steering Usability Hardening

## Result

An LLM can enter, author, drive, verify, and close Solver work through one
honest command surface without relying on hidden rules, unavailable adapters,
ambiguous continuation behavior, or mutable historical records.

## Owner Contracts

1. **Orientation owner** — `solve doctor` reports capabilities without mutation;
   `solve next` owns the typed next-action projection.
2. **Continuation owner** — the supervisor replays only progress-bearing cycle
   bounds. Actions that require judgment return to the external driver exactly
   once with their typed next action intact.
3. **Authoring owner** — a versioned Quest authoring contract distinguishes
   drafts from sealed declarations and validates every first-seal path.
4. **Steering-pack owner** — every binding rule is either emitted in the
   selectively loaded complete domain pack or assigned an explicit direct-load
   or reference-only source role.
5. **Verification owner** — verified checkpoints bind approval to exact attempt
   content; terminal handoff binds approval to the aggregate source scope and
   requires the full audit.
6. **Canon owner** — each onboarding document owns one concern, and the legacy
   census is a read-only report that never rewrites historical Quest truth.

## Quest Sequence

| Quest | Sealed outcome | Depends on |
| --- | --- | --- |
| `llm-steering-operator-orientation-isolated-evidence` | Doctor, typed next actions, discoverability, safe local config and attribution | — |
| `llm-steering-supervisor-actions-isolated-evidence` | Honest one-stop supervisor action semantics | operator orientation successor |
| `llm-steering-authoring-contract-isolated-evidence` | Versioned linted draft/seal contract and complete link authoring | — |
| `llm-steering-complete-rule-surface` | Complete selectively loaded domain packs with explicit source roles | — |
| `llm-steering-verification-handoff` | Fingerprinted verified checkpoints and full-audit terminal handoff | operator orientation successor |
| `llm-steering-canon-legacy-report` | Non-duplicated canon and immutable legacy census | all prior Quests |

Independent Quests may be implemented concurrently only when their changed
files do not overlap. The final canon Quest follows the other five because its
text must describe their landed behavior rather than anticipated behavior.

## Authoring Contract

New Quests declare `authoringContractVersion`. Absence means legacy. For the
new version, the first `step`, `attempt`, or `run` seals the statement, class,
`doneWhen`, frontier identities and metrics, constraints, and the authoring
version. Lint runs before that declaration and must leave no declaration or
pending state when it fails.

Historical Quest files, logs, declarations, and closure outcomes remain
byte-identical. The legacy census may report and propose repairs, but it never
applies them.

## Verification Contract

- A source-changing attempt may be checkpointed only after a verifier approval
  names the attempt change-reference content fingerprint.
- `solve checkpoint --id <id>` is explicit; recording a finding has no commit
  side effect.
- Terminal handoff requires a passing full audit and approval of the recomputed
  aggregate source-scope fingerprint after the latest source change.
- One approval may cover both levels only when the single attempt fingerprint
  equals the aggregate fingerprint.

## Proof

Each Quest has a deterministic guard scenario named after the Quest. Three
consecutive green reports satisfy its `doneWhen`. The integrated proof also
runs:

```sh
npm run steering:check
npm run solve:consistency
npm run test:static
npm run test:fast
```

Every source-changing Quest receives independent subagent verification before
terminal audit and scoped local commit. No Quest command pushes.

The initial operator-orientation, supervisor-actions, and authoring-contract
drafts were exhausted before any attempt because they sealed the repository-wide
report directory, whose unrelated large reports made an absent-scenario probe
unusable. Their successors above use the isolated report directory shared by
this spec's six proof scenarios.
