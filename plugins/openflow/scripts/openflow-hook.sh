#!/usr/bin/env sh
# Relays an AI coding tool's hook to the OpenFlow CLI installed in the site being edited:
#   openflow-hook.sh <session-start | post-tool-use | stop> [claude | cursor]
# Claude Code, Codex and GitHub Copilot CLI share one format (the default); Cursor has its own.
# Silent (exit 0) when no OpenFlow site with an installed CLI is found, so the plugin never
# disturbs other projects. The CLI itself skips duplicates when the project declares the hooks.
# `session-start` needs no CLI: in an OpenFlow repository or site, it tells the agent what is
# missing (packages not installed or built) so that the checks can run.
event="$1"
client="${2:-claude}"
input="$(cat)"

# First value of a JSON string field of the hook input (enough for paths and directories).
field() {
  printf '%s' "$input" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" | head -n 1
}
roots="$(printf '%s' "$input" | sed -n 's/.*"workspace_roots"[[:space:]]*:[[:space:]]*\[[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
start="$(field cwd)"
start="${start:-${roots:-${CLAUDE_PROJECT_DIR:-${CURSOR_PROJECT_DIR:-$PWD}}}}"

find_cli() {
  dir="$1"
  while [ -n "$dir" ] && [ "$dir" != "/" ] && [ "$dir" != "." ]; do
    if [ -x "$dir/node_modules/.bin/openflow" ] && { [ -f "$dir/openflow.config.tsx" ] || [ -f "$dir/openflow.config.ts" ]; }; then
      echo "$dir/node_modules/.bin/openflow"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

is_repo() { [ -f "$1/pnpm-workspace.yaml" ] && [ -f "$1/packages/cli/bin/openflow.js" ]; }

# The OpenFlow repository around the project directory, or cloned just inside it (./openflow…).
find_repo() {
  dir="$1"
  while [ -n "$dir" ] && [ "$dir" != "/" ] && [ "$dir" != "." ]; do
    if is_repo "$dir"; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  for sub in "$1"/*/; do
    if is_repo "${sub%/}"; then
      echo "${sub%/}"
      return 0
    fi
  done
  return 1
}

# Context for the agent at session start: plain text, or JSON for Cursor.
context() {
  if [ "$client" = "cursor" ]; then
    node -e 'process.stdout.write(JSON.stringify({ additional_context: process.argv[1] }))' "$1"
  else
    echo "$1"
  fi
}

if [ "$event" = "session-start" ]; then
  repo="$(find_repo "$start")" || exit 0
  if [ ! -d "$repo/node_modules" ] || [ ! -f "$repo/packages/cli/dist/cli.js" ]; then
    context "OpenFlow : le dépôt $repo n'est pas encore installé ou compilé. Avant de créer, vérifier ou lancer un site, exécute « pnpm install && pnpm build » à sa racine (ou le script scripts/openflow-init.sh du skill openflow-new-site). Sans cela, les contrôles de la norme OFS ne tournent pas."
    exit 0
  fi
  sites=""
  unlinked=""
  for config in "$repo"/sites/*/openflow.config.tsx; do
    [ -f "$config" ] || continue
    site="$(dirname "$config")"
    sites="$sites ${site#"$repo"/}"
    [ -x "$site/node_modules/.bin/openflow" ] || unlinked="$unlinked ${site#"$repo"/}"
  done
  if [ -n "$unlinked" ]; then
    context "OpenFlow : site(s) pas encore reliés aux paquets du dépôt :$unlinked. Exécute « pnpm install » à la racine du dépôt ($repo)."
  elif [ -n "$sites" ]; then
    context "OpenFlow : dépôt prêt ($repo). Sites :$sites. Un nouveau site se crée avec le skill openflow-new-site."
  fi
  exit 0
fi

# The edited file: `file_path` (Claude Code, Cursor), `path` (Copilot CLI) or the first file of a
# Codex patch. Then the working directory and its sub-directories (a site just created, or the
# sites/ folder of a repository cloned in the project).
file="$(field file_path)"
[ -n "$file" ] || file="$(field path)"
[ -n "$file" ] || file="$(printf '%s' "$input" | sed -n -E 's/.*\*\*\* (Add|Update) File: ([^\\"]*).*/\2/p' | head -n 1)"
case "$file" in
"" | /*) ;;
*) file="$start/$file" ;;
esac
cli=""
if [ -n "$file" ]; then cli="$(find_cli "$(dirname "$file")")"; fi
if [ -z "$cli" ]; then cli="$(find_cli "$start")"; fi
if [ -z "$cli" ]; then
  for sub in "$start"/*/ "$start"/*/*/ "$start"/*/sites/*/; do
    [ -d "$sub" ] || continue
    if [ -x "${sub}node_modules/.bin/openflow" ]; then
      cli="${sub}node_modules/.bin/openflow"
      break
    fi
  done
fi
[ -n "$cli" ] || exit 0
printf '%s' "$input" | "$cli" hook "$event" --source plugin --client "$client"
