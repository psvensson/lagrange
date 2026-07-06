# Academic Theory & Papers Behind the Ledger Self-Move Limit-Cycle Bug

_Research report. All citations verified against primary sources except where explicitly flagged._

## The phenomenon being grounded
A distributed placement/rebalancing controller oscillates in a LIMIT CYCLE during
cluster formation. A control loop (replica placement) reads a LAGGING SENSOR (a
CDC-replicated cache of committed state) and makes a discrete COUNT decision
(add/remove a replica). A separate health controller DEMOTES the raft leader for
transiently-low "durability fitness". Each demotion -> fresh leader -> stale sensor
read -> phantom count move that OPPOSES the in-progress change -> sustained
oscillation. No deadband/hysteresis on the count decision; sensor lag + relay-like
discrete decision = classic limit-cycle conditions.

Three physical ingredients map onto three bodies of theory:
1. The **relay input** = leadership flap (a health controller repeatedly demoting the
   leader). Theory: Raft leadership stability — leadership transfer, Pre-Vote,
   disruptive-server prevention.
2. The **lagging sensor** = CDC/cache read of committed state consumed before acting.
   Theory: read-before-acting freshness — ReadIndex, leader leases, TrueTime/closed
   timestamps.
3. The **discrete decision with no deadband** = add/remove replica count. Theory:
   relay/on-off feedback limit cycles and the hysteresis/deadband remedy; controller
   anti-flap (HPA stabilization window).
Plus a **formation-ordering** layer: the circular dependency where a health/quorum
controller cannot be satisfied until formation completes, yet blocks the formation
that would satisfy it.

---

## Theme 1 — Raft leadership stability & reconfiguration (the RELAY INPUT)

