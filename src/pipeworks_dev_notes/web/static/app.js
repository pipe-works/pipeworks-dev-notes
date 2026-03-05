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
const previewToc = document.querySelector("#preview-toc");
const formatTablesBtn = document.querySelector("#format-tables-btn");
const fixImagesBtn = document.querySelector("#fix-images-btn");
const indexView = document.querySelector("#index-view");
const noteForm = document.querySelector("#note-form");

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
let activeFilePath = null;
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
  if (activeFilePath) {
    return JSON.stringify({ content: fieldContent.value });
  }
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

/* ── Fix Images ────────────────────────────────────────────────── */

function fixImageLinks(text) {
  // Convert Obsidian ![[file.png]] to standard ![file.png](file.png)
  return text.replace(/!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp|svg))\]\]/gi, "![$1]($1)");
}

function onFixImages() {
  const before = fieldContent.value;
  const after = fixImageLinks(before);
  if (after !== before) {
    fieldContent.value = after;
    checkUnsavedChanges();
    const count = (before.match(/!\[\[/g) || []).length;
    setStatus(`Fixed ${count} image link(s).`);
  } else {
    setStatus("No Obsidian-style image links to fix.");
  }
}

/* ── Markdown Preview ──────────────────────────────────────────── */

function currentImageBase() {
  if (activeFilePath) {
    const parts = activeFilePath.split("/");
    parts.pop();
    return parts.join("/");
  }
  if (activeNoteId) {
    const parts = activeNoteId.split("/");
    parts.pop();
    return parts.join("/");
  }
  return "";
}

function resolveImageSrc(src) {
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/")) {
    return src;
  }
  const base = currentImageBase();
  const path = base ? `${base}/${src}` : src;
  return `/api/workspace/image/${encodeNoteId(path)}`;
}

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
  const tables = [];
  let i = 0;

  while (i < srcLines.length) {
    if (
      srcLines[i].includes("|") &&
      i + 1 < srcLines.length &&
      srcLines[i + 1].includes("|")
    ) {
      const tableResult = renderMarkdownTable(srcLines, i);
      if (tableResult) {
        const placeholder = `MKTBL${tables.length}MKTBL`;
        processed.push(placeholder);
        tables.push(tableResult.html);
        i = tableResult.endIdx;
        continue;
      }
    }
    processed.push(srcLines[i]);
    i++;
  }

  let html = escapeHtml(processed.join("\n"));

  // Restore tables (placeholders survive escapeHtml since they're plain alphanumeric)
  for (let t = 0; t < tables.length; t++) {
    html = html.replace(`MKTBL${t}MKTBL`, tables[t]);
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

  // Images: standard ![alt](src)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
    const resolved = resolveImageSrc(src);
    return `<img src="${resolved}" alt="${alt}" class="markdown-img">`;
  });

  // Images: Obsidian ![[file.png]]
  html = html.replace(/!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp|svg))\]\]/gi, (_m, file) => {
    const resolved = resolveImageSrc(file);
    return `<img src="${resolved}" alt="${file}" class="markdown-img">`;
  });

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

