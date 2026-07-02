import {CONFIG_KEY} from '../config/config-constants.js';
import {NUM} from '../constants/index.js';

const HLC_SUBSYSTEM = 'hlc';

const HLC_CONFIG_KEY = Object.freeze({
  MAX_DRIFT_MS: CONFIG_KEY.HLC_MAX_DRIFT_MS,
  MAX_LOGICAL_COUNTER: CONFIG_KEY.HLC_MAX_LOGICAL_COUNTER,
});

const HLC_DEFAULT = Object.freeze({
  MAX_DRIFT_MS: 500,
  MAX_LOGICAL_COUNTER: 65535,
});

const HLC_SEPARATOR = Object.freeze({
  FIELD: '-',
});

const HLC_PART = Object.freeze({
  MIN_COUNT: NUM.THREE,
  NODE_ID_INDEX: 2,
  PARSE_RADIX: NUM.TEN,
});

const HLC_LOG_MSG = Object.freeze({
  EXCESSIVE_CLOCK_DRIFT: 'Excessive clock drift detected',
});

const HLC_ERROR_MSG = Object.freeze({
  NOT_STRING_PREFIX: 'HLC timestamp must be a string, got ',
  INVALID_STRING_PREFIX: 'Invalid HLC timestamp string: ',
});

export {
  HLC_CONFIG_KEY,
  HLC_DEFAULT,
  HLC_ERROR_MSG,
  HLC_LOG_MSG,
  HLC_PART,
  HLC_SEPARATOR,
  HLC_SUBSYSTEM,
};