**Primary source:** Diego Ongaro, _Consensus: Bridging Theory and Practice_, PhD
dissertation, Stanford University, 2014.
PDF: https://web.stanford.edu/~ouster/cgi-bin/papers/OngaroPhD.pdf
(sources also at https://github.com/ongardie/dissertation ; Stanford repository
https://purl.stanford.edu/qr033xr6097). Section numbers below are quoted from the
dissertation's own table of contents and body pages (verified by reading the PDF).

**Original paper:** Diego Ongaro & John Ousterhout, "In Search of an Understandable
Consensus Algorithm," USENIX ATC 2014 (Best Paper).
https://www.usenix.org/system/files/conference/atc14/atc14-paper-ongaro.pdf
Extended version: https://raft.github.io/raft.pdf

### 1a. Leadership transfer extension — §3.10 (p.28)
Mechanism (quoted): "an optional extension to Raft that allows one server to transfer
its leadership to another." Motivated by two situations: (1) "Sometimes the leader
must step down. For example, it may need to reboot for maintenance, or it may be
removed from the cluster... When it steps down, the cluster will be idle for an
election timeout until another server times out and wins an election. This brief
unavailability can be avoided by having the leader transfer its leadership to another
server before it steps down." (2) "one or more servers may be more suitable to lead
the cluster than others. For example, a server with high load would not make a good
leader."
The transfer works by the leader bringing the target's log fully up to date, then
sending a `TimeoutNow` so the target starts an election immediately and wins before
any other server times out — leadership moves in one election-timeout-free hop.
**Which failure it prevents:** the availability gap and the election scramble that
follow an abrupt, uncoordinated step-down.
**How it applies to our bug:** the health controller currently DEMOTES (abrupt
step-down) for transient low durability fitness. That is precisely the "server not
suitable to lead right now" case §3.10 is written for — but demotion is the wrong
tool: it triggers a fresh, uncoordinated election (the relay pulse). If leadership
must move at all, an _orderly transfer_ (or simply _not moving it_ for a transient
dip) removes the relay pulse that seeds the limit cycle.

### 1b. Catching up new servers as non-voting members — §4.2.1 (p.37–39)
Mechanism (quoted): "To catch up a new server, the replication of entries to the new
server is split into rounds." The new server is added as a **non-voting** learner
first; the leader "should also abort the change if the new server is unavailable or is
so slow that it will never catch up." Cited cautionary tale: "Lamport's ancient Paxon
government broke down because they did not include it. They accidentally changed the
membership to consist of only drowned sailors and could make no more progress."
**Which failure it prevents:** adding a not-yet-caught-up voter shifts the majority
onto members that cannot actually respond, putting availability at risk mid-change.
**How it applies to our bug:** the general principle — _do not let a member/replica
count toward a quorum-or-count decision until it is actually caught up and verified_ —
is the same discipline our count controller violates when it acts on a stale cache
rather than a caught-up, confirmed view.

### 1c. Disruptive servers & Pre-Vote — §4.2.3 (p.40–41) and §9.6 (p.136)
Mechanism (quoted, §4.2.3): "Without additional mechanism, servers not in Cnew can
disrupt the cluster... a server that is not in Cnew will no longer receive heartbeats,
so it will time out and start new elections... it will send RequestVote RPCs with new
term numbers, and this will cause the current leader to revert to follower state. A new
leader from Cnew will eventually be elected, but the disruptive server will time out
again and the process will repeat, resulting in poor availability."
This is a **textbook description of a leadership limit cycle**: a peripheral condition
repeatedly forces the incumbent leader down, a new leader rises, the condition recurs,
oscillation sustains.
The **Pre-Vote** phase (§9.6, p.136–137): "a candidate would first ask other servers
whether its log was up-to-date enough to get their vote. Only if the candidate believed
it could get votes from a majority of the cluster would it increment its term and start
a normal election." Pre-Vote prevents a partitioned/rejoining server from disrupting a
healthy leader by bumping the term.
Important nuance the thesis states explicitly (§4.2.3, Fig. 4.7): "the Pre-Vote phase
does **not** solve the problem of disruptive servers" in the reconfiguration case; the
membership-change fix is the separate **minimum-election-timeout / heartbeat** rule
(reject RequestVotes received within the minimum election timeout of hearing from a
current leader).
**Which failure it prevents:** unnecessary term bumps and leader step-downs caused by a
server that has no business winning — i.e., damping spurious leadership churn.
**How it applies to our bug:** our leadership flap is driven by an internal health
controller, not a rejoining peer, but the _class_ is identical: a peripheral signal
repeatedly forces the leader down and re-elects. Pre-Vote/min-timeout are Raft's
built-in **anti-flap dampers on the leadership relay** — the analogue of putting
hysteresis on the "should this leader keep leading?" decision (see Theme 3).

### 1d. Membership: single-server vs joint consensus — Ch.4 (§4.1 p.33, §4.3 p.43)
Single-server changes (§4.1): add or remove one server at a time; safety is preserved
"since at least one server overlaps any majority during the change." Joint consensus
(§4.3, Cold,new): the general N-at-once change transits an intermediate joint
configuration where decisions need a majority of BOTH old and new configs, so "there is
no time when Cold and Cnew can both make unilateral decisions." A leader "rejects
additional configuration changes when a configuration change is already in progress."
**How it applies to our bug:** the "reject a new change while one is in progress" rule
is itself an interlock against overlapping, contradictory reconfigurations — the same
family as our self-move interlock. The theory says overlap-safety must hold _across_ a
change; a stale-view controller that issues an opposing count move mid-change breaks
exactly that invariant.

---

## Theme 2 — Read-before-acting freshness (the LAGGING SENSOR)

The core defect is a controller that ACTS on a lagging replicated view. The canonical
distributed-systems answer is: before a leader takes an action whose correctness
depends on the latest committed state, it must first establish that its view is fresh
(that it is still leader and has seen all prior commits). Three mechanisms:

### 2a. Raft ReadIndex (read-index) — Ongaro thesis §6.4 (p.72–73)
The problem statement is almost verbatim our bug (quoted): "bypassing the log could
lead to stale results for read-only queries. For example, a leader might be partitioned
from the rest of the cluster, and the rest of the cluster might have elected a new
leader and committed new entries... If the partitioned leader responded to a read-only
query without consulting the other servers, it would return stale results, which are
not linearizable."
The five-step ReadIndex protocol (quoted/paraphrased, §6.4):
1. If the leader has not yet committed an entry from its current term, it commits a
   blank **no-op** first (Leader Completeness alone doesn't tell a fresh leader which
   entries are committed until it commits one of its own term).
2. The leader records `readIndex = commitIndex` as a lower bound.
3. The leader issues a **fresh round of heartbeats and waits for a majority to ack** —
   proving "there could not have existed a leader for a greater term at the moment it
   sent the heartbeats," so its view is current.
4. It waits for its state machine to advance to at least `readIndex`.
5. Only then does it serve the read.
**Mechanism essence:** a leader confirms it is _still the leader_ and its applied state
is _at least as fresh as the latest commit_ BEFORE using that state to answer.
**How it applies to our bug:** the replica-count controller reads a CDC/cache view and
acts with no equivalent of steps 1–4. A ReadIndex-style **freshness gate** — confirm
current leadership + apply-caught-up-to-commit, or read the committed state directly
from the owner/leader bypassing the cache — makes the phantom opposing move impossible
because the sensor is no longer allowed to lag. (This is the same shape as the prior
fix `c7a3bf19`: a cache-BYPASSING owner-RPC read on the self-move interlock.)

### 2b. Leader leases / clock-based reads — Ongaro thesis §6.4.1 (p.73–74)
Mechanism (quoted): "the normal heartbeat mechanism would provide a form of lease. Once
the leader's heartbeats were acknowledged by a majority of the cluster, the leader would
assume that no other server will become leader for about an election timeout, and it
could extend its lease accordingly... The leader would then reply to read-only queries
during that period without any additional communication." Lease bound (Fig 6.3):
`start + electionTimeout / clockDriftBound`. Caveat: "If the assumptions [bounded clock
drift] are violated, the system could return arbitrarily stale information." And
critically for Theme 1: "a leader would need to expire its lease before transferring
leadership."
**How it applies:** a lease is the _time-domain_ freshness guarantee — the leader may
act cache-free only while it provably still holds leadership. The lease/leadership-
transfer coupling is exactly why abrupt demotion (no lease expiry, no transfer) is
dangerous: it hands leadership to a node whose view can be behind.

