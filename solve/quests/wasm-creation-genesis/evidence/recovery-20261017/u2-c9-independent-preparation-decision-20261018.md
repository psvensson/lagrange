# U2 C9 preparation: independent scope decisions

Reviewer and lead: `subagent:/root`, 2026-10-18. Preparation author:
`subagent:/root/u1_finality`.

Reviewed document: `u2-c9-process-recovery-design-gaps-20261018.md`, SHA256
`d064511f7cf2139397f6875c6d04c5ac530416185935dddba1cb342df497e1b5`.
The reviewer read it completely and checked its bound input manifest as
recorded in `u2-progress-independent-contract-verdict-20261018.md`.

Verdict: **ACCEPT the preparation's source findings and the following scope
decisions; concrete fixture/oracle approval remains open.** No C9 source,
test execution or process recovery receipt is approved here. Corrected U1
independent approval remains a prerequisite to U2 implementation.

## Named cuts and truthful evidence ceilings

The later RECOVERY-DESIGN R2-H/P-R10 is the governing **post-PUBLISHED C9
successor**: one actual child hosts all three native RF3 service hosts over
their three retained directories and a shared file-backed component metadata/
journal database. The parent observes the committed local PUBLISHED state,
SIGKILLs its exact child, observes the actual SIGKILL close result, reconstructs
all three hosts, and proves original identity plus real confirmed publication.

The original TEST-PLAN C9 pre-INIT cut is a distinct useful obligation and is
**retained as an additional separately named C9-pre-INIT receipt**. It must
kill after the original binding/root is durably retained and before that
creation's first INIT, then prove old-INIT exclusion and completion of the
first valid original INIT after reconstruction. This explicitly resolves the
two differently worded C9 records without treating a post-publication retry
as first initialization. A shared child fixture may expose both owned cuts;
each requires its own raw schedule, durable observation and result.

Neither ordinary process-crash cut, by itself, proves recovery from a fact
that exists only in uncheckpointed WAL, a mid-Ready interruption, a host OS or
power failure, native metadata quorum loss, or three separate host processes.
The prior owner-plan sentence claiming uncheckpointed-WAL proof from the
proposed shape is explicitly withdrawn as an unproven inference. Preserve all
SQLite/WAL files and report actual modes. Additional WAL-dependent or mid-Ready
claims require their own reviewed non-mutating discriminator and cut; they
are not required additions to these two process-crash receipts.

## Accepted reconstruction constraints

The preparation correctly identifies that current fixture constructors cannot
be used unchanged for reconstruction: they allocate new directories, INSTALL
the catalog, or select a new instance request. Recovery must instead compose
the same owners over retained paths and read the original validated journal
intent, token and opening. An IPC manifest supplies locators, never authority.
Observe that INSTALL, selection, new-intent creation and new admission are not
called even if their idempotent result might equal the original. Resolution,
confirmation and the existing ordinary continuation remain permitted.

Every reconstructed host acquires actual process custody before inventory or
open. Supply original journal owners and artifact/module availability, apply
corrected U1 inventory before external requests, and use a later boot
incarnation. No orderly cleanup, native shutdown, DB close, explicit checkpoint
or directory-owner release may precede the measured kill. Join actual child
death before reusing any directory. A pre-kill independent contender must be
fenced; a post-death successor must acquire through the real owner.

Compare immutable identity and the original native INIT receipt/log prefix;
report legitimate later term/index/no-op changes instead of asserting an
unchanged entire log. The old INIT must come from a real previously selected
incarnation and traverse actual native application. A valid current operation
must then complete through its real writer owner, so always-refuse behavior
cannot pass. Confirmed ACTIVE requires actual endpoint/services projection at
the new boot incarnation and exact-token PRESENT completion.

Failure diagnostics and first results must survive cleanup failure. Preserve
owned child stdout/stderr, IPC, directory/database/WAL files and mode/cut
observations. A failure to reach a cut or an early child exit is a setup/cut
failure, not successful abrupt recovery. Killing only the child owned by this
experiment is part of its test orchestration.

## Still required before implementation

Review the concrete fixture extraction and both binary cut/oracle definitions
against the corrected U1 interfaces; confirm that observers do not drive native
progress during a cut. Review U2 opening/confirmation/projection contracts and
the selected K value independently. Bind the test-only tree before any source
implementation or lab execution. Review distinct meaningful source mutations
against unchanged accepted oracles. The progress amendment is approved
separately; none of these pending items is certified by that decision.
