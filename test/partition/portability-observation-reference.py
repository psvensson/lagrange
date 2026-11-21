#!/usr/bin/env python3
"""Independent Q1a logical observation decoder, using only Python stdlib.

This is deliberately not an adapter around JavaScript or a runtime wire codec.
It reads the published conformance fixture from stdin and prints a deficit
count. A green result describes the fixture/target contract, not a cluster.
"""

import json
import re
import sys


SCHEMA = "portable-partition-observation-v1"
SCOPE = "logical-retained-committed-statement-observation-only"
SQLITE_INT64_MIN = -(2**63)
SQLITE_INT64_MAX = 2**63 - 1
MAX_EXACT_DESCRIPTOR_EPOCH = 2**53 - 1
DECIMAL = re.compile(r"-?(?:0|[1-9][0-9]*)\Z")

ACCEPTED_IDS = set(f"A{i:02}" for i in range(1, 13))
REJECTED_IDS = set(f"R{i:02}" for i in range(1, 22))
COMPARISON_IDS = set(f"C{i:02}" for i in range(1, 6))
EPOCH_IDS = set(f"E{i:02}" for i in range(1, 6))
REJECTED_EPOCH_IDS = set(f"X{i:02}" for i in range(1, 7))
IDENTITY_IDS = set(f"I{i:02}" for i in range(1, 6))

# Every named example has a protected semantic distinction. Fixed IDs alone
# are insufficient: repeating a small valid case can otherwise make a vacuous
# positive corpus, even while the checker passes its mutation controls.
ACCEPTED_COVERAGE = {
    "A01": {"kind": "settled", "outcome": "applied", "changes": "0", "lastInsertRowid": None},
    "A02": {"outcome": "applied", "logIndex": "9007199254740993",
            "lastInsertRowid": "9223372036854775807"},
    "A03": {"outcome": "statement_failed", "term": "9223372036854775807",
            "failureCode": "SQLITE_CONSTRAINT", "changes": None},
    "A04": {"outcome": "applied", "lastInsertRowid": "-9223372036854775808"},
    "A05": {"kind": "unsettled"},
    "A06": {"kind": "unavailable", "reason": "partition_retained_store_schema_unavailable"},
    "A07": {"kind": "unavailable", "reason": "partition_retained_store_schema_contrary"},
    "A08": {"kind": "unavailable", "reason": "partition_retained_store_row_contrary"},
    "A09": {"kind": "unknown", "reason": "partition_write_outcome_unknown"},
    "A10": {"kind": "settled", "outcome": "applied", "changes": None,
            "lastInsertRowid": None, "ownerResultText": None},
    "A11": {"kind": "settled", "outcome": "applied",
            "entryKey": "txop:transaction-1:partition-1:0", "changes": "2"},
    "A12": {"kind": "settled", "outcome": "applied", "changes": None,
            "ownerResultText": '{"outcome":"applied"}'},
}
REJECTED_COVERAGE = {
    "R01": {"logIndex": "01"}, "R02": {"logIndex": "0"},
    "R03": {"logIndex": "9223372036854775808"},
    "R04": {"changes": "0.0"}, "R05": {"lastInsertRowid": "-0"},
    "R06": {"lastInsertRowid": "-9223372036854775809"},
    "R07": {"entryKey": "entry:"}, "R08": {"kind": "absent"},
    "R09": {"kind": "unavailable", "reason": "not_found"},
    "R10": {"kind": "unknown", "reason": "not_committed"},
    "R11": {"outcome": "replayed"}, "R12": {"appendedAt": "fabricated"},
    "R13": {"changes": 1}, "R14": {"term": None},
    "R15": {"outcome": "applied", "failureCode": "SQLITE_CONSTRAINT"},
    "R16": {"outcome": "statement_failed", "changes": "1"},
    "R17": {"outcome": "statement_failed", "failureCode": None},
    "R18": {"outcome": "applied", "changes": "0", "lastInsertRowid": "1"},
    "R19": {"entryKey": "txop:transaction-1:partition-1:00"},
    "R20": {"changes": "1", "ownerResultText": '{"outcome":"applied"}'},
    "R21": {"changes": None, "lastInsertRowid": "1"},
}
COMPARISON_COVERAGE = {
    "C01": {"domain": "retained-log-index", "left": "9007199254740993",
            "right": "9007199254740992", "order": 1},
    "C02": {"domain": "retained-term", "left": "9223372036854775807",
            "right": "9223372036854775807", "order": 0},
    "C03": {"domain": "retained-term", "left": "2", "right": "3", "order": -1},
    "C04": {"domain": "sqlite-rowid", "left": "-9223372036854775808",
            "right": "0", "order": -1},
    "C05": {"domain": "sqlite-rowid", "left": "0", "right": "1", "order": -1},
}
EPOCH_COVERAGE = {
    "E01": {"expected": 1, "actual": 1, "match": True},
    "E02": {"expected": 1, "actual": 2, "match": False},
    "E03": {"expected": 9007199254740991, "actual": 9007199254740991, "match": True},
    "E04": {"expected": 9007199254740991, "actual": 1, "match": False},
    "E05": {"expected": 7, "actual": 7, "match": True},
}
REJECTED_EPOCH_COVERAGE = {
    "X01": {"expected": 0}, "X02": {"expected": 9007199254740992},
    "X03": {"expected": "1"}, "X04": {"expected": True},
    "X05": {"expected": 1.5}, "X06": {"expected": 1, "match": False},
}
IDENTITY_COVERAGE = {
    "I01": {"left": "entry:alpha", "right": "entry:Alpha", "equal": False},
    "I02": {"left": "entry:café", "right": "entry:cafe\u0301", "equal": False},
    "I03": {"left": "txop:transaction-1:partition-1:0",
            "right": "txop:transaction-1:partition-1:1", "equal": False},
    "I04": {"left": "entry:alpha", "right": "entry:alpha", "equal": True},
    "I05": {"left": "entry:alpha", "right": "txop:transaction-1:partition-1:0",
            "equal": False},
}

