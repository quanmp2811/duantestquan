function decodeBase64(value) {
  if (!value) return "";

  try {
    return window.atob(value);
  } catch {
    return "";
  }
}

const SHEET_URL = decodeBase64(window.APP_CONFIG?.sheetUrlEncoded || "");
const categories = (window.APP_CONFIG?.categories || []).map((category) => ({
  ...category,
  url: decodeBase64(category.urlEncoded || "")
}));

const menu = document.querySelector(".menu");
const submenu = document.querySelector(".submenu");
const content = document.querySelector(".content");
const frame = document.getElementById("frame");
const securityOverlay = document.getElementById("securityOverlay");

let tableItems = [];
let appLocked = false;
let activeTableUrl = "";

function parseCsvLine(line) {
  const cols = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cols.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cols.push(current.trim());
  return cols;
}

function setActiveButton(container, button) {
  container.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
  if (button) button.classList.add("active");
}

function blockDevToolsShortcuts(event) {
  const key = event.key?.toUpperCase();
  const ctrlShiftCombo = event.ctrlKey && event.shiftKey && ["I", "J", "C"].includes(key);
  const ctrlOnlyCombo = event.ctrlKey && key === "U";

  if (key === "F12" || ctrlShiftCombo || ctrlOnlyCombo) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function lockApp() {
  if (appLocked) return;

  appLocked = true;
  securityOverlay.classList.add("visible");
  frame.removeAttribute("src");
  menu.innerHTML = "";
  submenu.innerHTML = "";
  submenu.classList.add("hidden");
  content.classList.remove("tables-layout");
}

function detectDevToolsByViewport() {
  const widthGap = window.outerWidth - window.innerWidth;
  const heightGap = window.outerHeight - window.innerHeight;
  return widthGap > 160 || heightGap > 160;
}

function detectDevToolsByTiming() {
  const startedAt = performance.now();
  debugger;
  return performance.now() - startedAt > 120;
}

function watchDevTools() {
  window.setInterval(() => {
    if (appLocked) return;

    if (detectDevToolsByViewport() || detectDevToolsByTiming()) {
      lockApp();
    }
  }, 1000);
}

function openUrl(url) {
  if (!url) {
    activeTableUrl = "";
    frame.removeAttribute("src");
    return;
  }

  if (url.includes("docs.google.com/spreadsheets")) {
    url = url.replace("/edit", "/preview");
  }

  if (url.includes("drive/folders")) {
    activeTableUrl = url;
    window.open(url, "_blank");
    return;
  }

  activeTableUrl = url;
  frame.src = url;
}

function renderTableButtons(searchTerm = "") {
  const list = submenu.querySelector(".submenu-list");
  if (!list) return;

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredItems = tableItems.filter((item) =>
    item.name.toLowerCase().includes(normalizedSearch)
  );

  list.innerHTML = "";

  if (!filteredItems.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "submenu-empty";
    emptyState.textContent = "Khong tim thay file phu hop.";
    list.appendChild(emptyState);
    return;
  }

  filteredItems.forEach((item, index) => {
    const btn = document.createElement("button");
    btn.innerText = item.name;
    btn.classList.toggle("active", item.url === activeTableUrl);

    btn.onclick = () => {
      setActiveButton(list, btn);
      openUrl(item.url);
    };

    list.appendChild(btn);

    if (!activeTableUrl && index === 0) {
      btn.classList.add("active");
      openUrl(item.url);
    }
  });
}

function renderTablesSubmenu() {
  submenu.innerHTML = `
    <div class="submenu-search">
      <input type="search" class="submenu-search-input" placeholder="Tim file..." aria-label="Tim file">
    </div>
    <div class="submenu-list"></div>
  `;
  content.classList.add("tables-layout");
  submenu.classList.remove("hidden");

  const searchInput = submenu.querySelector(".submenu-search-input");
  renderTableButtons();

  searchInput.addEventListener("input", (event) => {
    renderTableButtons(event.target.value);
  });
}

function activateCategory(category, button) {
  setActiveButton(menu, button);

  if (category.type === "tables") {
    renderTablesSubmenu();
    return;
  }

  content.classList.remove("tables-layout");
  submenu.classList.add("hidden");
  submenu.innerHTML = "";
  openUrl(category.url);
}

async function loadTables() {
  if (!SHEET_URL) {
    tableItems = [];
    return;
  }

  const res = await fetch(SHEET_URL);
  const text = await res.text();
  const rows = text.split(/\r?\n/).slice(1).filter(Boolean);

  tableItems = rows
    .map((row) => {
      const cols = parseCsvLine(row);
      if (!cols || cols.length < 2) return null;

      return {
        name: cols[0].replace(/^"|"$/g, "").trim(),
        url: cols[1].replace(/^"|"$/g, "").trim()
      };
    })
    .filter((item) => item && item.name && item.url);
}

async function init() {
  await loadTables();

  categories.forEach((category, index) => {
    const btn = document.createElement("button");
    btn.innerText = category.name;
    btn.onclick = () => activateCategory(category, btn);
    menu.appendChild(btn);

    if (index === 0) {
      activateCategory(category, btn);
    }
  });
}

document.addEventListener("keydown", blockDevToolsShortcuts);
document.addEventListener("contextmenu", (event) => event.preventDefault());

watchDevTools();
init();
