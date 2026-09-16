#!/usr/bin/env node
/**
 * Formation interaction-attribution authority probe
 * (`formation-production-interaction-attribution-authority` quest, epic
 * formation-seed-decoupling).
 *
 *   node scripts/checks/formation-attribution-authority.js [--explain]
 *
 * Prints the number of UNMET acceptance clauses (the quest probe; target 0).
 *
 * The question this probe answers is not "how much work is attributed". It is
 * "who was allowed to decide the owner, and can every measured segment say
 * why it has the owner it has". A generic execution mechanism - the
 * execution-node context, VirtualNetwork delivery, a promise continuation, a
 * remote peer representation, the transcript - transports execution and must
 * never become a semantic owner by transporting it. An owner is acquired at a
 * semantic boundary or the work stays unattributed; there is no fallback.
 *
 * Two clause families:
 *
 *   witness clauses - the mutation controls and the boundary witnesses. A
 *     mapping revert must demonstrably remove an OWNERSHIP TRANSITION while
 *     the production behaviour underneath still executes; a caller that
 *     reaches a Raft semantic boundary must hand off and be restored
 *     afterwards rather than owning Raft because it made the call.
 *
 *   census clauses - the provenance classification over the complete E host.
 *     Every measured segment is explicit owner entry, an async descendant of
 *     an authoritative owner, an owner-to-owner handoff, proven outside-domain
 *     carrier work, or it keeps this probe red.
 */
import {runAttributionAuthorityProbe} from './attribution-authority-probe.js';

runAttributionAuthorityProbe();