SQLITE_ABSENCE_REASONS = {
    "partition_retained_store_schema_unavailable",
    "partition_retained_store_schema_contrary",
    "partition_retained_store_row_contrary",
}
UNKNOWN_REASON = "partition_write_outcome_unknown"
SETTLED_OUTCOMES = {"applied", "statement_failed"}
SETTLED_KEYS = {
    "kind", "entryKey", "outcome", "logIndex", "term", "changes",
    "lastInsertRowid", "failureCode", "failureMessage", "ownerResultText",
}


class ContractError(ValueError):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def fail(code):
    raise ContractError(code)


def exact_keys(value, fields):
    if not isinstance(value, dict) or set(value) != fields:
        fail("invalid_shape")


def canonical_decimal(value, minimum=SQLITE_INT64_MIN, maximum=SQLITE_INT64_MAX):
    if not isinstance(value, str) or not DECIMAL.fullmatch(value):
        fail("invalid_decimal")
    try:
        number = int(value)
    except ValueError:
        fail("invalid_decimal")
    if str(number) != value:
        fail("invalid_decimal")
    if number < minimum or number > maximum:
        fail("out_of_range")
    return number


def nullable_decimal(value, minimum=SQLITE_INT64_MIN):
    if value is not None:
        canonical_decimal(value, minimum)


def nullable_text(value):
    if value is not None and not isinstance(value, str):
        fail("invalid_shape")


def entry_key(value):
    if not isinstance(value, str):
        fail("invalid_identity")
    if value.startswith("entry:"):
        if len(value) <= len("entry:"):
            fail("invalid_identity")
    elif value.startswith("txop:"):
        subject = value[len("txop:"):]
        if ":" not in subject:
            fail("invalid_identity")
        participant_id, ordinal = subject.rsplit(":", 1)
        if (not participant_id or ":" not in participant_id
                or participant_id.startswith(":") or participant_id.endswith(":")
                or not re.fullmatch(r"(?:0|[1-9][0-9]*)", ordinal)
                or int(ordinal) > MAX_EXACT_DESCRIPTOR_EPOCH):
            fail("invalid_identity")
    else:
        fail("invalid_identity")
    try:
        value.encode("utf-8")
    except UnicodeEncodeError:
        fail("invalid_identity")


def validate_observation(value):
    if not isinstance(value, dict):
        fail("invalid_shape")
    kind = value.get("kind")
    if kind == "settled":
        exact_keys(value, SETTLED_KEYS)
        entry_key(value["entryKey"])
        if value["outcome"] not in SETTLED_OUTCOMES:
            fail("invalid_state")
        canonical_decimal(value["logIndex"], 1)
        canonical_decimal(value["term"], 1)
        nullable_decimal(value["changes"], 0)
        nullable_decimal(value["lastInsertRowid"])
        for field in ("failureCode", "failureMessage", "ownerResultText"):
            nullable_text(value[field])
        if value["outcome"] == "statement_failed":
            if (value["changes"] is not None or value["lastInsertRowid"] is not None
                    or value["failureCode"] is None or value["failureMessage"] is None
                    or value["ownerResultText"] is not None):
                fail("invalid_outcome_fields")
        else:
            if value["failureCode"] is not None or value["failureMessage"] is not None:
                fail("invalid_outcome_fields")
            if value["lastInsertRowid"] is not None and (
                    value["changes"] is None or int(value["changes"]) == 0):
                fail("invalid_insert_identity")
            if value["ownerResultText"] is not None and (
                    value["changes"] is not None or value["lastInsertRowid"] is not None):
                fail("invalid_result")
        return
    if kind == "unsettled":
        exact_keys(value, {"kind", "entryKey"})
        entry_key(value["entryKey"])
        return
    if kind in ("unavailable", "unknown"):
        exact_keys(value, {"kind", "entryKey", "reason"})
        entry_key(value["entryKey"])
        reasons = SQLITE_ABSENCE_REASONS if kind == "unavailable" else {UNKNOWN_REASON}
        if value["reason"] not in reasons:
            fail("invalid_reason")
        return
    fail("invalid_state")


