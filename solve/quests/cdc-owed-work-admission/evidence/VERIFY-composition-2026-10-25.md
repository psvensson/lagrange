# D1 F1/F2 integration composition — APPROVE, bounded source composition

Independent reviewer: `/root/cdc_d1_review` (Astra xhigh). This approves the
composition described below, not whole-D1 completion, retained-seed acceptance,
W7/W9, a release, publication, or a changed executable source checkpoint.

## Exact binding

- Integration parent: `9e026a011a2368853926f602abc300acb75aed67`.
- Incoming reviewed history: `714eee75a648520a79f0468fc63d55b0ed0a8048`.
- Approved incoming executable source: `bcb063a7acf7f79c88ce0bea2e32be83c979c8d4`;
  incoming adds only the independent review document and an append-only log line.
- Reviewed merge index tree: `fcd09ae53df7a75e233d190a2a7ea74e3ff4139d`.
  This is a tree identity, not a fabricated final merge commit. A subsequent
  metadata-only checkpoint can bind this tree; source changes need delta review.
- Worktree read: `/mnt/data/peter/projects/.worktrees/mg-delivery-resume-r2-20261023`.
  Reviewer source and evidence live separately in this directory. No author or
  integration production edits, test execution, sealing, or merge by reviewer.

`inspect-composition.mjs` independently reads Git parents and current worktree,
compares index/worktree bytes, parses methods with Espree, and emits
`source-binding.json` and `source-binding.log`. It does not trust the parent's
method-comparison report as its oracle. All 16 changed runtime paths match the
index. Fifteen are byte-identical to both incoming and approved executable
source. The remaining entry-apply file has SHA256
`388c24a014dba9a9cd2d24207a69103a74522ca7abc75911715f58c6b456a386`.
Its 14 methods are each byte-identical to a parent: eight unchanged in both,
five Q6 handler methods exact integration parent, and `applyCommittedEntry`
exact approved incoming. The entire text outside the class is incoming text
plus the integration-owned handler-identity import. No new dispatch or method
body is hidden in the merge.

## Owner interaction and registry

The retained Q6 handlers keep transport classification with the router:
successful native step returns null, transport handler serving identity is
checked before step, and domain handlers return their application outcome.
The incoming application method keeps the independently approved F1 compacted
exact-ACK refusal and F2 durable owed-count admission, pre-effect refusal,
same-entry retry, prepared reservation, and unconditional decision/ACK drain
ordering. The merge neither recreates a flat answer alias nor adds a second
CDC progress/admission authority.

Parsed JSON comparison finds only four intended registry entry changes:
`original-retained-effects-correspondence`, `cdc-source-native-delivery`,
`original-foundation-producer-observation`, and the corresponding CDC coupled
pair. They add the reclamation test, the owed-admission owner, and four F2
tests. Existing Q6 and TX1 contracts/pairs remain semantically identical to the
integration parent; escaped versus literal section signs are JSON-equivalent.
No owner or witness is removed. The cognitive checker is exact incoming,
SHA256 `4b52e1cafad5c240fb4bfb0d6a4f27e3f5859c13e765d7382585924ed2af28e4`,
with baseline150 retained. The retained-seed log preserves the entire parent
byte prefix and appends exactly two distinct lines already present incoming.
Their historical timestamps are not rewritten as current verification.

## Behavior evidence and ceilings

Parent/root executed and reaped the canonical classified composition run:
`/tmp/codex-rs-raft-20261025/d1-composition-cone.log`. Reviewer read the complete
log: exit0 reported by root, 18/18 files, 481 runner assertions, ordinary16/308
and bootstrap2/173, jobs1, retries0 reported by root. Thermal gate reports
CPU45C then51C, NVMe68C. This is explicitly reused root execution, not a claim
that this reviewer reran it.

The cone covers the actual RF3 owed-admission leadership-transfer/drain/retry
witness, all fourteen final F2 suites, Q6 retiring-partition handler identity,
F1 reclamation and malicious identity cases, retained effects unit/integration,
and D4 hydration handoff. The normal native partition loopback uses the sole
envelope builder. It exercises the composed handler/application boundary.
Earlier independent F1 and F2 reports retain their stronger controlled
overbudget/restart/queue/rollback probes and their explicit receipt-subscriber,
single-controller, native, storage and network ceilings. Their unchanged
runtime bodies remain source-bound here. The run does not establish remote
recipient native acceptance, W7/W9, or any unrun message-group/Wasm suite.

Named checklist disposition: recovery/replay, concurrency, retry uncertainty,
owner interaction, and harness fidelity retain the F1/F2 dispositions for
unchanged bodies. The composition-specific atomic boundary and handler
identity are supported by independent method equality and the above cone.
Unrelated coupled pairs are unchanged, not newly certified. Whole-corpus
cyclomatic debt previously recorded as1766 versus1755 remains outside this
bounded change; no baseline increase is authorized or claimed. Full current
global metrics and normal merge-hook metadata remain the composition owner's
responsibility.

## Separate fixture follow-up

Source census has identified six inherited native-queue doubles returning raw
`{delivered:true}`. The Q6 peer-delivery owner accepts only its branded envelope,
so those doubles misreport queued custody as failure and suppress later
same-peer messages in that batch. This is a fixture-fidelity finding, present
in the integration parent, not a D1 runtime merge change. None is used by the
18-file cone. A separately scoped census records all six, their consumer
chains, and exclusions. They must be corrected through the existing envelope
builder before their affected native recovery/CDC tests are used for
acceptance; no legacy production fallback or relaxed acceptance is justified.

No blocking issue was found in this exact bounded D1 source composition.
