#!/usr/bin/env sh
# Prepares an OpenFlow workspace and, optionally, creates a site in it. The OpenFlow packages are not
# published on npm: sites live in the sites/ folder of the OpenFlow repository. This script reuses the
# repository it runs in (or ./openflow), else clones it, then installs and builds the packages.
# Safe to run again: it only does what is missing.
#
#   sh openflow-init.sh [--site <folder> --name "<Site name>"] [--dir <path>] [--repo <git url>] [--ref <branch>]
#
#   --site   create the site sites/<folder> (skipped when it already exists)
#   --name   the site's name, shown on the site and in its admin
#   --dir    where the repository is, or goes (default: the repository around the current directory, else ./openflow)
#   --repo   repository to clone, e.g. an agency's private copy (default: $OPENFLOW_REPO or GitHub Firfal/openflow)
#   --ref    branch or tag to clone (default: main for the public repository)
set -eu

UPSTREAM="https://github.com/Firfal/openflow"
repo="${OPENFLOW_REPO:-$UPSTREAM}"
ref="${OPENFLOW_REF:-}"
dir=""
site=""
name=""

say() { printf '%s\n' "$*"; }
fail() {
  printf 'OpenFlow : %s\n' "$*" >&2
  exit 1
}
value() {
  [ $# -ge 2 ] && [ -n "$2" ] || fail "l'option $1 attend une valeur (voir --help)."
}

while [ $# -gt 0 ]; do
  case "$1" in
  --site | --name | --dir | --repo | --ref)
    value "$@"
    case "$1" in
    --site) site="$2" ;;
    --name) name="$2" ;;
    --dir) dir="$2" ;;
    --repo) repo="$2" ;;
    --ref) ref="$2" ;;
    esac
    shift 2
    ;;
  -h | --help)
    sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *) fail "option inconnue : $1 (voir --help)." ;;
  esac
done

# Prerequisites ---------------------------------------------------------------------------------
command -v git >/dev/null 2>&1 || fail "git est introuvable. Installez-le : https://git-scm.com/downloads"
command -v node >/dev/null 2>&1 ||
  fail "Node.js 22 ou plus est requis : https://nodejs.org (ou « nvm install 22 »)."
major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$major" -ge 22 ] ||
  fail "Node.js $major est installé, OpenFlow demande la version 22 ou plus : « nvm install 22 » ou https://nodejs.org"
if command -v pnpm >/dev/null 2>&1; then
  run_pnpm() { pnpm "$@"; }
else
  # No global pnpm: the version pinned by the repository, through npx (bundled with Node.js).
  run_pnpm() { npx --yes "pnpm@${pnpm_version:-10}" "$@"; }
fi

# The repository ---------------------------------------------------------------------------------
is_repo() { [ -f "$1/pnpm-workspace.yaml" ] && [ -f "$1/packages/cli/bin/openflow.js" ]; }
find_repo() {
  d="$1"
  while [ -n "$d" ] && [ "$d" != "/" ]; do
    if is_repo "$d"; then
      printf '%s\n' "$d"
      return 0
    fi
    d="$(dirname "$d")"
  done
  return 1
}

if [ -n "$dir" ]; then
  target="$dir"
elif found="$(find_repo "$PWD")"; then
  target="$found"
else
  target="$PWD/openflow"
fi

if ! is_repo "$target"; then
  if [ -e "$target" ] && [ -n "$(ls -A "$target" 2>/dev/null)" ]; then
    fail "le dossier $target existe déjà et ne contient pas le dépôt OpenFlow. Choisissez-en un autre avec --dir."
  fi
  if [ -z "$ref" ] && [ "${repo%.git}" = "$UPSTREAM" ]; then ref="main"; fi
  say "→ Téléchargement d'OpenFlow ($repo${ref:+, $ref}) dans $target…"
  if [ -n "$ref" ]; then
    git clone --branch "$ref" "$repo" "$target"
  else
    git clone "$repo" "$target"
  fi
fi
target="$(cd "$target" && pwd)"
cd "$target"
pnpm_version="$(node -p 'try { require("./package.json").packageManager.split("@")[1] } catch { "10" }')"

# Dependencies and packages (only when something changed) ----------------------------------------
marker="node_modules/.openflow-built"
if [ ! -f "$marker" ] || [ -n "$(find pnpm-lock.yaml packages/*/package.json packages/*/src -newer "$marker" 2>/dev/null | head -n 1)" ]; then
  say "→ Installation des dépendances (pnpm install)…"
  run_pnpm install
  say "→ Compilation des paquets OpenFlow (pnpm build)…"
  run_pnpm build
  touch "$marker"
fi

# The site ---------------------------------------------------------------------------------------
if [ -n "$site" ]; then
  case "$site" in
  sites/*) ;;
  */*) fail "--site attend un nom de dossier (il va dans sites/) : --site boulangerie" ;;
  *) site="sites/$site" ;;
  esac
  if [ -f "$site/openflow.config.tsx" ]; then
    say "→ Le site $site existe déjà : rien à créer."
  else
    if [ -n "$name" ]; then
      run_pnpm openflow create "$site" --name "$name"
    else
      run_pnpm openflow create "$site"
    fi
  fi
  if [ ! -x "$site/node_modules/.bin/openflow" ]; then
    say "→ Liaison du site aux paquets du dépôt (pnpm install)…"
    # The lockfile gains the new site (pnpm freezes it by default when CI is set).
    run_pnpm install --no-frozen-lockfile
    touch "$marker" # The lockfile now lists the site: nothing to rebuild.
  fi
fi

say ""
say "OpenFlow est prêt : $target"
if [ -n "$site" ]; then
  say "Site : $target/$site"
  say "  cd \"$target/$site\""
  say "  npx openflow check --level build   # norme OFS"
  say "  npx openflow dev                   # site + /admin sur les émulateurs (Java 21 requis)"
else
  say "Créer un site : sh \"$0\" --site <dossier> --name \"<Nom du site>\""
fi
command -v java >/dev/null 2>&1 ||
  say "Note : installez Java 21 pour prévisualiser le site avec « openflow dev » (émulateurs Firebase) : https://adoptium.net"