### 2c. Spanner TrueTime + leader leases
Primary: J. Corbett et al., "Spanner: Google's Globally-Distributed Database," OSDI
2012 (https://research.google/pubs/pub39966/ ; course PDF
https://courses.cs.vt.edu/cs5204/fall14-butt/lectures/spanner.pdf).
Mechanism: TrueTime exposes bounded-uncertainty time (`TT.now()` = [earliest, latest]).
"Spanner's Paxos implementation uses timed leases to make leadership long-lived (10
seconds by default)." A leader holds a lease interval derived from TrueTime; a
replica serves a strong read only within its lease and after its safe-time has advanced
past the read timestamp. Bounded-staleness reads (Google Cloud Spanner docs
https://docs.cloud.google.com/spanner/docs/timestamp-bounds) let a read pick the newest
timestamp within a user-supplied staleness bound so it can be served locally without
blocking — an _explicit, bounded_ lag rather than an accidental unbounded one.
**How it applies:** the design principle is that any staleness in a
read-before-acting path must be **bounded and intentional**, gated by a lease/safe-time
— never the unbounded, uncontrolled lag of a CDC cache feeding a control decision.

### 2d. CockroachDB epoch-based leases & closed timestamps
Primary/technical: CockroachDB "An epic read on follower reads"
(https://www.cockroachlabs.com/blog/follower-reads-stale-data/) and the bounded-
staleness RFC
(https://github.com/cockroachdb/cockroach/blob/master/docs/RFCS/20210519_bounded_staleness_reads.md).
Mechanism: range leases (epoch-based, tied to a node liveness epoch) name a single
leaseholder that may serve reads without consensus; **closed timestamps** advance a
per-range timestamp below which no new writes will be accepted, so any replica can serve
a consistent read as of a closed timestamp. A strong read at a non-leaseholder "contacts
the leader and asks for a log position associated with the read's timestamp, and then
waits for replication to apply commands through the respective log position locally."
**How it applies:** same lesson as Spanner — freshness is a first-class, explicitly
tracked quantity (closed timestamp / safe time). A controller that consumes replicated
state should consume it _as of a closed timestamp it has caught up to_, not as of
"whatever the cache last saw."

### 2e. Recent formalization
"LeaseGuard: Raft Leases Done Right," A. J. Jiryu Davis et al. (MongoDB), arXiv 2025,
https://arxiv.org/abs/2512.15659 — formalizes correct Raft lease handoff (the failure
mode where an old leaseholder serves stale reads across a leadership change). Useful as
a current, peer-reviewable statement that lease/leadership handoff is the subtle part
— directly relevant to demotion-driven leadership churn feeding stale reads.
_(2025 arXiv preprint; cite as a preprint, not yet a journal/conference final.)_

---

## Theme 3 — Control theory of limit cycles (the DISCRETE DECISION with NO DEADBAND)

### 3a. Relay feedback produces sustained limit cycles; the describing-function method
Canonical references:
- K. J. Åström & T. Hägglund, "Automatic Tuning of Simple Regulators with Specifications
  on Phase and Amplitude Margins," _Automatica_ 20(5), 1984 — the relay-feedback
  auto-tuner: deliberately inserting an on/off (relay) element into a feedback loop
  **forces a stable limit cycle** at the plant's ultimate frequency. This is the
  foundational demonstration that relay + lagging linear dynamics => self-sustained
  oscillation.
- Tutorial review: C. C. Hang, K. J. Åström, W. K. Wang, "Relay feedback auto-tuning
  of process controllers — a tutorial review," _Control Engineering Practice_ 10 (2002)
  https://www.sciencedirect.com/science/article/abs/pii/S0959152401000257 (open PDF:
  https://slunik.slu.se/kursfiler/TE0010/10095.1213/Reg1TuneReview.pdf). States the
  mechanism plainly: "The purpose of this method is to cause limited and controlled
  oscillations in the process."
- Describing-function analysis (the standard tool): a limit cycle exists near the
  frequency where `1 + N(a)·G(jω) = 0`, i.e. `G(jω) = −1/N(a)`, where `N(a)` is the
  describing function (amplitude-dependent quasi-gain) of the nonlinearity and `G` the
  linear part. For an ideal relay `N(a) = 4d/(πa)`; **transport delay (dead time) in
  `G` rotates the Nyquist locus and is what makes the −1/N intersection — the sustained
  oscillation — occur.** Standard textbook treatments: K. J. Åström & R. M. Murray,
  _Feedback Systems_ (Princeton, free at https://fbswiki.org/), chapter on nonlinear
  behavior/limit cycles; H. K. Khalil, _Nonlinear Systems_ (3rd ed.), describing-
  function section; J.-J. Slotine & W. Li, _Applied Nonlinear Control_, describing-
  function chapter. _(These textbook chapter cites are from standard knowledge of these
  well-known texts; I did not re-fetch each page — treat the exact page numbers as
  needing a look-up, but the results themselves are standard and correct.)_
- Time-delay + relay-with-hysteresis limit-cycle stability specifically: J. M. Gonçalves
  et al., "Local stability of limit cycles for time-delay relay-feedback systems"
  (https://www.researchgate.net/publication/3324063 ). Confirms delay + relay hysteresis
  => limit cycles whose stability can be analyzed.

**Why a DEADBAND / HYSTERESIS breaks the cycle.** A relay _with hysteresis_ (Schmitt
trigger: separate upper/lower switching thresholds) changes the describing function to
a complex `N(a)` whose `−1/N(a)` locus shifts; more intuitively, the controller will not
reverse its output until the signal has crossed a _band_, not a single point. With a
band wider than the peak-to-peak excursion the lagging sensor can produce, the reverse-
switch condition is never met and the oscillation cannot sustain. In electronics terms
(Schmitt trigger tutorials, e.g. https://www.next.gr/tutorials/operational-amplifiers/comparator-with-hysteresis-schmitt-trigger-tutorial):
hysteresis "introduces a form of memory that ensures stability, prevents oscillation,
and avoids noise interference." The **deadband trades a small steady-state error for the
elimination of chatter/limit-cycling** — exactly the trade a replica-count controller
should make (tolerate being transiently ±1 off target rather than thrash).

**Sampled-data / transport-delay angle.** The CDC cache lag is a transport delay in the
feedback path; sampled-data control theory (G. F. Franklin, J. D. Powell, M. Workman,
_Digital Control of Dynamic Systems_ — standard text) shows that a pure delay adds phase
lag `−ωT` without changing gain, eroding phase margin and driving otherwise-stable loops
into oscillation. Two independent remedies fall straight out: (i) **reduce/remove the
delay** (freshness gate — Theme 2), or (ii) **add hysteresis/deadband** so the loop
tolerates the phase lag without switching. Either one alone stops the limit cycle.

**How it applies to our bug:** the count decision (add/remove replica) is a relay
(discrete, threshold-triggered), the CDC cache is the transport delay, and there is no
deadband — the exact recipe for a sustained limit cycle. Theory guarantees that a
hysteresis band on the count decision, or removal of the sensor lag, each independently
kills it.

### 3b. Applied controller anti-flap — Kubernetes HPA stabilization window
Primary: Kubernetes docs, Horizontal Pod Autoscaling
(https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/); practical
write-ups: FlightCrew/Chronosphere "Taming Kubernetes HPA Flapping with Stabilization
Windows," OneUptime "HPA stabilizationWindowSeconds to Prevent Scaling Thrashing"
(https://oneuptime.com/blog/post/2026-02-09-hpa-stabilization-window-prevent-thrashing/view),
AnantaCloud "Preventing Autoscaler Flapping: Kubernetes HPA Tolerance in Depth."
Mechanism, three damping layers, all directly on-point:
1. **Stabilization window** — HPA records every desired-replica recommendation over a
   rolling window and, when it acts, "chooses the highest replica-count recommendation
   that appeared inside the ... window" for scale-down (min for scale-up). Default
   scale-down window = 300s; scale-up = 0s. As one source puts it: "Because HPA lacks
   intrinsic damping, stabilization windows act as an **external hysteresis mechanism**."
2. **Tolerance (deadband)** — default 0.1: HPA does not act while the metric is within
   10% of target, "preventing constant micro-adjustments under noisy metrics." This is a
   literal deadband on the scaling decision.
3. **Asymmetry** — aggressive up, conservative down ("never scale below any peak that
   occurred inside the window") — an intentional bias so the damper never starves
   capacity.
**How it applies to our bug:** HPA is the industry's canonical count-controller-that-
would-otherwise-flap, and its production fix is precisely (deadband + stabilization
window) = hysteresis on the count decision. A replica-count controller adding/removing
placements is the same controller class; the same remedy (a hysteresis band + a
stabilization window over recent recommendations, biased toward not removing a replica
mid-formation) transfers directly. (General datacenter-scheduler oscillation and the use
of dampening is folklore-plus-HPA; I did not find a single canonical peer-reviewed
"scheduler limit cycle" paper — the strongest documented instance is HPA itself.)

---

## Theme 4 — Autoscaling / controller flapping literature (summary)
Covered under Theme 3b (HPA is the best-documented case). Additional grounding: the
control-theory framing of autoscalers as feedback controllers needing damping is treated
in surveys of cloud elasticity control (e.g., Lorido-Botrán, Miguel-Alonso, Lozano, "A
Review of Auto-scaling Techniques for Elastic Applications in Cloud Environments,"
_Journal of Grid Computing_ 12(4), 2014 — classifies reactive threshold controllers and
notes their oscillation/thrashing tendency and the need for cool-down/damping).
_(I recall this survey's thesis from standard knowledge; I did not re-fetch it this
session — verify the exact volume/page before quoting.)_ The consistent message: reactive
count controllers oscillate unless given a cool-down/stabilization/deadband — a restatement
of the relay-hysteresis result in ops language.

---

## Theme 5 — Bootstrap / formation circular dependency
**Primary source:** Ongaro thesis §4.4 "System integration" (p.45–46) plus §3.8
"Persisted state and server restarts" (p.27). These directly address the "health/quorum
controller can't be satisfied until formation completes, but blocks the formation"
class.

The two load-bearing passages (quoted, §4.4 p.46):
- On the auto-remove/auto-replace controller that is _our controller_: "it can be
  **dangerous for the cluster to automatically remove failed servers, as it could then be
  left with too few replicas to satisfy the intended durability and fault-tolerance
  requirements.** One reasonable approach is to have the system administrator configure a
  desired cluster size, and within that constraint, available servers could automatically
  replace failed servers." — i.e., a count controller must be governed by a stable target
  and must not react to transient unfitness by shedding replicas.
- On ordering: "When making cluster membership changes that require multiple single-server
  steps, it is preferable to **add servers before removing servers.**" (add-before-remove
  keeps fault tolerance intact throughout — the ordering discipline our formation violates
  when a stale read removes/opposes before the add lands.)
- On breaking the bootstrap chicken-and-egg (initial configuration): "we recommend that
  the very first time a cluster is created, **one server is initialized with a
  configuration entry as the first entry in its log. This configuration lists only that
  one server; it alone forms a majority of its configuration, so it can consider this
  configuration committed.** Other servers ... are added ... through the membership change
  mechanism." — the canonical escape hatch: seed a trivially-satisfiable single-member
  config, then grow. This is the formal answer to "you need a quorum to make progress but
  need progress to form a quorum."

Also §3.8 (p.27): commitIndex "can safely be reinitialized to zero on a restart. Even if
every server restarts at the same time, the commit index will only temporarily lag behind
its true value" — an explicit statement that a freshly-elected leader's view is
_transiently behind_ and recovers; acting on that transient lag (as our controller does)
is the error.

General framing (secondary): the "chicken-and-egg / circular dependency at bootstrap"
pattern and its standard escape hatches (staged startup, a non-cyclic seed/bootstrap node,
idempotent retry, decoupling via runtime-fetched config) are surveyed in practitioner
literature, e.g. dev.to "Solved: how to develop in a way that's robust to chicken-and-egg
problems," and Sander van der Burg, "Deploying systems with circular dependencies using
Disnix." These corroborate the seed-config approach but are not formal.

**How it applies to our bug:** the durability-fitness gate is the "health controller that
can't be satisfied until formation completes." Ongaro §4.4 says (a) don't let such a gate
drive replica removal/opposition on transient unfitness, (b) add-before-remove, and (c)
give formation a trivially-satisfiable seed so it can make progress at all. Our bug is the
gate blocking the very formation that would satisfy it — the exact anti-pattern §4.4 warns
against.

---

## SYNTHESIS — THREE INDEPENDENT CUTS

The limit cycle is a loop with three necessary ingredients. Cutting **any one** breaks it
(classic result: a relay-feedback limit cycle needs the relay, the loop gain/phase, and the
switching to reverse — remove the delay OR widen the deadband OR remove the relay and the
`−1/N(a) = G(jω)` intersection no longer exists).

- **Cut (a) — remove the sensor lag (freshness gate).** Make the count decision read a
  fresh, leadership-confirmed, apply-caught-up view (ReadIndex, Theme 2a) or read committed
  state directly from the owner/leader bypassing the CDC cache (Spanner/CRDB closed-timestamp
  discipline, Themes 2c/2d). Theory: removes the transport delay ⇒ restores phase margin ⇒
  no limit cycle (sampled-data result, Theme 3a).
- **Cut (b) — add a deadband/hysteresis to the count decision.** A Schmitt-trigger band /
  HPA-style stabilization window on add/remove-replica, biased toward not removing mid-
  formation. Theory: changes `N(a)` / raises the switching threshold above the lag-induced
  excursion ⇒ the reverse-switch condition is never met (relay-hysteresis result, Themes
  3a/3b). Trades a bounded ±count error for elimination of chatter.
- **Cut (c) — remove the relay input (leadership flap).** Stop demoting the leader for a
  transient durability-fitness dip (incumbent-leader hysteresis / Pre-Vote-style min-timeout
  damping, Themes 1c), or replace abrupt demotion with orderly leadership transfer only when
  genuinely warranted (§3.10, Theme 1a). Theory: with no repeated forced step-down, there is
  no relay pulse to seed the oscillation; also §4.4 says a health gate must not drive
  count/leadership churn on transient unfitness.

### Mapping to the candidate fixes (eval-path files in this change dir)
- `eval-path-a-root` — the root/freshness framing ⇒ **Cut (a)**. Cleanest in principle: it
  attacks the actual defect (a control loop acting on a lagging sensor) and, per Theme 2,
  matches how correct systems (Raft ReadIndex, Spanner, CockroachDB) are built. Reuses the
  established pattern already in this codebase (`c7a3bf19`, cache-bypassing owner-RPC read).
- `eval-path-d-view-completeness` and `eval-path-e-services-freshness` — both are **Cut (a)**
  variants (make the consumed view complete/fresh before acting). Same theoretical class as
  ReadIndex step 3–4 (confirm leadership + apply-caught-up).
- `eval-path-b-hysteresis` — **Cut (b)**, deadband on the count decision (HPA stabilization
  window analogue). Sound and independently sufficient, but it _masks_ rather than _removes_
  the lag; theory-clean as a robustness layer, not as the sole fix.
- `eval-path-c-incumbent-hysteresis` — **Cut (c)**, hysteresis on leadership (don't flap the
  leader on transient fitness). Directly attacks the relay input; strongest _preventive_ cut
  and aligns with Raft's own anti-flap machinery (Pre-Vote/min-timeout, §9.6/§4.2.3) and
  §4.4's "don't churn on transient unfitness."

### Which cut is theoretically cleanest
Two are "correct-by-construction," one is a "robustness band":
1. **Cut (a) freshness gate is the cleanest _root_ fix** — it eliminates the lagging-sensor
   pathology itself, so the loop is correct regardless of how often leadership moves. It is
   the exact mechanism (read-before-act freshness) that every principled consensus/DB system
   in Theme 2 uses, and it reuses machinery already proven in this repo.
2. **Cut (c) removing the relay is the cleanest _preventive_ fix** — it removes the
   externally-injected disturbance (spurious leadership flap) that has no legitimate reason to
   exist; a leader should not be demoted for a transient durability dip in the first place.
3. **Cut (b) hysteresis is the cleanest _robustness_ fix** — cheap, well-understood, and the
   industry-standard anti-flap layer (HPA), but it accepts a bounded steady-state count error
   and leaves the underlying lag/flap in place.

Because the cuts are independent, the theoretically strongest posture is **(a) as the root
fix, with (c) removing the illegitimate relay, and (b) retained as a defensive hysteresis
band** — but any single one provably breaks the current limit cycle. If forced to choose one,
Cut (a) (freshness gate) is the most defensible: it is the direct analogue of the accepted
correct-construction technique (ReadIndex/leases) and does not depend on tuning a band width
against a hard-to-bound worst-case sensor lag.

---

## Verified vs. flagged citations
- **Verified from primary source (PDF read this session):** all Ongaro dissertation section
  numbers and quotes — §3.8, §3.10, §4.1, §4.2.1, §4.2.3, §4.3, §4.4, §6.4, §6.4.1, §9.6.
- **Verified via search/official pages:** Raft ATC 2014 paper; HPA stabilization window +
  tolerance mechanics; Spanner TrueTime lease (10s) & bounded-staleness docs; CockroachDB
  closed-timestamp/epoch-lease + bounded-staleness RFC; Åström–Hägglund relay auto-tuning
  tutorial review; LeaseGuard arXiv 2512.15659.
- **Cited from standard knowledge, NOT re-fetched this session (verify exact page/edition
  before quoting):** Åström & Murray _Feedback Systems_, Khalil _Nonlinear Systems_, Slotine
  & Li _Applied Nonlinear Control_ (describing-function/limit-cycle chapters); Franklin/Powell/
  Workman _Digital Control of Dynamic Systems_; Lorido-Botrán et al. 2014 auto-scaling survey;
  Åström–Hägglund 1984 _Automatica_ original relay-tuner (the 2002 tutorial review, which I did
  verify, cites and summarizes it). These are well-established results; the risk is only in the
  exact page/volume metadata, not the substance.
- **No fabrications.** Where I could not pin a single canonical peer-reviewed "datacenter
  scheduler limit cycle" paper, I said so (HPA is the best-documented concrete instance).
