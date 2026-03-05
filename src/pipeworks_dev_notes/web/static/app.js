const statusText = document.querySelector("#status-text");
const noteList = document.querySelector("#note-list");
const noteTitle = document.querySelector("#note-title");
const themeToggle = document.querySelector("#theme-toggle");
const saveNoteButton = document.querySelector("#save-note");
const closeNoteButton = document.querySelector("#close-note");
const newNoteButton = document.querySelector("#new-note");
const scaffoldButton = document.querySelector("#scaffold-btn");
const rebuildIndexButton = document.querySelector("#rebuild-index-btn");
const appVersion = document.querySelector("#app-version");
const noteMetaDetails = document.querySelector("#note-meta-details");
const noteFieldsDetails = document.querySelector("#note-fields-details");
const previewBtn = document.querySelector("#preview-btn");
const previewModal = document.querySelector("#preview-modal");
const previewClose = document.querySelector("#preview-close");
const previewContent = document.querySelector("#preview-content");
const previewBackdrop = previewModal ? previewModal.querySelector(".modal__backdrop") : null;
const formatTablesBtn = document.querySelector("#format-tables-btn");

const metaNoteId = document.querySelector("#meta-note-id");
const metaFilename = document.querySelector("#meta-filename");
const metaOwner = document.querySelector("#meta-owner");
const metaStatus = document.querySelector("#meta-status");
const metaRisk = document.querySelector("#meta-risk");
const metaRepo = document.querySelector("#meta-repo");
const metaImpacted = document.querySelector("#meta-impacted");
const metaReviewed = document.querySelector("#meta-reviewed");

const fieldFilename = document.querySelector("#field-filename");
const fieldTitle = document.querySelector("#field-title");
const fieldOwner = document.querySelector("#field-owner");
const fieldStatus = document.querySelector("#field-status");
const fieldRisk = document.querySelector("#field-risk");
const fieldCanonical = document.querySelector("#field-canonical");
const fieldReviewed = document.querySelector("#field-reviewed");
const fieldContent = document.querySelector("#field-content");
const impactedTagList = document.querySelector("#impacted-tag-list");
const impactedSelect = document.querySelector("#field-impacted-select");

let activeNoteId = null;
let isSaving = false;
let canonicalRepos = [];
let workspaceRepos = { discovered: [], scaffolded: [] };
let filenameManuallyEdited = false;
let savedSnapshot = null;
let selectedImpactedRepos = [];
const COLLAPSED_KEY = "pipeworks-dev-notes-collapsed";

function getCollapsedRepos() {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY)) || {};
  } catch {
    return {};
  }
}

function setCollapsedRepo(repo, collapsed) {
  const state = getCollapsedRepos();
  state[repo] = collapsed;
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify(state));
}

function setStatus(text) {
  statusText.textContent = text;
}

function setTheme(theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
    themeToggle.textContent = "\u25d1 Light";
  } else {
    document.documentElement.removeAttribute("data-theme");
    themeToggle.textContent = "\u25d1 Dark";
  }
  localStorage.setItem("pipeworks-dev-notes-theme", theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  setTheme(current === "light" ? "dark" : "light");
}

function updateMetaTable(data) {
  metaNoteId.textContent = data.note_id || "-";
  metaFilename.textContent = data.filename || "-";
  metaOwner.textContent = data.owner || "-";
  metaStatus.textContent = data.status || "-";
  metaRisk.textContent = data.breaking_change_risk || "-";
  metaRepo.textContent = data.canonical_repo || "-";
  metaImpacted.textContent =
    data.impacted_repos && data.impacted_repos.length
      ? data.impacted_repos.join(", ")
      : "(none)";
  metaReviewed.textContent = data.last_reviewed || "-";
}

function clearMetaTable() {
  metaNoteId.textContent = "-";
  metaFilename.textContent = "-";
  metaOwner.textContent = "-";
  metaStatus.textContent = "-";
  metaRisk.textContent = "-";
  metaRepo.textContent = "-";
  metaImpacted.textContent = "-";
  metaReviewed.textContent = "-";
}

