#!/usr/bin/env bash
set -euo pipefail

APPLY=0
FORCE=0
CANONICAL_REPO=""
FILENAME=""
TITLE=""
OWNER="${USER:-unknown}"
STATUS="draft"
RISK="medium"
IMPACTED_REPOS=""
LAST_REVIEWED="$(date +%F)"
REPO_ROOT=""
SHARED_DIR=""

usage() {
  cat <<'EOF'
Usage: working_shared_scaffold_note.sh --canonical-repo <repo> --filename <name> [options]

Scaffolds a markdown note in `_working_shared/<canonical-repo>/<filename>.md`.
Dry-run by default; use --apply to create files.

Options:
  --apply                     Create the note file.
  --force                     Overwrite existing file.
  --title <text>              Title frontmatter (default: derived from filename).
  --owner <name>              Owner metadata (default: current user).
  --status <value>            Status metadata (default: draft).
  --risk <value>              breaking_change_risk metadata (default: medium).
  --impacted <comma list>     impacted_repos metadata.
  --last-reviewed <YYYY-MM-DD>
                              last_reviewed metadata (default: today).
  --repo-root <path>          Workspace root (default: parent of this repo).
  --shared-dir <path>         Shared docs dir (default: <repo-root>/_working_shared).
  -h, --help                  Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)
      APPLY=1
      shift
      ;;
    --force)
      FORCE=1
      shift
      ;;
    --canonical-repo)
      CANONICAL_REPO="${2:-}"
      shift 2
      ;;
    --filename)
      FILENAME="${2:-}"
      shift 2
      ;;
    --title)
      TITLE="${2:-}"
      shift 2
      ;;
    --owner)
      OWNER="${2:-}"
      shift 2
      ;;
    --status)
      STATUS="${2:-}"
      shift 2
      ;;
    --risk)
      RISK="${2:-}"
      shift 2
      ;;
    --impacted)
      IMPACTED_REPOS="${2:-}"
      shift 2
      ;;
    --last-reviewed)
      LAST_REVIEWED="${2:-}"
      shift 2
      ;;
    --repo-root)
      REPO_ROOT="${2:-}"
      shift 2
      ;;
    --shared-dir)
      SHARED_DIR="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${CANONICAL_REPO}" || -z "${FILENAME}" ]]; then
  echo "--canonical-repo and --filename are required" >&2
  usage
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
if [[ -z "${REPO_ROOT}" ]]; then
  REPO_ROOT="${DEFAULT_ROOT}"
fi
if [[ -z "${SHARED_DIR}" ]]; then
  SHARED_DIR="${REPO_ROOT}/_working_shared"
fi

if [[ ! -d "${SHARED_DIR}" ]]; then
  echo "Shared directory not found: ${SHARED_DIR}" >&2
  exit 1
fi

safe_filename="${FILENAME}"
safe_filename="${safe_filename// /-}"
if [[ "${safe_filename}" != *.md ]]; then
  safe_filename="${safe_filename}.md"
fi
if [[ "${safe_filename}" == *"/"* || "${safe_filename}" == *"\\"* || "${safe_filename}" == *".."* ]]; then
  echo "Invalid filename: ${safe_filename}" >&2
  exit 1
fi

if [[ -z "${TITLE}" ]]; then
  TITLE="${safe_filename%.md}"
  TITLE="${TITLE//-/ }"
  TITLE="${TITLE//_/ }"
fi

target_dir="${SHARED_DIR}/${CANONICAL_REPO}"
target_file="${target_dir}/${safe_filename}"

if [[ "${APPLY}" -eq 0 ]]; then
  echo "[plan] mkdir -p ${target_dir}"
  echo "[plan] create ${target_file}"
  echo
  echo "Template preview:"
  echo "  canonical_repo: ${CANONICAL_REPO}"
  echo "  title: ${TITLE}"
  echo "  owner: ${OWNER}"
  echo "  status: ${STATUS}"
  echo "  breaking_change_risk: ${RISK}"
  echo "  impacted_repos: ${IMPACTED_REPOS}"
  echo "  last_reviewed: ${LAST_REVIEWED}"
  exit 0
fi

mkdir -p "${target_dir}"
if [[ -e "${target_file}" && "${FORCE}" -eq 0 ]]; then
  echo "File exists at ${target_file}; use --force to overwrite" >&2
  exit 2
fi

{
  echo "---"
  echo "title: ${TITLE}"
  echo "owner: ${OWNER}"
  echo "status: ${STATUS}"
  echo "breaking_change_risk: ${RISK}"
  echo "canonical_repo: ${CANONICAL_REPO}"
  echo "impacted_repos:"
  if [[ -n "${IMPACTED_REPOS}" ]]; then
    IFS=',' read -r -a impacted_items <<< "${IMPACTED_REPOS}"
    for item in "${impacted_items[@]}"; do
      cleaned="$(echo "${item}" | xargs)"
      if [[ -n "${cleaned}" ]]; then
        echo "  - ${cleaned}"
      fi
    done
  fi
  echo "last_reviewed: ${LAST_REVIEWED}"
  echo "---"
  echo
  echo "Describe the context, intent, and cross-repo impacts here."
} > "${target_file}"

echo "[ok] scaffold created at ${target_file}"

