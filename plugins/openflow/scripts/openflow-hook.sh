#!/usr/bin/env sh
# Relays a Claude Code hook to the OpenFlow CLI installed in the site being edited.
# Silent (exit 0) when no OpenFlow site with an installed CLI is found, so the plugin never
# disturbs other projects. The CLI itself skips duplicates when the project declares the hooks.
event="$1"
input="$(cat)"

find_cli() {
  dir="$1"
  while [ -n "$dir" ] && [ "$dir" != "/" ]; do
    if [ -x "$dir/node_modules/.bin/openflow" ] && { [ -f "$dir/openflow.config.tsx" ] || [ -f "$dir/openflow.config.ts" ]; }; then
      echo "$dir/node_modules/.bin/openflow"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

# Edited file (PostToolUse) or working directory, then first-level sub-directories (new site).
file="$(printf '%s' "$input" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
start="${CLAUDE_PROJECT_DIR:-$PWD}"
cli=""
if [ -n "$file" ]; then cli="$(find_cli "$(dirname "$file")")"; fi
if [ -z "$cli" ]; then cli="$(find_cli "$start")"; fi
if [ -z "$cli" ]; then
  for sub in "$start"/*/ "$start"/*/*/; do
    [ -d "$sub" ] || continue
    if [ -x "${sub}node_modules/.bin/openflow" ]; then cli="${sub}node_modules/.bin/openflow"; break; fi
  done
fi
[ -n "$cli" ] || exit 0
printf '%s' "$input" | "$cli" hook "$event" --source plugin
