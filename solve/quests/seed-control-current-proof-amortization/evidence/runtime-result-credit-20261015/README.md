# Runtime/result credit checkpoint - implementation HOLD

Reviewed input: `fb3c09d4a90952ee57bb2de09aa1e0b6cf1f2e9c`.
Test checkpoint: `f02153dbd406ef55010d596fe15579890bc97e5c`.
Branch: `review/runtime-result-credit-contract-20261015`.
The publication receipt binds the later evidence head and archive separately.
This branch carries rejected predecessor production source and must not be
merged wholesale. No production source, timeout or protocol changed here.

## Result

The recorder repair is independently approved. Both nested test observers now
preserve the original receiver, all arguments, original native Promise/value,
rejection and synchronous throw. Observation errors fail fixture teardown
separately; they cannot manufacture a transport failure or success. The helper
is scoped to the existing native-Promise seam, not arbitrary thenable semantics.

Four forwarding controls pass. A callable two-argument-loss mutant fails with
`2 !== 4` at the forwarding assertion; it has three other passing controls.
The first, narrower PASS3 run is also preserved. The final witness adds pending
Promise ordering and unchanged arbitrary non-success response observations;
its `ack` field is a test value, not canonical MessageRouter-shape certification.

The authorized whole native file ran once on locked `lenovo-laptop` at the
test checkpoint: **one passed file, zero failed files, 5,015 ms** classified.
The runner rechecked exact source/dependencies and used its isolated checkout
and machine locks. This is RF3 on one physical host, not multi-host certification.
The three application replicas end applied/committed at 6, OPEN, retaining
their ROLLED_BACK participant rows. Two real QueryEngine ROLLBACK deliveries
return the same terminal decision position. Four invocation-proof observations
are retained; query census remains HELD. The later local release took about
78.27 ms. This preserves the existing local-PAUSE ROLLBACK baseline. It proves
neither COMMIT nor committed HOLD, stalled delivery deadlines or snapshot import.

The previous accepted run at `8a4986dd82e4f26436945dc139727024d9b70b41` remains
unchanged; this new run is not attributed to those earlier bytes.

## Capacity decision and remaining blockers

[CAPACITY-CONTRACT.md](CAPACITY-CONTRACT.md) contains the complete custody table,
identity/charge definitions, fixed-cell retirement proposal, exact proposed
interfaces, settlement treatment, D3 phase clarification and acceptance matrix.
Its SHA256 is `785993d39dd966a20461c3fb8563826d2fa785c6a523e68335b65908f4928684`.

Select the existing runtime/result/application interaction. Waiter removal
does not release consensus custody; all profiled command creation includes
forwarded proposals; application atomically exchanges reservation for result.
One fixed retirement receipt plus a history frontier avoids allocating another
receipt per generation. TX/query retain sole settlement authority.

**A finite complete-system bound and nonstarvable reopening are not proved.**
The proposed 4,243,456-byte calculation is a conditional active-leader release
admission envelope, not an adopted policy or replacement certification for the
earlier 5,388,288-byte arithmetic. Concrete remaining counterexamples are:

* Expiring waiters while consensus retains commands defeats today's Q bound.
* Leader admission limits do not bound a lagging follower's distinct unapplied
  requests across repeated retirement generations.
* Competing refusals can refill APPROVE capacity after retirement. Even fair
  admission is insufficient if subsequent RETIRE commands repeatedly overtake
  admitted recovery APPROVEs before application.
* One PREPARED participant does not bound the global decision encoding. Serial
  settled transactions also accumulate durable history under current owners.

The fixed-cell trace is a candidate progress path with these explicit blockers,
not an executed native capacity witness. No production seam exists yet for the
full custody transfers, authoritative suffix-discard deltas, bounded inventory
reconstruction or ordered recovery fairness. No mock or missing-symbol RED is
substituted. The limited encoding probe tests actual existing canonical readers;
its 4,096-participant acceptance is parser evidence, not native fleet reachability.

Already acknowledged larger TX1 obligations retain settlement under TX/query;
a release budget cannot reject their authoritative decision. Prefix provenance,
durable query discharge, INIT activation and the existing application-image /
native accepted Ready / atomic-import contract remain named owner dependencies.
Normal legitimately admitted TX1 staging does not revoke its own D3 grant.

The preserved [comparative precedents](../native-owner-contract-20261015/COMPARATIVE-PRECEDENTS.md)
remain useful: atomic compare/result ownership, request retirement protection,
stable intent through uncertainty, and maintenance under saturation. Their
pinned LogCabin/Raft and official etcd/FoundationDB sources are not a proof of
Lagrange's missing custody or recovery interfaces. No general research/model
campaign was repeated.

## Changed files, evidence and ownership

The test commit changes four files: new
`test/partition/participant-release-delivery-recorder.js` and its `.test.js`,
plus the existing query-engine and TX1 native fixtures. It updates
`test/shards/impact-contracts.json`, primary/resource/subsystem classifications,
the impact graph seal and hook-generated global-owner-debt inventory. The
native settlement test itself is unchanged. All later changes are this evidence
packet, its publication receipt and the append-only Quest evidence finding.

[VERIFICATION.json](VERIFICATION.json) separates scoped greens from inherited
debt and records the corrected complexity CLI invocation. Normal hooks ran;
they recorded inherited complexity/duplication ratchet excess without raising
baselines. Scoped ESLint, scoped complexity, shard/impact audits passed. RC1/RC2
remain inherited F-MIR failures; no waiver or rerun is claimed.

Raw evidence is in `evidence/`: first/final forwarding TAP, semantic negative
control, exact size probe and output, locked native log/discovery/plan/TAP,
controller bytes and normal commit log. Git preserves executable evidence as
`.mjs.txt` or `.js.txt`; the full archive also carries executable originals.
The archive manifest hashes every payload member. It excludes local process
command lines and the shared staged patch.

Independent reports in `reviews/` bind exact source/contract hashes. Earlier
review rounds are preserved, including REVISE and its resolved witness gaps.
Read [OWNERSHIP.json](OWNERSHIP.json): the isolated review tree is this lane's
only checkout. Shared integration HEAD remains `0996d7576516af24f5f4d3e1e9aee37c775aabae`
with the same 18 staged paths and staged-byte hash. No existing agent/process,
shared dependency installation or historical evidence was altered.

Stop for content-bound owner review of this capacity contract. Production
implementation remains HOLD; successor unsealed/unactivated; shared-control-wave
HELD; Runner/TAP PARKED; PR #122 and `bde70cec...` remain rejected. No merge or
main publication is authorized by this checkpoint.
