# Protected closure checkpoint

Design and evidence review only. Source baseline and accepted predecessor:
`0c981c7b18eabd11b021d8ddbaccd506a5e1a666`, freshly verified against
`origin/review/ordered-release-recovery-20261015`.

Selected proposal: **RETIRE_AND_HOLD**, sharing RETIRE_AND_APPROVE's single
maintenance custody slot, future child/result reservation and atomic application
exchange. See [contract](PROTECTED-CLOSURE-CONTRACT.md) and
[native implementation plan](NATIVE-IMPLEMENTATION-PLAN.md).

The closed design counterexample is OPEN with full HOLD history, followed by
retirement and competing refusals occupying every freed HOLD result slot before
the necessary HOLD obtains one. The carried child already owns its reservation;
retirement and its disposition are indivisible at application. A real expected
state change can refuse it. HELD/ALREADY_HELD is distinct from local D3 closure.

The same illustrative leader projection remains **4,273,152 bytes**: the new
variant adds no simultaneous slot or future result. This is sizing arithmetic,
not an adopted resource bound. H exchange <=2 pending +1 child <=4;
A exchange <=4 pending +1 child <=8. Pins, profile/encoding support and recovered
custody remain explicit assumptions; no follower quota gates accepted replay.

[Reproduction and limitations](REPRODUCTION.md) distinguishes new design traces
from native observations. No unchanged recorder, ROLLBACK, persistence or Ready
tests were rerun; no new native release command exists to certify. Cheap trace
execution used an isolated local evidence directory. No lab reservation or
shared dependency installation was changed. Prior locked native evidence is
retained as baseline, not relabeled as execution of this proposal.

The implementation plan covers shared local/forwarded admission, finite
accepted-work service, exact discard/reconstruction and one atomic result
exchange for BOTH pressure directions. It explicitly includes closing before
the current successful-control-release/build/drain prerequisites, and custody
revision wakeup into the existing release continuation. Those changes are
proposed interfaces and native REDs, not implemented guarantees.

Fresh ownership observations: isolated worktree
`/mnt/data/peter/projects/.worktrees/protected-release-closure-20261015`, branch
`review/protected-release-closure-20261015`; shared integration checkout observed
at `0996d7576516af24f5f4d3e1e9aee37c775aabae` with 18 staged paths, staged patch
SHA256 `0b2ea79142a13f4dcada523f01108fbd8a4809492838e23f7a0246a7159953fc`.
The process inventory was refreshed without stopping or claiming existing
agents. These are observations, not ownership leases. Raw full process lines
and staged patch remain private local evidence; published observations omit them.

Earlier accepted/rejected evidence remains unchanged, including the prior
trace SHA256 `77863f5f600cf9764e4f25dc5c9f75abbbae715603069a9f9af34df71dc8e1cf`.
This evidence branch still carries rejected predecessor source and must NOT be
merged wholesale. No production src, test fixture, timeout or snapshot changes.
The archive and publication receipt identify exact packet bytes separately from
the later receipt commit. Publication is non-main preservation, not Quest-land.

Stop for content-bound review. Production implementation and successor
sealing/activation remain HOLD; shared-control-wave HELD; Runner/TAP PARKED;
PR #122 and bde70cec remain rejected. Snapshot/provenance/durable discharge,
activation, settlement-size and deadline contracts remain with their named
owners. No native protocol claim is inferred from the design checker.