function buildToc(container) {
  previewToc.innerHTML = "";
  const headings = container.querySelectorAll("h1, h2, h3, h4");
  if (!headings.length) return;

  const list = document.createElement("ul");
  list.className = "toc-list";

  headings.forEach((heading, idx) => {
    const id = `preview-heading-${idx}`;
    heading.id = id;

    const li = document.createElement("li");
    const link = document.createElement("a");
    link.className = `toc-link toc-link--${heading.tagName.toLowerCase()}`;
    link.textContent = heading.textContent;
    link.addEventListener("click", () => {
      heading.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    li.appendChild(link);
    list.appendChild(li);
  });

  previewToc.appendChild(list);
}

function openPreview() {
  previewContent.innerHTML = renderMarkdown(fieldContent.value);
  buildToc(previewContent);
  previewModal.hidden = false;
}

function closePreview() {
  previewModal.hidden = true;
  previewContent.innerHTML = "";
  previewToc.innerHTML = "";
}

/* ── Index / Editor View Toggle ─────────────────────────────────── */

function showIndexView() {
  indexView.hidden = false;
  noteMetaDetails.style.display = "none";
  noteForm.style.display = "none";
  saveNoteButton.style.display = "none";
  closeNoteButton.style.display = "none";
  noteTitle.textContent = "Shared Notes Index";
}

function showEditorView() {
  indexView.hidden = true;
  noteMetaDetails.style.display = "";
  noteForm.style.display = "";
  noteFieldsDetails.style.display = "";
  saveNoteButton.style.display = "";
}

function showFileReadOnlyView(title) {
  indexView.hidden = false;
  noteMetaDetails.style.display = "none";
  noteForm.style.display = "none";
  saveNoteButton.style.display = "none";
  closeNoteButton.style.display = "";
  noteTitle.textContent = title;
}

function showFileEditorView(title) {
  indexView.hidden = true;
  noteMetaDetails.style.display = "none";
  noteForm.style.display = "";
  noteFieldsDetails.style.display = "none";
  saveNoteButton.style.display = "";
  closeNoteButton.style.display = "";
  noteTitle.textContent = title;
}

async function loadFileContent(filePath) {
  const fileName = filePath.split("/").pop();
  setStatus(`Loading ${filePath}...`);
  try {
    const resp = await fetch(
      `/api/workspace/file/${encodeNoteId(filePath)}`
    );
    if (!resp.ok) {
      showFileReadOnlyView(fileName);
      indexView.innerHTML = "<p>Failed to load file.</p>";
      setStatus(`Failed to load ${filePath}`);
      return;
    }
    const text = await resp.text();

    if (filePath.endsWith(".md")) {
      activeNoteId = null;
      activeFilePath = filePath;
      showFileEditorView(fileName);
      fieldContent.value = text;
      savedSnapshot = null;
      takeSavedSnapshot();
      setStatus(`Editing ${filePath}`);
    } else {
      activeFilePath = null;
      showFileReadOnlyView(fileName);
      indexView.innerHTML = `<pre><code>${escapeHtml(text)}</code></pre>`;
      setStatus(`Viewing ${filePath} (read-only)`);
    }
  } catch {
    showFileReadOnlyView(fileName);
    indexView.innerHTML = "<p>Failed to load file.</p>";
    setStatus(`Failed to load ${filePath}`);
  }
}

async function loadIndexContent() {
  try {
    const resp = await fetch("/api/workspace/index/content");
    if (!resp.ok) {
      indexView.innerHTML = "<p>No INDEX.md found. Click Rebuild Index to generate.</p>";
      return;
    }
    const markdown = await resp.text();
    indexView.innerHTML = renderMarkdown(markdown);
  } catch {
    indexView.innerHTML = "<p>Failed to load INDEX.md</p>";
  }
}

indexView.addEventListener("click", (e) => {
  const link = e.target.closest("a");
  if (!link) return;
  const href = link.getAttribute("href");
  if (href && href.endsWith(".md") && !href.startsWith("http")) {
    e.preventDefault();
    loadNote(href);
  }
});

/* ── Form Operations ────────────────────────────────────────────── */

function resetFormFields() {
  activeNoteId = null;
  activeFilePath = null;
  filenameManuallyEdited = false;
  savedSnapshot = null;
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
}

function clearForm() {
  resetFormFields();
  showIndexView();
  loadIndexContent();
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
  showEditorView();
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

function createDirNode(dirPath, dirName) {
  const li = document.createElement("li");
  li.className = "repo-group collapsed";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "repo-toggle repo-toggle--sub";
  toggle.textContent = `\u25b6 \ud83d\udcc1 ${dirName}`;

  const childList = document.createElement("ul");
  childList.className = "repo-notes";
  let loaded = false;

  toggle.addEventListener("click", async () => {
    const nowCollapsed = !li.classList.contains("collapsed");
    li.classList.toggle("collapsed");
    toggle.textContent = `${nowCollapsed ? "\u25b6" : "\u25bc"} \ud83d\udcc1 ${dirName}`;

    if (!loaded && !nowCollapsed) {
      loaded = true;
      try {
        const listing = await fetchJson(
          `/api/workspace/dirlist/${encodeNoteId(dirPath)}`
        );
        for (const sub of listing.dirs) {
          childList.appendChild(createDirNode(`${dirPath}/${sub}`, sub));
        }
        const imageExts = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
        for (const file of listing.files) {
          const fli = document.createElement("li");
          const ext = file.substring(file.lastIndexOf(".")).toLowerCase();
          const fullFilePath = `${dirPath}/${file}`;

          if (imageExts.includes(ext)) {
            const wrapper = document.createElement("div");
            wrapper.className = "note-link note-link--file note-link--image";
            const label = document.createElement("span");
            label.textContent = file;
            const img = document.createElement("img");
            img.src = `/api/workspace/image/${encodeNoteId(fullFilePath)}`;
            img.alt = file;
            img.className = "tree-thumb";
            wrapper.appendChild(label);
            wrapper.appendChild(img);
            fli.appendChild(wrapper);
          } else {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "note-link note-link--file";
            btn.textContent = file;
            btn.addEventListener("click", () => loadFileContent(fullFilePath));
            fli.appendChild(btn);
          }
          childList.appendChild(fli);
        }
        if (!listing.dirs.length && !listing.files.length) {
          const empty = document.createElement("li");
          empty.className = "note-link note-link--file";
          empty.textContent = "(empty)";
          childList.appendChild(empty);
        }
      } catch {
        const err = document.createElement("li");
        err.className = "note-link note-link--file";
        err.textContent = "(failed to load)";
        childList.appendChild(err);
      }
    }
  });

  li.appendChild(toggle);
  li.appendChild(childList);
  return li;
}

async function renderTree(notes) {
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

  // Fetch top-level dir listings for all repos in parallel
  const dirlistByRepo = {};
  await Promise.all(
    sortedRepos.map(async (repo) => {
      try {
        dirlistByRepo[repo] = await fetchJson(
          `/api/workspace/dirlist/${encodeNoteId(repo)}`
        );
      } catch {
        dirlistByRepo[repo] = { dirs: [], files: [] };
      }
    })
  );

  const collapsed = getCollapsedRepos();

  for (const repo of sortedRepos) {
    const repoNotes = notesByRepo[repo] || [];
    const dirlist = dirlistByRepo[repo] || { dirs: [], files: [] };
    const isCollapsed = collapsed[repo] === true;
    const itemCount = repoNotes.length + dirlist.dirs.length;

    const group = document.createElement("li");
    group.className = "repo-group" + (isCollapsed ? " collapsed" : "");

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "repo-toggle";
    toggle.textContent = `${isCollapsed ? "\u25b6" : "\u25bc"} ${repo} (${itemCount})`;
    toggle.addEventListener("click", () => {
      const nowCollapsed = !group.classList.contains("collapsed");
      group.classList.toggle("collapsed");
      setCollapsedRepo(repo, nowCollapsed);
      toggle.textContent = `${nowCollapsed ? "\u25b6" : "\u25bc"} ${repo} (${itemCount})`;
    });
    group.appendChild(toggle);

    const itemContainer = document.createElement("ul");
    itemContainer.className = "repo-notes";

    for (const dir of dirlist.dirs) {
      itemContainer.appendChild(createDirNode(`${repo}/${dir}`, dir));
    }

    for (const note of repoNotes) {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "note-link";
      if (note.note_id === activeNoteId) {
        button.classList.add("is-active");
      }
      button.dataset.noteId = note.note_id;
      button.textContent = note.title;
      button.addEventListener("click", () => loadNote(note.note_id));
      li.appendChild(button);
      itemContainer.appendChild(li);
    }
    group.appendChild(itemContainer);
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

  // File edit mode — save raw content back to file
  if (activeFilePath) {
    isSaving = true;
    saveNoteButton.disabled = true;
    try {
      setStatus(`Saving ${activeFilePath}...`);
      const resp = await fetch(
        `/api/workspace/file/${encodeNoteId(activeFilePath)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "text/plain" },
          body: fieldContent.value,
        }
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${resp.status}`);
      }
      takeSavedSnapshot();
      setStatus(`Saved ${activeFilePath}`);
    } catch (error) {
      setStatus(`Save failed: ${error}`);
    } finally {
      isSaving = false;
      saveNoteButton.disabled = false;
    }
    return;
  }

  // Note edit mode
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
    if (!indexView.hidden) {
      await loadIndexContent();
    }
  } catch (error) {
    setStatus(`Rebuild index failed: ${error}`);
  }
}

async function startNewNote() {
  resetFormFields();
  showEditorView();
  noteTitle.textContent = "New Note";
  closeNoteButton.style.display = "";
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
  if (fixImagesBtn) fixImagesBtn.addEventListener("click", onFixImages);
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

  try {
    fetchJson("/api/version")
      .then((data) => {
        if (appVersion) appVersion.textContent = `V${data.version}`;
      })
      .catch(() => {});
    await loadWorkspaceRepos();
    await loadRepos();
    resetFormFields();
    showIndexView();
    await loadIndexContent();
    await loadNotes();
    setStatus("Ready");
  } catch (error) {
    setStatus(`Failed to load notes: ${error}`);
  }
}

init();
