#!/usr/bin/env bash
set -euo pipefail

APPLY=0
REPO_ROOT=""
SHARED_DIR=""
OUTPUT_PATH=""

usage() {
  cat <<'EOF'
Usage: working_shared_index.sh [--apply] [--repo-root <path>] [--shared-dir <path>] [--output <path>]

Builds a markdown index of shared notes in _working_shared.
Dry-run by default; use --apply to write output.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)
      APPLY=1
      shift
      ;;
    --repo-root)
      REPO_ROOT="${2:-}"
      shift 2
      ;;
    --shared-dir)
      SHARED_DIR="${2:-}"
      shift 2
      ;;
    --output)
      OUTPUT_PATH="${2:-}"
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
if [[ -z "${REPO_ROOT}" ]]; then
  REPO_ROOT="${DEFAULT_ROOT}"
fi
if [[ -z "${SHARED_DIR}" ]]; then
  SHARED_DIR="${REPO_ROOT}/_working_shared"
fi
if [[ -z "${OUTPUT_PATH}" ]]; then
  OUTPUT_PATH="${SHARED_DIR}/INDEX.md"
fi

if [[ ! -d "${SHARED_DIR}" ]]; then
  echo "Shared directory not found: ${SHARED_DIR}" >&2
  exit 1
fi

extract_frontmatter_value() {
  local key="$1"
  local file="$2"
  awk -v key="${key}" '
    BEGIN { in_fm = 0; found = 0; }
    /^---$/ {
      if (in_fm == 0) { in_fm = 1; next }
      else { exit }
    }
    in_fm == 1 && $0 ~ ("^" key ":") {
      sub("^" key ":[[:space:]]*", "", $0)
      print $0
      found = 1
      exit
    }
    END { if (found == 0) print "" }
  ' "${file}"
}

extract_title() {
  local file="$1"
  local meta_title
  meta_title="$(extract_frontmatter_value "title" "${file}")"
  if [[ -n "${meta_title}" ]]; then
    printf '%s' "${meta_title}"
    return
  fi
  awk '/^# / { sub("^# ", ""); print; exit }' "${file}"
}

tmp_file="$(mktemp)"
trap 'rm -f "${tmp_file}"' EXIT

{
  echo "# Shared Working Index"
  echo
  echo "- Generated: $(date +%F)"
  echo "- Source: \`${SHARED_DIR}\`"
  echo "- Regenerate: \`${REPO_ROOT}/pipeworks-dev-notes/tools/shared_working/working_shared_index.sh --apply\`"
  echo
  echo "| Note ID | Canonical Repo | File | Title | Owner | Status | Last Reviewed |"
  echo "|---|---|---|---|---|---|---|"

  while IFS= read -r -d '' file; do
    repo_name="$(basename "$(dirname "${file}")")"
    filename="$(basename "${file}")"
    note_id="${repo_name}/${filename}"

    if [[ "${filename}" == "README.md" ]]; then
      note_id="${repo_name}"
    fi

    title="$(extract_title "${file}")"
    owner="$(extract_frontmatter_value "owner" "${file}")"
    status="$(extract_frontmatter_value "status" "${file}")"
    reviewed="$(extract_frontmatter_value "last_reviewed" "${file}")"
    canonical_repo="$(extract_frontmatter_value "canonical_repo" "${file}")"

    if [[ -z "${title}" ]]; then title="(untitled)"; fi
    if [[ -z "${owner}" ]]; then owner="(not set)"; fi
    if [[ -z "${status}" ]]; then status="(not set)"; fi
    if [[ -z "${reviewed}" ]]; then reviewed="(not set)"; fi
    if [[ -z "${canonical_repo}" ]]; then canonical_repo="${repo_name}"; fi

    printf '| `%s` | `%s` | `%s` | %s | %s | %s | %s |\n' \
      "${note_id}" \
      "${canonical_repo}" \
      "${filename}" \
      "${title}" \
      "${owner}" \
      "${status}" \
      "${reviewed}"
  done < <(find "${SHARED_DIR}" -mindepth 2 -maxdepth 2 -type f -name "*.md" -print0 | sort -z)
} > "${tmp_file}"

if [[ "${APPLY}" -eq 1 ]]; then
  cp "${tmp_file}" "${OUTPUT_PATH}"
  echo "[ok] wrote ${OUTPUT_PATH}"
  exit 0
fi

echo "[plan] write ${OUTPUT_PATH}"
echo
cat "${tmp_file}"

