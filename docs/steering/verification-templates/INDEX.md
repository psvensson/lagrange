# Verification Templates

Attack-surface checklists for adversarial verification subagents (and human
reviewers). When a change touches one of these categories, the verification
prompt SHOULD include that template's checklist — filled in with the change's
specifics — so review quality does not depend on the prompt author
remembering each classic failure mode.

Every checklist item cites the closure record or quest finding that put it on
the list. Every item demands an EVIDENCE PATH (file:line, log line, test
name), never a yes/no. **Anti-theater rule:** if a template item "passes"
review and the same defect class still ships twice, the item is either
promoted to a machine check (guideline audit / guard test) or deleted — a
checklist entry that catches nothing is noise.

| Change category | Template |
| --- | --- |
| Admission / gating / hold predicates | [admission-gating.md](admission-gating.md) |
| Retry / re-drive / follow-up loops | [retry-loops.md](retry-loops.md) |
| Transport / delivery / wake semantics | [transport-delivery.md](transport-delivery.md) |
| Sweep / timer / periodic enforcement | [sweep-timer.md](sweep-timer.md) |
| Recovery / replay / reconciliation | [recovery-replay.md](recovery-replay.md) |
| Concurrency / locking / single-flight | [concurrency-serialization.md](concurrency-serialization.md) |
| Formation-vs-steady-state circularity | [formation-circularity.md](formation-circularity.md) |
| Test-harness / fixture fidelity | [harness-fidelity.md](harness-fidelity.md) |

Usage in a verification prompt: paste the relevant checklist, replace each
placeholder with the change's specifics, and require the verifier to return
a verdict per item with an evidence path.
