# Seed release deadlines: single-budget ownership and ping-pong regression audit
Date: 2026-10-14
Status: WIP exact-source evidence, NOT independent rs-raft merge acceptance.

## Decision — separate performance from authorization

The inherited claim/cache fixture `TEST_CONFIG.bootstrap.leadershipWaitTimeoutMs=1000` was accidentally used for *45 partition cohorts* and their SQL/Raft/CDC release while also governing election waiting. This is a performance mismatch, not evidence that the release protocol should skip consensus, admission, or durable proof. The production `BOOTSTRAP_DEFAULT.leadershipWaitTimeoutMs=30000` is a different setting from the 1s fixture. `RealTimeSource` delegates to `Date.now()`; the original 1s case is **not** virtual time. Full integration has a separate test-harness deadline.

Measured hosted hardware from `38545636829`: one 4-vCPU AMD EPYC 7763 GitHub runner, ~16 GiB RAM, Node 22, with original source. The 45-partition release took ~10.5–10.8s in three original full-cohort positive-return measurements when the fixture budget was 5s or 10s; both 1s attempts failed after only part of the work, at ~8.8–9.5s before refusing (indicating cleanup/outstanding work). Three additional 15/20s budget measurements at `38546620969` completed the release phase in 9.94, 10.05, 10.56s, without modifying runtime. The later `38548439462` workflow passed the original 45/45 SQL/Raft/CDC claim-cache body using a separate explicit 20s seed-release budget, unchanged 1s election fixture, and 90s whole-test harness. 20s/90s are empirical hosted CI budgets, not proof of all cloud hardware or a performance SLA.

No actual success may be established by (a) simply extending a retry window, (b) transporting an old `CUT_OVER`, (c) an expired receiver `RESUME` commit, or (d) a stale accepted wave after END.

## Four clocks/bounds, four owners

| Scope | Single owner and observed configuration | Meaning |
| --- | --- | --- |
| Leadership discovery | Bootstrap election owner; `leadershipWaitTimeoutMs` (CI fixture 1,000ms, production default 30,000ms) | Limits waiting for leadership; **not** the full 45-cohort release target |
| Complete fresh-seed partition release | Seed workflow; one `seedParticipantReleaseBudgetMs` (explicit 20,000ms in measured CI, otherwise historic leadership-timeout fallback) and absolute `deadlineAtMs` once at start | Controls whether the entire release wave can be reported ready. No per-cohort renewal |
| One participant release transport request | Existing `participant-release-client`; cap `REQUEST_TIMEOUT_MS=5,000` AND remaining absolute budget | Bounding a wire/RPC wait is not Raft commit or permission. A successful reply may still arrive too late to authorize readiness |
| Actual replica admission commit | Existing recipient `resumeParticipantCutoverAdmission` | Before writing OPEN, compare actual recipient clock with the **original request** absolute deadline after awaited membership; no new timer |

Other bounded retry cadence (`PAUSE_RETRY_AFTER_MS=100`, `RECOVERY_RETRY_MS=1,000`) is neither a new wall-clock budget nor permission. All retries must remain subordinate to the absolute release deadline; recovery after a refusal reconstructs from durable owner facts and never manufactures an OPEN decision.

## Causal source-only red and green

1. Seed success-after-expiry: real immutable prior source `1617f808a821e6ef8454048963fe34f0e5542394` failed a deterministic `VirtualTimeSource` test. An actual typed `CUT_OVER` reply arriving at 1,001ms after a 1,000ms budget was accepted; at 999ms the in-budget reply passed. See `38549103472`. The seed-only correction `78a9504aaf1f1b2a64aba5c1e658ba213b1a8e0a` uses the original seed clock *after* each awaited reply to reject late success with canonical typed `release_deadline`; `38549326020` passed 29 focused assertions with no timer added.
2. Participant OPEN-after-expiry: original recipient code under `46793df4aa6553a090af418b65b573f970b15f44` failed a registered genuine SQL control-release test. RESUME entered before deadline; the second awaited current-membership read advanced the test clock beyond the original deadline, yet the recipient committed OPEN and the release returned CUT_OVER. See `38549820245` and clean-lint source-only repeat `38550047253`. The recipient-owner correction `7ae8a0bd61f5389c9b086b65c5e46186f084edc1` now checks the *same* original deadline at entry and just before mutating OPEN. The focused adversarial case was green in `38550107565`. An inherited direct TX1 test-helper bypass (missing any deadline or handler timeSource) then correctly failed; `b606479a530589ac2835fe96bff0e4bb8f2ac08e` repaired the fake setup to supply authentic bounded current membership attempt instead of loosening recipient code; `38550594293` passed full original release protocol.
3. Seed control-wave END-after-expiry: first test attempt did not engage dependent routing and was rejected as harness setup error (`38550851204`). After correcting that fixture, the unchanged source accepted a successful wave END arriving after expiry, `38551026935` (named `Missing expected rejection`). The seed owner now checks after awaiting the wave's final END/cleanup in `a03bd089fd535ea3e2b7b9850ee90e2c3ae5b6e1`. This refuses readiness, not retroactive durable commit. Exact green and full composed verification remain required.

These are three **authorization/completion boundaries** sharing a single datum, not three independent timeout policies. Each checks freshness at its own point of authority. The incorrect alternative is to add another timer to each or to enlarge a timeout until an inherited test happens to pass.

## What is and is not solved

- A 20-second CI seed release budget is consistent with 10-11s physically measured completion on that exact hosted runner, and production already has a 30s leadership-wait default when explicit release budget is absent. No additional production default was silently introduced.
- A successful response arriving after a 5s configured deadline need not mean the core spent 10s in one Raft turn; the seed method's whole phase includes 45 partition cutovers and multiple waits. The measured 5s 'returned' result was unsafe *as a readiness verdict* until the post-await boundaries were hardened.
- The test runner's 30/60/90 second whole-test limits must never be confused with the runtime release deadline. A long full body containing SQL, Raft, CDC, two claim/cache cases and teardown can fail its harness bound even if the seed release itself is healthy. Increasing the test-harness limit is not increasing runtime permission.
- No evidence yet proves clock skew tolerance across actual remote hosts, every future transport budget, or failure under seed-storage loss/restart. The current absolute timestamp uses wall clocks; distributed acceptance must check cross-host skew/lifecycle and fail closed, not assume identical clocks.
- All three source changes remain on WIP branches, with `main` unchanged. Await canonical metadata, independent source review, exact candidate gates and multi-host certification before any integration or Quest receipt.

## Anti-ping-pong rule

Stop optimizing the obsolete 1-second **whole release** threshold. Keep it only as an explicit negative/pressure diagnostic, preserve the 1-second **election** fixture, and test 20-second seed release independently on the same physical host with no retries or skipped original bodies. Once a source-bound semantic falsifier is green, do not replace it with another owner or loosen the ratchet because a different speed benchmark is red. Continue throughput work only when a comparable physically measured healthy baseline and exact independent safety review justify it.