def validate_comparison(item):
    exact_keys(item, {"id", "domain", "left", "right", "order"})
    domains = {"retained-log-index": 1, "retained-term": 1, "sqlite-rowid": SQLITE_INT64_MIN}
    if item["domain"] not in domains:
        fail("invalid_domain")
    minimum = domains[item["domain"]]
    left = canonical_decimal(item["left"], minimum)
    right = canonical_decimal(item["right"], minimum)
    order = (left > right) - (left < right)
    if type(item["order"]) is not int or item["order"] != order:
        fail("comparison_mismatch")


def validate_epoch(item):
    exact_keys(item, {"id", "expected", "actual", "match"})
    for field in ("expected", "actual"):
        number = item[field]
        if type(number) is not int or number < 1 or number > MAX_EXACT_DESCRIPTOR_EPOCH:
            fail("invalid_epoch")
    if type(item["match"]) is not bool or item["match"] != (
        item["expected"] == item["actual"]
    ):
        fail("epoch_mismatch")


def validate_identity(item):
    exact_keys(item, {"id", "left", "right", "equal"})
    entry_key(item["left"])
    entry_key(item["right"])
    if type(item["equal"]) is not bool or item["equal"] != (
            item["left"].encode("utf-8") == item["right"].encode("utf-8")):
        fail("identity_mismatch")


def count_ids(items, required):
    if not isinstance(items, list):
        return 1
    ids = [item.get("id") for item in items if isinstance(item, dict)]
    return int(len(ids) != len(items) or len(ids) != len(required) or set(ids) != required)


def coverage_deficit(items, anchors, field=None):
    deficits = 0
    for item in items:
        if not isinstance(item, dict):
            deficits += 1
            continue
        required = anchors.get(item.get("id"))
        value = item.get(field) if field is not None else item
        if not isinstance(required, dict) or not isinstance(value, dict) or any(
                key not in value or type(value[key]) is not type(expected)
                or value[key] != expected for key, expected in required.items()):
            deficits += 1
    return deficits


def check_accepted(items, validator, field="value"):
    deficits = 0
    for item in items:
        try:
            validator(item[field])
        except (ContractError, KeyError, TypeError):
            deficits += 1
    return deficits


def check_rejected(items, validator, field="value"):
    deficits = 0
    for item in items:
        try:
            validator(item[field])
            deficits += 1
        except ContractError as error:
            if error.code != item.get("expect"):
                deficits += 1
        except (KeyError, TypeError):
            deficits += 1
    return deficits


def deficits_for(corpus):
    if (not isinstance(corpus, dict) or corpus.get("schema") != SCHEMA
            or corpus.get("scope") != SCOPE or set(corpus) != {
                "schema", "scope", "accepted", "rejected", "comparisons",
                "epochs", "rejectedEpochs", "identities",
            }):
        return 1
    collections = (
        ("accepted", ACCEPTED_IDS), ("rejected", REJECTED_IDS),
        ("comparisons", COMPARISON_IDS), ("epochs", EPOCH_IDS),
        ("rejectedEpochs", REJECTED_EPOCH_IDS), ("identities", IDENTITY_IDS),
    )
    if any(not isinstance(corpus.get(key), list) for key, _ in collections):
        return 1
    deficits = sum(count_ids(corpus[key], ids) for key, ids in collections)
    deficits += sum(coverage_deficit(corpus[key], anchors, field) for key, anchors, field in (
        ("accepted", ACCEPTED_COVERAGE, "value"),
        ("rejected", REJECTED_COVERAGE, "value"),
        ("comparisons", COMPARISON_COVERAGE, None),
        ("epochs", EPOCH_COVERAGE, None),
        ("rejectedEpochs", REJECTED_EPOCH_COVERAGE, None),
        ("identities", IDENTITY_COVERAGE, None),
    ))
    deficits += check_accepted(corpus["accepted"], validate_observation)
    deficits += check_rejected(corpus["rejected"], validate_observation)
    for item in corpus["identities"]:
        try:
            validate_identity(item)
        except (ContractError, KeyError, TypeError):
            deficits += 1
    for item in corpus["comparisons"]:
        try:
            validate_comparison(item)
        except (ContractError, KeyError, TypeError):
            deficits += 1
    for item in corpus["epochs"]:
        try:
            validate_epoch(item)
        except (ContractError, KeyError, TypeError):
            deficits += 1
    for item in corpus["rejectedEpochs"]:
        try:
            validate_epoch({key: value for key, value in item.items() if key != "expect"})
            deficits += 1
        except ContractError as error:
            if error.code != item.get("expect"):
                deficits += 1
        except (KeyError, TypeError):
            deficits += 1
    return deficits


def main():
    try:
        corpus = json.load(sys.stdin)
        print(deficits_for(corpus))
    except (ValueError, TypeError, KeyError, OverflowError) as error:
        print(f"reference rejected malformed fixture: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