/* ── Impacted Repos Tag Picker ──────────────────────────────────── */

function renderImpactedTags() {
  impactedTagList.innerHTML = "";
  for (const repo of selectedImpactedRepos) {
    const tag = document.createElement("span");
    tag.className = "tag-picker__tag";
    tag.textContent = repo;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "tag-picker__remove";
    removeBtn.textContent = "\u00d7";
    removeBtn.addEventListener("click", () => {
      selectedImpactedRepos = selectedImpactedRepos.filter((r) => r !== repo);
      renderImpactedTags();
      updateImpactedSelect();
      checkUnsavedChanges();
    });
    tag.appendChild(removeBtn);
    impactedTagList.appendChild(tag);
  }
}

function updateImpactedSelect() {
  impactedSelect.innerHTML = '<option value="">+ Add repo...</option>';
  const allRepos = [
    ...new Set([...canonicalRepos, ...workspaceRepos.discovered]),
  ].sort();
  for (const repo of allRepos) {
    if (selectedImpactedRepos.includes(repo)) continue;
    const option = document.createElement("option");
    option.value = repo;
    option.textContent = repo;
    impactedSelect.appendChild(option);
  }
}

function onImpactedSelectChange() {
  const value = impactedSelect.value;
  if (!value) return;
  if (!selectedImpactedRepos.includes(value)) {
    selectedImpactedRepos.push(value);
    selectedImpactedRepos.sort();
    renderImpactedTags();
    updateImpactedSelect();
    checkUnsavedChanges();
  }
  impactedSelect.value = "";
}

/* ── Unsaved Changes Tracking ───────────────────────────────────── */

function currentFormSnapshot() {
  return JSON.stringify({
    title: fieldTitle.value,
    filename: fieldFilename.value,
    owner: fieldOwner.value,
    status: fieldStatus.value,
    risk: fieldRisk.value,
    canonical: fieldCanonical.value,
    reviewed: fieldReviewed.value,
    impacted: [...selectedImpactedRepos],
    content: fieldContent.value,
  });
}

function takeSavedSnapshot() {
  savedSnapshot = currentFormSnapshot();
  saveNoteButton.classList.remove("is-modified");
}

function checkUnsavedChanges() {
  if (!savedSnapshot) {
    saveNoteButton.classList.remove("is-modified");
    return;
  }
  if (currentFormSnapshot() !== savedSnapshot) {
    saveNoteButton.classList.add("is-modified");
  } else {
    saveNoteButton.classList.remove("is-modified");
  }
}

/* ── Table Formatter ───────────────────────────────────────────── */

function isTableSeparator(row) {
  return row.every((cell) => /^[-: ]+$/.test(cell));
}

function parseTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

function formatMarkdownTables(text) {
  const MAX_COL_WIDTH = 40;
  const lines = text.split("\n");
  const result = [];
  let i = 0;

  while (i < lines.length) {
    if (
      lines[i].includes("|") &&
      i + 1 < lines.length &&
      lines[i + 1].includes("|")
    ) {
      const headerCells = parseTableRow(lines[i]);
      const sepCells = parseTableRow(lines[i + 1]);

      if (isTableSeparator(sepCells)) {
        const rows = [headerCells];
        const separators = [sepCells];
        let j = i + 2;
        while (j < lines.length && lines[j].includes("|")) {
          const cells = parseTableRow(lines[j]);
          if (isTableSeparator(cells)) break;
          rows.push(cells);
          j++;
        }

        const colCount = Math.max(
          headerCells.length,
          ...rows.map((r) => r.length)
        );
        for (const row of rows) {
          while (row.length < colCount) row.push("");
        }
        while (separators[0].length < colCount) separators[0].push("---");

        // Calculate widths capped at MAX_COL_WIDTH
        const widths = [];
        for (let c = 0; c < colCount; c++) {
          let max = 3;
          for (const row of rows) {
            max = Math.max(max, (row[c] || "").length);
          }
          widths.push(Math.min(max, MAX_COL_WIDTH));
        }

        const pad = (str, w) =>
          str.length >= w ? str : str + " ".repeat(w - str.length);
        const renderRow = (cells) =>
          "| " + cells.map((c, idx) => pad(c || "", widths[idx])).join(" | ") + " |";

        result.push(renderRow(rows[0]));

        const sepFormatted = separators[0].map((sep, idx) => {
          const w = widths[idx];
          const left = sep.startsWith(":");
          const right = sep.endsWith(":");
          if (left && right) return ":" + "-".repeat(w - 2) + ":";
          if (right) return "-".repeat(w - 1) + ":";
          if (left) return ":" + "-".repeat(w - 1);
          return "-".repeat(w);
        });
        result.push("| " + sepFormatted.join(" | ") + " |");

        for (let r = 1; r < rows.length; r++) {
          result.push(renderRow(rows[r]));
        }

        i = j;
        continue;
      }
    }

    result.push(lines[i]);
    i++;
  }

  return result.join("\n");
}

