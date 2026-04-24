const PAGE_LABELS = Object.freeze({
  users: "Manajemen user",
  savings: "Simpanan",
  supplierPayouts: "Pembayaran pemasok",
  reports: "Laporan",
});

export async function initPage({ pageKey }) {
  const root = document.querySelector("#app-page-slot");
  if (!root) return;

  const label = PAGE_LABELS[pageKey] || "Halaman ini";
  root.innerHTML = `
    <section class="pos-page-view">
      <div class="container-fluid">
        <section class="card shadow">
          <div class="card-body p-5 text-center">
            <div class="pos-unsupported-icon mb-3">
              <i class="fas fa-tools fa-2x"></i>
            </div>
            <p class="pos-section-title mb-2">Desktop v1</p>
            <h1 class="h3 text-gray-800 mb-3">${label} belum tersedia</h1>
            <p class="text-gray-600 mb-4">Fase desktop pertama fokus pada login offline, dashboard, transaksi, pemasok, dan sinkronisasi Google Sheets.</p>
            <a class="btn btn-primary shadow-sm" href="./transaksi.html">
              <i class="fas fa-cash-register fa-sm mr-2"></i>Buka transaksi
            </a>
          </div>
        </section>
      </div>
    </section>
  `;
}
