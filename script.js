const config = window.APP_CONFIG || {};
const DRIVE_FOLDER_URL = config.driveFolderUrl || "";
const treeRoot = document.getElementById("treeRoot");
const searchInput = document.getElementById("searchInput");
const reportStatus = document.getElementById("reportStatus");
const tabButtons = document.querySelectorAll(".tab-button");
const tabsElement = document.querySelector(".tabs");
const dashboardView = document.getElementById("dashboardView");
const reportView = document.getElementById("reportView");
const dashboardFrame = document.getElementById("dashboardFrame");
const reportSidebar = document.getElementById("reportSidebar");
const reportPlaceholder = document.getElementById("reportPlaceholder");
const reportPreviewFrame = document.getElementById("reportPreviewFrame");
const previewTitle = document.getElementById("previewTitle");
const previewNote = document.getElementById("previewNote");
const sidebarToggle = document.getElementById("sidebarToggle");
const contentSidebarToggle = document.getElementById("contentSidebarToggle");
const contentToggleWrap = document.getElementById("contentToggleWrap");

const state = {
  documents: [],
  expanded: new Set(),
  searchTerm: "",
  selectedId: "",
  selectedUrl: "",
  selectedName: "",
  activeTab: config.tabs?.[0]?.id || "dashboard",
  isSidebarCollapsed: false,
  hasLoadedDocuments: false,
  documentsRequest: null
};

init();

async function init() {
  bindTabs();
  bindSearch();
  bindSidebarToggle();
  setupDashboard();
  renderTabs();
  window.addEventListener("resize", syncSidebarToggleContrast);
}

function bindTabs() {
  tabButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      state.activeTab = button.dataset.tab;
      await ensureReportDocumentsLoaded();
      renderTabs();
    });
  });
}

function bindSearch() {
  searchInput.addEventListener("input", (event) => {
    state.searchTerm = event.target.value.trim().toLowerCase();
    renderDocuments();
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    state.searchTerm = event.target.value.trim().toLowerCase();
    renderDocuments();
  });
}

function bindSidebarToggle() {
  [sidebarToggle, contentSidebarToggle].forEach((button) => {
    if (!button) return;

    button.addEventListener("click", () => {
      state.isSidebarCollapsed = !state.isSidebarCollapsed;
      renderSidebarState();
    });
  });
}

function renderTabs() {
  if (tabsElement) {
    tabsElement.dataset.activeTab = state.activeTab;
  }

  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === state.activeTab);
  });

  dashboardView.classList.toggle("active", state.activeTab === "dashboard");
  reportView.classList.toggle("active", state.activeTab === "report");
  renderSidebarState();
  renderPreview();
}

async function ensureReportDocumentsLoaded() {
  if (state.activeTab !== "report" || state.hasLoadedDocuments) {
    return;
  }

  if (!state.documentsRequest) {
    state.documentsRequest = loadDocuments().finally(() => {
      state.documentsRequest = null;
    });
  }

  await state.documentsRequest;
}

function renderSidebarState() {
  if (!reportView || !reportSidebar) return;

  reportView.classList.toggle("is-sidebar-collapsed", state.isSidebarCollapsed);

  if (sidebarToggle) {
    sidebarToggle.classList.toggle("is-open", state.isSidebarCollapsed);
    sidebarToggle.classList.toggle("is-close", !state.isSidebarCollapsed);
    sidebarToggle.setAttribute("aria-label", state.isSidebarCollapsed ? "Mở thanh bên" : "Đóng thanh bên");
    sidebarToggle.setAttribute("aria-expanded", String(!state.isSidebarCollapsed));
  }

  if (contentSidebarToggle) {
    contentSidebarToggle.classList.toggle("is-open", state.isSidebarCollapsed);
    contentSidebarToggle.classList.toggle("is-close", !state.isSidebarCollapsed);
    contentSidebarToggle.setAttribute("aria-label", state.isSidebarCollapsed ? "Mở thanh bên" : "Đóng thanh bên");
    contentSidebarToggle.setAttribute("aria-expanded", String(!state.isSidebarCollapsed));
  }

  if (contentToggleWrap) {
    contentToggleWrap.classList.toggle("is-hidden", !state.isSidebarCollapsed);
  }

  syncSidebarToggleContrast();
}

function syncSidebarToggleContrast() {
  [sidebarToggle, contentSidebarToggle].forEach((button) => {
    if (!button) return;
    button.classList.toggle("is-on-dark", isDarkSurface(button));
  });
}

function isDarkSurface(element) {
  const rgba = findEffectiveBackground(element);
  if (!rgba) return false;

  const [r, g, b] = rgba;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.55;
}

function findEffectiveBackground(element) {
  let current = element;

  while (current) {
    const background = window.getComputedStyle(current).backgroundColor;
    const rgba = parseRgb(background);
    if (rgba && rgba[3] > 0) {
      return rgba;
    }
    current = current.parentElement;
  }

  return [255, 255, 255, 1];
}

function parseRgb(value) {
  if (!value) return null;
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;

  const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}