function onFormatTables() {
  const before = fieldContent.value;
  const after = formatMarkdownTables(before);
  if (after !== before) {
    fieldContent.value = after;
    checkUnsavedChanges();
    setStatus("Tables formatted.");
  } else {
    setStatus("No tables to format.");
  }
}

/* ── Markdown Preview ──────────────────────────────────────────── */

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdownTable(lines, startIdx) {
  const header = parseTableRow(lines[startIdx]);
  const sep = parseTableRow(lines[startIdx + 1]);
  if (!isTableSeparator(sep)) return null;

  const rows = [];
  let j = startIdx + 2;
  while (j < lines.length && lines[j].includes("|")) {
    const cells = parseTableRow(lines[j]);
    if (isTableSeparator(cells)) break;
    rows.push(cells);
    j++;
  }

  let html = "<table><thead><tr>";
  for (const cell of header) {
    html += `<th>${cell}</th>`;
  }
  html += "</tr></thead><tbody>";
  for (const row of rows) {
    html += "<tr>";
    for (let c = 0; c < header.length; c++) {
      html += `<td>${row[c] || ""}</td>`;
    }
    html += "</tr>";
  }
  html += "</tbody></table>";
  return { html, endIdx: j };
}

function renderMarkdown(src) {
  // Process line-by-line to handle tables before escaping
  const srcLines = src.split("\n");
  const processed = [];
  let i = 0;

  while (i < srcLines.length) {
    // Check for table
    if (
      srcLines[i].includes("|") &&
      i + 1 < srcLines.length &&
      srcLines[i + 1].includes("|")
    ) {
      const tableResult = renderMarkdownTable(srcLines, i);
      if (tableResult) {
        // Escape cell contents within the already-built table
        processed.push("\x00TABLE\x00" + processed.length);
        processed._tables = processed._tables || [];
        processed._tables.push(tableResult.html);
        i = tableResult.endIdx;
        continue;
      }
    }
    processed.push(srcLines[i]);
    i++;
  }

  const tables = processed._tables || [];
  let html = escapeHtml(processed.join("\n"));

  // Restore tables (they were replaced with placeholders)
  for (let t = 0; t < tables.length; t++) {
    html = html.replace(`\x00TABLE\x00${t}`, tables[t]);
  }

  // Fenced code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    return `<pre><code>${code}</code></pre>`;
  });

  // Inline code (after fenced blocks to avoid conflicts)
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // Headings
  html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
  html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

  // Horizontal rules
  html = html.replace(/^---+$/gm, "<hr>");

  // Blockquotes
  html = html.replace(/^&gt;\s?(.*)$/gm, "<blockquote>$1</blockquote>");
  html = html.replace(/<\/blockquote>\n<blockquote>/g, "\n");

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>'
  );

  // Unordered lists
  html = html.replace(/(^[\t ]*[-*]\s+.+(\n|$))+/gm, (block) => {
    const items = block
      .trim()
      .split("\n")
      .map((line) => `<li>${line.replace(/^[\t ]*[-*]\s+/, "")}</li>`)
      .join("\n");
    return `<ul>${items}</ul>\n`;
  });

  // Ordered lists
  html = html.replace(/(^\d+\.\s+.+(\n|$))+/gm, (block) => {
    const items = block
      .trim()
      .split("\n")
      .map((line) => `<li>${line.replace(/^\d+\.\s+/, "")}</li>`)
      .join("\n");
    return `<ol>${items}</ol>\n`;
  });

  // Paragraphs: wrap remaining bare lines
  html = html
    .split("\n\n")
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (/^<(h[1-6]|ul|ol|pre|blockquote|hr|table)/.test(trimmed)) return trimmed;
      return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");

  return html;
}

