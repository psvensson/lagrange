/*
 * Probe-only SQLite page reader for bounded-transaction-workspace Gate A1.
 *
 * This executable is compiled against the repository's vendored SQLite
 * amalgamation with SQLITE_ENABLE_DBPAGE_VTAB.  The production better-sqlite3
 * build does not expose sqlite_dbpage.  Keep this file evidence-only: it owns
 * one read-only connection from BEGIN through ROLLBACK and never implements a
 * writable overlay.
 */

#include "sqlite3.h"

#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define COMMAND_BYTES 128
#define HASH_OFFSET UINT64_C(1469598103934665603)
#define HASH_PRIME UINT64_C(1099511628211)

static int64_t monotonic_micros(void) {
  struct timespec value;
  if (clock_gettime(CLOCK_MONOTONIC, &value) != 0) return 0;
  return ((int64_t)value.tv_sec * INT64_C(1000000)) +
    ((int64_t)value.tv_nsec / INT64_C(1000));
}

static uint64_t hash_bytes(const unsigned char *data, int bytes) {
  uint64_t hash = HASH_OFFSET;
  int index;
  for (index = 0; index < bytes; index += 1) {
    hash ^= data[index];
    hash *= HASH_PRIME;
  }
  return hash;
}

static void print_error(sqlite3 *db, const char *phase, int code) {
  const char *message = db == NULL ? sqlite3_errstr(code) : sqlite3_errmsg(db);
  fprintf(stdout,
    "{\"type\":\"error\",\"phase\":\"%s\",\"code\":%d,"
    "\"extendedCode\":%d,\"message\":\"SQLite error\"}\n",
    phase, code, db == NULL ? code : sqlite3_extended_errcode(db));
  fprintf(stderr, "%s: %s (%d)\n", phase, message, code);
  fflush(stdout);
}

static int execute(sqlite3 *db, const char *sql, const char *phase) {
  int code = sqlite3_exec(db, sql, NULL, NULL, NULL);
  if (code != SQLITE_OK) print_error(db, phase, code);
  return code;
}

static int read_applied_index(sqlite3 *db, char *value, size_t value_bytes) {
  static const char sql[] =
    "SELECT CAST(applied_index AS TEXT) "
    "FROM _raft_rs_applied_state ORDER BY group_id LIMIT 1";
  sqlite3_stmt *statement = NULL;
  int code = sqlite3_prepare_v2(db, sql, -1, &statement, NULL);
  if (code == SQLITE_OK) code = sqlite3_step(statement);
  if (code == SQLITE_ROW) {
    const unsigned char *text = sqlite3_column_text(statement, 0);
    snprintf(value, value_bytes, "%s", text == NULL ? "" : (const char *)text);
    code = SQLITE_OK;
  } else if (code == SQLITE_DONE) {
    code = SQLITE_NOTFOUND;
  }
  if (code != SQLITE_OK) print_error(db, "read-applied-index", code);
  sqlite3_finalize(statement);
  return code;
}

static int read_state(sqlite3 *db) {
  static const char sql[] =
    "SELECT CAST(s.applied_index AS TEXT), a.value "
    "FROM _raft_rs_applied_state AS s "
    "CROSS JOIN anchor_rows AS a "
    "WHERE a.id=1 ORDER BY s.group_id LIMIT 1";
  sqlite3_stmt *statement = NULL;
  int64_t started = monotonic_micros();
  int code = sqlite3_prepare_v2(db, sql, -1, &statement, NULL);
  if (code == SQLITE_OK) code = sqlite3_step(statement);
  if (code == SQLITE_ROW) {
    const unsigned char *index = sqlite3_column_text(statement, 0);
    const unsigned char *anchor = sqlite3_column_text(statement, 1);
    fprintf(stdout,
      "{\"type\":\"state\",\"appliedIndex\":\"%s\","
      "\"anchor\":\"%s\",\"elapsedMicros\":%" PRId64 "}\n",
      index, anchor, monotonic_micros() - started);
    fflush(stdout);
    code = SQLITE_OK;
  } else if (code == SQLITE_DONE) {
    code = SQLITE_NOTFOUND;
  }
  if (code != SQLITE_OK) print_error(db, "read-state", code);
  sqlite3_finalize(statement);
  return code;
}

static int read_late(sqlite3 *db) {
  static const char sql[] = "SELECT value FROM late_rows WHERE id=1";
  sqlite3_stmt *statement = NULL;
  int64_t started = monotonic_micros();
  int code = sqlite3_prepare_v2(db, sql, -1, &statement, NULL);
  if (code == SQLITE_OK) code = sqlite3_step(statement);
  if (code == SQLITE_ROW) {
    const unsigned char *value = sqlite3_column_text(statement, 0);
    fprintf(stdout,
      "{\"type\":\"late\",\"value\":\"%s\",\"elapsedMicros\":%" PRId64 "}\n",
      value, monotonic_micros() - started);
    fflush(stdout);
    code = SQLITE_OK;
  } else if (code == SQLITE_DONE) {
    code = SQLITE_NOTFOUND;
  }
  if (code != SQLITE_OK) print_error(db, "read-late", code);
  sqlite3_finalize(statement);
  return code;
}

