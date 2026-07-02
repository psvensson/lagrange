

function normalizeMembershipPublicationStringList(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || '').trim())
        .filter((value) => value.length > 0),
    ),
  ].sort();
}

export {normalizeMembershipPublicationStringList};
