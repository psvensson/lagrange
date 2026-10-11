# BEGIN uncertain creation handoff — round-five author freeze

## Boundary

- Worktree: `/mnt/data/peter/projects/.worktrees/rs-raft-startup-integration-20261011`
- Caller HEAD/base: `c6d71665e98be03de916705f272a9d6340e4a842`
- Rejected predecessor: `d1ea7302fcf51b2c4be21b8d47db6295bef3d555`
- Accepted design SHA-256: `3679b87f4aeb84fd8d9397aac9f73f686e5fcb990c1e61e86df35e9731f91fa5`
- Round-four independent report SHA-256: `4460dbaf0eb965947aa2136a54ad2406e37a86a35580909f92128501024dc281`
- Exact full 40-path source boundary: `source-manifest.sha256`
- Exact four-path delta from the rejected predecessor: `round4-to-round5-source-delta.json` and `round4-to-round5.patch`

The four changed paths relative to the rejected predecessor are the creation owner, its resource owner, and the two already registered focused test files. There are no activation, C3, C17, startup, cluster, staging, commit, push, or landing changes in this correction.

## Ownership transitions

`transition-ownership-map.json` records the complete affected handoff. The decisive release rule is: an accepted advanced handoff does not release the record reservation while a live client still owns an unclaimed result. Record count and bytes release only after the ordinary recovery or terminal owner has accepted the debt and no live client result remains.

The correction preserves these outcomes together:

- A fresh control-turn budget is installed before every advanced or initial I/O; the original transaction deadline is unchanged.
- Advanced same-creation COMMIT knowledge is monotonic across explicit retirement and a late original INSERT APPLIED result.
- A background sweep may resolve a genuinely unknown INSERT before the live client retries.
- An attachment timer releases only its waiter and operation. Late uncertain completion cannot overwrite or discard the record's exact live consumer.
- Missing participant progress cannot shrink a valid durable manifest, invent PREPARE evidence, or change a recorded COMMIT.

## Resource census

`retained-root-census.json` records every declared root and copy multiplier. The model is canonical retained-reference accounting, not a VM heap-size claim.

- Independent observed lower bound: 161,218 bytes.
- Repository complete-path synthetic bound: 201,618 bytes.
- Charged record envelope: 201,632 bytes.
- Observed peak with operation and attachment: 241,763 bytes.
- Product default remains 1,048,576 bytes.
- The 65,000-byte negative refuses a 20,000-byte session before INSERT.

## Expectations changed from the rejected predecessor

`expectation-changes.json` explains every intentional expectation change. Recovery-first now resolves returned authoritative evidence before retry; the exact live consumer remains entitled to claim it. A fresh background turn may progress after the caller's old control turn expires. The resource witness uses a 250,000-byte test-only cap because the corrected envelope is 201,632 bytes; the product cap is unchanged.

The same file discloses two author-only diagnostic harness corrections. The independent-review directory was not modified.

## Proof

- Canonical component runner: 7/7 test files, 594 assertions green (`cumulative-final.log`).
- Preserved cumulative diagnostic matrix: 30/30 green (`round4-cumulative-assertions.log`).
- Round-four extension matrix: 12/12 green (`round4-extension-assertions.log`).
- Final ESLint: green on the four changed paths (`eslint-final.log`).
- Impact contracts: 64 contracts and 35 coupled pairs green (`impact.log`).
- Shards: 2,355 classified tests green (`shards.log`).
- Scoped cyclomatic and cognitive checks: green.
- Global cognitive: 151/152 green and tighten-able.
- Global cyclomatic: 1,780/1,755 red and unwaived.
- Global file size: source 29/27 red and unwaived; tests 21/21. The changed production files are 799 and 451 lines, so this correction adds no oversized source file.

Normal `startLagrangeRuntime` remains separately blocked by activation work. The actual listener/adapter/engine evidence here is component evidence, not a full startup or cluster proof. All green evidence remains author evidence pending independent source review.