function openPreview() {
  previewContent.innerHTML = renderMarkdown(fieldContent.value);
  previewModal.hidden = false;
}

function closePreview() {
  previewModal.hidden = true;
  previewContent.innerHTML = "";
}

/* ── Form Operations ────────────────────────────────────────────── */

function clearForm() {
  activeNoteId = null;
  filenameManuallyEdited = false;
  savedSnapshot = null;
  noteTitle.textContent = "New Note";
  clearMetaTable();
  noteMetaDetails.open = false;
  fieldFilename.value = "";
  fieldTitle.value = "";
  fieldOwner.value = "";
  fieldStatus.value = "draft";
  fieldRisk.value = "medium";
  fieldReviewed.value = "";
  fieldContent.value = "";
  selectedImpactedRepos = [];
  renderImpactedTags();
  updateImpactedSelect();
  if (canonicalRepos.length) {
    fieldCanonical.value = canonicalRepos[0];
  } else {
    fieldCanonical.value = "";
  }
  setIdentityFieldsReadOnly(false);
  saveNoteButton.classList.remove("is-modified");
  closeNoteButton.style.display = "none";
}

function setIdentityFieldsReadOnly(value) {
  fieldCanonical.disabled = value;
  fieldFilename.disabled = value;
}

function slugFromText(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function ensureMdExtension(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`;
}

function syncFilenameFromTitle() {
  if (filenameManuallyEdited || activeNoteId) {
    return;
  }
  const slug = slugFromText(fieldTitle.value);
  fieldFilename.value = slug ? `${slug}.md` : "";
}

function payloadFromForm() {
  return {
    filename: ensureMdExtension(fieldFilename.value) || null,
    title: fieldTitle.value.trim(),
    content: fieldContent.value,
    owner: fieldOwner.value.trim(),
    status: fieldStatus.value.trim() || "draft",
    breaking_change_risk: fieldRisk.value.trim() || "medium",
    canonical_repo: fieldCanonical.value.trim(),
    impacted_repos: [...selectedImpactedRepos],
    last_reviewed: fieldReviewed.value.trim(),
  };
}

function fillFormFromNote(note) {
  const metadata = note.metadata || {};
  const impacted = Array.isArray(metadata.impacted_repos) ? metadata.impacted_repos : [];

  fieldFilename.value = note.filename || "";
  fieldTitle.value = note.title;
  fieldOwner.value = String(metadata.owner ?? "");
  fieldStatus.value = String(metadata.status ?? "draft");
  fieldRisk.value = String(metadata.breaking_change_risk ?? "medium");
  fieldCanonical.value = String(note.canonical_repo ?? metadata.canonical_repo ?? "");
  fieldReviewed.value = String(metadata.last_reviewed ?? "");
  fieldContent.value = note.content || "";
  noteTitle.textContent = note.title;

  selectedImpactedRepos = impacted.map((v) => String(v)).sort();
  renderImpactedTags();
  updateImpactedSelect();

  updateMetaTable({
    note_id: note.note_id,
    filename: note.filename,
    owner: fieldOwner.value,
    status: fieldStatus.value,
    breaking_change_risk: fieldRisk.value,
    canonical_repo: fieldCanonical.value,
    impacted_repos: selectedImpactedRepos,
    last_reviewed: fieldReviewed.value,
  });
  noteMetaDetails.open = true;

  setIdentityFieldsReadOnly(true);
  closeNoteButton.style.display = "";
  takeSavedSnapshot();
}

function renderTree(notes) {
  noteList.innerHTML = "";

  const allRepos = new Set([
    ...workspaceRepos.scaffolded,
    ...notes.map((n) => n.canonical_repo),
  ]);
  const sortedRepos = [...allRepos].sort();

  if (!sortedRepos.length) {
    const empty = document.createElement("li");
    empty.textContent = "No repos found. Click Scaffold to set up.";
    noteList.appendChild(empty);
    return;
  }

  const notesByRepo = {};
  for (const note of notes) {
    if (!notesByRepo[note.canonical_repo]) {
      notesByRepo[note.canonical_repo] = [];
    }
    notesByRepo[note.canonical_repo].push(note);
  }

  const collapsed = getCollapsedRepos();

  for (const repo of sortedRepos) {
    const repoNotes = notesByRepo[repo] || [];
    const isCollapsed = collapsed[repo] === true;

    const group = document.createElement("li");
    group.className = "repo-group" + (isCollapsed ? " collapsed" : "");

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "repo-toggle";
    const count = repoNotes.length;
    toggle.textContent = `${isCollapsed ? "\u25b6" : "\u25bc"} ${repo} (${count})`;
    toggle.addEventListener("click", () => {
      const nowCollapsed = !group.classList.contains("collapsed");
      group.classList.toggle("collapsed");
      setCollapsedRepo(repo, nowCollapsed);
      toggle.textContent = `${nowCollapsed ? "\u25b6" : "\u25bc"} ${repo} (${count})`;
    });
    group.appendChild(toggle);

    const noteContainer = document.createElement("ul");
    noteContainer.className = "repo-notes";
    for (const note of repoNotes) {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "note-link";
      if (note.note_id === activeNoteId) {
        button.classList.add("is-active");
      }
      button.dataset.noteId = note.note_id;
      button.textContent = `${note.title} (${note.filename})`;
      button.addEventListener("click", () => loadNote(note.note_id));
      li.appendChild(button);
      noteContainer.appendChild(li);
    }
    group.appendChild(noteContainer);
    noteList.appendChild(group);
  }
}

function encodeNoteId(noteId) {
  return noteId
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function fetchJson(path, init = {}) {
  const response = await fetch(path, init);
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      detail = payload.detail ?? detail;
    } catch {
      detail = response.statusText || detail;
    }
    throw new Error(detail);
  }
  return response.json();
}

async function loadWorkspaceRepos() {
  try {
    workspaceRepos = await fetchJson("/api/workspace/repos");
  } catch {
    workspaceRepos = { discovered: [], scaffolded: [] };
  }
}

async function loadNotes() {
  const notes = await fetchJson("/api/notes");
  renderTree(notes);
  return notes;
}

async function loadRepos() {
  canonicalRepos = await fetchJson("/api/repos");
  fieldCanonical.innerHTML = "";
  for (const repoName of canonicalRepos) {
    const option = document.createElement("option");
    option.value = repoName;
    option.textContent = repoName;
    fieldCanonical.appendChild(option);
  }
  updateImpactedSelect();
}

async function loadNote(noteId) {
  setStatus(`Loading ${noteId}...`);
  const note = await fetchJson(`/api/notes/${encodeNoteId(noteId)}`);
  activeNoteId = note.note_id;
  filenameManuallyEdited = true;
  fillFormFromNote(note);
  await loadNotes();
  setStatus(`Loaded ${noteId}`);
}

async function closeNote() {
  clearForm();
  await loadNotes();
  setStatus("Ready");
}

async function saveCurrentNote() {
  if (isSaving) {
    return;
  }

  const payload = payloadFromForm();
  if (!payload.title) {
    setStatus("Title is required.");
    return;
  }
  if (!payload.canonical_repo) {
    setStatus("Canonical repo is required.");
    return;
  }
  if (!payload.filename) {
    setStatus("Filename is required.");
    return;
  }

  isSaving = true;
  saveNoteButton.disabled = true;
  try {
    if (activeNoteId) {
      setStatus(`Updating ${activeNoteId}...`);
      await fetchJson(`/api/notes/${encodeNoteId(activeNoteId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await loadNote(activeNoteId);
      setStatus(`Updated ${activeNoteId}`);
    } else {
      setStatus("Creating note...");
      const created = await fetchJson("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await loadNote(created.note_id);
      setStatus(`Created ${created.note_id}`);
    }
  } catch (error) {
    setStatus(`Save failed: ${error}`);
  } finally {
    isSaving = false;
    saveNoteButton.disabled = false;
  }
}

async function scaffoldWorkspace() {
  setStatus("Scaffolding workspace...");
  try {
    const result = await fetchJson("/api/workspace/scaffold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apply: true }),
    });
    const msg = result.created.length
      ? `Scaffolded ${result.created.length} repo(s): ${result.created.join(", ")}`
      : "All repos already scaffolded.";
    setStatus(msg);
    await loadWorkspaceRepos();
    await loadRepos();
    clearForm();
    await loadNotes();
  } catch (error) {
    setStatus(`Scaffold failed: ${error}`);
  }
}

async function rebuildIndex() {
  setStatus("Rebuilding INDEX.md...");
  try {
    const result = await fetchJson("/api/workspace/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apply: true }),
    });
    setStatus(
      `INDEX.md rebuilt: ${result.note_count} note(s) across ${result.repo_count} repo(s).`
    );
  } catch (error) {
    setStatus(`Rebuild index failed: ${error}`);
  }
}

