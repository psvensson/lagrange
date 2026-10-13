# C2 and participant release recovery integration checkpoint

Status: HOLD. This is a non-main preservation of reviewed component bytes and
their measured interaction. It is not Quest landing, publication, corpus
certification, startup repair or main merge approval. Both component Quests
remain open. The earlier `checkpoint-hold.md` describes the standalone recovery
checkpoint and remains historical evidence.

The merge parents are C2 `406ceac1c40bdf57da1a6668806d0f3b38526cb9` and
recovery `f6c48301221877c534a3f669f5a91a7a8a1edd29`. C2 removes two orphan
promotion modules and their exclusive support; recovery retains the existing
owner's bounded observation debt for a host-held partition and fences stale
pause/resume lifecycle. Their production and witness changes are retained
byte-for-byte from their independently reviewed parents. Only the canonical
metadata and owner-debt inventory producers resolve their generated overlap.

## Measured integrated input

- Candidate `6c27b10b6f3c8093f4baab149f20b6a79524aecf`, tree
  `16b56845ffd6479c727240514aaa11f8cc63b210`.
- Source-only control `57d4d8c265ac486697bb06c62177a34dc8e60d86`, tree
  `0d395055fa04717867e17442d7de432699df1e67`. Exactly the two recovery
  production files are restored from C2; every other tracked byte is identical.
- `evidence/integrated-paired-result-v2.json`, SHA256
  `b94091f379883f4c4062d563d9374761b927250dbeb455559420b9b1a193873f`,
  binds 67 artifacts, including raw lab results and compressed raw static scans.
- Independent final review `evidence/integrated-composition-evidence-review-v2.md`,
  SHA256 `036531736266015180a6c4ff985e92145541bd55b2ccecd8d22f88a4ea2b98b2`,
  approves bounded composition content and recovery preservation. It retains
  every static, seed startup, Quest, main, corpus and release HOLD below.
- Five locked lab hosts execute 19 distinct candidate files, with 277 runner
  assertions. The 17 recovery files pass all 219 assertions. Two additional
  startup files fail during seed release, as on their same-host C2 predecessor.
- The two primary source controls run on the same hosts: native 19/20 and
  focused 3/15. Deferred native recovery takes 1171.841226 ms with the fix;
  without it the unchanged 10000 ms bound fails at 10163.887684 ms with zero
  post-heal reconstruction or consensus activity. The integrated control is
  this two-file falsifier pair, not a repeated 17-file control corpus.
- Carinas' first placement was refused before a placement head, PID or TAP.
  Its ambiguous error does not prove why. A later canonical fleet check showed
  a free eligible machine; the fresh placement is the only executed candidate
  focused run. No lock or readiness gate was bypassed and no executed file was
  retried to obtain green.

V2 corrects an overbroad prose claim in retained V1: zero clone groups touch the
four recovery JS files; two groups touch the C2 bootstrap property file. Both
are exact pre-existing fragments in the prior standalone scan. The structured
V1 scan already retained those two groups; no raw evidence was changed.

The preservation merge adds evidence after the executed snapshot. Its eventual
commit SHA must not be relabelled as the executed lab input. Compare all
architecture, source, script, test and generated inventory bytes to the
candidate before relying on the checkpoint.

## Remaining work

Impact contracts and shard audits pass. Whole-scope gates remain red: two
dependency cycles; 1451 unused exports versus 1416; complexity 1777 versus
1755; and test clone lines 26415 versus 26369. The source clone count remains
47/1462. Recovery has no new complexity finding; the C2 helper retains its
pre-existing complexity-19 function. The earlier reviewed fresh-create
`local_retry_loop` remains. No baseline, deadline or timeout was raised.

Seed release is still a system defect. The direct release protocol passes,
but claim-cache cannot enter its intended T1 body after seed failure. The
bootstrap property continues after failed seed assertions and then receives
HTTP 503; those responses do not certify successful join behavior. Its 23
direct authority assertions remain positive. Terminal errors do not yet expose
the blocked drain vector, position in the serialized seed budget, or age and
original trigger of a joined release attempt. A separate bounded diagnostic
design is being reviewed before any repair is chosen.

Exact-main independent review, full static and corpus proof, transaction/crash
and snapshot custody, FreshMG, CDC, and integrated distributed startup/recovery
remain required. This checkpoint provides no waiver or terminal approval.
