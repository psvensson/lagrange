// The OLTP adapter contract every product adapter honours (the pg-wire
// adapter for Lagrange and PostgreSQL, the TiDB adapter). One vocabulary:
// `close({dropDataset})` - by default an adapter drops the dataset it
// created; `dropDataset: false` keeps it for a caller that observes the
// dataset after the adapter closes (a proof's restart, a deployment's
// after-window placement).
const OLTP_ADAPTER_CLOSE_OPTION = Object.freeze({DROP_DATASET: 'dropDataset'});
const KEEP_DATASET = Object.freeze({[OLTP_ADAPTER_CLOSE_OPTION.DROP_DATASET]: false});

function dropsDataset(closeOptions = {}) {
  return closeOptions[OLTP_ADAPTER_CLOSE_OPTION.DROP_DATASET] !== false;
}

export {KEEP_DATASET as OLTP_ADAPTER_KEEP_DATASET, dropsDataset};
