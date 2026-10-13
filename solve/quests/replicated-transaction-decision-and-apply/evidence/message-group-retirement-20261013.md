# Message-group retirement identity guard — bounded proof

The independent Copilot review (PR #117, comment 4256028183) found that
`retireMessageGroupTransportHandler` logged a refused exact-handler retirement
without preventing callers from treating teardown as settled. The repair
consumes the already authoritative `requireReplicaHandlerRetirement` predicate
after reporting the exact result. No second identity check, fallback
address-only unregister, or new retirement owner is introduced.

## Verification
Workflow `rs-raft-message-group-retirement`, run 38374213330: **success**.
The negative control restores only the original retirement-consumer file
while keeping the test fixed; its new refusal assertion fails.
On the corrected source, the message-group activation/retirement, executor
activation and replica-runtime cleanup-custody cone passes. Focused ESLint,
the actual rs-raft operation-boundary audit, and whitespace checks pass.

## Remaining distinct review issue

Copilot comment 4256028250 is NOT resolved by this correction. The seed and
join creation paths register a transport handler before awaiting
`messageGroup.initialize()`, but publish the service into host custody only
on success. A rejection can therefore strand its exact handler before the
cleanup path can reach the service.

A complete correction must preserve original startup refusal identity, try
exact-handler retirement and service shutdown, retain the exact partially
created service under an existing host cleanup owner if either cleanup fails,
and ensure any repeated CREATE refuses while that debt remains rather than
returning CREATED. A production router without the identity API must fail
closed, never unregister by address. Do not merge this partial increment as
a resolution of that second finding.

No main merge, release, Solver approval or full candidate certification.
