// The OLTP adapter contract every product adapter honours (the pg-wire
// adapter for Lagrange and PostgreSQL, the TiDB adapter). One vocabulary:
// `close({dropDataset})` - by default an adapter drops the dataset it
// created; `dropDataset: false` keeps it for a caller that observes the
// dataset after the adapter closes (a proof's restart, a deployment's
// after-window placement).
const OLTP_ADAPTER_CLOSE_OPTION = Object.freeze({DROP_DATASET: 'dropDataset'});
const KEEP_DATASET = Object.freeze({[OLTP_ADAPTER_CLOSE_OPTION.DROP_DATASET]: false});

// What an adapter did to make its dataset the canonical one, reported by the
// adapter that did it (never inferred from the system name): the dataset was
// created and loaded, truncated and reloaded, or dropped, created and loaded;
// a run that never opened its adapter performed nothing.
const OLTP_DATASET_PREPARATION_METHOD = Object.freeze({
  CREATED_AND_LOADED: 'created-and-loaded',
  TRUNCATED_AND_RELOADED: 'truncated-and-reloaded',
  DROPPED_CREATED_AND_LOADED: 'dropped-created-and-loaded',
  NOT_PERFORMED: 'not-performed',
});

function dropsDataset(closeOptions = {}) {
  return closeOptions[OLTP_ADAPTER_CLOSE_OPTION.DROP_DATASET] !== false;
}

export {
  KEEP_DATASET as OLTP_ADAPTER_KEEP_DATASET,
  OLTP_DATASET_PREPARATION_METHOD,
  dropsDataset,
};
