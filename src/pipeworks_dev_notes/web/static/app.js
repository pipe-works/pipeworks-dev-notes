const statusText = document.querySelector("#status-text");
const noteList = document.querySelector("#note-list");
const noteTitle = document.querySelector("#note-title");
const noteMeta = document.querySelector("#note-meta");
const themeToggle = document.querySelector("#theme-toggle");
const saveNoteButton = document.querySelector("#save-note");
const newNoteButton = document.querySelector("#new-note");

const fieldSlug = document.querySelector("#field-slug");
const fieldTitle = document.querySelector("#field-title");
const fieldOwner = document.querySelector("#field-owner");
const fieldStatus = document.querySelector("#field-status");
const fieldRisk = document.querySelector("#field-risk");
const fieldCanonical = document.querySelector("#field-canonical");
const fieldReviewed = document.querySelector("#field-reviewed");
const fieldImpacted = document.querySelector("#field-impacted");
const fieldContent = document.querySelector("#field-content");

let activeSlug = null;
let isSaving = false;

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
    `Owner: ${note.owner || "(not set)"}`,
    `Status: ${note.status || "(not set)"}`,
    `Risk: ${note.breaking_change_risk || "(not set)"}`,
    `Canonical Repo: ${note.canonical_repo || "(not set)"}`,
    `Impacted: ${note.impacted_repos.length ? note.impacted_repos.join(", ") : "(none listed)"}`,
    `Last Reviewed: ${note.last_reviewed || "(not set)"}`,
  ].join(" | ");
}

function setSlugReadOnly(value) {
  fieldSlug.disabled = value;
}

function clearForm() {
  activeSlug = null;
  noteTitle.textContent = "New Note";
  noteMeta.textContent = "Create a note and save.";
  fieldSlug.value = "";
  fieldTitle.value = "";
  fieldOwner.value = "";
  fieldStatus.value = "draft";
  fieldRisk.value = "medium";
  fieldCanonical.value = "";
  fieldReviewed.value = "";
  fieldImpacted.value = "";
  fieldContent.value = "";
  setSlugReadOnly(false);
}

function payloadFromForm() {
  const impacted = fieldImpacted.value
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    slug: fieldSlug.value.trim() || null,
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

  fieldSlug.value = note.slug;
  fieldTitle.value = note.title;
  fieldOwner.value = String(metadata.owner ?? "");
  fieldStatus.value = String(metadata.status ?? "draft");
  fieldRisk.value = String(metadata.breaking_change_risk ?? "medium");
  fieldCanonical.value = String(metadata.canonical_repo ?? "");
  fieldReviewed.value = String(metadata.last_reviewed ?? "");
  fieldImpacted.value = impacted.map((value) => String(value)).join(", ");
  fieldContent.value = note.content || "";
  noteTitle.textContent = note.title;
  noteMeta.textContent = formatMeta({
    owner: fieldOwner.value,
    status: fieldStatus.value,
    breaking_change_risk: fieldRisk.value,
    canonical_repo: fieldCanonical.value,
    impacted_repos: impacted.map((value) => String(value)),
    last_reviewed: fieldReviewed.value,
  });
  setSlugReadOnly(true);
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
    if (note.slug === activeSlug) {
      button.classList.add("is-active");
    }
    button.dataset.slug = note.slug;
    button.textContent = note.title;
    button.addEventListener("click", () => loadNote(note.slug));
    li.appendChild(button);
    noteList.appendChild(li);
  }
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

async function loadNote(slug) {
  setStatus(`Loading ${slug}...`);
  const note = await fetchJson(`/api/notes/${slug}`);
  activeSlug = slug;
  fillFormFromNote(note);
  await loadNotes();
  setStatus(`Loaded ${slug}`);
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

  isSaving = true;
  saveNoteButton.disabled = true;
  try {
    if (activeSlug) {
      setStatus(`Updating ${activeSlug}...`);
      await fetchJson(`/api/notes/${activeSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await loadNote(activeSlug);
      setStatus(`Updated ${activeSlug}`);
    } else {
      setStatus("Creating note...");
      const created = await fetchJson("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await loadNote(created.slug);
      setStatus(`Created ${created.slug}`);
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

  clearForm();

  try {
    const notes = await loadNotes();
    if (notes.length) {
      await loadNote(notes[0].slug);
    } else {
      setStatus("Ready");
    }
  } catch (error) {
    setStatus(`Failed to load notes: ${error}`);
  }
}

init();
