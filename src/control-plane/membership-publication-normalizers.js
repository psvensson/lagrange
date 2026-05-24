import {NUM} from '../constants/index.js';

const LOCAL_STR_EMPTY = '';

function normalizeMembershipPublicationStringList(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || LOCAL_STR_EMPTY).trim())
        .filter((value) => value.length > NUM.ZERO),
    ),
  ].sort();
}

export {normalizeMembershipPublicationStringList};
