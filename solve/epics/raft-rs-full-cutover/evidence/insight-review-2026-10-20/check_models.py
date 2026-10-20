#!/usr/bin/env python3
"""Finite design counterexamples; NOT a model of the full Lagrange implementation.

Standard-library only, Python 3.10+. Explores every reachable state of eight
small abstractions. Each defective rule has a reachable counterexample; its
proposed repair must have none within the stated model, and must engage a
positive case. No clock/disk/network/Byzantine/unbounded-liveness certification.
The word 'repaired' refers to the abstraction, not to repository source.

Run: python3 check_models.py --output model-results.json
"""
from __future__ import annotations
from collections import deque
from dataclasses import dataclass
import argparse
import hashlib
import json
from pathlib import Path
from typing import Callable, Iterable

State = tuple
Step = tuple[str, State]
@dataclass(frozen=True)
class Model:
    name: str
    assumptions: str
    initial: State
    successors: Callable[[State], Iterable[Step]]
    violation: Callable[[State], bool]
    success: Callable[[State], bool]


def explore(m: Model) -> dict:
    """Breadth-first exhaustive search, with a shortest counterexample trace."""
    todo = deque([m.initial])
    parent: dict[State, tuple[State, str] | None] = {m.initial: None}
    bad: list[State] = []
    terminals = transitions = successes = 0
    while todo:
        s = todo.popleft()
        if m.violation(s):
            bad.append(s)
        if m.success(s):
            successes += 1
        steps = list(m.successors(s))
        transitions += len(steps)
        if not steps:
            terminals += 1
        for event, nxt in steps:
            if nxt not in parent:
                parent[nxt] = (s, event)
                todo.append(nxt)
    trace = []
    if bad:
        cursor = bad[0]
        while parent[cursor] is not None:
            prev, event = parent[cursor]
            trace.append({'event': event, 'state': list(cursor)})
            cursor = prev
        trace.append({'event': 'initial', 'state': list(m.initial)})
        trace.reverse()
    return dict(name=m.name, assumptions=m.assumptions,
                reachable_states=len(parent), transitions=transitions,
                terminal_states=terminals, success_states=successes,
                violating_states=len(bad), shortest_counterexample=trace)


def bootstrap(repaired: bool) -> Model:
    # a=minimum metadata usable, p=participant admission, h=distinct hosts,
    # t=traffic ready. Safe durable roots/quorum are premises, not inferred.
    def steps(s):
        a, p, h, t = s
        if not a and (repaired or t):
            yield 'recover existing metadata owners from validated durable roots', (1,p,h,t)
        if a and not p:
            yield 'complete canonical participant release', (a,1,h,t)
        if p and h < 3:
            yield 'complete another distinct-host placement', (a,p,h+1,t)
        if a and p and h == 3 and not t:
            yield 'publish traffic readiness', (a,p,h,1)
    def bad(s):
        a,p,h,t=s
        return bool(t and not(a and p and h==3)) or (not t and not list(steps(s)))
    return Model('bootstrap circular prerequisites',
        'Four state variables; safe intact root storage and quorum already available; three required hosts. '
        'The bad model requires traffic-ready to recover metadata. The repair changes only that dependency.',
        (0,0,0,0),steps,bad,lambda s: s[3]==1)


def stale_effect(repaired: bool) -> Model:
    # current generation, observation, settled, wrong effect, acted-on generation
    def steps(s):
        g,checked,settled,wrong,acted=s
        if not checked and not settled:
            yield 'caller checks grant for generation 1', (g,1,settled,wrong,acted)
        if g==1:
            yield 'resource owner installs generation 2', (2,checked,settled,wrong,acted)
        if checked and not settled:
            if repaired:
                if g==1:
                    yield 'sink atomically checks and effects exact generation 1', (g,checked,1,wrong,1)
                else:
                    yield 'sink refuses stale generation; obligation remains unresolved', (g,checked,1,wrong,acted)
            else:
                yield 'late STOP resolves logical name to current generation', (g,checked,1,int(g!=1),g)
    return Model('effect-boundary physical fencing',
        'Two generations, one delayed effect, one replacement. Repair serializes exact-generation validation '
        'with the sink effect; a separate pre-check would not satisfy this model. Positive coverage requires '
        'an actual effect on generation 1, not merely a safe refusal.',
        (1,0,0,0,0),steps,lambda s: bool(s[3]),lambda s: s[2]==1 and s[3]==0 and s[4]==1)


