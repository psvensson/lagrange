# U1 strict legacy REMOVE read contract: independent approval addendum

Date: 2026-10-19. Reviewer: `subagent:/root/lifecycle_design_research`.

## Disposition and exact scope

**APPROVE** the minimum correction to the scripted repository-consumer witness
in `test/control-plane/replica-dispatch-reservation-identity.test.js:186–234`,
at complete-file SHA256
`0dd845ca42bcdbb3db8851fd610df077438ca145bf15c43d8a039d091be86b17`.

This is an append-only disposition following the **REVISE** in
`u1-revised-restart-and-legacy-oracles-independent-review-20261019.md`
(SHA256 `3123d44da26400b44773e5618bf3d81b652d86f5810affb4d184f9bb5552483c`).
That earlier finding and its reviewed bytes are preserved. This addendum
approves only the subsequent narrow correction; it does not retrospectively
approve the missing read-option discriminator in the earlier test.

The reviewer independently read the exact diff, the complete named test,
and the unchanged dispatch/repository source below. No source or test was
edited by this reviewer, and no test or mutation was executed.

## Why the correction satisfies the request

The delta changes the test label and comments to identify a dispatch
consumer with a scripted repository seam. It adds two assertions:

1. The captured repository read ID equals the exact original requested
   operation ID.
2. `requireAbsenceConfirmation` is exactly `true`.

The existing `OWNER_RPC_REQUIRED` assertion remains. So do the six typed
observations: exact admitted operation, wrong entity, wrong node, terminal
operation, confirmed absence, and unavailable owner. No response expectation,
production behavior, or other witness is changed by this delta.

The read contract comes from the actual owner interaction, not from the
scripted reply. `src/control-plane/replica-dispatch-service.js:47–74` requests
the original operation with both strict options and validates its exact
REMOVE/entity/replica/host/incomplete-workflow identity. At
`src/rebalancer/replica-operation-repository-read-methods.js:425–438`,
`requireAbsenceConfirmation: true` is what retains a failed authoritative
read as explicit deferral when no other deferral applies. At
`src/rebalancer/replica-operation-repository-visibility-methods.js:489–493`,
the priority-recovery helper legitimately supplies no deferral outside that
mode. Omitting the option would therefore remain a real consumer-contract
defect even if a stub independently scripted an unavailable answer.

By direct inspection, a source-only mutation that changes the requested ID,
omits `OWNER_RPC_REQUIRED`, or omits `requireAbsenceConfirmation: true` now
fails the corresponding captured-call assertion. This is a discrimination
argument, not an executed negative-control result.

## Evidence ceiling

This witness verifies the dispatch consumer's exact request and typed-response
mapping at a scripted repository boundary. It does not execute a repository
RPC, demonstrate real owner unavailability, grant generation authority from
a dispatch projection, or prove physical successor safety. The handler and
physical lifecycle witnesses retain their separate scopes. No U1 acceptance,
source acceptance, combined-suite pass, or U2 authorization follows from this
approval.

## Byte bindings

Production remains the reviewed `a55ab41296faf30a4c404c56117eacbaa993c903`
source for these files. Full-file hashes bind the exact bytes read and do not
broaden the named review scope.

| File | SHA256 |
| --- | --- |
| `test/control-plane/replica-dispatch-reservation-identity.test.js` | `0dd845ca42bcdbb3db8851fd610df077438ca145bf15c43d8a039d091be86b17` |
| `src/control-plane/replica-dispatch-service.js` | `385217923b84a9981204398d25b434453d01df709aa09daf429f24c378e04352` |
| `src/rebalancer/replica-operation-repository-read-methods.js` | `a7618950221ffce5ad837774c4d89827bfe8c7c466a8be119cb447a60249d677` |
| `src/rebalancer/replica-operation-repository-visibility-methods.js` | `1eb7bc55867b2a319bd5e04cdedd09edf314f2483d6639cc6319ef228fce77e8` |

Root reported ESLint and diff checks separately. This review does not claim
to have run those checks or transfer them into behavioral evidence.
