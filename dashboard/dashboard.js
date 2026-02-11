// Scanner Dashboard — Desktop file viewer
// Reads files uploaded from mobile scanner

const SUPABASE_URL = "https://bpjmyuegaabdyfbeucox.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwam15dWVnYWFiZHlmYmV1Y294Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0OTUzNjQsImV4cCI6MjA4NjA3MTM2NH0.lyzrdJqj1-r28zb3G2K7RMvObqFkObB7fDDVE_xlcX8";

let db = null;
let allFiles = [];
let currentView = "grid";
let currentModal = null;

// ── Init ──

function initSupabase() {
  if (window.supabase && window.supabase.createClient) {
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return true;
  }
  return false;
}

async function boot() {
  if (!initSupabase()) {
    await new Promise((r) => setTimeout(r, 1000));
    if (!initSupabase()) {
      alert("Supabase gagal dimuat. Refresh halaman.");
      return;
    }
  }

  setupListeners();
  await checkAuth();
}

// ── Auth ──

async function checkAuth() {
  try {
    const { data: { session } } = await db.auth.getSession();
    if (session) showDashboard(session.user);
    else showLogin();

    db.auth.onAuthStateChange((_, session) => {
      if (session) showDashboard(session.user);
      else showLogin();
    });
  } catch (e) {
    console.error("Auth error:", e);
    showLogin();
  }
}

async function login() {
  if (!db) return alert("Supabase belum siap.");
  const { error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.href },
  });
  if (error) alert("Login error: " + error.message);
}

async function logout() {
  if (db) await db.auth.signOut();
  showLogin();
}

function showLogin() {
  document.getElementById("login-section").classList.remove("hidden");
  document.getElementById("dashboard").classList.add("hidden");
}

function showDashboard(user) {
  document.getElementById("login-section").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");

  const meta = user.user_metadata || {};
  document.getElementById("user-photo").src = meta.avatar_url || "";
  document.getElementById("user-name").textContent = meta.full_name || "User";

  window._user = user;
  loadFiles();
}

// ── Data ──

async function loadFiles() {
  if (!db || !window._user) return;

  const grid = document.getElementById("grid");
  const list = document.getElementById("list");
  grid.innerHTML = '<div class="spinner">Memuat file...</div>';
  list.innerHTML = '<div class="spinner">Memuat file...</div>';

  try {
    const { data, error } = await db
      .from("files")
      .select("*")
      .eq("user_id", window._user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    allFiles = data || [];
    renderStats();
    renderFiles();
  } catch (e) {
    console.error("Load error:", e);
    grid.innerHTML = '<div class="empty-state"><div class="icon">❌</div><h3>Error</h3><p>' + e.message + '</p></div>';
  }
}

function renderStats() {
  const total = allFiles.length;
  const bytes = allFiles.reduce((s, f) => s + (f.size || 0), 0);
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  const pct = Math.min(100, (bytes / (100 * 1024 * 1024)) * 100);
  const now = Date.now();
  const twoDays = 2 * 24 * 60 * 60 * 1000;
  const expiring = allFiles.filter((f) => new Date(f.expires_at) - now < twoDays).length;
  const today = new Date().toDateString();
  const todayCount = allFiles.filter((f) => new Date(f.created_at).toDateString() === today).length;

  document.getElementById("s-total").textContent = total;
  document.getElementById("s-storage").textContent = mb + " MB";
  document.getElementById("s-expiring").textContent = expiring;
  document.getElementById("s-today").textContent = todayCount;
  document.getElementById("storage-label").textContent = mb + " MB / 100 MB";
  document.getElementById("storage-fill").style.width = pct + "%";
}

function renderFiles() {
  const grid = document.getElementById("grid");
  const list = document.getElementById("list");

  if (allFiles.length === 0) {
    const html = `
      <div class="empty-state">
        <div class="icon">📱</div>
        <h3>Belum ada file</h3>
        <p>Upload file dari <a href="../">Scanner HP</a> untuk melihatnya di sini</p>
      </div>`;
    grid.innerHTML = html;
    list.innerHTML = html;
    return;
  }

  // Grid
  grid.innerHTML = allFiles.map((f, i) => {
    const url = getPublicUrl(f.path);
    const exp = daysLeft(f.expires_at);
    const date = fmtDate(f.created_at);
    return `
      <div class="file-card anim" style="animation-delay:${i * 0.03}s">
        <img class="thumb" src="${url}" alt="${f.filename}"
             onclick="openModal('${esc(url)}','${esc(f.filename)}','${f.id}','${esc(f.path)}')"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 75%22><rect fill=%22%23111%22 width=%22100%22 height=%2275%22/><text x=%2250%22 y=%2242%22 text-anchor=%22middle%22 fill=%22%23444%22 font-size=%2216%22>📄</text></svg>'" />
        <div class="body">
          <div class="fname" title="${f.filename}">${f.filename}</div>
          <div class="fmeta">
            <span>${fmtSize(f.size)} · ${date}</span>
            <span class="exp">⏳ ${exp}d</span>
          </div>
        </div>
        <div class="actions">
          <button onclick="downloadFile('${esc(url)}','${esc(f.filename)}')">📥 Download</button>
          <button class="del" onclick="deleteFile('${f.id}','${esc(f.path)}')">🗑️</button>
        </div>
      </div>`;
  }).join("");

  // List
  list.innerHTML = allFiles.map((f) => {
    const url = getPublicUrl(f.path);
    const exp = daysLeft(f.expires_at);
    const date = fmtDate(f.created_at, true);
    return `
      <div class="file-row" onclick="openModal('${esc(url)}','${esc(f.filename)}','${f.id}','${esc(f.path)}')">
        <img src="${url}" alt="${f.filename}"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 52 52%22><rect fill=%22%23111%22 width=%2252%22 height=%2252%22 rx=%2210%22/><text x=%2226%22 y=%2230%22 text-anchor=%22middle%22 fill=%22%23444%22 font-size=%2218%22>📄</text></svg>'" />
        <div class="info">
          <div class="name">${f.filename}</div>
          <div class="meta">${fmtSize(f.size)} · ${date} · <span class="exp">⏳ ${exp} hari lagi</span></div>
        </div>
        <div class="row-actions" onclick="event.stopPropagation()">
          <button onclick="downloadFile('${esc(url)}','${esc(f.filename)}')">📥</button>
          <button class="del" onclick="deleteFile('${f.id}','${esc(f.path)}')">🗑️</button>
        </div>
      </div>`;
  }).join("");
}

// ── Modal ──

function openModal(url, filename, id, path) {
  currentModal = { url, filename, id, path };
  document.getElementById("modal-img").src = url;
  document.getElementById("modal-name").textContent = filename;
  document.getElementById("modal").classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  document.getElementById("modal").classList.remove("show");
  document.body.style.overflow = "";
  currentModal = null;
}

// ── Actions ──

async function downloadFile(url, filename) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    window.open(url, "_blank");
  }
}

