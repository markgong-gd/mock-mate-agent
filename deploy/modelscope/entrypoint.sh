#!/usr/bin/env bash
# 魔搭 Docker 创空间入口（02 §10.2）：
#   1. PGDATA 不存在 -> initdb
#   2. 以 postgres 用户启动内置 Postgres（只监听 127.0.0.1）
#   3. 等待就绪 -> 创建库与扩展（幂等）
#   4. 启动 node（迁移 -> checkpointer.setup -> pg-boss -> 监听 PORT）
#   5. 收到 SIGTERM：先停 node，再 pg_ctl stop -m fast
# USE_EMBEDDED_PG=false 时跳过 1~3/5，直接使用外部 DATABASE_URL（如 docker compose --profile app）。
set -Eeuo pipefail

log() { echo "[entrypoint] $(date -u +%H:%M:%S) $*"; }

DATA_ROOT="${DATA_ROOT:-/mnt/workspace}"
PGDATA="${PGDATA:-$DATA_ROOT/pgdata}"
PG_RUN_DIR="${PG_RUN_DIR:-/tmp/pg-run}"
PG_DB="${PG_DB:-mockmate}"
PG_USER_NAME="${PG_USER_NAME:-mockmate}"
export BACKUP_DIR="${BACKUP_DIR:-$DATA_ROOT/backups}"

NODE_PID=""
PG_STARTED=false

pg_as() { if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi; }

stop_all() {
  log "received stop signal"
  if [ -n "$NODE_PID" ] && kill -0 "$NODE_PID" 2>/dev/null; then
    kill -TERM "$NODE_PID" 2>/dev/null || true
    wait "$NODE_PID" 2>/dev/null || true
  fi
  if [ "$PG_STARTED" = true ]; then
    log "stopping postgres"
    pg_as pg_ctl -D "$PGDATA" stop -m fast -w || true
  fi
  exit 0
}
trap stop_all SIGTERM SIGINT

if [ "${USE_EMBEDDED_PG:-true}" = "true" ]; then
  mkdir -p "$DATA_ROOT" "$PG_RUN_DIR" "$BACKUP_DIR"
  if [ "$(id -u)" = "0" ]; then
    chown -R postgres:postgres "$PG_RUN_DIR" "$BACKUP_DIR"
    [ -d "$PGDATA" ] && chown -R postgres:postgres "$PGDATA"
  fi

  if [ ! -s "$PGDATA/PG_VERSION" ]; then
    log "initdb at $PGDATA"
    mkdir -p "$PGDATA"
    [ "$(id -u)" = "0" ] && chown -R postgres:postgres "$PGDATA"
    chmod 700 "$PGDATA"
    pg_as initdb -D "$PGDATA" --username=postgres --auth-local=trust --auth-host=scram-sha-256 \
      --encoding=UTF8 --locale=C.UTF-8 >/dev/null
    {
      echo "listen_addresses = '127.0.0.1'"
      echo "unix_socket_directories = '$PG_RUN_DIR'"
      echo "max_connections = 30"
      echo "shared_buffers = 128MB"
    } >> "$PGDATA/postgresql.conf"
  fi
  rm -f "$PGDATA/postmaster.pid"

  log "starting postgres"
  pg_as pg_ctl -D "$PGDATA" -o "-k $PG_RUN_DIR" -l "$PG_RUN_DIR/postgres.log" start -w -t 120
  PG_STARTED=true

  for _ in $(seq 1 60); do
    pg_as pg_isready -h "$PG_RUN_DIR" -q && break
    sleep 1
  done

  PG_PASSWORD_FILE="$PGDATA/.mockmate_password"
  if [ ! -s "$PG_PASSWORD_FILE" ]; then
    head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$PG_PASSWORD_FILE"
    [ "$(id -u)" = "0" ] && chown postgres:postgres "$PG_PASSWORD_FILE"
    chmod 600 "$PG_PASSWORD_FILE"
  fi
  PG_PASSWORD="$(cat "$PG_PASSWORD_FILE")"

  psql_admin() { pg_as psql -h "$PG_RUN_DIR" -U postgres -v ON_ERROR_STOP=1 -qAt "$@"; }
  if [ "$(psql_admin -c "select 1 from pg_roles where rolname='$PG_USER_NAME'")" != "1" ]; then
    psql_admin -c "create role $PG_USER_NAME login password '$PG_PASSWORD'"
  else
    psql_admin -c "alter role $PG_USER_NAME password '$PG_PASSWORD'"
  fi
  if [ "$(psql_admin -c "select 1 from pg_database where datname='$PG_DB'")" != "1" ]; then
    psql_admin -c "create database $PG_DB owner $PG_USER_NAME"
  fi
  psql_admin -d "$PG_DB" -c "create extension if not exists vector" -c "create extension if not exists pg_trgm"

  export DATABASE_URL="postgres://$PG_USER_NAME:$PG_PASSWORD@127.0.0.1:5432/$PG_DB"
  log "postgres ready (data: $PGDATA)"
fi

log "starting app on ${HOST:-0.0.0.0}:${PORT:-7860}"
node dist/server/entry.js &
NODE_PID=$!
set +e
wait "$NODE_PID"
CODE=$?
set -e
log "app exited with $CODE"
if [ "$PG_STARTED" = true ]; then
  pg_as pg_ctl -D "$PGDATA" stop -m fast -w || true
fi
exit "$CODE"
