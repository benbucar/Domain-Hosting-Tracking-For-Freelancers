<?php
require_once __DIR__ . '/config.php';

session_name(SESSION_NAME);
session_start();

$isLoggedIn = !empty($_SESSION['authenticated']) && $_SESSION['authenticated'] === true;

if (!$isLoggedIn) {
?>
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Giriş — Hosting &amp; Domain Takip</title>
  <link rel="stylesheet" href="styles.css" />
  <link rel="icon" type="image/png" href="fav.png">
  <style>
    .login-wrap {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 20px;
    }
    .login-card {
      width: 100%;
      max-width: 390px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px 26px;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
    }
    .login-card h1 {
      margin: 14px 0 4px;
      font-size: 20px;
    }
    .login-card p {
      margin: 0 0 20px;
      font-size: 13.5px;
      color: var(--text-muted);
    }
    .login-error {
      margin-top: 12px;
      padding: 9px 12px;
      border-radius: 9px;
      background: var(--danger-bg);
      border: 1px solid var(--danger-border);
      color: var(--danger-text);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="login-wrap">
    <form id="loginForm" class="login-card">
      <div class="brand-mark"><img src="fav.png" alt="logo" style="width: 42px;"></div>
      <h1>Hosting &amp; Domain Takip</h1>
      <p>Devam etmek için şifrenizi girin.</p>
      <div class="field">
        <label for="password">Yönetim Şifresi</label>
        <input id="password" type="password" required autofocus placeholder="••••••••" />
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%; margin-top:14px;">Giriş Yap</button>
      <div id="loginError" class="login-error hidden"></div>
    </form>
  </div>
  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('loginError');
      errBox.classList.add('hidden');
      const password = document.getElementById('password').value;
      const res = await fetch('api.php?route=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        errBox.textContent = data.error || 'Hatalı şifre';
        errBox.classList.remove('hidden');
      }
    });
  </script>
</body>
</html>
<?php
    exit;
}
?>
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hosting &amp; Domain Takip — Barış Uçar</title>
  <link rel="stylesheet" href="styles.css" />
  <link rel="icon" type="image/png" href="fav.png">
