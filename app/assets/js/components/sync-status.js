import { api } from "../api.js";
import { escapeHtml, formatDateTime } from "../utils.js";

function getBadgeConfig(status = {}) {
  if (!status.configured) {
    return { tone: "secondary", label: "Belum dikonfigurasi" };
  }
  if (status.isSyncing) {
    return { tone: "info", label: "Sinkronisasi..." };
  }
  if (!status.online) {
    return { tone: "warning", label: "Offline" };
  }
  if (status.authRequired) {
    return { tone: "warning", label: "Login online diperlukan" };
  }
  if (status.lastError) {
    return { tone: "danger", label: "Sync error" };
  }
  if (Number(status.pendingCount || 0) > 0) {
    return { tone: "primary", label: `${status.pendingCount} antrean` };
  }
  return { tone: "success", label: "Sinkron" };
}

function renderTopbar(status = {}) {
  const badge = getBadgeConfig(status);
  return `
    <div class="pos-sync-pill-group">
      <span class="badge badge-pill badge-${badge.tone} px-3 py-2 shadow-sm">${escapeHtml(badge.label)}</span>
      <span class="badge badge-pill badge-light px-3 py-2 shadow-sm">${escapeHtml(status.online ? "Online" : "Lokal")}</span>
    </div>
  `;
}

function renderPanel(status = {}) {
  const badge = getBadgeConfig(status);
  return `
    <div class="pos-sync-panel">
      <div class="d-flex flex-wrap align-items-start justify-content-between mb-3">
        <div>
          <div class="small text-uppercase text-muted mb-1">Status sinkronisasi</div>
          <div class="h5 mb-1 font-weight-bold text-gray-800">${escapeHtml(badge.label)}</div>
          <div class="small text-gray-600">${escapeHtml(status.online ? "Bridge GAS terjangkau." : "Aplikasi sedang berjalan lokal/offline.")}</div>
        </div>
        <button type="button" class="btn btn-primary btn-sm shadow-sm" data-sync-now ${status.isSyncing ? "disabled" : ""}>
          <i class="fas fa-sync-alt fa-sm mr-2"></i>Sync Now
        </button>
      </div>

      <div class="pos-sync-grid">
        <article class="pos-sync-metric">
          <span class="text-muted small text-uppercase d-block mb-1">Mode</span>
          <strong>${escapeHtml(status.online ? "Online" : "Offline")}</strong>
        </article>
        <article class="pos-sync-metric">
          <span class="text-muted small text-uppercase d-block mb-1">Queue</span>
          <strong>${escapeHtml(String(status.pendingCount ?? 0))}</strong>
        </article>
        <article class="pos-sync-metric">
          <span class="text-muted small text-uppercase d-block mb-1">Sync terakhir</span>
          <strong>${escapeHtml(status.lastSyncAt ? formatDateTime(status.lastSyncAt) : "-")}</strong>
        </article>
        <article class="pos-sync-metric">
          <span class="text-muted small text-uppercase d-block mb-1">Retry berikutnya</span>
          <strong>${escapeHtml(status.nextRetryAt ? formatDateTime(status.nextRetryAt) : "-")}</strong>
        </article>
      </div>

      <div class="alert alert-light border mb-0 mt-3">
        <div class="small text-uppercase text-muted mb-1">Catatan</div>
        <div class="text-gray-700">${escapeHtml(status.lastError || (status.authRequired ? "Lakukan login online sekali agar sinkronisasi bisa lanjut." : "Queue lokal siap dikirim saat koneksi tersedia."))}</div>
      </div>
    </div>
  `;
}

async function loadInitialStatus() {
  const response = await api.getSyncStatus();
  return response.data;
}

export function mountTopbarSyncStatus(root) {
  if (!root) return () => {};

  let active = true;

  const render = (status) => {
    if (!active) return;
    root.innerHTML = renderTopbar(status);
  };

  void loadInitialStatus().then(render).catch(() => {
    render({
      online: false,
      configured: false,
      pendingCount: 0,
      lastError: "Status sinkronisasi belum tersedia.",
    });
  });

  const unsubscribe = api.onSyncStatusChange(render);

  return () => {
    active = false;
    unsubscribe?.();
  };
}

export function mountSyncStatusPanel(root) {
  if (!root) return () => {};

  let active = true;

  const render = (status) => {
    if (!active) return;
    root.innerHTML = renderPanel(status);
  };

  const onClick = async (event) => {
    const syncButton = event.target.closest("[data-sync-now]");
    if (!syncButton) return;

    syncButton.disabled = true;
    try {
      const response = await api.runSyncNow();
      render(response.data);
    } finally {
      syncButton.disabled = false;
    }
  };

  root.addEventListener("click", onClick);

  void loadInitialStatus().then(render).catch(() => {
    render({
      online: false,
      configured: false,
      pendingCount: 0,
      lastError: "Status sinkronisasi belum tersedia.",
    });
  });

  const unsubscribe = api.onSyncStatusChange(render);

  return () => {
    active = false;
    root.removeEventListener("click", onClick);
    unsubscribe?.();
  };
}