async function startNewNote() {
  clearForm();
  noteMetaDetails.open = false;
  takeSavedSnapshot();
  await loadNotes();
  setStatus("New note mode");
}

async function init() {
  const savedTheme = localStorage.getItem("pipeworks-dev-notes-theme");
  setTheme(savedTheme || "dark");
  themeToggle.addEventListener("click", toggleTheme);
  saveNoteButton.addEventListener("click", saveCurrentNote);
  closeNoteButton.addEventListener("click", closeNote);
  newNoteButton.addEventListener("click", startNewNote);
  if (scaffoldButton) {
    scaffoldButton.addEventListener("click", scaffoldWorkspace);
  }
  if (rebuildIndexButton) {
    rebuildIndexButton.addEventListener("click", rebuildIndex);
  }
  impactedSelect.addEventListener("change", onImpactedSelectChange);
  if (formatTablesBtn) formatTablesBtn.addEventListener("click", onFormatTables);
  if (previewBtn) previewBtn.addEventListener("click", openPreview);
  if (previewClose) previewClose.addEventListener("click", closePreview);
  if (previewBackdrop) previewBackdrop.addEventListener("click", closePreview);
  fieldTitle.addEventListener("input", () => {
    syncFilenameFromTitle();
    checkUnsavedChanges();
  });
  fieldFilename.addEventListener("input", () => {
    filenameManuallyEdited = true;
    checkUnsavedChanges();
  });
  for (const el of [
    fieldOwner,
    fieldStatus,
    fieldRisk,
    fieldCanonical,
    fieldReviewed,
    fieldContent,
  ]) {
    el.addEventListener("input", checkUnsavedChanges);
  }

  closeNoteButton.style.display = "none";

  try {
    fetchJson("/api/version")
      .then((data) => {
        if (appVersion) appVersion.textContent = `V${data.version}`;
      })
      .catch(() => {});
    await loadWorkspaceRepos();
    await loadRepos();
    clearForm();
    const notes = await loadNotes();
    if (notes.length) {
      await loadNote(notes[0].note_id);
    } else {
      setStatus("Ready");
    }
  } catch (error) {
    setStatus(`Failed to load notes: ${error}`);
  }
}

init();