def overflow(repaired: bool) -> Model:
    # observed credit for request A/B (-1 unknown, 0 refused, 1 allowed), applied A/B, reserved total
    def steps(s):
        seen0,seen1,done0,done1,total=s
        for i in (0,1):
            seen=[seen0,seen1]; done=[done0,done1]
            if seen[i]==-1:
                allowed=int(total<1)
                seen[i]=allowed
                # The repaired authoritative reservation is atomic at admission.
                nxt_total=total+allowed if repaired else total
                yield f'operation {i}: '+('reserve at single owner' if repaired else 'read unreserved spare credit'), (*seen,*done,nxt_total)
            elif not done[i]:
                done[i]=1
                nxt_total=total if repaired else total+seen[i]
                yield f'operation {i}: consume captured allowance', (*seen,*done,nxt_total)
    return Model('shared overflow budget',
        'Two distinct operations, one spare slot, no release/restart. Repaired reservation is atomic, '
        'stored by the existing budget owner, and uniquely keyed by operation.',
        (-1,-1,0,0,0),steps,lambda s:s[4]>1,lambda s:s[2]==s[3]==1 and s[4]==1)


def lost_wake(repaired: bool) -> Model:
    # phase 0=not read,1=read unavailable,2=registered,3=waiting;
    # ready, waiter installed, queue dirty, complete.
    def steps(s):
        phase,ready,waiter,dirty,done=s
        if not ready:
            yield 'authoritative prerequisite becomes ready; notify current subscribers', (phase,1,waiter,int(bool(waiter)),done)
        if done:
            return
        if phase==0:
            yield 'read authoritative prerequisite', (1,ready,waiter,dirty,int(bool(ready)))
        elif phase==1:
            yield 'register waiter', (2,ready,1,dirty,done)
        elif phase==2:
            if repaired:
                yield 'recheck level after registration', (3,ready,waiter,int(bool(dirty or ready)),done)
            else:
                yield 'sleep without post-registration recheck', (3,ready,waiter,dirty,done)
        elif dirty:
            yield 'same owner reconciles retained obligation', (phase,ready,waiter,0,int(bool(ready)))
    def bad(s):
        phase,ready,waiter,dirty,done=s
        return phase==3 and ready==1 and dirty==0 and done==0
    return Model('read/register lost-wake interval',
        'One readiness transition, reliable callbacks to registered listeners, one dirty bit. '
        'Crash or dropped notifications require an additional fair rescan; this model does not certify those.',
        (0,0,0,0,0),steps,bad,lambda s:bool(s[4]))


def historical_commit(repaired: bool) -> Model:
    # durable decision (0 undecided,1 committed), current coordinator epoch,
    # observed decision by replacement: 0 not recovered,1 COMMIT,2 rejected-as-stale.
    def steps(s):
        decision,epoch,recovered=s
        if epoch==1 and decision==0:
            yield 'commit decision becomes durable under coordinator epoch 1', (1,epoch,recovered)
        if epoch==1:
            yield 'coordinator replacement advances scheduling epoch to 2', (decision,2,recovered)
        if epoch==2 and decision==1 and recovered==0:
            yield ('replacement recognizes immutable transaction commit' if repaired
                   else 'replacement rejects known commit because its issuing epoch is old'), (decision,epoch,1 if repaired else 2)
    return Model('historical decision vs current permission',
        'One immutable transaction identity/manifest, two coordinator epochs, one known durable COMMIT. '
        'The repair preserves the commit fact, not the old coordinator\'s permission to initiate new effects.',
        (0,1,0),steps,lambda s:s[0]==1 and s[2]==2,
        lambda s:s[0]==1 and s[1]==2 and s[2]==1)