function setupDashboard() {
  const dashboardUrl = decodeBase64(config.dashboardUrlEncoded || "");

  if (!dashboardUrl) {
    dashboardFrame.removeAttribute("src");
    return;
  }

  dashboardFrame.src = dashboardUrl;
}

async function loadDocuments() {
  reportStatus.textContent = "Đang tải danh sách tài liệu...";

  try {
    const data = await fetchDocumentSource();

    state.documents = normalizeDocuments(data);
    state.expanded = new Set();
    expandFolders(state.documents);
    state.hasLoadedDocuments = true;
    renderDocuments();
  } catch (error) {
    console.error(error);
    state.hasLoadedDocuments = false;
    reportStatus.textContent = "Không tải được danh sách tài liệu.";
    treeRoot.innerHTML = `<div class="placeholder-card">${escapeHtml(error.message)}</div>`;
  }
}

async function fetchDocumentSource() {
  const sheetUrl = decodeBase64(config.sheetUrlEncoded || "");

  if (sheetUrl) {
    const response = await fetch(sheetUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Không tải được Google Sheets. Mã lỗi ${response.status}.`);
    }

    const csvText = await response.text();
    const rows = parseSheetCsv(csvText);
    if (!rows.length) {
      throw new Error("Google Sheets không có dữ liệu hợp lệ.");
    }

    return rows;
  }

  const response = await fetch("files.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Không tải được files.json. Mã lỗi ${response.status}.`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("files.json phải là một mảng JSON.");
  }

  return data;
}

function parseSheetCsv(csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) return [];

  const headers = rows[0].map((value) => normalizeHeader(value));
  const hasRecognizedHeader = headers.some((header) => {
    return ["name", "ten", "title", "path", "duongdan", "folder", "url", "link", "href", "type", "loai"].includes(header);
  });

  if (!hasRecognizedHeader) {
    return rows
      .map((row) => inferCsvRow(row))
      .filter((row) => row.name || row.path || row.url);
  }

  return rows
    .slice(1)
    .map((row) => mapCsvRow(headers, row))
    .filter((row) => row.name || row.path || row.url);
}

