const state = {
  records: [],
  settings: { defaultUsdRate: 50.6, reminderDays: 30 },
  filter: 'all',
  view: 'grouped',
  search: '',
};

const els = {
  liveRateInput: document.getElementById('liveRateInput'),
  refreshRateBtn: document.getElementById('refreshRateBtn'),
  addRecordBtn: document.getElementById('addRecordBtn'),
  alertBanner: document.getElementById('alertBanner'),
  statTotal: document.getElementById('statTotal'),
  statTotalSub: document.getElementById('statTotalSub'),
  statUpcoming: document.getElementById('statUpcoming'),
  statUpcomingSub: document.getElementById('statUpcomingSub'),
  statUnpaid: document.getElementById('statUnpaid'),
  statUnpaidSub: document.getElementById('statUnpaidSub'),
  statVolumeUsd: document.getElementById('statVolumeUsd'),
  statVolumeTry: document.getElementById('statVolumeTry'),
  searchInput: document.getElementById('searchInput'),
  groupedContainer: document.getElementById('groupedContainer'),
  flatContainer: document.getElementById('flatContainer'),
  recordsBody: document.getElementById('recordsBody'),
  recordModal: document.getElementById('recordModal'),
  recordModalTitle: document.getElementById('recordModalTitle'),
  recordForm: document.getElementById('recordForm'),
  renewModal: document.getElementById('renewModal'),
  renewForm: document.getElementById('renewForm'),
  renewSummary: document.getElementById('renewSummary'),
  historyModal: document.getElementById('historyModal'),
  historyModalTitle: document.getElementById('historyModalTitle'),
  historyBody: document.getElementById('historyBody'),
  toast: document.getElementById('toast'),
};

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.add('hidden'), 2800);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTRY(val) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2,
  }).format(Number(val) || 0);
}

function formatUSD(val) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number(val) || 0);
}

