# What "the sealed structural audit" means for this quest

The quest statement and the probe header speak of "the sealed structural audit
(`scripts/participant-release-completion-audit.js`, unchanged)". For this
quest that phrase means **the audit as it stands on main at ab347e962**: sha256
`416e3fb25397954137b9efad8a21dc38e886ffce22bc2e36d0b21afeee2e1350`, unchanged
by this candidate. It does not mean the bytes the sealed quest
`participant-release-completion-owner` reviewed and approved (`90fb37194`).
Those bytes and main's audit differ by three revisions made after the seal. The sealed `quest.json`
statement of this quest is not edited; this note fixes its meaning. All facts
are VERIFIED: hashed from git objects, read at the cited log lines, or run.

## The audit's history

| Commit | Audit sha256 | Fragments changed | Record |
| --- | --- | --- | --- |
| `90fb37194` "fix: own bounded participant release completion in existing client" (2026-10-21), the sealed quest's reviewed candidate (seal `92ae06ef4`; log lines 11-13, approving verification at line 13). It is not on main's lineage: its audit bytes reached main byte-identical through the release squash `54dd2d7ce` | `5e8fb0dba8f58bb912d99e1ba1700ce9baa8bdb3e1a5ec3399c8b324a296cb5d` | introduced (absent before) | `solve/quests/participant-release-completion-owner/log.ndjson` line 10: "Final support SHA256 5e8fb0dba8f5…" |
| `d38fef56e` (2026-11-02), attempt 1 of `fresh-create-release-authority-from-committed-operation` | `816323688746fd6a…` | `FRESH_CONTRACT` only | Recorded supersession: sealed quest log line 20 (R09, approved by the lead 2026-11-02). It changes the `releaseFreshCreate` body pinned by `FRESH_CONTRACT` and promises that `OWNER_CONTRACT`, `REQUEST_CONTRACT` and the seed contract stay unchanged and are proven identical by the audit. |
| `b0dd82398` "Consolidate CREATE custody and bind typed release completion audit" (2026-11-20) | `b2255871fb1612a6…` | `OWNER_CONTRACT`, `FRESH_CONTRACT`, `FRESH_BINDINGS`, a new `FRESH_UNAVAILABLE_DECLARATION` and its check; plus a new case in the sealed test `test/scripts/participant-release-completion-owner.test.js` | Only a finding names it, by the prefix `b0dd`: `solve/quests/fresh-formation-user-table-routability/log.ndjson:141` (2026-11-20T22:59:14Z, kind evidence). No verification names it. |
| `064ca02df` "Consume seed completion once and separate terminal clock evidence" (2026-11-21) | `416e3fb25397…` (= main) | `SEED_CONTRACT`, `SEED_IMPORTS`, `SEED_BINDINGS`; plus one case in the sealed test | Approving verification: `solve/quests/fresh-formation-user-table-routability/log.ndjson:155` (2026-11-20T23:26:22Z, verdict approve, `subagent:/root/formation_lifetime_review`) |

`b0dd82398` changed `OWNER_CONTRACT`, the fragment that pins
`completeParticipantRelease`. That is contrary to the promise in the sealed log
(line 20), and no verification names the commit.

## What the repair restores

- Main's audit (ab347e962 bytes) over the candidate: **0 violations**; the
  probe prints 0.
- The sealed audit bytes (`90fb37194`) over:
  - `90fb37194` itself (the control): 0 violations;
  - `3343a640a` (the parent of `3ed2d6969`): 3 (owner, fresh, seed);
  - ab347e962: 3 (owner, fresh, seed);
  - the candidate: 3 (owner, fresh, seed).

The repair therefore restores conformance to **main's audit**, which is the
state immediately before `3ed2d6969`. It does not restore conformance to the
sealed quest's reviewed audit bytes. The two differ by the three revisions
above, which this repair neither makes nor reverts.

## Open finding for the participant-release owner

Whether `b0dd82398`'s revision of `OWNER_CONTRACT` (and with it the fresh and
seed revisions that followed) is legitimate is the participant-release
owner's question. The sealed log promised the owner fragment would stay
unchanged, and no verification names the commit. Resolving it means verifying
and recording the revision, or superseding the sealed contract (R09). It is
routed to that owner, not decided here.
