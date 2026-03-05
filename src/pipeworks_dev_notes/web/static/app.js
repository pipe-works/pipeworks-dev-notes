const statusText = document.querySelector("#status-text");
const noteList = document.querySelector("#note-list");
const noteTitle = document.querySelector("#note-title");
const noteMeta = document.querySelector("#note-meta");
const themeToggle = document.querySelector("#theme-toggle");
const saveNoteButton = document.querySelector("#save-note");
const newNoteButton = document.querySelector("#new-note");
const scaffoldButton = document.querySelector("#scaffold-btn");

const fieldFilename = document.querySelector("#field-filename");
const fieldTitle = document.querySelector("#field-title");
const fieldOwner = document.querySelector("#field-owner");
const fieldStatus = document.querySelector("#field-status");
const fieldRisk = document.querySelector("#field-risk");
const fieldCanonical = document.querySelector("#field-canonical");
const fieldReviewed = document.querySelector("#field-reviewed");
const fieldImpacted = document.querySelector("#field-impacted");
const fieldContent = document.querySelector("#field-content");

let activeNoteId = null;
let isSaving = false;
let canonicalRepos = [];
let workspaceRepos = { discovered: [], scaffolded: [] };
let filenameManuallyEdited = false;
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
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  localStorage.setItem("pipeworks-dev-notes-theme", theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  setTheme(current === "light" ? "dark" : "light");
}

function formatMeta(note) {
  return [
    `Note ID: ${note.note_id || "(not set)"}`,
    `Filename: ${note.filename || "(not set)"}`,
    `Owner: ${note.owner || "(not set)"}`,
    `Status: ${note.status || "(not set)"}`,
    `Risk: ${note.breaking_change_risk || "(not set)"}`,
    `Canonical Repo: ${note.canonical_repo || "(not set)"}`,
    `Impacted: ${note.impacted_repos.length ? note.impacted_repos.join(", ") : "(none listed)"}`,
    `Last Reviewed: ${note.last_reviewed || "(not set)"}`,
  ].join(" | ");
}

function clearForm() {
  activeNoteId = null;
  filenameManuallyEdited = false;
  noteTitle.textContent = "New Note";
  noteMeta.textContent = "Create a note and save.";
  fieldFilename.value = "";
  fieldTitle.value = "";
  fieldOwner.value = "";
  fieldStatus.value = "draft";
  fieldRisk.value = "medium";
  fieldReviewed.value = "";
  fieldImpacted.value = "";
  fieldContent.value = "";
  if (canonicalRepos.length) {
    fieldCanonical.value = canonicalRepos[0];
  } else {
    fieldCanonical.value = "";
  }
  setIdentityFieldsReadOnly(false);
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
  const impacted = fieldImpacted.value
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    filename: ensureMdExtension(fieldFilename.value) || null,
    title: fieldTitle.value.trim(),
    content: fieldContent.value,
    owner: fieldOwner.value.trim(),
    status: fieldStatus.value.trim() || "draft",
    breaking_change_risk: fieldRisk.value.trim() || "medium",
    canonical_repo: fieldCanonical.value.trim(),
    impacted_repos: impacted,
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
  fieldImpacted.value = impacted.map((value) => String(value)).join(", ");
  fieldContent.value = note.content || "";
  noteTitle.textContent = note.title;
  noteMeta.textContent = formatMeta({
    note_id: note.note_id,
    filename: note.filename,
    owner: fieldOwner.value,
    status: fieldStatus.value,
    breaking_change_risk: fieldRisk.value,
    canonical_repo: fieldCanonical.value,
    impacted_repos: impacted.map((value) => String(value)),
    last_reviewed: fieldReviewed.value,
  });
  setIdentityFieldsReadOnly(true);
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

async function startNewNote() {
  clearForm();
  await loadNotes();
  setStatus("New note mode");
}

async function init() {
  const savedTheme = localStorage.getItem("pipeworks-dev-notes-theme");
  setTheme(savedTheme || "dark");
  themeToggle.addEventListener("click", toggleTheme);
  saveNoteButton.addEventListener("click", saveCurrentNote);
  newNoteButton.addEventListener("click", startNewNote);
  if (scaffoldButton) {
    scaffoldButton.addEventListener("click", scaffoldWorkspace);
  }
  fieldTitle.addEventListener("input", syncFilenameFromTitle);
  fieldFilename.addEventListener("input", () => {
    filenameManuallyEdited = true;
  });

  try {
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
