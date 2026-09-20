// The durable Raft record of the raft-rs-wasm backend, as SQL.
//
// It lives in the replica's OWN SQLite database - the same file and the same
// connection the replica already uses - so that the configuration state and
// its applied progress can be one transaction with the rest of the replica's
// durable state. It does NOT reuse liferaft's `_raft_log` and `_raft_state`:
// those tables carry liferaft's own entry shape, and this quest never
// migrates a liferaft log nor changes liferaft's behaviour. Two backends,
// two records, one database.
//
// Every sixty-four-bit Raft value crosses this boundary as a decimal string
// and is bound as a BigInt. Nothing passes through a JavaScript Number.

const RAFT_RS_TABLE = Object.freeze({
  LOG: '_raft_rs_log',
  HARD_STATE: '_raft_rs_hard_state',
  APPLIED_STATE: '_raft_rs_applied_state',
  SNAPSHOT: '_raft_rs_snapshot',
  // Retirement is part of the durable record because it must be read BEFORE
  // a restarted replica ticks (addendum §5), and the only thing a restart may
  // read that early is its own durable Raft record. A retired replica's
  // stale configuration still lists itself, so the configuration cannot
  // answer this question and nothing else in the process knows the answer
  // yet.
  RETIREMENT: '_raft_rs_retirement',
});

// The applied index and the configuration state are COLUMNS OF ONE ROW,
// written by one statement. That is the whole mechanism behind "ConfState and
// its applied progress are written atomically": there is no write that can
// move one without the other, because there is no statement that touches one
// alone.
const RAFT_RS_SQL = Object.freeze({
  CREATE_LOG_TABLE: `
    CREATE TABLE IF NOT EXISTS ${RAFT_RS_TABLE.LOG} (
      group_id TEXT NOT NULL,
      log_index INTEGER NOT NULL,
      term INTEGER NOT NULL,
      entry_type INTEGER NOT NULL,
      data TEXT,
      PRIMARY KEY (group_id, log_index)
    )
  `,
  CREATE_HARD_STATE_TABLE: `
    CREATE TABLE IF NOT EXISTS ${RAFT_RS_TABLE.HARD_STATE} (
      group_id TEXT PRIMARY KEY,
      term INTEGER NOT NULL,
      vote INTEGER NOT NULL,
      commit_index INTEGER NOT NULL
    )
  `,
  CREATE_APPLIED_STATE_TABLE: `
    CREATE TABLE IF NOT EXISTS ${RAFT_RS_TABLE.APPLIED_STATE} (
      group_id TEXT PRIMARY KEY,
      applied_index INTEGER NOT NULL,
      voters TEXT NOT NULL,
      learners TEXT NOT NULL,
      voters_outgoing TEXT NOT NULL,
      learners_next TEXT NOT NULL,
      auto_leave INTEGER NOT NULL
    )
  `,
  CREATE_SNAPSHOT_TABLE: `
    CREATE TABLE IF NOT EXISTS ${RAFT_RS_TABLE.SNAPSHOT} (
      group_id TEXT PRIMARY KEY,
      snapshot_index INTEGER NOT NULL,
      snapshot_term INTEGER NOT NULL,
      data TEXT,
      voters TEXT NOT NULL,
      learners TEXT NOT NULL,
      voters_outgoing TEXT NOT NULL,
      learners_next TEXT NOT NULL,
      auto_leave INTEGER NOT NULL
    )
  `,
  CREATE_RETIREMENT_TABLE: `
    CREATE TABLE IF NOT EXISTS ${RAFT_RS_TABLE.RETIREMENT} (
      group_id TEXT NOT NULL,
      peer_id TEXT NOT NULL,
      retired_at TEXT NOT NULL,
      PRIMARY KEY (group_id, peer_id)
    )
  `,
  INSERT_RETIREMENT: `
    INSERT OR IGNORE INTO ${RAFT_RS_TABLE.RETIREMENT}
      (group_id, peer_id, retired_at)
    VALUES (?, ?, ?)
  `,
  SELECT_RETIREMENT: `
    SELECT retired_at FROM ${RAFT_RS_TABLE.RETIREMENT}
    WHERE group_id = ? AND peer_id = ?
  `,
  DELETE_LOG_FROM: `
    DELETE FROM ${RAFT_RS_TABLE.LOG}
    WHERE group_id = ? AND log_index >= ?
  `,
  INSERT_LOG_ENTRY: `
    INSERT OR REPLACE INTO ${RAFT_RS_TABLE.LOG}
      (group_id, log_index, term, entry_type, data)
    VALUES (?, ?, ?, ?, ?)
  `,
  SELECT_LOG_ENTRIES: `
    SELECT log_index, term, entry_type, data
    FROM ${RAFT_RS_TABLE.LOG}
    WHERE group_id = ?
    ORDER BY log_index ASC
  `,
  UPSERT_HARD_STATE: `
    INSERT INTO ${RAFT_RS_TABLE.HARD_STATE}
      (group_id, term, vote, commit_index)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(group_id) DO UPDATE SET
      term = excluded.term,
      vote = excluded.vote,
      commit_index = excluded.commit_index
  `,
  UPSERT_COMMIT_INDEX: `
    INSERT INTO ${RAFT_RS_TABLE.HARD_STATE}
      (group_id, term, vote, commit_index)
    VALUES (?, 0, 0, ?)
    ON CONFLICT(group_id) DO UPDATE SET
      commit_index = excluded.commit_index
  `,
  SELECT_HARD_STATE: `
    SELECT term, vote, commit_index
    FROM ${RAFT_RS_TABLE.HARD_STATE}
    WHERE group_id = ?
  `,
  UPSERT_APPLIED_STATE: `
    INSERT INTO ${RAFT_RS_TABLE.APPLIED_STATE}
      (group_id, applied_index, voters, learners, voters_outgoing,
       learners_next, auto_leave)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(group_id) DO UPDATE SET
      applied_index = excluded.applied_index,
      voters = excluded.voters,
      learners = excluded.learners,
      voters_outgoing = excluded.voters_outgoing,
      learners_next = excluded.learners_next,
      auto_leave = excluded.auto_leave
  `,
  SELECT_APPLIED_STATE: `
    SELECT applied_index, voters, learners, voters_outgoing, learners_next,
           auto_leave
    FROM ${RAFT_RS_TABLE.APPLIED_STATE}
    WHERE group_id = ?
  `,
  UPSERT_SNAPSHOT: `
    INSERT INTO ${RAFT_RS_TABLE.SNAPSHOT}
      (group_id, snapshot_index, snapshot_term, data, voters, learners,
       voters_outgoing, learners_next, auto_leave)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(group_id) DO UPDATE SET
      snapshot_index = excluded.snapshot_index,
      snapshot_term = excluded.snapshot_term,
      data = excluded.data,
      voters = excluded.voters,
      learners = excluded.learners,
      voters_outgoing = excluded.voters_outgoing,
      learners_next = excluded.learners_next,
      auto_leave = excluded.auto_leave
  `,
  SELECT_SNAPSHOT: `
    SELECT snapshot_index, snapshot_term, data, voters, learners,
           voters_outgoing, learners_next, auto_leave
    FROM ${RAFT_RS_TABLE.SNAPSHOT}
    WHERE group_id = ?
  `,
});

