# TX1 single-path preservation checkpoint

This is reviewed work in progress on `continue/rs-raft-alpha-single-path-20261013`.
It is not Quest landing, main merge, release approval or a passing full-corpus
certificate. The Quest remains active with two receipt obligations unresolved.

The parent is `e6d43bc1acb128a2b83ac89c77a3ec400e7edb1f` (the recovered cloud
candidate). Source/test evidence binds immutable input
`57f98ca76d948e3a8f0d9e4dbe63992d68bde987`; the final change afterward is existing
coupled-contract metadata registration plus preserved evidence. All 37 source
paths match `evidence/source-review-manifest-v3.json`. Main was only observed:
remote main was `599e9224b7ec9e2439bc5f6fb3ceebb4aaa1b68a` at preservation time.

## What changed

Delete the executable sessionId-only transaction engine, dispatch, old maps and
outcome producer, marker reconstruction and expiry healing. Keep current TX1
identity admission, participant sessions, durable reservations, replicated
PREPARE/immutable decision apply, release/drain, startup mirror and hold owners.
Reject malformed identity and active-session query collisions before side effects.

Remove all found live consumers of the retired transaction-active constant and
its alternate query/rebalancer retry branches. Forward the existing typed
failure code into the existing classifier. Keep unknown-outcome same-address
redelivery, explicit session identity, current route repair and retry budgets.
Obsolete tests are removed; current owner witnesses use current fixtures. No
new transaction, classifier or recovery algorithm was added.

## Measured evidence

- Historical broad changed-path cohort: 1146 files, 1054 pass, 92 fail,
  35018 assertions, on four locked physical lab hosts.
- Identical-test, predecessor-source controls on the same hosts: 90 red files
  reproduce; two introduced retry failures motivated the corrective source.
  Different cohort concurrency means this is not timing or assertion equivalence.
- Final immutable candidate: 16 files pass, 1240 runner assertions, across
  three locked lab hosts. Two behavioral source-revert controls fail against
  sourceV2 and pass against sourceV3; no missing import/setup failure is counted.
- Public facade: 50 leaf assertions (58 runner assertions), single runtime only.
  Its 126652 ms formation and 279572 ms runner duration are not a performance
  or timeout-free certificate; successful TAP omits runtime stderr.
- Exact duplicate-fragment comparison adds zero source or test clone identities.
  Production 47 groups/1462 lines passes the tightened ratchet. Tests remain
  697 groups/26415 lines, 46 above the existing limit; no limit increased.
- Fast static passes its other checks but fails the same three dependency edges.
  Whole-repository guideline findings match predecessor after position-only
  normalization: 318 literal, 42 decision-boundary and 3 silent-catch findings.
- Final impact and shard audits pass. Independent content/evidence review
  approves only non-main WIP preservation. Full review and raw failures are
  retained under `evidence/`; `frozen-v6-evidence-manifest.json` binds latest proof.

## Remaining system obligations

1. Deferred-election recovery spends the full healthy 10-second post-heal bound
   on both source inputs (19/20). Repair the existing release owner continuation
   in a separate measured Quest; do not add another recovery driver or more time.
2. Historical W1 healthy 30-second expiry and M1 one-node provisioning spent-wait
   remain unresolved. Later green runs do not close them.
3. Current full publication proof is refused pending release proof. The gating
   corpus has 2363 files, with three convergence probes observed separately.
   The historical 1146-file run does not satisfy that obligation.
4. The unresolved dependency import into orphan C2 promotion code, release
   dependency cycles, duplication/unused/guideline and solve footprint debt stay
   visible. A separate C2 removal Quest/design is prepared in another worktree;
   no C2 source implementation is included here.
5. Integrated multi-host startup, restart, crash/immutable-decision delivery,
   split/merge, replacement/seed loss, application snapshot authority, FreshMG
   activation and CDC certification remain parent rs-raft merge obligations.

The runbook explicitly permits a non-main WIP preservation commit and branch
push while gates are red. This checkpoint uses that route, not `solve land` or
`npm run publish`. No historical evidence is rewritten and no failed gate is
converted into a success claim.
