function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let allScheduledRows = [];
let filteredScheduledRows = [];

async function requireAdmin() {
  if (!window.supabase) {
    window.location.href = 'admin-login.html';
    return null;
  }

  const { data: authData, error: authErr } = await window.supabase.auth.getUser();
  if (authErr || !authData?.user) {
    window.location.href = 'admin-login.html';
    return null;
  }

  const { data: me, error: meErr } = await window.supabase
    .from('users')
    .select('id, role')
    .eq('id', authData.user.id)
    .single();

  if (meErr || !me || me.role !== 'admin') {
    await window.supabase.auth.signOut();
    window.location.href = 'admin-login.html';
    return null;
  }

  return me;
}

function formatMoney(value) {
  return `GHS ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusBadge(status) {
  const safe = String(status || 'scheduled').toLowerCase();
  return `<span class="status-pill ${esc(safe)}">${esc(safe)}</span>`;
}

async function loadScheduledDeliveries() {
  const { data, error } = await window.supabase
    .from('scheduled_orders')
    .select('id, user_id, phone, network, plan, amount, status, scheduled_at, note')
    .order('scheduled_at', { ascending: false })
    .limit(2000);

  if (error) {
    document.getElementById('matrixBody').innerHTML = `<tr><td class="state-msg">${esc(error.message)}</td></tr>`;
    document.getElementById('matrixDetailsBody').innerHTML = `<tr><td colspan="6" class="state-msg">${esc(error.message)}</td></tr>`;
    return;
  }

  allScheduledRows = data || [];
  hydrateNetworkFilter();
  applyScheduledFilters();
}

function hydrateNetworkFilter() {
  const select = document.getElementById('matrixNetwork');
  if (!select) return;

  const currentValue = select.value;
  const networks = Array.from(new Set(allScheduledRows.map(r => String(r.network || '').trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));

  select.innerHTML = '<option value="">All Networks</option>' +
    networks.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');

  if (currentValue && networks.includes(currentValue)) {
    select.value = currentValue;
  }
}

function applyScheduledFilters() {
  const network = (document.getElementById('matrixNetwork')?.value || '').toLowerCase();
  const status = (document.getElementById('matrixStatus')?.value || '').toLowerCase();
  const dateFrom = document.getElementById('matrixDateFrom')?.value || '';
  const dateTo = document.getElementById('matrixDateTo')?.value || '';

  const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
  const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

  filteredScheduledRows = allScheduledRows.filter(row => {
    const rowMs = new Date(row.scheduled_at || 0).getTime();
    const matchNetwork = !network || String(row.network || '').toLowerCase() === network;
    const matchStatus = !status || String(row.status || '').toLowerCase() === status;
    const matchFrom = fromMs === null || rowMs >= fromMs;
    const matchTo = toMs === null || rowMs <= toMs;
    return matchNetwork && matchStatus && matchFrom && matchTo;
  });

  renderSummary();
  renderMatrix();
  renderDetails();
}

function resetScheduledFilters() {
  const network = document.getElementById('matrixNetwork');
  const status = document.getElementById('matrixStatus');
  const dateFrom = document.getElementById('matrixDateFrom');
  const dateTo = document.getElementById('matrixDateTo');

  if (network) network.value = '';
  if (status) status.value = '';
  if (dateFrom) dateFrom.value = '';
  if (dateTo) dateTo.value = '';

  applyScheduledFilters();
}

function renderSummary() {
  const total = filteredScheduledRows.length;
  const amount = filteredScheduledRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const phones = new Set(filteredScheduledRows.map(r => String(r.phone || '').trim()).filter(Boolean));
  const networks = new Set(filteredScheduledRows.map(r => String(r.network || '').trim()).filter(Boolean));

  document.getElementById('sumTotal').innerText = String(total);
  document.getElementById('sumAmount').innerText = formatMoney(amount);
  document.getElementById('sumPhones').innerText = String(phones.size);
  document.getElementById('sumNetworks').innerText = String(networks.size);
}

function toDateKey(value) {
  const d = new Date(value || Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function renderMatrix() {
  const head = document.getElementById('matrixHead');
  const body = document.getElementById('matrixBody');

  if (!head || !body) return;

  if (!filteredScheduledRows.length) {
    head.innerHTML = '';
    body.innerHTML = '<tr><td class="state-msg">No scheduled deliveries match the selected filters.</td></tr>';
    return;
  }

  const dateKeys = Array.from(new Set(filteredScheduledRows.map(r => toDateKey(r.scheduled_at)))).sort();
  const networks = Array.from(new Set(filteredScheduledRows.map(r => String(r.network || 'Unknown').trim() || 'Unknown'))).sort((a, b) => a.localeCompare(b));

  head.innerHTML = `<tr><th>Date</th>${networks.map(n => `<th>${esc(n)}</th>`).join('')}<th>Total</th></tr>`;

  body.innerHTML = dateKeys.map(dateKey => {
    const rowsByDate = filteredScheduledRows.filter(r => toDateKey(r.scheduled_at) === dateKey);
    const totalCount = rowsByDate.length;

    const cells = networks.map(network => {
      const rowsByNetwork = rowsByDate.filter(r => String(r.network || 'Unknown').trim() === network);
      if (!rowsByNetwork.length) return '<td>0</td>';

      const amount = rowsByNetwork.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      return `<td class="matrix-cell">${rowsByNetwork.length}<small>${formatMoney(amount)}</small></td>`;
    }).join('');

    return `<tr><td>${esc(dateKey)}</td>${cells}<td><strong>${totalCount}</strong></td></tr>`;
  }).join('');
}

function renderDetails() {
  const tbody = document.getElementById('matrixDetailsBody');
  const count = document.getElementById('detailCount');
  if (!tbody || !count) return;

  count.innerText = `${filteredScheduledRows.length} rows`;

  if (!filteredScheduledRows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="state-msg">No records found.</td></tr>';
    return;
  }

  tbody.innerHTML = filteredScheduledRows.map(r => {
    return `<tr><td>${esc(new Date(r.scheduled_at).toLocaleString())}</td><td>${esc(r.phone || '-')}</td><td>${esc(r.network || '-')}</td><td>${esc(r.plan || '-')}</td><td>${formatMoney(r.amount)}</td><td>${statusBadge(r.status)}</td></tr>`;
  }).join('');
}

async function refreshScheduledMatrix() {
  await loadScheduledDeliveries();
}

window.applyScheduledFilters = applyScheduledFilters;
window.resetScheduledFilters = resetScheduledFilters;
window.refreshScheduledMatrix = refreshScheduledMatrix;

document.addEventListener('DOMContentLoaded', async () => {
  const admin = await requireAdmin();
  if (!admin) return;
  await loadScheduledDeliveries();
});
