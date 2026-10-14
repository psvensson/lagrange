# Applied-position controls V6 freeze

This test-only correction closes the four bounded B1-B4 findings in independent
review `6c3abe4b6bdf52de4955da97b75b4d6c4819ce6d9db9beb2decb7d3231468fc4`.
It is based on committed V5a `7596c52c23e0b9167356d4841c5975ebcafd83ca`.
No production, native witness, final-query witness, Quest, registry, generated
metadata, Git index or commit was changed. No behavioral test or lab command was
run. Content and behavior remain pending independent review and root-owned
source composition.

## B1: coherent N then real K before adjudication

`participant-release-applied-position.test.js` removes its private captured
membership gate and uses the shared fixture gate with its settlement/retirement
custody. The operation-port wrapper delegates the facts owner's first
`readStatus` to capture coherent N. On the second real status read, which is the
post-facts adjudication boundary in both reviewed treatments, it applies the
already accepted ordinary SQL proposal through `ControllableConsensusPort.commit`
and explicitly publishes the existing `RAFT_EVENT.APPLIED_PROGRESS` seam.
The returned status is therefore actual K.

The witness names false STALE as the defect, requires exactly the N/K reads,
requires K>N while term, leader, configuration, membership generation, runtime
generation and lifecycle incarnation stay equal, and retains real statement,
durable outcome, log-index, proposal-queue and CLOSED-admission assertions.
The event is explicitly a controlled publication seam; native publication
remains separate. Operation-port, subscription, membership and settlement
cleanup preserve independent failures.

## B2: retained cleanup debt is reached through the registry owner

`replica-handler-release-recovery.test.js` restores the exact still-live service
through the real tracked registry after the terminal removal wake and before
either retained-debt join. Cleanup-call and membership-read baselines are taken
after that registry wake. Exact joins can therefore reach the retained
observation promise instead of failing early with `hosted_replica`.

After clean discharge, the canonical fresh request is built before installing
the next membership hold. This removes the self-deadlock while preserving the
same service, request owner, stored answer, nonrenewal, resource release,
fresh-record and later shutdown-error custody assertions.

## B3: hostile Array iteration is scoped to the changed parser

The ingress witness replaces the ambient Array iterator only long enough to
observe iteration of the frozen exact `release/attempt/target/origin` field-name
array. Every unrelated array delegates to the captured original iterator. The
correct indexed capture must leave the counter at zero, execute no nested getter,
start no membership read and return the canonical INVALID answer with null
release identity. Iterator restoration retains the primary failure.

## B4: gate custody begins at acquisition

The ingress membership gate is acquired immediately before the owning
try/finally. Generic unsafe envelopes, every malformed nested variant, the
scoped iterator control and the final valid observation all run inside that
custody. The removed private B1 gate eliminates a second restoration algorithm;
the existing shared gate owns held-call settlement and restoration.

## Static verification and limits

All four staged-existing control paths were supplied to every exact static
command, including the two unchanged shared-owner files.

- Four `node --check` commands: PASS.
- Exact four-file ESLint: PASS.
- Strict scoped cyclomatic 12 / cognitive 20: PASS, zero violations.
- Repository file-size ratchet: PASS. Exact lines are F1172, P760, R1416,
  A929; every selected test/helper remains below 1500.
- Four-path `git diff --check` against V5a: PASS.
- The first scoped-metrics attempt honestly found ingress complexity 14. The
  scoped nested-array assertion was extracted without a threshold/baseline
  change; `scoped-metrics-attempt1.log` retains that failed pre-freeze attempt.
- V5a-to-V6 patch: 92 insertions and 101 deletions across R and A. F and P are
  byte-identical to V5a. No new gate, release classifier, timer, budget,
  retry, authority or cleanup store was added.

Behavior remains intentionally unrun in this old-source controls worktree.
The retained-feature be8 treatment, approved candidate source, source controls,
native/query/startup/corpus proof, normal metadata and Quest disposition remain
root-owned HOLDs.
