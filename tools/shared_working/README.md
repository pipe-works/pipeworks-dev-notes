# Shared Working Tools

These scripts manage cross-repo shared notes under:

- `/Users/aapark/pipe-works-development/_working_shared`

Run from this repository:

- `/Users/aapark/pipe-works-development/pipeworks-dev-notes/tools/shared_working`

## Scripts

- `working_shared_scaffold_repos.sh`
  - Scaffolds `_working_shared/<repo_name>/` directories from detected git repos.
- `working_shared_link.sh`
  - Creates or repairs `<repo>/_working/shared` symlinks to shared root.
- `working_shared_doctor.sh`
  - Validates symlink setup and reports drift.
- `working_shared_index.sh`
  - Generates an index markdown file from shared note files.
- `working_shared_scaffold_note.sh`
  - Creates a note file template at `<canonical_repo>/<filename>.md`.

## Typical Usage

```bash
# 1) Scaffold canonical repo directories first
./tools/shared_working/working_shared_scaffold_repos.sh --apply

# 2) Ensure all repo _working/shared links are correct
./tools/shared_working/working_shared_link.sh --apply
./tools/shared_working/working_shared_doctor.sh

# 3) Create a note in canonical repo directory
./tools/shared_working/working_shared_scaffold_note.sh \
  --canonical-repo pipeworks_mud_server \
  --filename chat-user-llm-systems \
  --apply

# 4) Regenerate index
./tools/shared_working/working_shared_index.sh --apply
```

