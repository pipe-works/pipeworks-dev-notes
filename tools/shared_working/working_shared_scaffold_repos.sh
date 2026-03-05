#!/usr/bin/env bash
set -euo pipefail

APPLY=0
REPO_ROOT=""
SHARED_DIR=""

usage() {
  cat <<'EOF'
Usage: working_shared_scaffold_repos.sh [--apply] [--repo-root <path>] [--shared-dir <path>]

Scaffolds `_working_shared/<repo_name>/` directories for all git repos under repo root.
Dry-run by default; use --apply to create directories.
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

if [[ ! -d "${REPO_ROOT}" ]]; then
  echo "Repository root not found: ${REPO_ROOT}" >&2
  exit 1
fi

if [[ "${APPLY}" -eq 1 ]]; then
  mkdir -p "${SHARED_DIR}"
fi
if [[ ! -d "${SHARED_DIR}" ]]; then
  echo "Shared directory not found: ${SHARED_DIR}" >&2
  exit 1
fi

total=0
created=0
exists=0

while IFS= read -r -d '' git_dir; do
  repo_dir="$(dirname "${git_dir}")"
  repo_name="$(basename "${repo_dir}")"
  if [[ "${repo_name}" == .* ]]; then
    continue
  fi
  target="${SHARED_DIR}/${repo_name}"
  total=$((total + 1))

  if [[ -d "${target}" ]]; then
    echo "[ok] ${target}"
    exists=$((exists + 1))
    continue
  fi

  if [[ "${APPLY}" -eq 1 ]]; then
    mkdir -p "${target}"
    echo "[add] ${target}"
    created=$((created + 1))
  else
    echo "[plan] mkdir -p ${target}"
  fi
done < <(find "${REPO_ROOT}" -mindepth 2 -maxdepth 2 -type d -name .git -print0 | sort -z)

echo
echo "Summary: total=${total}, created=${created}, existing=${exists}, apply=${APPLY}"
