# External-systems research — how production distributed systems solve our bug class

**Problem being mapped (repeat for grounding):** a raft-based control plane with a
unified rebalancer/allocator. Placement reads a CDC-replicated cache of committed
replica rows to compute a replica COUNT. During COLD FORMATION a priority partition
suffers a leadership DEMOTION FLAP (demoted for transiently-low "durability fitness"
that is low ONLY because formation isn't finished). Each demotion elects a fresh
leader whose replicated view is STALE → miscounts → emits a phantom count-changing
move that FIGHTS the in-progress rebalance → self-reinforcing LIMIT CYCLE that never
converges.

Two distinct defects to attack, kept separate throughout:
- **(a) the leadership-flap GENERATOR** — a steady-state health controller (durability
  fitness) demoting a leader during bootstrap.
- **(b) the stale-view MISCOUNT** — a freshly-elected leader/allocator acting on a
  lagging replicated read and emitting an opposing count-changing move.

---

## Q1 — Leadership stability during formation/churn

### etcd / go raft (Pre-Vote + CheckQuorum)
- **Pre-Vote**: a candidate first runs a "pre-election" — it does NOT bump its term
  and asks whether peers *would* grant a vote. Peers refuse a pre-vote if they have
  heard from a valid leader within the minimum election timeout. This prevents a node
  with a stale/partitioned view from disrupting an established leader and prevents term
  inflation churn. "The PreVote phase … candidates will be rejected if a node has
  received a heartbeat from the leader within the minimum election timeout … increase
  the robustness and stability of actual stable leaders."
- **CheckQuorum**: the leader steps down if it cannot contact a quorum within an
  election timeout; and followers won't grant pre-votes if they've heard from a leader
  in the past election timeout. Together they suppress *spurious* elections while still
  deposing genuinely-isolated leaders.
- CockroachDB enabled Raft CheckQuorum by default (PR #104042) precisely to stop a
  partitioned node from "stealing leadership away from an established leader, which can
  cause the leader to become unreachable by the leaseholder, resulting in permanent
  range unavailability."
- Sources:
  - go.etcd.io/raft PreVote/CheckQuorum config — https://pkg.go.dev/go.etcd.io/raft/v3
  - CRDB "enable Raft CheckQuorum by default" — https://github.com/cockroachdb/cockroach/pull/104042
  - Pre-voting explainer — https://davecturner.github.io/2017/08/17/paxos-pre-voting.html
  - raft-dev "How to avoid frequent leader election" — https://groups.google.com/g/raft-dev/c/E1eaYkl4-zg

**Maps to (a):** Pre-Vote/CheckQuorum guard against *electoral* churn (a candidate
disrupting a healthy leader). Our flap is NOT electoral — the incumbent VOLUNTARILY
demotes on a health metric. So Pre-Vote does not directly fix (a); the flap generator
is a health-controller policy, not a spurious election. (Confirmed by internal
research: run-5 is a ~2-min-period *voluntary demotion* cycle, not a fast electoral
flap.) Pre-Vote is still relevant as the canonical "don't let a stale-view node act as
if it should lead" principle.

---

## Q3 — Damping placement limit cycles / thrash (strongest external match)

### CockroachDB allocator — the "would I immediately undo this?" simulation
This is the closest real-world analogue to our bug and fix. From the CRDB rebalancing
tech-note, section **"Picking a rebalance target"**:

> "As one last precautionary step, we then **simulate the down-replication logic** on
> the set of replicas that will result from adding the new replica. **If the simulation
> finds that we would remove the replica that was just added, we choose not to make
> that change. This avoids thrashing**, and is needed because we can't atomically add a
> member to the raft group at the same time that we remove one."

Other anti-thrash mechanisms in the same tech-note:
- **Leaseholder-only decisions**: "The ReplicateQueue only acts on ranges for which the
  local store is the current leaseholder." → single decision-maker per range; no two
  nodes emit conflicting placement moves.
- **Tolerance / deadband as hysteresis**: CRDB "intentionally tolerates small
  deviations between nodes to prevent thrashing"; leaseholder rebalancing only moves
  when a store is "clearly over or underfull relative to the average," not fine-tuning.
- **Known issue** acknowledged: "Rebalancing isn't atomic, meaning that adding a new
  replica and removing the replica it replaces is done as two separate steps" — exactly
  the transient-miscount window our REPLACE opens.
- Sources:
  - CRDB rebalancing tech-note — https://github.com/cockroachdb/cockroach/blob/master/docs/tech-notes/rebalancing.md
  - CRDB rebalancing RFC 1.1 — https://github.com/cockroachdb/cockroach/blob/master/docs/RFCS/20170602_rebalancing_for_1_1.md
  - Replication layer docs — https://www.cockroachlabs.com/docs/stable/architecture/replication-layer

**Maps to (b) and to the limit cycle directly.** CRDB's "simulate the undo; if the move
would be immediately reverted, DON'T emit it" is a *conflict/overlap detection between
the intended move and the in-progress state* — precisely a guard our rebalancer lacks
for the quorum-spread self-move. This argues for a **deadband / undo-simulation guard**
on the count-changing move rather than (only) attacking the flap.

### Kubernetes HPA — stabilization window (downscale)
- Default downscale stabilization window = 300s (`--horizontal-pod-autoscaler-downscale-stabilization`);
  no upscale window by default (scale up immediately, scale down slowly).
- Mechanism: HPA records every desired-replica recommendation over the window and, when
  acting, picks the **highest** recommendation in the window — guaranteeing it never
  scales below any recent peak, smoothing bursts/dips. This is asymmetric hysteresis.
- Rationale directly parallels ours: "new pods may still be downloading images or
  warming caches when HPA starts deleting them" == acting on a not-yet-settled signal.
- KEP-853 (configurable scale velocity) adds rate limits/policies as further damping.
- Sources:
  - K8s HPA docs (stabilization window) — https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/
  - KEP-853 configurable HPA scale velocity — https://github.com/kubernetes/enhancements/blob/master/keps/sig-autoscaling/853-configurable-hpa-scale-velocity/README.md
  - HPA stabilization deep-dive — https://www.flightcrew.io/blog/hpa-stabilization-window

**Maps to the limit cycle.** The HPA "asymmetric stabilization window" is the textbook
name for what our INCUMBENT_MOVEMENT_COST hysteresis does for DATA_AFFINITY but is NOT
wired for quorum-spread. Directly supports adding a downscale/rebalance stabilization
(cooldown) to the count-changing self-move.

### TiKV / PD — operator staleness + region epoch fencing
- Every region carries an **epoch** (conf_ver + version) bumped on membership change or
  split. "Before TiKV processes a request, the request will be verified by comparing
  the epoch. If the status is inconsistent, the request will be regarded as illegal and
  an error will be returned." → a scheduling operator built against a stale epoch is
  rejected at apply time (epoch fencing).
- PD dispatches at most a pending operator per region and monitors it via subsequent
  region heartbeats; stale region info is a known hazard (tikv#3868).
- Sources:
  - PD Metadata Management (epoch) — https://github.com/tikv/pd/wiki/Metadata-Management
  - PD Scheduling Introduction — https://github.com/tikv/pd/wiki/Scheduling-Introduction
  - PD stale region heartbeat issue — https://github.com/tikv/tikv/issues/3868
  - TiDB scheduling docs — https://docs.pingcap.com/tidb/stable/tidb-scheduling/

**Maps to (b).** Epoch fencing is the canonical "don't let a decision built on a stale
view take effect" mechanism. Our analogue: fence the count-changing move against the
generation/epoch of the replica-set it was planned from, so a move minted from a
CDC-lagged view is rejected when applied against a fresher committed set.

### TiKV / PD — per-operator concurrency limits (one-change bounding)
- `leader-schedule-limit`, `region-schedule-limit`, `replica-schedule-limit` bound how
  many operators of each type are outstanding cluster-wide. PD maintains a **window
  size per operator type** and limits the rate at which schedulers generate operators;
  PD dispatches at most one pending operator per region. Issue tikv/pd#3778 ("Reduce
  the conflict when multiple scheduling is running") is the direct analogue of our
  overlapping-moves problem.
- Sources:
  - PD scheduling-limit config — https://tikv.org/docs/6.1/deploy/configure/limit/
  - PD scheduling best practices — https://docs.pingcap.com/tidb/stable/pd-scheduling-best-practices/
  - PD "reduce conflict when multiple scheduling running" — https://github.com/tikv/pd/issues/3778

**Maps to the limit cycle.** Bounded per-type operator windows + one-pending-per-region
is the "operator-in-flight limit / one change at a time" damping. Our rebalancer's
interlock is the analogue; the internal research says narrowing it is unsafe, so the
external lesson is that the *staleness/undo guard* (CRDB) is the safer lever than the
concurrency limit here.

---

## Q2 — Not acting on a stale view (freshness before deciding)

### Raft ReadIndex / applied-index freshness (etcd, TiKV, JRaft)
- A leader must not serve a read (or, by extension, act on state) until its state
  machine has caught up: "the leader waits for the execution of its state machine until
  the apply index equals or exceeds ReadIndex." A newly-elected leader is NOT known to
  be up to date until **it has applied the first entry (a no-op) of its own term** —
  only then is its state machine guaranteed current.
- Leader-lease read optimization: "After the leader applies the first log in the current
  term, its state machine must be up-to-date, so it doesn't have to obtain the commit
  index." A partitioned leader that skips the heartbeat/quorum confirmation "might serve
  stale reads, which would violate linearizability."
- Sources:
  - TiKV lease-read explainer — https://tikv.org/blog/lease-read/
  - SOFA-JRaft user guide (ReadIndex/applied-index) — https://www.sofastack.tech/en/projects/sofa-jraft/jraft-user-guide/
  - raft-dev "readIndex vs appliedIndex" — https://groups.google.com/g/raft-dev/c/hzQf4pvwWaU
  - go.etcd.io/raft — https://pkg.go.dev/go.etcd.io/raft/v3

**Maps to (b) — the single most on-point mechanism for the miscount.** The bug is a
freshly-elected leader acting (emitting a count-changing move) on a lagging view. The
canonical rule is: a new leader must apply its own term's first (no-op) entry — i.e.
confirm its replicated state machine is current — BEFORE acting on that state. Our
CDC-cache read has no such applied-index/read-index gate; a "don't plan a
count-changing move until the replica-row view is confirmed current (applied-index /
generation fresh)" gate is the direct translation. This is the **services-row
freshness gate** option, and it is exactly what mature Raft does before any
read-derived decision.

### CockroachDB — decide on the leaseholder, with closed-timestamp/follower-read freshness
- Placement decisions run only on the leaseholder (single fresh authority). Follower
  reads use closed timestamps to guarantee a follower serves only data at/below a
  known-safe timestamp — a freshness fence for reads off a non-authoritative replica.
- Sources:
  - CRDB rebalancing tech-note (ReplicateQueue leaseholder-only) — https://github.com/cockroachdb/cockroach/blob/master/docs/tech-notes/rebalancing.md
  - CRDB replication layer — https://www.cockroachlabs.com/docs/stable/architecture/replication-layer

**Maps to (b).** Same lesson: derive placement from a *fresh, authoritative* view, not a
lagging replicated copy.

---

## Q4 — Adding a voter safely (no over/under count): learner-first / joint consensus

### etcd learner (non-voting until caught up)
- `member add --learner` joins as a non-voting member that receives all data but does
  not affect quorum or vote. It can be promoted only after "its log has caught up to
  the leader's" (delta below a threshold, e.g. < 1/10 snapshot count); an early promote
  request FAILS. "This prevents new cluster members from disrupting the quorum or
  causing leader elections."
- Sources:
  - etcd learner design — https://etcd.io/docs/v3.5/learning/design-learner/
  - etcd learner overview — https://etcd.io/docs/v3.3/learning/learner/
  - kubeadm etcd learner mode — https://kubernetes.io/blog/2023/09/25/kubeadm-use-etcd-learner-mode/

### CockroachDB atomic replication changes (joint consensus + learner)
- CRDB replaced add-then-remove with **atomic replication changes ("Joint Quorums" /
  Joint Consensus)**: a short-lived learner is snapshotted in phase one, then a single
  atomic config change swaps membership through a joint (old+new) quorum, so there is
  **no transient window** where the count is wrong or a naive majority could split.
- Sources:
  - CRDB joint consensus blog — https://www.cockroachlabs.com/blog/joint-consensus-raft/
  - CRDB non-voting replicas — https://github.com/cockroachdb/cockroach/issues/51943

**Maps to (b) — root cause of the transient miscount.** Our REPLACE is a non-atomic
add-then-remove; the internal research confirms "we can't atomically add a member … at
the same time that we remove one." Joint consensus / atomic replication changes are the
principled fix that removes the miscount WINDOW entirely — but it is a large
architectural change. The learner-first pattern (catch up before counting as a voter) is
the lighter-weight expression of the same idea and maps to "don't count a not-yet-caught-up
replacement as present/absent when computing the count."

---

## Q5 — Formation-vs-steady-state gating (don't run steady-state health control during bootstrap)

This is the anti-pattern our defect (a) is an instance of, and it is well-recognized.

### Consul / Vault Autopilot — ServerStabilizationTime
- A new server is added as a **non-voter** and must remain continuously **healthy for a
  minimum stabilization period (`ServerStabilizationTime`, default 10s)** before
  Autopilot promotes it to voter. "Healthy" is a composite: SerfHealth Alive, last
  contact < `LastContactThreshold` (200ms), Raft term matches leader, and trailing log
  entries ≤ `MaxTrailingLogs` (250). The whole point is to NOT act on a health signal
  until it has been stably good — i.e. gate the promotion controller behind a
  settle-time and a *catch-up* condition.
- Sources:
  - Consul Autopilot HTTP API (config fields) — https://developer.hashicorp.com/consul/api-docs/operator/autopilot
  - Consul Autopilot concepts — https://developer.hashicorp.com/consul/docs/manage/scale/autopilot
  - Vault integrated-storage autopilot — https://developer.hashicorp.com/vault/docs/concepts/integrated-storage/autopilot

### Kafka KRaft — observer-first bootstrap + Pre-Vote (KIP-853 / KIP-996)
- A new controller ALWAYS joins as an **Observer** (non-voter, cannot lead), pulls the
  full metadata log, and is promoted to voter only once fully caught up (KIP-853). This
  "prevents instability during the catch-up phase." KIP-996 adds Pre-Vote so a
  controller only starts an election "after a majority of voters agree that the leader
  is truly unavailable."
- Sources:
  - KIP-853 KRaft controller membership changes — https://cwiki.apache.org/confluence/display/KAFKA/KIP-853:+KRaft+Controller+Membership+Changes
  - KRaft protocol deep dive (observer bootstrap, Pre-Vote) — https://developers.redhat.com/articles/2025/09/17/deep-dive-apache-kafkas-kraft-protocol
  - KRaft ops — https://kafka.apache.org/41/operations/kraft/

### Kubernetes — startup probe gates liveness/readiness during init
- "If a startup probe is configured, Kubernetes does not execute liveness or readiness
  probes until the startup probe succeeds." A slow-starting container (migrations,
  cache warming) is explicitly shielded so the health controllers don't act (restart /
  pull traffic) on a not-yet-initialized signal.
- Sources:
  - K8s probes (startup gating) — https://kubernetes.io/docs/concepts/workloads/pods/probes/

### YugabyteDB — leader leases; balancer transfers leadership, doesn't thrash
- Leader lease (default 2s): "A new server is not allowed to serve as a leader until a
  lease of this duration has definitely expired on the old leader's side" — a temporal
  guard against dual-leader / rapid handoff. Cluster balancer runs continuously but
  transfers leadership only to healthy nodes.
- Sources:
  - Yugabyte leader leases — https://www.yugabyte.com/blog/low-latency-reads-in-geo-distributed-sql-with-raft-leader-leases/
  - Yugabyte cluster balancing — https://docs.yugabyte.com/stable/architecture/docdb-sharding/cluster-balancing/

**Maps to (a) — directly.** "Demote a leader for a health metric that is only unhealthy
because the cluster hasn't finished forming" is exactly the anti-pattern these systems
avoid via a **stabilization/settle window + catch-up condition before a health
controller may act**. Consul's `ServerStabilizationTime` and K8s's startup-probe gate
are the two cleanest templates: require the durability-fitness signal to be *stably*
below threshold for a settle window (and/or gate the demotion controller OFF until
formation/quorum is `initialized`) before demotion may fire. This validates the
"formation-vs-steady-state gate" family of fixes (eval-path-d/e).

---

## Per-system one-liner summary

| System | What they do (relevant) | Attacks |
| --- | --- | --- |
| **etcd / go-raft** | Pre-Vote + CheckQuorum (electoral churn); learner non-voting until caught-up; ReadIndex/applied-index before reads | (a) electoral only; (b) via learner + read-index |
| **CockroachDB** | Allocator **simulates the undo** and skips a move it would immediately revert; leaseholder-only decisions; tolerance/deadband; **atomic replication changes (joint consensus)**; closed-timestamp freshness | (b) + limit cycle (best overall match) |
| **TiKV / PD** | **Region epoch fencing** rejects stale-view operators; per-type operator windows + one-pending-per-region | (b) fencing; limit cycle |
| **Kafka KRaft** | Observer-first bootstrap (KIP-853); Pre-Vote (KIP-996) | (a) formation gating; electoral |
| **YugabyteDB** | Leader leases (2s); balancer transfers only to healthy | (a) temporal guard |
| **Consul / Vault** | **ServerStabilizationTime** — healthy+caught-up for a settle window before voter promotion | (a) formation gating (best template) |
| **Kubernetes** | Startup probe gates liveness/readiness; HPA **downscale stabilization window** (asymmetric hysteresis); readiness gates | (a) startup gate; limit cycle (HPA) |

---

## MECHANISMS THAT MAP TO OUR FIX (decision support)

### (a) The leadership-flap GENERATOR — steady-state health controller demoting during formation
Ranked best → worst fit:
1. **Consul/Vault `ServerStabilizationTime` + catch-up condition** (BEST). Require the
   durability-fitness signal to be *stably* unhealthy across a settle window AND gate the
   controller off until formation/quorum is `initialized` before a demotion may fire.
   Maps 1:1 to our defect (a): the fitness is low only transiently during formation, so a
   settle window + an "initialized/formed" gate suppresses the phantom demotion without
   disabling the genuine steady-state heal. Supports eval-path-e (services freshness/
   formation gate) and eval-path-d (view completeness).
2. **KRaft observer-first bootstrap / K8s startup-probe gating** — same principle
   (don't let steady-state health controllers act pre-initialization). Reinforces #1.
3. **Pre-Vote / CheckQuorum / leader leases** — LOW fit for (a). These damp *electoral*
   churn (a candidate stealing leadership). Internal research already establishes our
   flap is a *voluntary demotion*, not a contested election, so these do not address the
   generator. (Still worth having as defense-in-depth against any secondary electoral
   flap, e.g. the 3× "durability unfit for leadership" symptom.)

### (b) The stale-view MISCOUNT — new leader emits an opposing count-changing move
Ranked best → worst fit:
1. **CockroachDB "simulate the undo, skip a self-reverting move"** (BEST *tactical*
   match). Before emitting a count-changing self-move, simulate the down-replication /
   opposing leg; if the move would be immediately undone (or fights an in-flight move on
   the same partition), do NOT emit it. This is precisely the missing damping for the
   quorum-spread self-move (internal research: no undo/overlap guard is wired for it) and
   is the lowest-risk, most local fix. Supports eval-path-b/c (hysteresis / incumbent
   hysteresis) and the interlock overlap detection.
2. **Raft ReadIndex / applied-index freshness gate** (BEST *root* match for "stale
   view"). Do not plan a count-changing move until the replica-row view is confirmed
   current (new leader has applied its own-term first entry / the CDC cache generation is
   fresh). This is the **services-row freshness gate** and is the canonical Raft rule for
   any read-derived decision. Directly supports eval-path-d (view completeness) /
   eval-path-e (services freshness).
3. **TiKV/PD region-epoch fencing** — reject/park a move whose planning epoch is stale
   vs. the committed replica-set generation. Structurally similar to #2, enforced at
   apply time rather than plan time.
4. **Learner-first / joint consensus (etcd/CRDB atomic replication changes)** — removes
   the transient-miscount WINDOW at the source (non-atomic add-then-remove). Highest
   correctness ceiling but largest change; the "don't count a not-yet-caught-up
   replacement" idea is the tractable slice.

### Synthesis for the fix decision
- The internal research says narrowing the interlock (concurrency limit) is unsafe and
  the flap-generator root (stranded session commit) is structurally blocked by a
  formation-vs-steady-state circular dependency. External evidence agrees the highest-
  leverage, lowest-risk levers are the two that these systems standardize:
  - **For (a):** a Consul-style **stabilization/settle window + formation `initialized`
    gate** on the durability-fitness demotion (don't run a steady-state health controller
    during bootstrap).
  - **For (b):** a CockroachDB-style **undo-simulation / deadband guard** on the
    count-changing self-move AND/OR a Raft-**applied-index freshness gate** on the
    view the count is derived from (don't act on a lagging read).
- These are complementary: (a) reduces how often a fresh leader re-plans; (b) makes each
  re-plan safe even when it happens. If only one is chosen, the (b) freshness/undo guard
  is the more general safety net because it protects against ANY stale-view re-plan, not
  just the durability-fitness one — this favors the **services-row freshness gate**
  (eval-path-e/d) reinforced by an **undo/incumbent-hysteresis deadband** (eval-path-b/c)
  over attacking the flap generator directly.

