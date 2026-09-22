//! Lagrange test-side FORK of raft-logic's `raft_wasm` binding.
//!
//! Upstream (raft-logic 0.3.14 / repository head 918d481) exposes a
//! RawNode-shaped surface with NO configuration-change operations at all.
//! This fork adds the raft-rs configuration primitives themselves and the
//! storage operations the raft-rs Ready model requires of its host. It adds
//! no membership convenience: there is deliberately no add_node, remove_node,
//! add_learner or promote here, because that policy belongs to Lagrange.
//!
//! Evaluation only. Never published, never upstreamed.

use std::cell::RefCell;
use std::collections::HashMap;

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use js_sys::Uint8Array;
use serde::{Deserialize, Serialize};
use serde_wasm_bindgen as swb;
use wasm_bindgen::prelude::*;
use console_error_panic_hook::set_once as set_panic_hook;

use protobuf::Message as PbMessage;
use raft::prelude::*;
use raft::storage::MemStorage;
use raft::{Config, GetEntriesContext, RawNode};
use raft_proto::ConfChangeI;

use slog::o;
use slog::Discard;
use slog::Logger;

#[wasm_bindgen(start)]
pub fn wasm_start() {
    // Better panic messages from Rust in WASM (printed to console.error)
    set_panic_hook();
}

thread_local! {
    static NODES: RefCell<HandleMap> = RefCell::new(HandleMap::default());
}

#[derive(Default)]
struct HandleMap {
    next: u32,
    map: HashMap<u32, NodeCtx>,
}

struct NodeCtx {
    _id: u64,
    rn: RawNode<MemStorage>,
    // keep the last Ready around until advance() is called
    pending_ready: Option<Ready>,
    logger: Logger,
}