async function deleteFile(id, path) {
  if (!confirm("Hapus file ini?")) return;
  try {
    await db.storage.from("scans").remove([path]);
    await db.from("files").delete().eq("id", id);
    closeModal();
    loadFiles();
  } catch (e) {
    alert("Gagal menghapus: " + e.message);
  }
}

// ── Helpers ──

function getPublicUrl(path) {
  const { data } = db.storage.from("scans").getPublicUrl(path);
  return data.publicUrl;
}

function fmtSize(b) {
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
}

function daysLeft(exp) {
  return Math.max(0, Math.ceil((new Date(exp) - Date.now()) / 86400000));
}

function fmtDate(d, withTime) {
  const opts = { day: "numeric", month: "short", year: "numeric" };
  if (withTime) { opts.hour = "2-digit"; opts.minute = "2-digit"; }
  return new Date(d).toLocaleDateString("id-ID", opts);
}

function esc(s) {
  return String(s).replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

// ── Event Listeners ──

function setupListeners() {
  document.getElementById("login-btn").addEventListener("click", login);
  document.getElementById("logout-btn").addEventListener("click", logout);
  document.getElementById("refresh-btn").addEventListener("click", loadFiles);

  document.getElementById("btn-grid").addEventListener("click", () => {
    currentView = "grid";
    document.getElementById("btn-grid").classList.add("active");
    document.getElementById("btn-list").classList.remove("active");
    document.getElementById("grid").style.display = "";
    document.getElementById("list").style.display = "none";
  });

  document.getElementById("btn-list").addEventListener("click", () => {
    currentView = "list";
    document.getElementById("btn-list").classList.add("active");
    document.getElementById("btn-grid").classList.remove("active");
    document.getElementById("list").style.display = "";
    document.getElementById("grid").style.display = "none";
  });

  document.getElementById("modal-x").addEventListener("click", closeModal);
  document.getElementById("modal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById("modal-dl").addEventListener("click", () => {
    if (currentModal) downloadFile(currentModal.url, currentModal.filename);
  });
  document.getElementById("modal-rm").addEventListener("click", async () => {
    if (currentModal) await deleteFile(currentModal.id, currentModal.path);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

// ── Start ──
document.addEventListener("DOMContentLoaded", boot);