function formatDateTR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function daysUntil(isoDate) {
  if (!isoDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function addOneYear(isoDate) {
  const base = isoDate ? new Date(`${isoDate}T00:00:00`) : new Date();
  base.setFullYear(base.getFullYear() + 1);
  return base.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function api(path, options = {}) {
  const route = path.replace(/^\/api\//, '');
  const res = await fetch(`api.php?route=${encodeURIComponent(route)}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    window.location.reload();
    throw new Error('Oturum süresi doldu');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'İşlem başarısız');
  }
  return res.json();
}

async function loadRecords() {
  const data = await api('/api/records');
  state.records = data.records || [];
  state.settings = data.settings || state.settings;
  els.liveRateInput.value = Number(state.settings.defaultUsdRate || 50.6).toFixed(2);
  render();
}

async function refreshLiveRate(silent = false) {
  try {
    let rate = null;
    let source = 'saved';

    // Önce tarayıcıdan canlı kuru dene (lokal sunucu çevrimdışı olsa bile çalışır)
    try {
      const extRes = await fetch('https://open.er-api.com/v6/latest/USD');
      if (extRes.ok) {
        const extJson = await extRes.json();
        if (extJson && extJson.rates && typeof extJson.rates.TRY === 'number') {
          rate = Number(extJson.rates.TRY.toFixed(2));
          source = 'live';
          await api('/api/settings', { method: 'PUT', body: JSON.stringify({ defaultUsdRate: rate }) });
        }
      }
    } catch {
      // Sunucu üzerinden dene
    }

    if (!rate) {
      const res = await api('/api/usd-rate');
      if (res && res.rate) {
        rate = Number(Number(res.rate).toFixed(2));
        source = res.source || 'saved';
      }
    }

    if (rate) {
      state.settings.defaultUsdRate = rate;
      els.liveRateInput.value = rate.toFixed(2);
      render();
      if (!silent) {
        showToast(
          source === 'live'
            ? `Güncel USD/TRY kuru çekildi: ₺${rate.toFixed(2)}`
            : `Kayıtlı kur kullanılıyor: ₺${rate.toFixed(2)}`
        );
      }
    }
  } catch {
    if (!silent) showToast('Kur alınamadı, manuel girebilirsiniz.');
  }
}

function render() {
  const liveRate = Number(els.liveRateInput.value) || state.settings.defaultUsdRate || 35;
  const reminderDays = state.settings.reminderDays || 30;

  const enriched = state.records
    .map((r) => ({ ...r, _days: daysUntil(r.renewalDate) }))
    .sort((a, b) => {
      const da = a._days === null ? 99999 : a._days;
      const db = b._days === null ? 99999 : b._days;
      return da - db;
    });

  // Stats
  const upcomingList = enriched.filter((r) => r._days !== null && r._days <= reminderDays);
  const overdueList = enriched.filter((r) => r._days !== null && r._days < 0);
  const unpaidList = enriched.filter((r) => r.paymentStatus !== 'odendi');
  const unpaidTry = unpaidList.reduce((acc, r) => acc + (Number(r.tryAmount) || 0), 0);
  const totalUsd = enriched.reduce((acc, r) => acc + (Number(r.usdPrice) || 0), 0);

  const uniqueClientNames = Array.from(new Set(enriched.map((r) => (r.clientName || 'İsimsiz').trim()))).sort((a, b) =>
    a.localeCompare(b, 'tr')
  );
  const clientDataList = document.getElementById('clientNameList');
  if (clientDataList) {
    clientDataList.innerHTML = uniqueClientNames.map((n) => `<option value="${escapeHtml(n)}"></option>`).join('');
  }
  const uniqueClients = uniqueClientNames.length;
  els.statTotal.textContent = `${uniqueClients} Müşteri`;
  els.statTotalSub.textContent = `${enriched.length} hizmet · ${enriched.length - unpaidList.length} ödendi · ${unpaidList.length} bekliyor`;
  els.statUpcoming.textContent = upcomingList.length;
  els.statUpcomingSub.textContent =
    overdueList.length > 0
      ? `${overdueList.length} gecikmiş kayıt var!`
      : `Önümüzdeki ${reminderDays} gün`;
  els.statUnpaid.textContent = unpaidList.length;
  els.statUnpaidSub.textContent = formatTRY(unpaidTry);
  els.statVolumeUsd.textContent = formatUSD(totalUsd);
  els.statVolumeTry.textContent = `Güncel kurla ~${formatTRY(totalUsd * liveRate)}`;

  // Alert Banner
  if (upcomingList.length > 0) {
    const names = upcomingList
      .slice(0, 4)
      .map((r) => {
        const label = r._days < 0 ? `${Math.abs(r._days)} gün gecikti` : r._days === 0 ? 'bugün' : `${r._days} gün kaldı`;
        return `<strong>${escapeHtml(r.domain)}</strong> (${label})`;
      })
      .join(', ');
    els.alertBanner.innerHTML = `
      <div>
        <strong>Yenileme Hatırlatması:</strong> ${names}${upcomingList.length > 4 ? ` ve ${upcomingList.length - 4} kayıt daha` : ''}.
      </div>
      <button class="mini-btn" onclick="setFilter('upcoming')">Sadece bunları göster</button>
    `;
    els.alertBanner.classList.toggle('urgent', overdueList.length > 0);
    els.alertBanner.classList.remove('hidden');
  } else {
    els.alertBanner.classList.add('hidden');
  }

  // Filter + Search
  const q = state.search.trim().toLowerCase();
  const filtered = enriched.filter((r) => {
    if (state.filter === 'upcoming' && !(r._days !== null && r._days <= reminderDays)) return false;
    if (state.filter === 'bekliyor' && r.paymentStatus === 'odendi') return false;
    if (state.filter === 'odendi' && r.paymentStatus !== 'odendi') return false;
    if (q) {
      const hay = `${r.clientName} ${r.domain} ${r.provider} ${r.serviceType} ${r.notes}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const renderRow = (r, showClient) => {
    let dayBadge = `<span class="badge badge-neutral">Tarih yok</span>`;
    if (r._days !== null) {
      if (r._days < 0) {
        dayBadge = `<span class="badge badge-danger">${Math.abs(r._days)} gün gecikti</span>`;
      } else if (r._days <= 7) {
        dayBadge = `<span class="badge badge-danger">${r._days === 0 ? 'Bugün!' : `${r._days} gün kaldı`}</span>`;
      } else if (r._days <= reminderDays) {
        dayBadge = `<span class="badge badge-warn">${r._days} gün kaldı</span>`;
      } else {
        dayBadge = `<span class="badge badge-ok">${r._days} gün var</span>`;
      }
    }

    const isPaid = r.paymentStatus === 'odendi';
    const statusBadge = isPaid
      ? `<button class="badge badge-ok status-toggle" data-action="toggle-pay" data-id="${r.id}" title="Tıklayarak Bekliyor yap">✓ Ödendi</button>`
      : `<button class="badge badge-danger status-toggle" data-action="toggle-pay" data-id="${r.id}" title="Tıklayarak Ödendi yap">⏳ Bekliyor</button>`;

    const liveTryEst = (Number(r.usdPrice) || 0) * liveRate;
    const showEst = (Number(r.usdPrice) || 0) > 0 && Math.abs(liveRate - (Number(r.usdRate) || 0)) >= 0.05;
    const historyCount = Array.isArray(r.history) ? r.history.length : 0;

    return `
      <tr>
        <td>
          ${showClient ? `<div class="client-name">${escapeHtml(r.clientName)}</div>` : ''}
          <a class="domain-link" href="https://${escapeHtml(r.domain)}" target="_blank" rel="noopener">${escapeHtml(r.domain)}</a>
          ${r.notes ? `<div class="meta-sub">${escapeHtml(r.notes)}</div>` : ''}
        </td>
        <td>
          <span class="badge badge-neutral">${escapeHtml(r.serviceType)}</span>
          ${r.provider ? `<div class="meta-sub">${escapeHtml(r.provider)}</div>` : ''}
        </td>
        <td>
          <div><strong>${formatDateTR(r.renewalDate)}</strong></div>
          <div style="margin-top:4px">${dayBadge}</div>
        </td>
        <td>
          <div class="price-main">${formatUSD(r.usdPrice)} → ${formatTRY(r.tryAmount)}</div>
          <div class="price-sub">İşlem kuru: ₺${Number(r.usdRate || 0).toFixed(2)} ${r.startDate ? `(${formatDateTR(r.startDate)})` : ''}</div>
          ${showEst ? `<div class="price-est">Güncel kur (₺${liveRate.toFixed(2)}): ~${formatTRY(liveTryEst)}</div>` : ''}
        </td>
        <td>
          ${statusBadge}
          ${isPaid && r.paidDate ? `<div class="meta-sub">${formatDateTR(r.paidDate)}</div>` : ''}
        </td>
        <td class="col-actions">
          <div class="action-group">
            <button class="mini-btn accent" data-action="renew" data-id="${r.id}">Yenile</button>
            <button class="mini-btn" data-action="whatsapp" data-id="${r.id}" title="WhatsApp hatırlatma metnini kopyala">Mesaj</button>
            <button class="mini-btn" data-action="history" data-id="${r.id}">Geçmiş${historyCount ? ` (${historyCount})` : ''}</button>
            <button class="mini-btn" data-action="edit" data-id="${r.id}">Düzenle</button>
            <button class="mini-btn danger" data-action="delete" data-id="${r.id}">Sil</button>
          </div>
        </td>
      </tr>
    `;
  };

  if (state.view === 'grouped') {
    els.groupedContainer.classList.remove('hidden');
    els.flatContainer.classList.add('hidden');

    if (filtered.length === 0) {
      els.groupedContainer.innerHTML = `
        <div class="table-card">
          <div class="empty-cell">Gösterilecek kayıt bulunamadı. Sağ üstten <strong>+ Yeni Kayıt</strong> ekleyebilirsiniz.</div>
        </div>
      `;
      return;
    }

    const groupMap = new Map();
    for (const r of filtered) {
      const key = (r.clientName || 'İsimsiz').trim();
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key).push(r);
    }

    const groups = Array.from(groupMap.entries()).sort((a, b) => {
      const minA = Math.min(...a[1].map((x) => (x._days === null ? 99999 : x._days)));
      const minB = Math.min(...b[1].map((x) => (x._days === null ? 99999 : x._days)));
      return minA - minB;
    });

    els.groupedContainer.innerHTML = groups
      .map(([clientName, items]) => {
        const initials = clientName
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w[0].toUpperCase())
          .join('');
        const unpaidCount = items.filter((i) => i.paymentStatus !== 'odendi').length;
        const urgentCount = items.filter((i) => i._days !== null && i._days <= reminderDays).length;

        return `
          <section class="client-group">
            <div class="client-group-header">
              <div class="client-group-title">
                <div class="client-avatar">${escapeHtml(initials || '?')}</div>
                <span class="client-group-name">${escapeHtml(clientName)}</span>
                <span class="badge badge-neutral">${items.length} hizmet</span>
                ${urgentCount > 0 ? `<span class="badge badge-warn">${urgentCount} yaklaşan</span>` : ''}
                ${unpaidCount > 0 ? `<span class="badge badge-danger">${unpaidCount} ödeme bekliyor</span>` : '<span class="badge badge-ok">Tümü ödendi</span>'}
              </div>
              <div class="client-group-meta">
                <button class="mini-btn" data-action="rename-client" data-client="${escapeHtml(clientName)}" title="Bu müşterinin tüm kayıtlarında adı toplu değiştir">Adı Düzenle</button>
                <button class="mini-btn accent" data-action="add-for-client" data-client="${escapeHtml(clientName)}">+ Hizmet Ekle</button>
              </div>
            </div>
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Domain / Not</th>
                    <th>Hizmet / Firma</th>
                    <th>Yenileme Tarihi</th>
                    <th>Satış Fiyatı &amp; Kur</th>
                    <th>Ödeme Durumu</th>
                    <th class="col-actions">İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map((item) => renderRow(item, false)).join('')}
                </tbody>
              </table>
            </div>
          </section>
        `;
      })
      .join('');
  } else {
    els.groupedContainer.classList.add('hidden');
    els.flatContainer.classList.remove('hidden');

    if (filtered.length === 0) {
      els.recordsBody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-cell">
            Gösterilecek kayıt bulunamadı. Sağ üstten <strong>+ Yeni Kayıt</strong> ekleyebilirsiniz.
          </td>
        </tr>
      `;
      return;
    }

    els.recordsBody.innerHTML = filtered.map((r) => renderRow(r, true)).join('');
  }
}

window.setFilter = function (filter) {
  state.filter = filter;
  document.querySelectorAll('.filter-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  render();
};

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function openAddModal(presetClientName = '') {
  els.recordModalTitle.textContent = 'Yeni Kayıt Ekle';
  els.recordForm.reset();
  document.getElementById('recordId').value = '';
  if (presetClientName) {
    document.getElementById('clientName').value = presetClientName;
  }
  const today = todayIso();
  document.getElementById('startDate').value = today;
  document.getElementById('renewalDate').value = addOneYear(today);
  document.getElementById('usdRate').value = (Number(els.liveRateInput.value) || state.settings.defaultUsdRate || 50.6).toFixed(2);
  openModal('recordModal');
}

function openEditModal(record) {
  els.recordModalTitle.textContent = 'Kaydı Düzenle';
  document.getElementById('recordId').value = record.id;
  document.getElementById('clientName').value = record.clientName || '';
  document.getElementById('phone').value = record.phone || '';
  document.getElementById('domain').value = record.domain || '';
  document.getElementById('serviceType').value = record.serviceType || 'Hosting + Domain';
  document.getElementById('provider').value = record.provider || '';
  document.getElementById('paymentStatus').value = record.paymentStatus || 'bekliyor';
  document.getElementById('startDate').value = record.startDate || '';
  document.getElementById('renewalDate').value = record.renewalDate || '';
  document.getElementById('usdPrice').value = record.usdPrice ?? '';
  document.getElementById('usdRate').value = record.usdRate ?? '';
  document.getElementById('tryAmount').value = record.tryAmount ?? '';
  document.getElementById('paidDate').value = record.paidDate || '';
  document.getElementById('notes').value = record.notes || '';
  openModal('recordModal');
}

function openRenewModal(record) {
  const liveRate = Number((Number(els.liveRateInput.value) || state.settings.defaultUsdRate || 50.6).toFixed(2));
  document.getElementById('renewRecordId').value = record.id;
  els.renewSummary.innerHTML = `
    <strong>${escapeHtml(record.clientName)}</strong> — <strong>${escapeHtml(record.domain)}</strong><br/>
    Önceki dönem: ${formatUSD(record.usdPrice)} × ₺${Number(record.usdRate || 0).toFixed(2)} = <strong>${formatTRY(record.tryAmount)}</strong> (Bitiş: ${formatDateTR(record.renewalDate)})
  `;
  document.getElementById('renewStartDate').value = todayIso();
  document.getElementById('renewNextDate').value = addOneYear(record.renewalDate || todayIso());
  document.getElementById('renewUsdPrice').value = record.usdPrice || 0;
  document.getElementById('renewUsdRate').value = liveRate.toFixed(2);
  document.getElementById('renewTryAmount').value = ((record.usdPrice || 0) * liveRate).toFixed(2);
  document.getElementById('renewPaymentStatus').value = 'bekliyor';
  document.getElementById('renewPaidDate').value = '';
  document.getElementById('renewNotes').value = '';
  openModal('renewModal');
}

function openHistoryModal(record) {
  els.historyModalTitle.textContent = `${record.clientName} (${record.domain}) — Kur & Ödeme Geçmişi`;
  const history = Array.isArray(record.history) ? record.history : [];

  const currentCard = `
    <div class="history-item current">
      <div>
        <strong>Güncel Dönem</strong> (${formatDateTR(record.startDate)} → ${formatDateTR(record.renewalDate)})
        <div class="meta-sub">${escapeHtml(record.notes || 'Not yok')}</div>
      </div>
      <div style="text-align:right">
        <div><strong>${formatUSD(record.usdPrice)}</strong> × ₺${Number(record.usdRate || 0).toFixed(2)} = <strong>${formatTRY(record.tryAmount)}</strong></div>
        <div style="margin-top:4px">
          ${record.paymentStatus === 'odendi' ? '<span class="badge badge-ok">Ödendi</span>' : '<span class="badge badge-danger">Ödeme Bekliyor</span>'}
        </div>
      </div>
    </div>
  `;

  const pastCards = history.length
    ? history
        .map(
          (h) => `
      <div class="history-item">
        <div>
          <strong>Dönem: ${escapeHtml(h.period || formatDateTR(h.date))}</strong>
          <div class="meta-sub">İşlem: ${formatDateTR(h.date)} ${h.note ? `· ${escapeHtml(h.note)}` : ''}</div>
        </div>
        <div style="text-align:right">
          <div><strong>${formatUSD(h.usdPrice)}</strong> × ₺${Number(h.usdRate || 0).toFixed(2)} = <strong>${formatTRY(h.tryAmount)}</strong></div>
          <div style="margin-top:4px">
            ${h.paymentStatus === 'odendi' ? `<span class="badge badge-ok">Ödendi ${h.paidDate ? `(${formatDateTR(h.paidDate)})` : ''}</span>` : '<span class="badge badge-danger">Ödenmedi</span>'}
          </div>
        </div>
      </div>
    `
        )
        .join('')
    : '<p class="meta-sub" style="text-align:center; padding:12px 0;">Henüz arşivlenmiş geçmiş dönem yok. "Yenile" dediğinizde eski dönem otomatik buraya kaydedilir.</p>';

  els.historyBody.innerHTML = `<div class="history-list">${currentCard}${pastCards}</div>`;
  openModal('historyModal');
}

function copyWhatsAppMessage(record) {
  const liveRate = Number(els.liveRateInput.value) || state.settings.defaultUsdRate || 35;
  const estTry = Math.round((Number(record.usdPrice) || 0) * liveRate);
  const text = `Merhaba ${record.clientName}, ${record.domain} adresinizin yıllık ${record.serviceType.toLowerCase()} yenileme tarihi ${formatDateTR(record.renewalDate)}. Yenileme tutarı ${formatUSD(record.usdPrice)} (güncel kur ₺${liveRate.toFixed(2)} ile yaklaşık ${formatTRY(estTry)}). Onayınızla birlikte yenileme işlemini gerçekleştirebilirim.`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast('Hatırlatma mesajı panoya kopyalandı!'));
  } else {
    prompt('Kopyalamak için Ctrl/Cmd+C:', text);
  }
}

// Çift yönlü kur hesaplama: USD -> TRY ve TRY -> USD
function bindAutoCalc(usdId, rateId, tryId) {
  const usdEl = document.getElementById(usdId);
  const rateEl = document.getElementById(rateId);
  const tryEl = document.getElementById(tryId);

  usdEl.addEventListener('input', () => {
    const u = Number(usdEl.value) || 0;
    const r = Number(rateEl.value) || 0;
    tryEl.value = (u * r).toFixed(2);
  });

  tryEl.addEventListener('input', () => {
    const t = Number(tryEl.value) || 0;
    const r = Number(rateEl.value) || 0;
    usdEl.value = r > 0 ? (t / r).toFixed(2) : '0.00';
  });

  rateEl.addEventListener('input', () => {
    const u = Number(usdEl.value) || 0;
    const t = Number(tryEl.value) || 0;
    const r = Number(rateEl.value) || 0;
    if (u > 0) {
      tryEl.value = (u * r).toFixed(2);
    } else if (t > 0 && r > 0) {
      usdEl.value = (t / r).toFixed(2);
    }
  });
}

bindAutoCalc('usdPrice', 'usdRate', 'tryAmount');
bindAutoCalc('renewUsdPrice', 'renewUsdRate', 'renewTryAmount');

// Event listeners
els.addRecordBtn.addEventListener('click', () => openAddModal());

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await fetch('api.php?route=logout', { method: 'POST' });
    window.location.reload();
  });
}

document.querySelectorAll('.view-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.view = btn.dataset.view;
    document.querySelectorAll('.view-btn').forEach((b) => b.classList.toggle('active', b === btn));
    render();
  });
});

els.refreshRateBtn.addEventListener('click', () => refreshLiveRate(false));

els.liveRateInput.addEventListener('change', async () => {
  const val = Number(Number(els.liveRateInput.value).toFixed(2));
  if (val > 0) {
    els.liveRateInput.value = val.toFixed(2);
    state.settings.defaultUsdRate = val;
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ defaultUsdRate: val }) });
    render();
    showToast(`Güncel kur ₺${val.toFixed(2)} olarak kaydedildi.`);
  }
});

document.getElementById('useCurrentRateBtn').addEventListener('click', () => {
  const liveRate = Number((Number(els.liveRateInput.value) || state.settings.defaultUsdRate || 50.6).toFixed(2));
  document.getElementById('usdRate').value = liveRate.toFixed(2);
  const u = Number(document.getElementById('usdPrice').value) || 0;
  const t = Number(document.getElementById('tryAmount').value) || 0;
  if (u > 0) {
    document.getElementById('tryAmount').value = (u * liveRate).toFixed(2);
  } else if (t > 0) {
    document.getElementById('usdPrice').value = (t / liveRate).toFixed(2);
  }
});

els.searchInput.addEventListener('input', (e) => {
  state.search = e.target.value;
  render();
});

document.querySelectorAll('.filter-tab').forEach((btn) => {
  btn.addEventListener('click', () => window.setFilter(btn.dataset.filter));
});

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

document.querySelectorAll('.modal-backdrop').forEach((bg) => {
  bg.addEventListener('click', (e) => {
    if (e.target === bg) bg.classList.add('hidden');
  });
});

els.recordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('recordId').value;
  const payload = {
    clientName: document.getElementById('clientName').value,
    phone: document.getElementById('phone').value,
    domain: document.getElementById('domain').value,
    serviceType: document.getElementById('serviceType').value,
    provider: document.getElementById('provider').value,
    paymentStatus: document.getElementById('paymentStatus').value,
    startDate: document.getElementById('startDate').value,
    renewalDate: document.getElementById('renewalDate').value,
    usdPrice: Number(document.getElementById('usdPrice').value) || 0,
    usdRate: Number(document.getElementById('usdRate').value) || 0,
    tryAmount: Number(document.getElementById('tryAmount').value) || 0,
    paidDate: document.getElementById('paidDate').value,
    notes: document.getElementById('notes').value,
  };

  try {
    if (id) {
      await api(`/api/records/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Kayıt güncellendi.');
    } else {
      await api('/api/records', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Yeni kayıt eklendi.');
    }
    closeModal('recordModal');
    await loadRecords();
  } catch (err) {
    showToast(err.message);
  }
});

els.renewForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('renewRecordId').value;
  const payload = {
    startDate: document.getElementById('renewStartDate').value,
    renewalDate: document.getElementById('renewNextDate').value,
    usdPrice: Number(document.getElementById('renewUsdPrice').value) || 0,
    usdRate: Number(document.getElementById('renewUsdRate').value) || 0,
    tryAmount: Number(document.getElementById('renewTryAmount').value) || 0,
    paymentStatus: document.getElementById('renewPaymentStatus').value,
    paidDate: document.getElementById('renewPaidDate').value,
    notes: document.getElementById('renewNotes').value,
  };

  try {
    await api(`/api/records/${id}/renew`, { method: 'POST', body: JSON.stringify(payload) });
    closeModal('renewModal');
    showToast('Dönem yenilendi ve önceki kur/fiyat geçmişe arşivlendi.');
    await loadRecords();
  } catch (err) {
    showToast(err.message);
  }
});

async function handleListClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === 'add-for-client') {
    openAddModal(btn.dataset.client || '');
    return;
  }

  if (action === 'rename-client') {
    const oldName = btn.dataset.client || '';
    const newName = prompt('Yeni müşteri adını girin (bu müşterinin tüm kayıtlarında güncellenir):', oldName);
    if (newName && newName.trim() && newName.trim() !== oldName) {
      await api('/api/clients/rename', {
        method: 'PUT',
        body: JSON.stringify({ oldName, newName: newName.trim() }),
      });
      showToast(`Müşteri adı "${newName.trim()}" olarak güncellendi.`);
      await loadRecords();
    }
    return;
  }

  const id = btn.dataset.id;
  const record = state.records.find((r) => r.id === id);
  if (!record) return;

  if (action === 'edit') {
    openEditModal(record);
  } else if (action === 'renew') {
    openRenewModal(record);
  } else if (action === 'history') {
    openHistoryModal(record);
  } else if (action === 'whatsapp') {
    copyWhatsAppMessage(record);
  } else if (action === 'toggle-pay') {
    const nextStatus = record.paymentStatus === 'odendi' ? 'bekliyor' : 'odendi';
    await api(`/api/records/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        paymentStatus: nextStatus,
        paidDate: nextStatus === 'odendi' ? todayIso() : '',
      }),
    });
    showToast(nextStatus === 'odendi' ? 'Ödendi olarak işaretlendi.' : 'Ödeme bekliyor olarak güncellendi.');
    await loadRecords();
  } else if (action === 'delete') {
    if (confirm(`"${record.clientName} (${record.domain})" kaydını silmek istediğinize emin misiniz?`)) {
      await api(`/api/records/${id}`, { method: 'DELETE' });
      showToast('Kayıt silindi.');
      await loadRecords();
    }
  }
}

els.recordsBody.addEventListener('click', handleListClick);
els.groupedContainer.addEventListener('click', handleListClick);

// Init
loadRecords().then(() => refreshLiveRate(true));