// ------------------------------
// JSON/JS boundary schemas
// ------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateOpts {
    id: String,
    #[serde(default)]
    peers: Vec<String>,
    #[serde(default)]
    learners: Vec<String>,
    #[serde(default)]
    applied: Option<String>,
    election_tick: u64,
    heartbeat_tick: u64,
    #[serde(default)]
    pre_vote: bool,
    #[serde(default)]
    check_quorum: bool,
    #[serde(default)]
    bootstrap: Option<JsBootstrapIn>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsMessageIn {
    #[serde(default)]
    from: Option<String>,
    #[serde(default)]
    to: Option<String>,
    #[serde(default)]
    term: Option<String>,
    #[serde(default)]
    log_term: Option<String>,
    #[serde(default)]
    index: Option<String>,
    msg_type: u32,
    #[serde(default)]
    entries: Vec<JsEntryIn>,
    #[serde(default)]
    commit: Option<String>,
    #[serde(default)]
    context: Option<String>, // base64
    #[serde(default)]
    reject: bool,
    #[serde(default)]
    reject_hint: Option<String>,
    #[serde(default)]
    snapshot: Option<JsSnapshotIn>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsEntryIn {
    #[serde(default)]
    term: Option<String>,
    #[serde(default)]
    index: Option<String>,
    entry_type: u32,
    #[serde(default)]
    data: Option<String>, // base64
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsSnapshotIn {
    #[serde(default)]
    data: Option<String>, // base64
    #[serde(default)]
    metadata: Option<JsSnapshotMetadataIn>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsSnapshotMetadataIn {
    #[serde(default)]
    index: Option<String>,
    #[serde(default)]
    term: Option<String>,
    #[serde(default)]
    conf_state: Option<JsConfStateIn>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsHardStateIn {
    #[serde(default)]
    term: Option<String>,
    #[serde(default)]
    vote: Option<String>,
    #[serde(default)]
    commit: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsBootstrapIn {
    #[serde(default)]
    hard_state: Option<JsHardStateIn>,
    #[serde(default)]
    snapshot: Option<JsSnapshotIn>,
    #[serde(default)]
    entries: Vec<JsEntryIn>,
    #[serde(default)]
    conf_state: Option<JsConfStateIn>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsConfStateIn {
    #[serde(default)]
    voters: Vec<String>,
    #[serde(default)]
    learners: Vec<String>,
    #[serde(default)]
    voters_outgoing: Vec<String>,
    #[serde(default)]
    learners_next: Vec<String>,
    #[serde(default)]
    auto_leave: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsReadyOut {
    #[serde(skip_serializing_if = "Option::is_none")]
    hard_state: Option<JsHardStateOut>,
    #[serde(skip_serializing_if = "Option::is_none")]
    soft_state: Option<JsSoftStateOut>,
    #[serde(default)]
    entries: Vec<JsEntryOut>,
    #[serde(default)]
    committed_entries: Vec<JsEntryOut>,
    #[serde(default)]
    messages: Vec<JsMessageOut>,
    #[serde(default)]
    persisted_messages: Vec<JsMessageOut>,
    #[serde(skip_serializing_if = "Option::is_none")]
    snapshot: Option<JsSnapshotOut>,
    must_sync: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsHardStateOut {
    term: String,
    vote: String,
    commit: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsSoftStateOut {
    lead: String,
    raft_state: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsMessageOut {
    from: String,
    to: String,
    term: String,
    log_term: String,
    index: String,
    msg_type: u32,
    #[serde(default)]
    entries: Vec<JsEntryOut>,
    commit: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    context: Option<String>, // base64
    reject: bool,
    reject_hint: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    snapshot: Option<JsSnapshotOut>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsEntryOut {
    term: String,
    index: String,
    entry_type: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<String>, // base64
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsSnapshotOut {
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<JsSnapshotMetadataOut>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsSnapshotMetadataOut {
    index: String,
    term: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    conf_state: Option<JsConfStateOut>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsConfStateOut {
    voters: Vec<String>,
    learners: Vec<String>,
    voters_outgoing: Vec<String>,
    learners_next: Vec<String>,
    auto_leave: bool,
}

// FORK: ConfChangeV2 in, exactly as raft-rs models it. No Lagrange shape.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsConfChangeSingleIn {
    change_type: u32,
    node_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsConfChangeV2In {
    #[serde(default)]
    transition: u32,
    #[serde(default)]
    changes: Vec<JsConfChangeSingleIn>,
    #[serde(default)]
    context: Option<String>, // base64
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsConfChangeSingleOut {
    change_type: u32,
    node_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsConfChangeV2Out {
    transition: u32,
    changes: Vec<JsConfChangeSingleOut>,
    #[serde(skip_serializing_if = "Option::is_none")]
    context: Option<String>,
    // Which entry type the bytes were decoded from, so a host can tell a v1
    // ConfChange that was widened from a native v2 one.
    decoded_from_entry_type: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsProgressOut {
    id: String,
    matched: String,
    next_idx: String,
    state: String,
    paused: bool,
    recent_active: bool,
}

// FORK: upstream `status` returned {lead, raftState} only. A membership
// decision needs the numbers the core itself holds.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsStatusOut {
    id: String,
    lead: String,
    raft_state: u32,
    term: String,
    vote: String,
    commit: String,
    applied: String,
    pending_conf_index: String,
    promotable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    progress: Option<Vec<JsProgressOut>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsPersistedStateOut {
    #[serde(skip_serializing_if = "Option::is_none")]
    hard_state: Option<JsHardStateOut>,
    conf_state: JsConfStateOut,
    first_index: String,
    last_index: String,
    entries: Vec<JsEntryOut>,
    #[serde(skip_serializing_if = "Option::is_none")]
    snapshot: Option<JsSnapshotOut>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsLightReadyOut {
    #[serde(skip_serializing_if = "Option::is_none")]
    commit_index: Option<String>,
    #[serde(default)]
    committed_entries: Vec<JsEntryOut>,
    #[serde(default)]
    messages: Vec<JsMessageOut>,
}

// ------------------------------
// Public exports
// ------------------------------

#[wasm_bindgen]
pub fn create_node(opts: JsValue) -> Result<u32, JsValue> {
    let opts: CreateOpts = swb::from_value(opts)
        .map_err(|e| jserr(&format!("invalid create_node opts: {e}")))?;
    let id = parse_u64(&opts.id).map_err(|e| jserr(&format!("id parse: {e}")))?;

    // Build ConfState from peers
    let voters: Vec<u64> = opts
        .peers
        .iter()
        .map(|s| parse_u64(s))
        .collect::<Result<_, _>>()
        .map_err(|e| jserr(&format!("peers parse: {e}")))?;

    let learners: Vec<u64> = opts
        .learners
        .iter()
        .map(|s| parse_u64(s))
        .collect::<Result<_, _>>()
        .map_err(|e| jserr(&format!("learners parse: {e}")))?;

    let mut conf_state = ConfState::default();
    conf_state.mut_voters().extend(voters);
    conf_state.mut_learners().extend(learners);

    // FORK: upstream decodes `bootstrap.conf_state` and then drops it, so the
    // only configuration a node could ever be created with was a plain voter
    // list. A restart has to be able to restore the configuration that was
    // durably recorded, including learners and a joint configuration's
    // outgoing set, so the bootstrap ConfState wins when it is supplied.
    if let Some(ref bs) = opts.bootstrap {
        if let Some(ref cs_in) = bs.conf_state {
            conf_state = json_to_conf_state(cs_in)?;
        }
    }

    let storage = MemStorage::new_with_conf_state(conf_state);

    // If a bootstrap state is provided, seed the MemStorage BEFORE creating RawNode
    if let Some(ref bs) = opts.bootstrap {
        {
            let mut wl = storage.wl();

            // 1) Apply snapshot (if any)
            if let Some(ref snap_in) = bs.snapshot {
                let s = json_to_snapshot(snap_in)?;
                if s.get_metadata().get_index() > 0 {
                    wl.apply_snapshot(s)
                        .map_err(|e| jserr(&format!("apply_snapshot: {e}")))?;
                }
            }

            // 2) Append entries (if any)
            if !bs.entries.is_empty() {
                let ents = bs.entries
                    .iter()
                    .map(|e| json_to_entry(e))
                    .collect::<Result<Vec<Entry>, JsValue>>()?;
                wl.append(&ents)
                    .map_err(|e| jserr(&format!("append: {e}")))?;
            }

            // 3) Set hard state (if any)
            if let Some(ref hs_in) = bs.hard_state {
                let mut hs = HardState::default();
                if let Some(ref t) = hs_in.term {
                    hs.set_term(parse_u64(t).map_err(|e| jserr(&e))?);
                }
                if let Some(ref v) = hs_in.vote {
                    hs.set_vote(parse_u64(v).map_err(|e| jserr(&e))?);
                }
                if let Some(ref c) = hs_in.commit {
                    hs.set_commit(parse_u64(c).map_err(|e| jserr(&e))?);
                }
                wl.set_hardstate(hs);
            }
        }
    }

    // Raft config
    // FORK: a restarted peer must be able to say how far it had already
    // applied, or the core re-delivers committed entries it has seen.
    let applied = match opts.applied {
        Some(ref a) => parse_u64(a).map_err(|e| jserr(&format!("applied parse: {e}")))?,
        None => 0,
    };
    let mut cfg = Config {
        id,
        election_tick: opts.election_tick as usize,
        heartbeat_tick: opts.heartbeat_tick as usize,
        pre_vote: opts.pre_vote,
        check_quorum: opts.check_quorum,
        applied,
        ..Default::default()
    };
    // Set sane defaults
    if cfg.max_size_per_msg == 0 {
        cfg.max_size_per_msg = 1 * 1024 * 1024;
    }
    if cfg.max_inflight_msgs == 0 {
        cfg.max_inflight_msgs = 256;
    }

    let logger = Logger::root(Discard, o!());

    let rn = RawNode::new(&cfg, storage, &logger)
        .map_err(|e| jserr(&format!("RawNode::new failed: {e}")))?;

    let handle = NODES.with(|cell| {
        let mut hm = cell.borrow_mut();
        let h = hm.next;
        hm.next = hm.next.wrapping_add(1);
        hm.map.insert(
            h,
            NodeCtx {
                _id: id,
                rn,
                pending_ready: None,
                logger,
            },
        );
        h
    });

    Ok(handle)
}

#[wasm_bindgen]
pub fn seed_storage(handle: u32, bootstrap: JsValue) -> Result<(), JsValue> {
    let bs: JsBootstrapIn = swb::from_value(bootstrap)
        .map_err(|e| jserr(&format!("invalid bootstrap: {e}")))?;
    with_node(handle, |n| {
        let store = n.rn.mut_store();
        let mut wl = store.wl();

        // 1) Apply snapshot (if any)
        if let Some(ref snap_in) = bs.snapshot {
            let s = json_to_snapshot(snap_in)?;
            if s.get_metadata().get_index() > 0 {
                wl.apply_snapshot(s)
                    .map_err(|e| jserr(&format!("apply_snapshot: {e}")))?;
            }
        }

        // 2) Append entries (if any)
        if !bs.entries.is_empty() {
            let ents = bs.entries
                .iter()
                .map(|e| json_to_entry(e))
                .collect::<Result<Vec<Entry>, JsValue>>()?;
            wl.append(&ents)
                .map_err(|e| jserr(&format!("append: {e}")))?;
        }

        // 3) Set hard state (if any)
        if let Some(ref hs_in) = bs.hard_state {
            let mut hs = HardState::default();
            if let Some(ref t) = hs_in.term {
                hs.set_term(parse_u64(t).map_err(|e| jserr(&e))?);
            }
            if let Some(ref v) = hs_in.vote {
                hs.set_vote(parse_u64(v).map_err(|e| jserr(&e))?);
            }
            if let Some(ref c) = hs_in.commit {
                hs.set_commit(parse_u64(c).map_err(|e| jserr(&e))?);
            }
            wl.set_hardstate(hs);
        }

        Ok(())
    })
}

#[wasm_bindgen]
pub fn free(handle: u32) {
    NODES.with(|cell| {
        let mut hm = cell.borrow_mut();
        hm.map.remove(&handle);
    });
}

#[wasm_bindgen]
pub fn tick(handle: u32) -> Result<(), JsValue> {
    with_node(handle, |n| {
        n.rn.tick();
        Ok(())
    })
}

#[wasm_bindgen]
pub fn has_ready(handle: u32) -> Result<bool, JsValue> {
    with_node(handle, |n| Ok(n.rn.has_ready()))
}

#[wasm_bindgen]
pub fn take_ready(handle: u32) -> Result<JsValue, JsValue> {
    with_node(handle, |n| {
        if !n.rn.has_ready() {
            let empty = JsReadyOut {
                hard_state: None,
                soft_state: None,
                entries: vec![],
                committed_entries: vec![],
                messages: vec![],
                persisted_messages: vec![],
                snapshot: None,
                must_sync: false,
            };
            return swb::to_value(&empty).map_err(|e| jserr(&format!("serde: {e}")));
        }
        let rd = n.rn.ready();
        let json = ready_to_json(&rd)?;
        n.pending_ready = Some(rd);
        swb::to_value(&json).map_err(|e| jserr(&format!("serde: {e}")))
    })
}

#[wasm_bindgen]
pub fn persist_ready(handle: u32) -> Result<(), JsValue> {
    // Persist HardState, Snapshot, Entries into MemStorage (host durability should be done before calling this)
    with_node(handle, |n| {
        let rd = n
            .pending_ready
            .as_ref()
            .ok_or_else(|| jserr("persist_ready called without pending ready (call take_ready first)"))?;

        {
            let store = n.rn.mut_store();
            let mut wl = store.wl();

            // Order matters: apply snapshot -> append entries -> set hard state
            let snap = rd.snapshot();
            if snap.get_metadata().get_index() > 0 {
                wl.apply_snapshot(snap.clone())
                    .map_err(|e| jserr(&format!("apply_snapshot: {e}")))?;
            }

            let ents = rd.entries();
            if !ents.is_empty() {
                wl.append(ents)
                    .map_err(|e| jserr(&format!("append: {e}")))?;
            }

            if let Some(hs) = rd.hs() {
                wl.set_hardstate(hs.clone());
            }
        }

        // Do not advance here; leave rd in pending_ready for advance() to consume
        Ok(())
    })
}

#[wasm_bindgen]
pub fn advance_append(handle: u32) -> Result<JsValue, JsValue> {
    // Consume the pending Ready after host persistence to progress Raft's append phase.
    // Return LightReady so the host can apply entries and send messages.
    with_node(handle, |n| {
        let rd = n
            .pending_ready
            .take()
            .ok_or_else(|| jserr("advance_append called without pending ready"))?;

        // RawNode::advance_append internally commits persistence for the last Ready (commit_ready + on_persist_ready)
        let lr = n.rn.advance_append(rd);

        let committed_entries = lr
            .committed_entries()
            .iter()
            .map(entry_to_json)
            .collect::<Result<Vec<JsEntryOut>, JsValue>>()?;

        let messages = lr
            .messages()
            .iter()
            .map(message_to_json)
            .collect::<Result<Vec<JsMessageOut>, JsValue>>()?;

        let js = JsLightReadyOut {
            commit_index: lr.commit_index().map(|c| c.to_string()),
            committed_entries,
            messages,
        };
        swb::to_value(&js).map_err(|e| jserr(&format!("serde: {e}")))
    })
}

#[wasm_bindgen]
pub fn advance_apply(handle: u32) -> Result<(), JsValue> {
    // Finalize apply phase after the host has applied committed entries
    with_node(handle, |n| {
        n.rn.advance_apply();
        Ok(())
    })
}

#[wasm_bindgen]
pub fn advance(handle: u32) -> Result<(), JsValue> {
    // Backwards-compatible: treat as advance_apply
    with_node(handle, |n| {
        n.rn.advance_apply();
        Ok(())
    })
}

#[wasm_bindgen]
pub fn campaign(handle: u32) -> Result<(), JsValue> {
    with_node(handle, |n| {
        n.rn.campaign().map_err(|e| jserr(&format!("campaign: {e}")))?;
        Ok(())
    })
}

// FORK: the full status raft-rs already computes. Upstream threw all of it
// away except the leader id and the role, which is not enough to make - or to
// witness - a membership decision.
#[wasm_bindgen]
pub fn status(handle: u32) -> Result<JsValue, JsValue> {
    with_node(handle, |n| {
        let pending_conf_index = n.rn.raft.pending_conf_index;
        let promotable = n.rn.raft.promotable();
        let st = n.rn.status();
        let progress = st.progress.map(|tracker| {
            tracker
                .iter()
                .map(|(id, p)| JsProgressOut {
                    id: id.to_string(),
                    matched: p.matched.to_string(),
                    next_idx: p.next_idx.to_string(),
                    state: format!("{:?}", p.state),
                    paused: p.paused,
                    recent_active: p.recent_active,
                })
                .collect::<Vec<_>>()
        });
        let js = JsStatusOut {
            id: st.id.to_string(),
            lead: st.ss.leader_id.to_string(),
            raft_state: st.ss.raft_state as u32,
            term: st.hs.get_term().to_string(),
            vote: st.hs.get_vote().to_string(),
            commit: st.hs.get_commit().to_string(),
            applied: st.applied.to_string(),
            pending_conf_index: pending_conf_index.to_string(),
            promotable,
            progress,
        };
        swb::to_value(&js).map_err(|e| jserr(&format!("serde: {e}")))
    })
}

// ------------------------------
// FORK: configuration primitives
//
// These are the raft-rs operations themselves. There is deliberately no
// addNode/removeNode/addLearner/promote: the policy of adding a learner,
// waiting for it to catch up, promoting it and removing the old voter is
// Lagrange's, not the binding's.
// ------------------------------

#[wasm_bindgen]
pub fn propose_conf_change_v2(handle: u32, cc: JsValue) -> Result<(), JsValue> {
    let cc_in: JsConfChangeV2In =
        swb::from_value(cc).map_err(|e| jserr(&format!("invalid ConfChangeV2: {e}")))?;
    let (v2, context) = json_to_conf_change_v2(&cc_in)?;
    with_node(handle, |n| {
        n.rn
            .propose_conf_change(context.clone(), v2.clone())
            .map_err(|e| jserr(&format!("propose_conf_change: {e}")))
    })
}

#[wasm_bindgen]
pub fn apply_conf_change(handle: u32, cc: JsValue) -> Result<JsValue, JsValue> {
    let cc_in: JsConfChangeV2In =
        swb::from_value(cc).map_err(|e| jserr(&format!("invalid ConfChangeV2: {e}")))?;
    let (v2, _context) = json_to_conf_change_v2(&cc_in)?;
    with_node(handle, |n| {
        let cs = n
            .rn
            .apply_conf_change(&v2)
            .map_err(|e| jserr(&format!("apply_conf_change: {e}")))?;
        swb::to_value(&conf_state_to_json(&cs)).map_err(|e| jserr(&format!("serde: {e}")))
    })
}

// Identify and decode a committed configuration entry. A v1 EntryConfChange
// is widened to its v2 form by raft-rs's own `into_v2`, so the host has one
// shape to apply and the decoding never happens in JavaScript.
#[wasm_bindgen]
pub fn decode_conf_change_entry(entry_type: u32, data: Option<String>) -> Result<JsValue, JsValue> {
    // FORK: upstream's unwrap_or_default() turned undecodable data into an
    // EMPTY change list, which is a request to leave a joint configuration.
    // Corrupt input must be an error, not a different valid operation.
    let bytes = match data {
        None => Vec::new(),
        Some(ref encoded) => B64
            .decode(encoded.as_bytes())
            .map_err(|e| jserr(&format!("conf change entry data is not valid base64: {e}")))?,
    };
    let et = num_to_entry_type(entry_type)?;
    let v2 = match et {
        EntryType::EntryConfChange => {
            let mut cc = ConfChange::default();
            cc.merge_from_bytes(&bytes)
                .map_err(|e| jserr(&format!("ConfChange decode: {e}")))?;
            cc.into_v2()
        }
        EntryType::EntryConfChangeV2 => {
            let mut cc = ConfChangeV2::default();
            cc.merge_from_bytes(&bytes)
                .map_err(|e| jserr(&format!("ConfChangeV2 decode: {e}")))?;
            cc
        }
        EntryType::EntryNormal => {
            return Err(jserr("decode_conf_change_entry called on EntryNormal"))
        }
    };
    let js = JsConfChangeV2Out {
        transition: v2.get_transition() as u32,
        changes: v2
            .get_changes()
            .iter()
            .map(|c| JsConfChangeSingleOut {
                change_type: c.get_change_type() as u32,
                node_id: c.get_node_id().to_string(),
            })
            .collect(),
        context: encode_b64_opt(v2.get_context()),
        decoded_from_entry_type: entry_type,
    };
    swb::to_value(&js).map_err(|e| jserr(&format!("serde: {e}")))
}

#[wasm_bindgen]
pub fn conf_state(handle: u32) -> Result<JsValue, JsValue> {
    with_node(handle, |n| {
        let cs = n.rn.raft.prs().conf().to_conf_state();
        swb::to_value(&conf_state_to_json(&cs)).map_err(|e| jserr(&format!("serde: {e}")))
    })
}

// The host stores the ConfState that apply_conf_change RETURNED; this is the
// storage write raft-rs's own example makes (`store.wl().set_conf_state(cs)`).
#[wasm_bindgen]
pub fn set_conf_state(handle: u32, cs: JsValue) -> Result<(), JsValue> {
    let cs_in: JsConfStateIn =
        swb::from_value(cs).map_err(|e| jserr(&format!("invalid ConfState: {e}")))?;
    let parsed = json_to_conf_state(&cs_in)?;
    with_node(handle, |n| {
        n.rn.mut_store().wl().set_conf_state(parsed.clone());
        Ok(())
    })
}

// The LightReady commit index, written into the stored hard state. Upstream
// returned this number to JavaScript and then offered no way to store it.
#[wasm_bindgen]
pub fn persist_commit_index(handle: u32, commit: String) -> Result<(), JsValue> {
    let index = parse_u64(&commit).map_err(|e| jserr(&format!("commit parse: {e}")))?;
    with_node(handle, |n| {
        n.rn.mut_store().wl().mut_hard_state().set_commit(index);
        Ok(())
    })
}

// Read back everything the module holds. Upstream offered no way to see it,
// so a host that lost its own copy could recover nothing.
#[wasm_bindgen]
pub fn export_persisted_state(handle: u32) -> Result<JsValue, JsValue> {
    with_node(handle, |n| {
        let store = n.rn.store().clone();
        let state = store
            .initial_state()
            .map_err(|e| jserr(&format!("initial_state: {e}")))?;
        let first = store
            .first_index()
            .map_err(|e| jserr(&format!("first_index: {e}")))?;
        let last = store
            .last_index()
            .map_err(|e| jserr(&format!("last_index: {e}")))?;
        let entries = if last >= first {
            store
                .entries(first, last + 1, None, GetEntriesContext::empty(false))
                .map_err(|e| jserr(&format!("entries: {e}")))?
        } else {
            vec![]
        };
        let hs = state.hard_state.clone();
        let js = JsPersistedStateOut {
            hard_state: Some(JsHardStateOut {
                term: hs.get_term().to_string(),
                vote: hs.get_vote().to_string(),
                commit: hs.get_commit().to_string(),
            }),
            conf_state: conf_state_to_json(&state.conf_state),
            first_index: first.to_string(),
            last_index: last.to_string(),
            entries: entries
                .iter()
                .map(entry_to_json)
                .collect::<Result<Vec<JsEntryOut>, JsValue>>()?,
            snapshot: None,
        };
        swb::to_value(&js).map_err(|e| jserr(&format!("serde: {e}")))
    })
}

// A measurement primitive, not a membership one: linear-memory size, so a
// Multi-Raft cost measurement can separate the one-time runtime from the
// incremental per-RawNode cost instead of guessing from host RSS.
#[wasm_bindgen]
pub fn wasm_memory_bytes() -> f64 {
    (core::arch::wasm32::memory_size(0) * 65536) as f64
}

#[wasm_bindgen]
pub fn handle_count() -> u32 {
    NODES.with(|cell| cell.borrow().map.len() as u32)
}

#[wasm_bindgen]
pub fn step(handle: u32, msg: JsValue) -> Result<(), JsValue> {
    let msg_in: JsMessageIn =
        swb::from_value(msg).map_err(|e| jserr(&format!("invalid Message: {e}")))?;
    with_node(handle, |n| {
        let m = json_to_message(&msg_in)?;
        n.rn.step(m).map_err(|e| jserr(&format!("step: {e}")))
    })
}

#[wasm_bindgen]
pub fn propose(handle: u32, data: Uint8Array) -> Result<(), JsValue> {
    let bytes = uint8_to_vec(&data);
    with_node(handle, |n| {
        n.rn
            .propose(vec![], bytes)
            .map_err(|e| jserr(&format!("propose: {e}")))
    })
}

// ------------------------------
// Helpers
// ------------------------------

// FORK: the node is taken OUT of the handle table for the duration of the
// call and put back afterwards, so the RefCell borrow is never held while
// raft-rs code runs.
//
// Upstream held the borrow across the closure. raft-rs signals an
// unrecoverable input with `fatal!`, which panics; on wasm32-unknown-unknown
// the panic strategy is abort, so there is no unwinding and no catch_unwind -
// the borrow guard's destructor never runs and the table stays borrowed
// forever. Every later call on EVERY handle then traps "RefCell already
// borrowed", including create_node and free: one group's fatal killed every
// group in the same runtime. With the node removed first, a fatal costs
// exactly the group that caused it.
fn with_node<R, F: FnOnce(&mut NodeCtx) -> Result<R, JsValue>>(handle: u32, f: F) -> Result<R, JsValue> {
    let mut node = NODES
        .with(|cell| cell.borrow_mut().map.remove(&handle))
        .ok_or_else(|| jserr("invalid handle"))?;
    let result = f(&mut node);
    NODES.with(|cell| {
        cell.borrow_mut().map.insert(handle, node);
    });
    result
}

fn parse_u64(s: &str) -> Result<u64, String> {
    s.parse().map_err(|e| format!("{e}"))
}

fn uint8_to_vec(a: &Uint8Array) -> Vec<u8> {
    let mut v = vec![0u8; a.length() as usize];
    a.copy_to(&mut v[..]);
    v
}

fn decode_b64_opt(s: &Option<String>) -> Option<Vec<u8>> {
    s.as_ref().and_then(|b| B64.decode(b.as_bytes()).ok())
}

fn encode_b64_opt(bytes: &[u8]) -> Option<String> {
    if bytes.is_empty() {
        None
    } else {
        Some(B64.encode(bytes))
    }
}

fn json_to_message(j: &JsMessageIn) -> Result<Message, JsValue> {
    let mut m = Message::default();
    if let Some(ref s) = j.from {
        m.set_from(parse_u64(s).map_err(|e| jserr(&e))?);
    }
    if let Some(ref s) = j.to {
        m.set_to(parse_u64(s).map_err(|e| jserr(&e))?);
    }
    if let Some(ref s) = j.term {
        m.set_term(parse_u64(s).map_err(|e| jserr(&e))?);
    }
    if let Some(ref s) = j.log_term {
        m.set_log_term(parse_u64(s).map_err(|e| jserr(&e))?);
    }
    if let Some(ref s) = j.index {
        m.set_index(parse_u64(s).map_err(|e| jserr(&e))?);
    }
    m.set_msg_type(num_to_msg_type(j.msg_type)?);
    if let Some(ref s) = j.commit {
        m.set_commit(parse_u64(s).map_err(|e| jserr(&e))?);
    }
    if let Some(ref ctx) = j.context {
        if let Ok(bytes) = B64.decode(ctx.as_bytes()) {
            m.set_context(bytes.into());
        }
    }
    m.set_reject(j.reject);
    if let Some(ref s) = j.reject_hint {
        m.set_reject_hint(parse_u64(s).map_err(|e| jserr(&e))?);
    }
    for e in &j.entries {
        m.mut_entries().push(json_to_entry(e)?);
    }
    if let Some(ref snap) = j.snapshot {
        m.set_snapshot(json_to_snapshot(snap)?);
    }
    Ok(m)
}

fn json_to_entry(j: &JsEntryIn) -> Result<Entry, JsValue> {
    let mut e = Entry::default();
    if let Some(ref s) = j.term {
        e.set_term(parse_u64(s).map_err(|e| jserr(&e))?);
    }
    if let Some(ref s) = j.index {
        e.set_index(parse_u64(s).map_err(|e| jserr(&e))?);
    }
    e.set_entry_type(num_to_entry_type(j.entry_type)?);
    if let Some(ref d) = j.data {
        if let Ok(bytes) = B64.decode(d.as_bytes()) {
            e.set_data(bytes.into());
        }
    }
    Ok(e)
}

fn json_to_snapshot(j: &JsSnapshotIn) -> Result<Snapshot, JsValue> {
    let mut s = Snapshot::default();
    if let Some(ref d) = j.data {
        if let Ok(bytes) = B64.decode(d.as_bytes()) {
            s.set_data(bytes.into());
        }
    }
    if let Some(ref md) = j.metadata {
        let mut m = SnapshotMetadata::default();
        if let Some(ref idx) = md.index {
            m.set_index(parse_u64(idx).map_err(|e| jserr(&e))?);
        }
        if let Some(ref t) = md.term {
            m.set_term(parse_u64(t).map_err(|e| jserr(&e))?);
        }
        if let Some(ref cs) = md.conf_state {
            m.set_conf_state(json_to_conf_state(cs)?);
        }
        s.set_metadata(m);
    }
    Ok(s)
}

fn num_to_conf_change_type(n: u32) -> Result<ConfChangeType, JsValue> {
    match n {
        0 => Ok(ConfChangeType::AddNode),
        1 => Ok(ConfChangeType::RemoveNode),
        2 => Ok(ConfChangeType::AddLearnerNode),
        _ => Err(jserr("unknown ConfChangeType")),
    }
}

fn num_to_conf_change_transition(n: u32) -> Result<ConfChangeTransition, JsValue> {
    match n {
        0 => Ok(ConfChangeTransition::Auto),
        1 => Ok(ConfChangeTransition::Implicit),
        2 => Ok(ConfChangeTransition::Explicit),
        _ => Err(jserr("unknown ConfChangeTransition")),
    }
}

fn json_to_conf_change_v2(j: &JsConfChangeV2In) -> Result<(ConfChangeV2, Vec<u8>), JsValue> {
    let mut v2 = ConfChangeV2::default();
    v2.set_transition(num_to_conf_change_transition(j.transition)?);
    let mut singles: Vec<ConfChangeSingle> = Vec::with_capacity(j.changes.len());
    for change in &j.changes {
        let mut single = ConfChangeSingle::default();
        single.set_change_type(num_to_conf_change_type(change.change_type)?);
        single.set_node_id(parse_u64(&change.node_id).map_err(|e| jserr(&e))?);
        singles.push(single);
    }
    v2.set_changes(singles.into());
    let context = decode_b64_opt(&j.context).unwrap_or_default();
    v2.set_context(context.clone().into());
    Ok((v2, context))
}

fn conf_state_to_json(cs: &ConfState) -> JsConfStateOut {
    JsConfStateOut {
        voters: cs.get_voters().iter().map(|v| v.to_string()).collect(),
        learners: cs.get_learners().iter().map(|v| v.to_string()).collect(),
        voters_outgoing: cs
            .get_voters_outgoing()
            .iter()
            .map(|v| v.to_string())
            .collect(),
        learners_next: cs
            .get_learners_next()
            .iter()
            .map(|v| v.to_string())
            .collect(),
        auto_leave: cs.get_auto_leave(),
    }
}

fn json_to_conf_state(j: &JsConfStateIn) -> Result<ConfState, JsValue> {
    let mut cs = ConfState::default();
    cs.mut_voters().extend(
        j.voters
            .iter()
            .map(|s| parse_u64(s).map_err(|e| jserr(&e)))
            .collect::<Result<Vec<u64>, JsValue>>()?
            .into_iter(),
    );
    cs.mut_learners().extend(
        j.learners
            .iter()
            .map(|s| parse_u64(s).map_err(|e| jserr(&e)))
            .collect::<Result<Vec<u64>, JsValue>>()?
            .into_iter(),
    );
    cs.mut_voters_outgoing().extend(
        j.voters_outgoing
            .iter()
            .map(|s| parse_u64(s).map_err(|e| jserr(&e)))
            .collect::<Result<Vec<u64>, JsValue>>()?
            .into_iter(),
    );
    cs.mut_learners_next().extend(
        j.learners_next
            .iter()
            .map(|s| parse_u64(s).map_err(|e| jserr(&e)))
            .collect::<Result<Vec<u64>, JsValue>>()?
            .into_iter(),
    );
    cs.set_auto_leave(j.auto_leave);
    Ok(cs)
}

fn ready_to_json(rd: &Ready) -> Result<JsReadyOut, JsValue> {
    let hard_state = rd.hs().map(|hs| JsHardStateOut {
        term: hs.get_term().to_string(),
        vote: hs.get_vote().to_string(),
        commit: hs.get_commit().to_string(),
    });
    let soft_state = rd.ss().map(|ss| JsSoftStateOut {
        lead: ss.leader_id.to_string(),
        raft_state: ss.raft_state as u32,
    });

    let entries = rd
        .entries()
        .iter()
        .map(entry_to_json)
        .collect::<Result<Vec<JsEntryOut>, JsValue>>()?;

    let committed_entries = rd
        .committed_entries()
        .iter()
        .map(entry_to_json)
        .collect::<Result<Vec<JsEntryOut>, JsValue>>()?;

    let messages = rd
        .messages()
        .iter()
        .map(message_to_json)
        .collect::<Result<Vec<JsMessageOut>, JsValue>>()?;

    let persisted_messages = rd
        .persisted_messages()
        .iter()
        .map(message_to_json)
        .collect::<Result<Vec<JsMessageOut>, JsValue>>()?;

    let snapshot = {
        let s = rd.snapshot();
        if s.get_metadata().get_index() > 0 {
            Some(snapshot_to_json(s))
        } else {
            None
        }
    };

    Ok(JsReadyOut {
        hard_state,
        soft_state,
        entries,
        committed_entries,
        messages,
        persisted_messages,
        snapshot,
        must_sync: rd.must_sync(),
    })
}

fn entry_to_json(e: &Entry) -> Result<JsEntryOut, JsValue> {
    let data_opt = encode_b64_opt(e.get_data());
    Ok(JsEntryOut {
        term: e.get_term().to_string(),
        index: e.get_index().to_string(),
        entry_type: e.get_entry_type() as u32,
        data: data_opt,
    })
}

fn message_to_json(m: &Message) -> Result<JsMessageOut, JsValue> {
    let entries = m
        .get_entries()
        .iter()
        .map(entry_to_json)
        .collect::<Result<Vec<JsEntryOut>, JsValue>>()?;
    Ok(JsMessageOut {
        from: m.get_from().to_string(),
        to: m.get_to().to_string(),
        term: m.get_term().to_string(),
        log_term: m.get_log_term().to_string(),
        index: m.get_index().to_string(),
        msg_type: m.get_msg_type() as u32,
        entries,
        commit: m.get_commit().to_string(),
        context: encode_b64_opt(m.get_context()),
        reject: m.get_reject(),
        reject_hint: m.get_reject_hint().to_string(),
        snapshot: if m.has_snapshot() {
            Some(snapshot_to_json(m.get_snapshot()))
        } else {
            None
        },
    })
}

fn snapshot_to_json(s: &Snapshot) -> JsSnapshotOut {
    let md = s.get_metadata();
    JsSnapshotOut {
        data: encode_b64_opt(s.get_data()),
        metadata: Some(JsSnapshotMetadataOut {
            index: md.get_index().to_string(),
            term: md.get_term().to_string(),
            conf_state: Some(conf_state_to_json(md.get_conf_state())),
        }),
    }
}

fn num_to_msg_type(n: u32) -> Result<MessageType, JsValue> {
    use MessageType::*;
    let mt = match n {
        0 => MsgHup,
        1 => MsgBeat,
        2 => MsgPropose,
        3 => MsgAppend,
        4 => MsgAppendResponse,
        5 => MsgRequestVote,
        6 => MsgRequestVoteResponse,
        7 => MsgSnapshot,
        8 => MsgHeartbeat,
        9 => MsgHeartbeatResponse,
        10 => MsgUnreachable,
        11 => MsgSnapStatus,
        12 => MsgCheckQuorum,
        13 => MsgTransferLeader,
        14 => MsgTimeoutNow,
        15 => MsgReadIndex,
        16 => MsgReadIndexResp,
        17 => MsgRequestPreVote,
        18 => MsgRequestPreVoteResponse,
        _ => return Err(jserr("unknown MessageType")),
    };
    Ok(mt)
}

fn num_to_entry_type(n: u32) -> Result<EntryType, JsValue> {
    use EntryType::*;
    let et = match n {
        0 => EntryNormal,
        1 => EntryConfChange,
        2 => EntryConfChangeV2,
        _ => return Err(jserr("unknown EntryType")),
    };
    Ok(et)
}

#[derive(Serialize)]
struct JsRefusal<'a> {
    kind: &'static str,
    message: &'a str,
}

fn jserr(msg: &str) -> JsValue {
    swb::to_value(&JsRefusal {
        kind: "raft-rs-refusal",
        message: msg,
    })
    .unwrap_or_else(|_| JsValue::from_str(msg))
}