</head>
<body>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark"><img src="fav.png" alt="logo" style="width: 42px;"></div>
        <div>
          <h1>Hosting &amp; Domain Takip</h1>
          <p class="subtitle">Müşteri Yenileme, Kur &amp; Ödeme Paneli</p>
        </div>
      </div>
      <div class="topbar-actions">
        <div class="rate-pill" title="Güncel USD/TRY kuru (yeni dönem hesaplamaları için)">
          <span class="rate-label">USD/TRY</span>
          <input id="liveRateInput" type="number" step="0.01" min="1" aria-label="Güncel Dolar Kuru" />
          <button id="refreshRateBtn" class="icon-btn" title="Güncel kuru internetten çek">↻</button>
        </div>
        <button id="addRecordBtn" class="btn btn-primary">+ Yeni Kayıt</button>
        <button id="logoutBtn" class="btn btn-secondary" title="Oturumu kapat">Çıkış</button>
      </div>
    </header>

    <section id="alertBanner" class="alert-banner hidden" aria-live="polite"></section>

    <section class="stats-grid">
      <div class="stat-card">
        <span class="stat-label">Toplam Hizmet</span>
        <strong id="statTotal" class="stat-value">0</strong>
        <span id="statTotalSub" class="stat-sub">Aktif müşteri kaydı</span>
      </div>
      <div class="stat-card stat-warn">
        <span class="stat-label">30 Gün İçinde Yenileme</span>
        <strong id="statUpcoming" class="stat-value">0</strong>
        <span id="statUpcomingSub" class="stat-sub">Geciken ve yaklaşanlar</span>
      </div>
      <div class="stat-card stat-danger">
        <span class="stat-label">Ödeme Bekleyen</span>
        <strong id="statUnpaid" class="stat-value">0</strong>
        <span id="statUnpaidSub" class="stat-sub">0 TL</span>
      </div>
      <div class="stat-card stat-ok">
        <span class="stat-label">Yıllık Toplam Hacim</span>
        <strong id="statVolumeUsd" class="stat-value">$0</strong>
        <span id="statVolumeTry" class="stat-sub">Güncel kurla ~0 TL</span>
      </div>
    </section>

    <section class="toolbar">
      <div class="search-wrap">
        <input id="searchInput" type="search" placeholder="Müşteri adı, domain veya firma ara..." />
      </div>
      <div class="toolbar-right">
        <div class="view-toggle" role="group" aria-label="Görünüm">
          <button class="view-btn active" data-view="grouped">Müşteri Gruplu</button>
          <button class="view-btn" data-view="flat">Tarih Sıralı</button>
        </div>
        <div class="filter-tabs" role="tablist">
          <button class="filter-tab active" data-filter="all">Tümü</button>
          <button class="filter-tab" data-filter="upcoming">Yaklaşan / Geciken</button>
          <button class="filter-tab" data-filter="bekliyor">Ödeme Bekleyen</button>
          <button class="filter-tab" data-filter="odendi">Ödendi</button>
        </div>
      </div>
    </section>

    <main id="groupedContainer" class="grouped-list"></main>

    <main id="flatContainer" class="table-card hidden">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Müşteri &amp; Domain</th>
              <th>Hizmet / Firma</th>
              <th>Yenileme Tarihi</th>
              <th>Satış Fiyatı &amp; Kur</th>
              <th>Ödeme Durumu</th>
              <th class="col-actions">İşlemler</th>
            </tr>
          </thead>
          <tbody id="recordsBody">
            <tr>
              <td colspan="6" class="empty-cell">Yükleniyor...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>

    <footer class="footer">
      <span>Veriler korumalı <code>data/records.json</code> dosyasında saklanır · barisucar.com</span>
    </footer>
  </div>

  <!-- Yeni Kayıt / Düzenle Modal -->
  <div id="recordModal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="recordModalTitle">
    <div class="modal">
      <div class="modal-header">
        <h2 id="recordModalTitle">Yeni Kayıt Ekle</h2>
        <button class="icon-btn close-modal" data-close="recordModal" aria-label="Kapat">✕</button>
      </div>
      <form id="recordForm" class="modal-body">
        <input type="hidden" id="recordId" />

        <div class="form-grid">
          <div class="field">
            <label for="clientName">Müşteri Adı *</label>
            <input id="clientName" list="clientNameList" required placeholder="Örn. Ahmet Yılmaz / ABC Mimarlık" />
            <datalist id="clientNameList"></datalist>
          </div>
          <div class="field">
            <label for="phone">Telefon / WhatsApp</label>
            <input id="phone" placeholder="Örn. 0532 123 45 67" />
          </div>
          <div class="field">
            <label for="domain">Domain *</label>
            <input id="domain" required placeholder="Örn. orneksite.com" />
          </div>
          <div class="field">
            <label for="serviceType">Hizmet Türü</label>
            <select id="serviceType">
              <option value="Hosting + Domain">Hosting + Domain</option>
              <option value="Hosting">Sadece Hosting</option>
              <option value="Domain">Sadece Domain</option>
              <option value="SSL / Bakım">SSL / Bakım</option>
            </select>
          </div>
          <div class="field">
            <label for="provider">Hosting / Domain Firması</label>
            <input id="provider" placeholder="Örn. Turhost, Güzel Hosting, Natro, Cloudflare" />
          </div>
          <div class="field">
            <label for="paymentStatus">Ödeme Durumu</label>
            <select id="paymentStatus">
              <option value="bekliyor">Ödeme Bekliyor</option>
              <option value="odendi">Ödendi</option>
            </select>
          </div>
          <div class="field">
            <label for="startDate">İşlem / Başlangıç Tarihi</label>
            <input id="startDate" type="date" />
          </div>
          <div class="field">
            <label for="renewalDate">Yenileme (Bitiş) Tarihi *</label>
            <input id="renewalDate" type="date" required />
          </div>
        </div>

        <div class="pricing-box">
          <div class="pricing-header">
            <span>Fiyat &amp; İşlem Günü Dolar Kuru</span>
            <button type="button" id="useCurrentRateBtn" class="btn-link">Güncel kuru uygula</button>
          </div>
          <div class="form-grid three-col">
            <div class="field">
              <label for="usdPrice">Satış Fiyatı (USD) *</label>
              <input id="usdPrice" type="number" step="0.01" min="0" required placeholder="120" />
            </div>
            <div class="field">
              <label for="usdRate">O Günün Dolar Kuru (₺) *</label>
              <input id="usdRate" type="number" step="0.01" min="0" required placeholder="50.60" />
            </div>
            <div class="field">
              <label for="tryAmount">Satış Tutarı (₺)</label>
              <input id="tryAmount" type="number" step="0.01" min="0" placeholder="Otomatik hesaplanır" />
            </div>
          </div>
        </div>

        <div class="form-grid">
          <div class="field">
            <label for="paidDate">Ödeme Tarihi</label>
            <input id="paidDate" type="date" />
          </div>
          <div class="field full">
            <label for="notes">Notlar</label>
            <textarea id="notes" rows="2" placeholder="Paket detayı, cPanel bilgisi, fatura/EFT notu..."></textarea>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-close="recordModal">İptal</button>
          <button type="submit" class="btn btn-primary">Kaydet</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Yenileme Modal -->
  <div id="renewModal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="renewModalTitle">
    <div class="modal">
      <div class="modal-header">
        <h2 id="renewModalTitle">Dönem Yenile</h2>
        <button class="icon-btn close-modal" data-close="renewModal" aria-label="Kapat">✕</button>
      </div>
      <form id="renewForm" class="modal-body">
        <input type="hidden" id="renewRecordId" />
        <p id="renewSummary" class="modal-info"></p>

        <div class="form-grid">
          <div class="field">
            <label for="renewStartDate">Yeni İşlem Tarihi</label>
            <input id="renewStartDate" type="date" required />
          </div>
          <div class="field">
            <label for="renewNextDate">Yeni Bitiş Tarihi</label>
            <input id="renewNextDate" type="date" required />
          </div>
        </div>

        <div class="pricing-box">
          <div class="pricing-header">
            <span>Yeni Dönem Fiyat &amp; Kur Bilgisi</span>
          </div>
          <div class="form-grid three-col">
            <div class="field">
              <label for="renewUsdPrice">Satış Fiyatı (USD)</label>
              <input id="renewUsdPrice" type="number" step="0.01" min="0" required />
            </div>
            <div class="field">
              <label for="renewUsdRate">Bugünün Dolar Kuru (₺)</label>
              <input id="renewUsdRate" type="number" step="0.01" min="0" required />
            </div>
            <div class="field">
              <label for="renewTryAmount">Yeni TL Tutarı (₺)</label>
              <input id="renewTryAmount" type="number" step="0.01" min="0" required />
            </div>
          </div>
        </div>

        <div class="form-grid">
          <div class="field">
            <label for="renewPaymentStatus">Ödeme Durumu</label>
            <select id="renewPaymentStatus">
              <option value="bekliyor">Ödeme Bekliyor</option>
              <option value="odendi">Ödendi</option>
            </select>
          </div>
          <div class="field">
            <label for="renewPaidDate">Ödeme Tarihi</label>
            <input id="renewPaidDate" type="date" />
          </div>
          <div class="field full">
            <label for="renewNotes">Not</label>
            <input id="renewNotes" placeholder="Örn. 2026-2027 dönemi yenilendi" />
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-close="renewModal">İptal</button>
          <button type="submit" class="btn btn-primary">Yenilemeyi Kaydet &amp; Eski Dönemi Arşivle</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Geçmiş Modal -->
  <div id="historyModal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="historyModalTitle">
    <div class="modal modal-wide">
      <div class="modal-header">
        <h2 id="historyModalTitle">Kur &amp; Ödeme Geçmişi</h2>
        <button class="icon-btn close-modal" data-close="historyModal" aria-label="Kapat">✕</button>
      </div>
      <div id="historyBody" class="modal-body"></div>
    </div>
  </div>

  <div id="toast" class="toast hidden" role="status" aria-live="polite"></div>

  <script src="app.js"></script>
</body>
</html>