def dedup_migration(repaired: bool) -> Model:
    # phase 0=before first write,1=parent applied with lost response,2=child published,3=retry;
    # effect count, current owner's receipt
    def steps(s):
        phase,effects,receipt=s
        if phase==0:
            yield 'parent atomically commits write and result receipt; reply lost', (1,1,1)
        elif phase==1:
            yield ('publish child with data AND replay receipt' if repaired
                   else 'publish child with rows but without replay receipt'), (2,effects,receipt if repaired else 0)
        elif phase==2:
            yield 'retry identical logical request at new owner', (3,effects if receipt else effects+1,1)
    return Model('replay evidence through topology handoff',
        'One request, one split/migration, one lost reply. Initial apply/result storage is atomic. '
        'Repair retains replay evidence with data before ownership publication; GC is a separate obligation.',
        (0,0,0),steps,lambda s:s[1]>1,lambda s:s[0]==3 and s[1]==1)


def cdc_frontier(repaired: bool) -> Model:
    # delivered mask, observed/applied mask, global max, cursor A, cursor B
    events=((0,100),(1,1))
    def steps(s):
        delivered,applied,globalmax,ca,cb=s
        for stream,seq in events:
            bit=1<<stream
            if delivered&bit:
                continue
            last=(ca if stream==0 else cb) if repaired else globalmax
            accepted=seq>last
            newapplied=applied|bit if accepted else applied
            yield f'deliver stream {"AB"[stream]} sequence {seq}', (
                delivered|bit,newapplied,max(globalmax,seq),
                max(ca,seq) if stream==0 else ca,
                max(cb,seq) if stream==1 else cb)
    return Model('incomparable CDC positions',
        'Two independent ordered streams with one valid unseen event each, positions A:100 and B:1. '
        'No global total-order owner exists. Stream incarnation/lineage changes are not modeled.',
        (0,0,0,0,0),steps,lambda s:s[0]==3 and s[1]!=3,
        lambda s:s[0]==3 and s[1]==3)


def bounded_replay(repaired: bool) -> Model:
    # phase, effects, receipt retained, client valid
    def steps(s):
        phase,effects,receipt,valid=s
        if phase==0:
            yield 'apply write and retain replay result; reply lost', (1,1,1,1)
        elif phase==1:
            yield ('fence expired retry identity before collecting replay record' if repaired
                   else 'collect result after local timeout; leave identity usable'), (2,effects,0,0 if repaired else 1)
        elif phase==2:
            yield ('refuse retired identity without side effect' if not valid
                   else 'retry missing record as new work'), (3,effects+(1 if valid and not receipt else 0),receipt,valid)
    return Model('bounded replay metadata',
        'One request, one retention expiry, one delayed retry. Demonstrates that receipt GC must be coupled '
        'to identity retirement or an equivalent authoritative retention protocol; cannot promise unlimited replay with finite evidence.',
        (0,0,0,1),steps,lambda s:s[1]>1,
        lambda s:s[0]==3 and s[1]==1 and s[3]==0)


BUILDERS=(bootstrap,stale_effect,overflow,lost_wake,historical_commit,dedup_migration,cdc_frontier,bounded_replay)
def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=Path('model-results.json'))
    args=parser.parse_args()
    studies=[]
    for build in BUILDERS:
        bad=explore(build(False)); good=explore(build(True))
        assert bad['violating_states']>0, f"Defective rule not discriminated: {bad['name']}"
        assert good['violating_states']==0, f"Counterexample to proposed repair: {good['name']}"
        assert good['success_states']>0, f"Repair never engages a positive: {good['name']}"
        studies.append(dict(defective=bad,repaired_abstraction=good))
        print(f"{bad['name']}: bad {bad['reachable_states']} states / {bad['violating_states']} violations; "
              f"repaired {good['reachable_states']} states / 0 violations")
        print('  shortest: '+' -> '.join(x['event'] for x in bad['shortest_counterexample']))
    results=dict(schema='lagrange-design-counterexamples/v1',date='2026-10-20',
        target_source='be25caa5f0c3612feec662d4feaa9ba28f8f34df',
        artifact_scope='Authored finite abstractions, not extracted production models. No repository source tests run.',
        proof_ceiling='Exhaustive only for each listed finite transition system; no unbounded liveness, '
                      'production reachability, cross-host, IO, independent-review or release certification.',
        script_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),studies=studies)
    args.output.write_text(json.dumps(results,indent=2)+'\n',encoding='utf-8')
    print('All eight negative controls discriminated; all eight corrected abstractions have a positive and no bounded violation.')
    return 0
if __name__=='__main__':
    raise SystemExit(main())
