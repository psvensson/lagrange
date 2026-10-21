---
audience: development
documentClass: current
---

# Additive correction to the retained partial-seed charter

Date: 2026-10-21. Author: subagent release_recovery_writer. Design evidence only.
The original charter is preserved byte-for-byte at
`retained-partial-seed-recovery-charter-2026-10-21.md`, SHA256
`df6ce8656bc154b871acb4ef6a44002bdeae82a894cc08eb4f6de44d2e7f9863`.
This correction supersedes only its proposed public witness budget and its
proposed next-unit completion boundary; it does not amend any Quest seal.

The independent charter review (SHA256
`8698008180f8fb22a6af018ba9ee6cd89a2bcd13bb61e63cfadacff0b6460a5e`)
correctly distinguishes the existing lower-entry witness from a public restart.
Its 3,000ms budget is an explicit test fixture override in
`test/test-helpers/seed-release-failure-custody-fixture.js:42`.
Public `startSeedNode` at `src/lagrange-runtime-startup.js:422` passes no
BootstrapService configuration override; the constructor at
`src/bootstrap/bootstrap-service.js:202` uses the default
`leadershipWaitTimeoutMs: 30000` from
`src/bootstrap/bootstrap-constants.js:395`. A future public-entry witness must
select the real issued absolute deadline, assert its actual default budget,
and expire only the selected original attempt through the existing injected
handler clock. It must not transplant 3,000ms, extend a timeout, change native
clocks, or suppress canonical recovery. The existing 3,000ms lower-entry
witness and its accepted evidence remain unchanged.

The literal seed-restart-v2 seal requires cluster-id match plus its existing
peer/quorum proof before a durable seed serves bootstrap. A complete local
original allocation, intact native histories, or multiple replicas on one node
cannot substitute for that proof. The source at
`src/bootstrap/seed-recovery-proof.js:37` remains authoritative. The proposed
next bounded unit therefore ends at a **complete nonserving original handoff**
through the real cold public entry, followed by exact cleanup and a typed
serving-deferred outcome. It does not promise full isolated startup success.
The cold continuation extent is the known pre-registration cut with all
original handoff rights still UNUSED. Any SUBMITTED/TRANSFERRED cold state needs
independent current authority or remains HOLD before native reconstruction;
same-live-owner lost-answer reconciliation does not prove that cold progress.
The full startup/serving positive proposed by the original charter is an
explicitly unsatisfied larger-plan obligation. It is not reclassified as green.

The accompanying `retained-partial-seed-original-handoff-contract-draft-2026-10-21.md`
resolves the five review items as a concrete proposal for independent review.
It preserves the earlier source frontier: direct BootstrapService restart
refused the first partition at CREATE_OWNER_DEFERRED. No actual cold public
restart or prospective grant has yet been implemented or measured. Before
source work, a frozen public witness must first reach the real registered
ENABLE on unchanged candidate 393f411ca09449898465cc3cb7320c03fba2aba8 and
preserve its first actual restart frontier. Earlier setup failure is a separate
prerequisite, never permission to replace public entry with the lower seam.
