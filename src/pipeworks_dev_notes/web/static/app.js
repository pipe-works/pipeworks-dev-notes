const statusText = document.querySelector("#status-text");
const noteList = document.querySelector("#note-list");
const noteTitle = document.querySelector("#note-title");
const noteMeta = document.querySelector("#note-meta");
const themeToggle = document.querySelector("#theme-toggle");
const saveNoteButton = document.querySelector("#save-note");
const newNoteButton = document.querySelector("#new-note");

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
let filenameManuallyEdited = false;

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

function renderList(notes) {
  noteList.innerHTML = "";
  if (!notes.length) {
    const empty = document.createElement("li");
    empty.textContent = "No shared note folders found.";
    noteList.appendChild(empty);
    return;
  }

  for (const note of notes) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "note-link";
    if (note.note_id === activeNoteId) {
      button.classList.add("is-active");
    }
    button.dataset.noteId = note.note_id;
    button.textContent = `${note.title} (${note.canonical_repo}/${note.filename})`;
    button.addEventListener("click", () => loadNote(note.note_id));
    li.appendChild(button);
    noteList.appendChild(li);
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

async function loadNotes() {
  const notes = await fetchJson("/api/notes");
  renderList(notes);
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
  fieldTitle.addEventListener("input", syncFilenameFromTitle);
  fieldFilename.addEventListener("input", () => {
    filenameManuallyEdited = true;
  });

  try {
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