static int read_page(sqlite3 *db, sqlite3_stmt *statement, sqlite3_int64 page,
    int request_number) {
  const unsigned char *data;
  uint64_t hash;
  int bytes;
  int code;
  int64_t started = monotonic_micros();

  sqlite3_reset(statement);
  sqlite3_clear_bindings(statement);
  code = sqlite3_bind_int64(statement, 1, page);
  if (code == SQLITE_OK) code = sqlite3_step(statement);
  if (code != SQLITE_ROW) {
    if (code == SQLITE_DONE) code = SQLITE_NOTFOUND;
    print_error(db, "read-page", code);
    return code;
  }
  data = sqlite3_column_blob(statement, 0);
  bytes = sqlite3_column_bytes(statement, 0);
  hash = hash_bytes(data, bytes);
  fprintf(stdout,
    "{\"type\":\"page\",\"page\":%" PRId64 ",\"bytes\":%d,"
    "\"hash\":\"%016" PRIx64 "\",\"request\":%d,"
    "\"pageSqlStatements\":%d,\"elapsedMicros\":%" PRId64 "}\n",
    (int64_t)page, bytes, hash, request_number, request_number,
    monotonic_micros() - started);
  fflush(stdout);
  return SQLITE_OK;
}

int main(int argc, char **argv) {
  static const char page_sql[] =
    "SELECT data FROM sqlite_dbpage WHERE pgno=?1";
  sqlite3 *db = NULL;
  sqlite3_stmt *page_statement = NULL;
  char applied_index[64];
  char command[COMMAND_BYTES];
  int page_requests = 0;
  int code;
  int64_t open_started;
  int64_t open_micros;
  int64_t begin_started;
  int64_t begin_micros;
  int64_t applied_started;
  int64_t applied_micros;
  int64_t resolver_started;
  int64_t resolver_micros;

  if (argc != 2) {
    fprintf(stderr, "usage: %s DATABASE\n", argv[0]);
    return 64;
  }
  open_started = monotonic_micros();
  code = sqlite3_open_v2(argv[1], &db,
    SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX, NULL);
  open_micros = monotonic_micros() - open_started;
  if (code != SQLITE_OK) {
    print_error(db, "open", code);
    sqlite3_close(db);
    return 2;
  }
  sqlite3_extended_result_codes(db, 1);
  sqlite3_busy_timeout(db, 0);

  begin_started = monotonic_micros();
  code = execute(db, "BEGIN", "begin");
  begin_micros = monotonic_micros() - begin_started;
  if (code != SQLITE_OK) goto failed;

  applied_started = monotonic_micros();
  code = read_applied_index(db, applied_index, sizeof(applied_index));
  applied_micros = monotonic_micros() - applied_started;
  if (code != SQLITE_OK) goto failed;

  resolver_started = monotonic_micros();
  code = sqlite3_prepare_v2(db, page_sql, -1, &page_statement, NULL);
  resolver_micros = monotonic_micros() - resolver_started;
  if (code != SQLITE_OK) {
    print_error(db, "initialize-page-resolver", code);
    goto failed;
  }

  fprintf(stdout,
    "{\"type\":\"ready\",\"appliedIndex\":\"%s\","
    "\"openMicros\":%" PRId64 ",\"beginMicros\":%" PRId64 ","
    "\"appliedReadMicros\":%" PRId64 ",\"resolverInitMicros\":%" PRId64 ","
    "\"setupSqlStatements\":2,\"resolverPrepareStatements\":1}\n",
    applied_index, open_micros, begin_micros, applied_micros,
    resolver_micros);
  fflush(stdout);

  while (fgets(command, sizeof(command), stdin) != NULL) {
    int64_t page;
    if (sscanf(command, "PAGE %" SCNd64, &page) == 1) {
      page_requests += 1;
      if (read_page(db, page_statement, (sqlite3_int64)page,
          page_requests) != SQLITE_OK) {
        goto failed;
      }
    } else if (strcmp(command, "STATE\n") == 0) {
      if (read_state(db) != SQLITE_OK) goto failed;
    } else if (strcmp(command, "LATE\n") == 0) {
      if (read_late(db) != SQLITE_OK) goto failed;
    } else if (strcmp(command, "QUIT\n") == 0) {
      int64_t rollback_started = monotonic_micros();
      code = execute(db, "ROLLBACK", "rollback");
      fprintf(stdout,
        "{\"type\":\"disposed\",\"pageRequests\":%d,"
        "\"pageSqlStatements\":%d,\"rollbackMicros\":%" PRId64 "}\n",
        page_requests, page_requests, monotonic_micros() - rollback_started);
      fflush(stdout);
      sqlite3_finalize(page_statement);
      sqlite3_close(db);
      return code == SQLITE_OK ? 0 : 2;
    } else {
      print_error(db, "protocol", SQLITE_MISUSE);
      goto failed;
    }
  }

failed:
  sqlite3_finalize(page_statement);
  if (db != NULL) {
    sqlite3_exec(db, "ROLLBACK", NULL, NULL, NULL);
    sqlite3_close(db);
  }
  return 2;
}