// The ConfState fields, in the shape the binding serialises them.
const RAFT_RS_CONF_STATE_FIELD = Object.freeze({
  VOTERS: 'voters',
  LEARNERS: 'learners',
  VOTERS_OUTGOING: 'votersOutgoing',
  LEARNERS_NEXT: 'learnersNext',
  AUTO_LEAVE: 'autoLeave',
});

const RAFT_RS_CONF_STATE_MEMBER_FIELDS = Object.freeze([
  RAFT_RS_CONF_STATE_FIELD.VOTERS,
  RAFT_RS_CONF_STATE_FIELD.LEARNERS,
  RAFT_RS_CONF_STATE_FIELD.VOTERS_OUTGOING,
  RAFT_RS_CONF_STATE_FIELD.LEARNERS_NEXT,
]);

const RAFT_RS_ZERO_INDEX = '0';
const RAFT_RS_BOOLEAN_COLUMN = Object.freeze({TRUE: 1, FALSE: 0});

// Whether this replica may run as an active local Raft runtime at all, as a
// named state rather than an absent row read as false.
const RAFT_RS_SCHEDULING_ELIGIBILITY = Object.freeze({
  ELIGIBLE: 'eligible',
  RETIRED: 'retired-in-the-durable-record',
});

const RAFT_RS_STORE_ERROR_MSG = Object.freeze({
  notAnIndex: (value) =>
    'a raft-rs 64-bit value must be a decimal string, got ' +
    `${JSON.stringify(value)}`,
  noRecord: (groupId) =>
    `no durable raft-rs record for group ${JSON.stringify(groupId)}`,
});

export {
  RAFT_RS_BOOLEAN_COLUMN,
  RAFT_RS_CONF_STATE_FIELD,
  RAFT_RS_CONF_STATE_MEMBER_FIELDS,
  RAFT_RS_SCHEDULING_ELIGIBILITY,
  RAFT_RS_SQL,
  RAFT_RS_STORE_ERROR_MSG,
  RAFT_RS_ZERO_INDEX,
};
