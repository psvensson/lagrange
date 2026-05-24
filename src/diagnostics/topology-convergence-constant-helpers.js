function glossaryEntries(values) {
  return Object.entries(values).map(([name, value]) => ({
    name,
    value,
  }));
}

function cloneDecisionTableRows(rows) {
  return rows.map((row) => ({
    edgeId: row.edgeId,
    owner: row.owner,
    boundary: row.boundary,
    evidenceInputs: [...row.evidenceInputs],
    outcomes: row.outcomes.map((outcome) => ({
      condition: outcome.condition,
      state: outcome.state,
      reasons: [...outcome.reasons],
    })),
  }));
}

export {cloneDecisionTableRows, glossaryEntries};
