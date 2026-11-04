#!/bin/sh
set -e

VAULT="${SDL_VAULT_PATH:-/data/vault}"

if [ ! -f "$VAULT/.sdl-vault" ]; then
  mkdir -p "$VAULT"
  if [ -z "$(ls -A "$VAULT" 2>/dev/null)" ]; then
    cp -R /app/seeds/. "$VAULT"/
    printf '%s' '{"marker":"sdl-vault","schema_version":1}' > "$VAULT/.sdl-vault"
    echo "[sdl] 首次启动：已用 seeds 初始化 $VAULT"
  else
    echo "[sdl] 警告：$VAULT 非空但缺少 .sdl-vault 标记，写入会被拒绝。"
  fi
fi

exec "$@"