function mapCsvRow(headers, row) {
  const entry = {};

  headers.forEach((header, index) => {
    if (!header) return;
    entry[header] = String(row[index] || "").trim();
  });

  return {
    name: entry.name || entry.ten || entry.title || "",
    path: entry.path || entry.duongdan || entry.folder || "",
    type: entry.type || entry.loai || "file",
    url: entry.url || entry.link || entry.href || ""
  };
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function inferCsvRow(row) {
  const values = row.map((cell) => String(cell || "").trim()).filter(Boolean);
  if (!values.length) {
    return { name: "", path: "", type: "file", url: "" };
  }

  const url = values.find((value) => /^https?:\/\//i.test(value)) || "";
  const textValues = values.filter((value) => value !== url);
  const path = textValues.find((value) => value.includes("/")) || "";
  const name = textValues.find((value) => value !== path) || path.split("/").pop() || getNameFromUrl(url);

  return {
    name: name || "",
    path: path || "",
    type: "file",
    url
  };
}

function getNameFromUrl(url) {
  const match = String(url || "").match(/\/d\/([^/]+)/);
  return match ? match[1] : "";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function decodeBase64(value) {
  if (!value) return "";
  try {
    return window.atob(value);
  } catch {
    return "";
  }
}

function normalizeDocuments(rows) {
  const looksLikeTable = rows.every((row) => typeof row === "object" && row && typeof row.path === "string");
  return looksLikeTable ? buildTreeFromTable(rows) : attachPaths(rows);
}

function buildTreeFromTable(rows) {
  const root = [];
  const nodeMap = new Map();

  rows.forEach((row) => {
    const rawPath = String(row.path || row.name || "").trim();
    if (!rawPath) return;

    const parts = rawPath.split("/").map((part) => part.trim()).filter(Boolean);
    let currentChildren = root;
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = index === parts.length - 1;
      const isFile = isLast && (row.type || "file") === "file";
      const nodeType = isFile ? "file" : "folder";
      const nodeId = currentPath;

      let node = nodeMap.get(nodeId);
      if (!node) {
        node = {
          id: nodeId,
          name: isLast && row.name ? row.name : part,
          type: nodeType,
          url: isFile ? row.url || "" : "",
          children: []
        };
        nodeMap.set(nodeId, node);
        currentChildren.push(node);
      }

      if (isFile) {
        node.name = row.name || part;
        node.type = "file";
        node.url = row.url || "";
      }

      currentChildren = node.children;
    });
  });

  return root;
}

function attachPaths(nodes, parent = "") {
  return nodes.map((node, index) => {
    const id = parent ? `${parent}/${index}-${node.name}` : `${index}-${node.name}`;
    return {
      ...node,
      id,
      children: Array.isArray(node.children) ? attachPaths(node.children, id) : []
    };
  });
}

function expandFolders(nodes) {
  nodes.forEach((node) => {
    if (node.type === "folder") {
      state.expanded.add(node.id);
      expandFolders(node.children);
    }
  });
}

function renderDocuments() {
  const filtered = filterNodes(state.documents, state.searchTerm);
  const summary = countFiles(filtered);

  reportStatus.textContent = state.searchTerm
    ? (summary.total ? `Tìm thấy ${summary.total} mục phù hợp.` : "Không có tài liệu phù hợp.")
    : "";

  if (!filtered.length) {
    treeRoot.innerHTML = '<div class="placeholder-card">Không có tài liệu để hiển thị.</div>';
    return;
  }

  treeRoot.innerHTML = "";
  const fragment = document.createDocumentFragment();
  filtered.forEach((node) => {
    fragment.appendChild(createNode(node, 0, Boolean(state.searchTerm)));
  });
  treeRoot.appendChild(fragment);
}

function createNode(node, level, forceExpanded) {
  const wrapper = document.createElement("div");
  wrapper.className = "tree-node";
  wrapper.style.setProperty("--level", level);

  const row = document.createElement("div");
  row.className = "tree-row";
  if (state.selectedId === node.id) {
    row.classList.add("is-selected");
  }

  const hasChildren = node.type === "folder" && node.children.length > 0;
  const isExpanded = forceExpanded || state.expanded.has(node.id);

  const caret = document.createElement("span");
  caret.className = "tree-caret";
  caret.textContent = "▸";
  if (!hasChildren) {
    caret.classList.add("is-empty");
  } else if (isExpanded) {
    caret.classList.add("is-open");
  }

  const icon = document.createElement("span");
  icon.className = "tree-icon";
  icon.innerHTML = getNodeIcon(node);

  const label = document.createElement("span");
  label.className = "tree-label";
  label.textContent = node.name;

  const meta = document.createElement("span");
  meta.className = "tree-meta";
  meta.textContent = node.type === "folder" ? `${node.children.length} mục` : getFileExtension(node.name);

  row.append(caret, icon, label, meta);
  row.addEventListener("click", () => handleNodeClick(node));
  wrapper.appendChild(row);

  if (hasChildren) {
    const children = document.createElement("div");
    children.className = "tree-children";
    if (!isExpanded) {
      children.classList.add("is-collapsed");
    }

    const inner = document.createElement("div");
    inner.className = "tree-children-inner";

    node.children.forEach((child) => {
      inner.appendChild(createNode(child, level + 1, forceExpanded));
    });

    children.appendChild(inner);
    wrapper.appendChild(children);
  }

  return wrapper;
}

function handleNodeClick(node) {
  state.selectedId = node.id;

  if (node.type === "folder") {
    if (state.expanded.has(node.id)) {
      state.expanded.delete(node.id);
    } else {
      state.expanded.add(node.id);
    }
    renderDocuments();
    return;
  }

  state.selectedUrl = normalizePreviewUrl(node.url || "");
  state.selectedName = node.name || "Tài liệu";
  renderDocuments();
  renderPreview();
}

function filterNodes(nodes, term) {
  return nodes.map((node) => filterNode(node, term)).filter(Boolean);
}

function filterNode(node, term) {
  const matches = !term || String(node.name).toLowerCase().includes(term);

  if (node.type === "folder") {
    const children = node.children.map((child) => filterNode(child, term)).filter(Boolean);
    if (matches || children.length > 0 || !term) {
      return { ...node, children };
    }
    return null;
  }

  return matches || !term ? node : null;
}

function countFiles(nodes) {
  const summary = { total: 0 };
  nodes.forEach((node) => {
    summary.total += 1;
    if (node.children?.length) {
      summary.total += countFiles(node.children).total;
    }
  });
  return summary;
}

function getNodeIcon(node) {
  if (node.type === "folder") return "▸";
  return "▦";
}

function getFileExtension(name) {
  const lower = String(name || "").toLowerCase();
  const index = lower.lastIndexOf(".");
  return index >= 0 ? lower.slice(index) : "file";
}

function normalizePreviewUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";

  if (value.includes("docs.google.com/spreadsheets") && value.includes("/edit")) {
    return value.replace("/edit", "/preview");
  }

  if (value.includes("docs.google.com/document") && value.includes("/edit")) {
    return value.replace("/edit", "/preview");
  }

  return value;
}

function renderPreview() {
  if (!reportPreviewFrame || !reportPlaceholder || !previewTitle || !previewNote) {
    return;
  }

  if (!state.selectedUrl) {
    previewTitle.textContent = "Danh sách tài liệu";
    previewNote.textContent = "";
    reportPreviewFrame.classList.remove("is-visible");
    reportPreviewFrame.removeAttribute("src");
    reportPlaceholder.classList.remove("is-hidden");
    return;
  }

  previewTitle.textContent = state.selectedName || "Xem tài liệu";
  previewNote.textContent = "";
  reportPreviewFrame.src = state.selectedUrl;
  reportPreviewFrame.classList.add("is-visible");
  reportPlaceholder.classList.add("is-hidden");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
