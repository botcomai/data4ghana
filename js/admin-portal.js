/* ===== ADMIN PORTAL v3 — Full-featured Dashboard ===== */

// ── Security: HTML escaping ──
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Auth guard ──
async function requireAdmin() {
  if (!window.supabase) { window.location.href = 'admin-login.html'; return null; }
  const { data: authData, error: authErr } = await window.supabase.auth.getUser();
  if (authErr || !authData?.user) { window.location.href = 'admin-login.html'; return null; }
  const { data: me, error: meErr } = await window.supabase
    .from('users').select('id, role').eq('id', authData.user.id).single();
  if (meErr || !me || me.role !== 'admin') {
    await window.supabase.auth.signOut();
    window.location.href = 'admin-login.html';
    return null;
  }
  return me;
}

// ── State ──
let autoRefreshTimer = null;
let allUsersCache = [];
let allOrdersCache = [];
let allRolesCache = [];
let allAFACache = [];
let allTicketsCache = [];
let fundingCache = [];
let settlementsCache = [];
let currentRenderedOrderRows = [];

// Pagination state
const PAGE_SIZE = 15;
let usersPage = 1, ordersPage = 1, afaPage = 1, ticketsPage = 1;
let ordersSortField = 'created_at', ordersSortAsc = false;

// ── Utilities ──
function formatMoney(value) {
  return `GHS ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function updateLastSync() {
  const now = new Date().toLocaleString();
  const sync = document.getElementById('lastSync');
  if (sync) sync.innerText = `Last sync: ${now}`;
  const sub = document.getElementById('statusSyncTime');
  if (sub) sub.innerText = now;
}

function statusBadge(status) {
  const text = String(status || 'pending').toLowerCase();
  const cls = text.replace(/\s+/g, '_');
  return `<span class="status-pill ${esc(cls)}">${esc(text)}</span>`;
}

function getOrderCustomer(order) {
  return Array.isArray(order?.users) ? (order.users[0] || {}) : (order?.users || {});
}

function getOrderCustomerText(order) {
  const customer = getOrderCustomer(order);
  return [
    `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
    customer.email,
    customer.phone,
  ].map(v => String(v || '').toLowerCase()).join(' ');
}

function getTargetPhoneQuery() {
  return (document.getElementById('targetedCustomerPhone')?.value || '').trim();
}

function formatTargetStatusLabel(status) {
  const safe = String(status || '').trim().toLowerCase();
  if (!safe) return '';
  return safe.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

// ── Sidebar Navigation ──
function switchSection(sectionId, navEl) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const target = document.getElementById('section-' + sectionId);
  if (target) target.classList.add('active');
  if (navEl) navEl.classList.add('active');
  const titleMap = {
    dashboard: 'Dashboard', users: 'Users', orders: 'Orders',
    finance: 'Finance', notifications: 'Notifications',
    afa: 'AFA Manager', support: 'Support',
    matrix: 'Delivery Matrix', gateway: 'Payment Gateway'
  };
  const pageTitle = document.getElementById('pageTitle');
  if (pageTitle) pageTitle.innerText = titleMap[sectionId] || 'Dashboard';
  // Close sidebar on mobile
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('open');
}

function toggleDarkMode() {
  const dark = document.getElementById('darkModeToggle')?.checked;
  document.body.classList.toggle('dark', dark);
  try { localStorage.setItem('admin_dark_mode', dark ? '1' : '0'); } catch(e) {}
}

function restoreDarkMode() {
  try {
    if (localStorage.getItem('admin_dark_mode') === '1') {
      document.body.classList.add('dark');
      const toggle = document.getElementById('darkModeToggle');
      if (toggle) toggle.checked = true;
    }
  } catch(e) {}
}

// ── Pagination helper ──
function renderPagination(containerId, currentPage, totalPages, callbackName) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  let html = `<button ${currentPage <= 1 ? 'disabled' : ''} onclick="${callbackName}(${currentPage - 1})">‹</button>`;
  const range = 2;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - range && i <= currentPage + range)) {
      html += `<button class="${i === currentPage ? 'active' : ''}" onclick="${callbackName}(${i})">${i}</button>`;
    } else if (i === currentPage - range - 1 || i === currentPage + range + 1) {
      html += '<span class="page-info">…</span>';
    }
  }
  html += `<button ${currentPage >= totalPages ? 'disabled' : ''} onclick="${callbackName}(${currentPage + 1})">›</button>`;
  container.innerHTML = html;
}

// ── CSV Export ──
function downloadCSV(filename, headers, rows) {
  const lines = [headers.join(',')];
  rows.forEach(r => lines.push(r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportUsersCSV() {
  const rows = allUsersCache.map(u => [
    `${u.first_name || ''} ${u.last_name || ''}`.trim(),
    u.email || '', u.phone || '', u.role || 'client',
    u.wallet_balance || 0, new Date(u.created_at).toLocaleDateString()
  ]);
  downloadCSV('users_export.csv', ['Name','Email','Phone','Role','Wallet','Joined'], rows);
}

function exportOrdersCSV() {
  const rows = allOrdersCache.map(o => [
    o.phone || '', o.plan || ''
  ]);
  downloadCSV('orders_export.csv', ['Recipient Number','Plan Size'], rows);
}

async function copyOrdersForExcel() {
  const rows = getFilteredOrders().map(o => [o.phone || '', o.plan || '']);

  if (!rows.length) {
    alert('No orders available to copy.');
    return;
  }

  const lines = [
    ['Recipient Number', 'Plan Size'].join('\t'),
    ...rows.map(row => row.join('\t')),
  ];

  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    alert(`Copied ${rows.length} row(s) in Excel format.`);
  } catch (error) {
    alert(`Copy failed: ${error.message}`);
  }
}

function exportAFACSV() {
  const rows = allAFACache.map(a => [
    a.full_name || a.name || '', a.phone || '', a.type || '',
    a.status || '', new Date(a.created_at).toLocaleDateString()
  ]);
  downloadCSV('afa_export.csv', ['Name','Phone','Type','Status','Registered'], rows);
}

// ── Metrics ──
async function loadMetrics() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [usersRes, ordersTodayRes, pendingFundingRes, walletsRes, pendingSettlementsRes, revenueTodayRes, ticketsRes] = await Promise.all([
    window.supabase.from('users').select('id', { count: 'exact', head: true }),
    window.supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()),
    window.supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('type', 'Deposit (Manual)').eq('status', 'pending'),
    window.supabase.from('users').select('wallet_balance'),
    window.supabase.from('free_mode_settlements').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    window.supabase.from('orders').select('amount').eq('status', 'completed').gte('created_at', todayStart.toISOString()),
    window.supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ]);

  document.getElementById('metricUsers').innerText = String(usersRes.count || 0);
  document.getElementById('metricOrdersToday').innerText = String(ordersTodayRes.count || 0);
  document.getElementById('metricPendingFunding').innerText = String(pendingFundingRes.count || 0);
  document.getElementById('metricPendingSettlements').innerText = String(pendingSettlementsRes.count || 0);

  const totalWallet = (walletsRes.data || []).reduce((sum, r) => sum + Number(r.wallet_balance || 0), 0);
  document.getElementById('metricWallets').innerText = formatMoney(totalWallet);

  const revenueToday = (revenueTodayRes.data || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
  document.getElementById('metricRevenueToday').innerText = formatMoney(revenueToday);

  const openTickets = ticketsRes.count || 0;
  const el = document.getElementById('metricOpenTickets');
  if (el) el.innerText = String(openTickets);

  document.getElementById('metricStatus').innerText = navigator.onLine ? 'Online' : 'Offline';
  updateLastSync();
}

// ── Dashboard mini-tables ──
async function loadDashUsers() {
  const tbody = document.getElementById('dashUsersBody');
  if (!tbody) return;
  const { data, error } = await window.supabase
    .from('users').select('first_name, last_name, email, role, created_at')
    .order('created_at', { ascending: false }).limit(6);
  if (error) { tbody.innerHTML = `<tr><td colspan="4" class="state-msg">${esc(error.message)}</td></tr>`; return; }
  const users = data || [];
  if (!users.length) { tbody.innerHTML = '<tr><td colspan="4" class="state-msg">No users yet.</td></tr>'; return; }
  tbody.innerHTML = users.map(u => {
    const name = esc(`${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Unnamed');
    return `<tr><td>${name}</td><td>${esc(u.email || '-')}</td><td>${esc(u.role || 'client')}</td><td>${esc(new Date(u.created_at).toLocaleDateString())}</td></tr>`;
  }).join('');
}

async function loadDashOrders() {
  const tbody = document.getElementById('dashOrdersBody');
  if (!tbody) return;
  const { data, error } = await window.supabase
    .from('orders').select('phone, network, plan, amount, status')
    .order('created_at', { ascending: false }).limit(6);
  if (error) { tbody.innerHTML = `<tr><td colspan="5" class="state-msg">${esc(error.message)}</td></tr>`; return; }
  const orders = data || [];
  if (!orders.length) { tbody.innerHTML = '<tr><td colspan="5" class="state-msg">No orders yet.</td></tr>'; return; }
  tbody.innerHTML = orders.map(o => `<tr><td>${esc(o.phone || '-')}</td><td>${esc(o.network || '-')}</td><td>${esc(o.plan || '-')}</td><td>${formatMoney(o.amount)}</td><td>${statusBadge(o.status)}</td></tr>`).join('');
}

// ── Users Section (full table with pagination) ──
async function loadAllUsers() {
  const { data, error } = await window.supabase
    .from('users').select('id, first_name, last_name, email, phone, role, wallet_balance, created_at, merchant_id')
    .order('created_at', { ascending: false });
  if (error) { console.error('loadAllUsers:', error.message); return; }
  allUsersCache = data || [];
  const countEl = document.getElementById('usersCount');
  if (countEl) countEl.innerText = `${allUsersCache.length} users`;
  usersPage = 1;
  renderUsersTable(allUsersCache);
}

function renderUsersTable(users) {
  const tbody = document.getElementById('recentUsersBody');
  if (!tbody) return;
  if (!users.length) { tbody.innerHTML = '<tr><td colspan="8" class="state-msg">No users found.</td></tr>'; renderPagination('usersPagination', 1, 1, 'goUsersPage'); return; }
  const totalPages = Math.ceil(users.length / PAGE_SIZE);
  if (usersPage > totalPages) usersPage = totalPages;
  const start = (usersPage - 1) * PAGE_SIZE;
  const page = users.slice(start, start + PAGE_SIZE);
  tbody.innerHTML = page.map(u => {
    const name = esc(`${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Unnamed');
    const displayCode = esc(u.merchant_id || u.id.slice(0,8).toUpperCase());
    const shortId = `<span class="user-id-code" title="${esc(u.id)}">${displayCode}</span>`;
    const actionBtns = `<div class="support-actions">
      <button class="tiny-btn role-save" onclick="viewUserTransactions('${esc(u.id)}','${name}')">&#128196; Transactions</button>
      <button class="tiny-btn reject" onclick="deleteUser('${esc(u.id)}','${name}')">&#128465; Delete</button>
    </div>`;
    return `<tr><td>${shortId}</td><td>${name}</td><td>${esc(u.email || '-')}</td><td>${esc(u.phone || '-')}</td><td>${esc(u.role || 'client')}</td><td>${formatMoney(u.wallet_balance)}</td><td>${esc(new Date(u.created_at).toLocaleDateString())}</td><td>${actionBtns}</td></tr>`;
  }).join('');
  renderPagination('usersPagination', usersPage, totalPages, 'goUsersPage');
}

function goUsersPage(p) { usersPage = p; filterUsersTable(); }

function filterUsersTable() {
  const q = (document.getElementById('usersSearch')?.value || '').trim().toLowerCase();
  const filtered = allUsersCache.filter(u => {
    const name = `${u.first_name || ''} ${u.last_name || ''}`.trim().toLowerCase();
    const email = String(u.email || '').toLowerCase();
    const phone = String(u.phone || '').toLowerCase();
    const uid   = String(u.id || '').toLowerCase();
    return name.includes(q) || email.includes(q) || phone.includes(q) || uid.includes(q);
  });
  renderUsersTable(filtered);
}

async function viewUserTransactions(userId, userName) {
  const modal = document.getElementById('userTxModal');
  if (!modal) return;
  document.getElementById('userTxModalName').textContent = userName || 'User';
  document.getElementById('userTxModalMeta').textContent = 'Loading transactions...';
  document.getElementById('userTxBody').innerHTML = '<tr><td colspan="6" class="state-msg">Loading...</td></tr>';
  modal.classList.add('open');

  const { data, error } = await window.supabase
    .from('transactions')
    .select('id, type, amount, reference, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    document.getElementById('userTxBody').innerHTML = `<tr><td colspan="6" class="state-msg">${esc(error.message)}</td></tr>`;
    document.getElementById('userTxModalMeta').textContent = 'Error loading transactions';
    return;
  }

  const rows = data || [];
  document.getElementById('userTxModalMeta').textContent =
    `${rows.length} transaction${rows.length !== 1 ? 's' : ''} • User ID: ${userId.slice(0,8).toUpperCase()}`;

  if (!rows.length) {
    document.getElementById('userTxBody').innerHTML = '<tr><td colspan="6" class="state-msg">No transactions found for this user.</td></tr>';
    return;
  }

  document.getElementById('userTxBody').innerHTML = rows.map((t, i) => {
    const dt = new Date(t.created_at);
    const dateStr = esc(dt.toLocaleString());
    return `<tr>
      <td style="color:var(--muted);font-size:12px">${i + 1}</td>
      <td>${esc(t.type || '-')}</td>
      <td>${formatMoney(t.amount)}</td>
      <td style="font-size:12px;color:var(--muted)">${esc(t.reference || '-')}</td>
      <td>${statusBadge(t.status)}</td>
      <td style="font-size:12px;white-space:nowrap">${dateStr}</td>
    </tr>`;
  }).join('');
}
window.viewUserTransactions = viewUserTransactions;

function closeUserTxModal() {
  const modal = document.getElementById('userTxModal');
  if (modal) modal.classList.remove('open');
}
window.closeUserTxModal = closeUserTxModal;

async function deleteUser(userId, userName) {
  const confirmed = confirm(`Delete user "${userName}"?\n\nThis will permanently remove their account, orders, wallet, and all data. This cannot be undone.`);
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Delete failed');
    // Remove from local cache and re-render
    allUsersCache = allUsersCache.filter(u => u.id !== userId);
    const countEl = document.getElementById('usersCount');
    if (countEl) countEl.innerText = `${allUsersCache.length} users`;
    renderUsersTable(allUsersCache);
    alert(`User "${userName}" has been permanently deleted.`);
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}
window.deleteUser = deleteUser;

// ── Roles Manager ──
async function loadRolesManager() {
  const { data, error } = await window.supabase
    .from('users').select('id, first_name, last_name, email, role')
    .order('created_at', { ascending: false });
  if (error) { console.error('loadRolesManager:', error.message); return; }
  allRolesCache = data || [];
  renderRolesTable(allRolesCache);
}

function renderRolesTable(users) {
  const tbody = document.getElementById('rolesBody');
  if (!tbody) return;
  if (!users.length) { tbody.innerHTML = '<tr><td colspan="5" class="state-msg">No users.</td></tr>'; return; }
  tbody.innerHTML = users.slice(0, 50).map(u => {
    const name = esc(`${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Unnamed');
    const uid = esc(u.id);
    return `<tr>
      <td>${name}</td><td>${esc(u.email || '-')}</td><td>${esc(u.role || 'client')}</td>
      <td><select class="role-select" id="roleSelect_${uid}">
        <option value="client" ${u.role==='client'?'selected':''}>Client</option>
        <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
        <option value="agent" ${u.role==='agent'?'selected':''}>Agent</option>
      </select></td>
      <td><button class="tiny-btn role-save" onclick="changeUserRole('${uid}')">Save</button></td>
    </tr>`;
  }).join('');
}

function filterRolesTable() {
  const q = (document.getElementById('rolesSearch')?.value || '').trim().toLowerCase();
  const filtered = allRolesCache.filter(u => {
    const name = `${u.first_name || ''} ${u.last_name || ''}`.trim().toLowerCase();
    return name.includes(q) || String(u.email || '').toLowerCase().includes(q);
  });
  renderRolesTable(filtered);
}

async function changeUserRole(userId) {
  const select = document.getElementById('roleSelect_' + userId);
  if (!select) return;
  const newRole = select.value;
  const { error } = await window.supabase.from('users').update({ role: newRole }).eq('id', userId);
  if (error) { alert('Role update failed: ' + error.message); return; }
  await loadRolesManager();
}

// ── Orders Section (full table with pagination + sorting) ──
async function loadAllOrders() {
  const { data, error } = await window.supabase
    .from('orders').select('id, user_id, phone, network, plan, amount, status, created_at, users(first_name, last_name, email, phone)')
    .order(ordersSortField, { ascending: ordersSortAsc })
    .limit(500);
  if (error) { console.error('loadAllOrders:', error.message); return; }
  allOrdersCache = data || [];
  syncOrdersNetworkFilterOptions();
  syncOrdersProductFilterOptions();
  const countEl = document.getElementById('ordersCount');
  if (countEl) countEl.innerText = `${allOrdersCache.length} orders`;
  ordersPage = 1;
  renderOrdersTable(getFilteredOrders());
}
I
function syncOrdersNetworkFilterOptions() {
  const select = document.getElementById('ordersNetworkFilter');
  if (!select) return;

  const currentValue = select.value;
  const networks = Array.from(new Set(allOrdersCache
    .map(o => String(o.network || '').trim())
    .filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));

  select.innerHTML = '<option value="">All Networks</option>' +
    networks.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');

  if (currentValue && networks.includes(currentValue)) {
    select.value = currentValue;
  }
}

function syncOrdersProductFilterOptions() {
  const select = document.getElementById('ordersProductFilter');
  if (!select) return;

  const currentValue = select.value;
  const products = Array.from(new Set(allOrdersCache
    .map(o => String(o.plan || '').trim())
    .filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));

  select.innerHTML = '<option value="">All Products</option>' +
    products.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');

  if (currentValue && products.includes(currentValue)) {
    select.value = currentValue;
  }
}

function getFilteredOrders() {
  const customerFilter = (document.getElementById('ordersCustomerFilter')?.value || '').trim().toLowerCase();
  const statusFilter = (document.getElementById('ordersStatusFilter')?.value || '').toLowerCase();
  const networkFilter = (document.getElementById('ordersNetworkFilter')?.value || '').toLowerCase();
  const productFilter = (document.getElementById('ordersProductFilter')?.value || '').toLowerCase();
  const targetNumber = getTargetPhoneQuery().toLowerCase();
  const targetStatus = (document.getElementById('ordersTargetStatus')?.value || '').toLowerCase();
  const dateFilter = document.getElementById('ordersDateFilter')?.value || '';

  return allOrdersCache.filter(o => {
    const customerText = getOrderCustomerText(o);

    const recipientPhone = String(o.phone || '').toLowerCase();
    const createdAt = new Date(o.created_at || 0);
    const createdDateKey = Number.isNaN(createdAt.getTime()) ? '' : createdAt.toISOString().slice(0, 10);
    const matchCustomer = !customerFilter || customerText.includes(customerFilter);
    const matchStatus = !statusFilter || String(o.status || '').toLowerCase() === statusFilter;
    const matchNetwork = !networkFilter || String(o.network || '').toLowerCase() === networkFilter;
    const matchProduct = !productFilter || String(o.plan || '').toLowerCase() === productFilter;
    const matchTargetNumber = !targetNumber || recipientPhone.includes(targetNumber) || customerText.includes(targetNumber);
    const matchTargetStatus = !targetNumber || !targetStatus || String(o.status || '').toLowerCase() === targetStatus;
    const matchTargetScope = !targetNumber ? true : (targetStatus ? matchTargetStatus : matchTargetNumber);
    const matchDate = !dateFilter || createdDateKey === dateFilter;
    return matchCustomer && matchStatus && matchNetwork && matchProduct && matchTargetScope && matchDate;
  });
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById('recentOrdersBody');
  if (!tbody) return;
  if (!orders.length) { tbody.innerHTML = '<tr><td colspan="8" class="state-msg">No orders found.</td></tr>'; renderPagination('ordersPagination', 1, 1, 'goOrdersPage'); return; }
  const totalPages = Math.ceil(orders.length / PAGE_SIZE);
  if (ordersPage > totalPages) ordersPage = totalPages;
  const start = (ordersPage - 1) * PAGE_SIZE;
  const page = orders.slice(start, start + PAGE_SIZE);
  currentRenderedOrderRows = page;

  const selectAll = document.getElementById('ordersSelectAll');
  if (selectAll) selectAll.checked = false;

  tbody.innerHTML = page.map(o => {
    const oid = esc(o.id);
    const customer = getOrderCustomer(o);
    const customerName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
    const customerLabel = customerName || customer.email || customer.phone || '-';
    const customerBlock = `<div class="order-stack"><strong>${esc(customerLabel)}</strong></div>`;
    const productBlock = `<div class="order-stack"><strong>${esc(o.network || '-')}</strong><span>${esc(o.plan || '-')}</span></div>`;
    return `<tr><td><input type="checkbox" class="order-check" value="${oid}" onchange="onOrdersSelectionChange()"></td><td>${oid}</td><td>${customerBlock}</td><td>${productBlock}</td><td>${formatMoney(o.amount)}</td><td>${statusBadge(o.status)}</td><td>${esc(new Date(o.created_at).toLocaleDateString())}</td><td><div class="order-row-actions"><button class="tiny-btn approve" onclick="refundLegacyOrder('${oid}')">Refund</button></div></td></tr>`;
  }).join('');

  renderPagination('ordersPagination', ordersPage, totalPages, 'goOrdersPage');
  onOrdersSelectionChange();
}

function toggleOrdersSelectAll() {
  const checked = document.getElementById('ordersSelectAll')?.checked;
  document.querySelectorAll('.order-check').forEach(cb => cb.checked = checked);
  onOrdersSelectionChange();
}

function onOrdersSelectionChange() {
  const all = document.querySelectorAll('.order-check');
  const checked = document.querySelectorAll('.order-check:checked');
  const selectAll = document.getElementById('ordersSelectAll');
  if (!selectAll) return;
  selectAll.checked = all.length > 0 && checked.length === all.length;

  const hasSelection = checked.length > 0;
  const show = el => { if (el) el.style.display = ''; };
  const hide = el => { if (el) el.style.display = 'none'; };
  const toggle = id => hasSelection ? show(document.getElementById(id)) : hide(document.getElementById(id));

  toggle('ordersBulkStatus');
  toggle('ordersMassUpdateBtn');
  toggle('ordersMassDeleteBtn');
  toggle('ordersRefundLegacyBtn');
  toggle('ordersCopyExcelBtn');
  toggle('ordersExportCsvBtn');
}

function getSelectedOrderIds() {
  return Array.from(document.querySelectorAll('.order-check:checked')).map(cb => cb.value);
}

async function bulkUpdateSelectedOrders() {
  const selectedIds = getSelectedOrderIds();
  if (!selectedIds.length) { alert('No orders selected.'); return; }

  const newStatus = (document.getElementById('ordersBulkStatus')?.value || '').trim();
  if (!newStatus) { alert('Select a status first.'); return; }

  const { error } = await window.supabase
    .from('orders')
    .update({ status: newStatus })
    .in('id', selectedIds);

  if (error) { alert('Mass update failed: ' + error.message); return; }

  await loadAllOrders();
  await loadDashOrders();
  await loadMetrics();
}

function detectTargetStatusFromPhone() {
  const phoneQuery = getTargetPhoneQuery().trim().toLowerCase();
  const preview = document.getElementById('targetStatusPreview');
  if (!phoneQuery) {
    if (preview) preview.innerText = 'Enter a phone number to detect its latest status and show matching rows.';
    alert('Enter the phone number first.');
    return;
  }

  const matched = allOrdersCache
    .filter(order => {
      const recipientPhone = String(order.phone || '').toLowerCase();
      const customerText = getOrderCustomerText(order);
      return recipientPhone.includes(phoneQuery) || customerText.includes(phoneQuery);
    })
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  if (!matched.length) {
    if (preview) preview.innerText = `No orders found for ${phoneQuery}.`;
    alert('No orders found for that phone number.');
    return;
  }

  const detectedStatus = String(matched[0].status || '').toLowerCase();
  const targetStatusInput = document.getElementById('ordersTargetStatus');
  const statusFilterInput = document.getElementById('ordersStatusFilter');
  const targetedCurrentStatus = document.getElementById('targetedCurrentStatus');

  if (targetStatusInput) targetStatusInput.value = detectedStatus;
  if (statusFilterInput) statusFilterInput.value = detectedStatus;
  if (targetedCurrentStatus) targetedCurrentStatus.value = formatTargetStatusLabel(detectedStatus);
  if (preview) preview.innerText = `Detected latest status: ${formatTargetStatusLabel(detectedStatus)}. Table now shows all orders with the same status.`;

  filterOrdersTable();
}

function selectOrdersRelativeToTarget(direction) {
  const phoneQuery = getTargetPhoneQuery().trim().toLowerCase();
  const preview = document.getElementById('targetStatusPreview');
  if (!phoneQuery) {
    alert('Enter the phone number first.');
    return;
  }

  if (!currentRenderedOrderRows.length) {
    alert('No visible orders available for selection.');
    return;
  }

  const matchedIndexes = currentRenderedOrderRows
    .map((order, index) => ({ order, index }))
    .filter(({ order }) => {
      const recipientPhone = String(order.phone || '').toLowerCase();
      const customerText = getOrderCustomerText(order);
      return recipientPhone.includes(phoneQuery) || customerText.includes(phoneQuery);
    })
    .map(item => item.index);

  if (!matchedIndexes.length) {
    alert('The searched phone number is not visible in the current table page.');
    return;
  }

  const firstMatch = Math.min(...matchedIndexes);
  const lastMatch = Math.max(...matchedIndexes);
  const selectedIds = currentRenderedOrderRows
    .filter((_, index) => direction === 'up' ? index <= lastMatch : index >= firstMatch)
    .map(order => String(order.id));

  document.querySelectorAll('.order-check').forEach(cb => {
    cb.checked = selectedIds.includes(String(cb.value));
  });

  onOrdersSelectionChange();

  if (preview) {
    preview.innerText = direction === 'up'
      ? 'Selected the searched phone row(s) and all visible rows above for bulk update.'
      : 'Selected the searched phone row(s) and all visible rows below for bulk update.';
  }
}

async function bulkDeleteSelectedOrders() {
  const selectedIds = getSelectedOrderIds();
  if (!selectedIds.length) { alert('No orders selected.'); return; }

  const confirmed = confirm(`Delete ${selectedIds.length} selected order(s)? This cannot be undone.`);
  if (!confirmed) return;

  const { error } = await window.supabase
    .from('orders')
    .delete()
    .in('id', selectedIds);

  if (error) { alert('Mass delete failed: ' + error.message); return; }

  await loadAllOrders();
  await loadDashOrders();
  await loadMetrics();
}

async function refundLegacyOrder(orderId) {
  const confirmed = confirm('Process legacy refund for this order?');
  if (!confirmed) return;

  const { data, error } = await window.supabase.rpc('admin_refund_legacy_order', {
    p_order_id: orderId,
  });

  if (error) {
    alert(`Refund failed: ${error.message}`);
    return;
  }

  if (data?.skipped) {
    alert(`Legacy refund skipped: ${data.reason || 'not eligible'}.`);
  }

  await loadAllOrders();
  await loadDashOrders();
  await loadMetrics();
}

async function bulkRefundLegacyOrders() {
  const selectedIds = getSelectedOrderIds();
  if (!selectedIds.length) { alert('No orders selected.'); return; }

  const confirmed = confirm(`Process legacy refund for ${selectedIds.length} selected order(s)?`);
  if (!confirmed) return;

  let refundedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const orderId of selectedIds) {
    const { data, error } = await window.supabase.rpc('admin_refund_legacy_order', {
      p_order_id: orderId,
    });

    if (error) {
      failedCount += 1;
      continue;
    }

    if (data?.skipped) {
      skippedCount += 1;
    } else {
      refundedCount += 1;
    }
  }

  alert(`Legacy refund completed. Refunded: ${refundedCount}. Skipped: ${skippedCount}. Failed: ${failedCount}.`);

  await loadAllOrders();
  await loadDashOrders();
  await loadMetrics();
}

function goOrdersPage(p) { ordersPage = p; renderOrdersTable(getFilteredOrders()); }

function filterOrdersTable() { ordersPage = 1; renderOrdersTable(getFilteredOrders()); }

function sortOrders(field) {
  if (ordersSortField === field) { ordersSortAsc = !ordersSortAsc; }
  else { ordersSortField = field; ordersSortAsc = true; }
  loadAllOrders();
}

async function updateTargetedCustomerOrders() {
  const phone = (document.getElementById('targetedCustomerPhone')?.value || '').trim();
  const targetStatus = document.getElementById('targetedCurrentStatus')?.value || '';
  const newStatus = document.getElementById('targetedNewStatus')?.value || '';

  if (!phone) {
    alert('Please enter a customer phone number.');
    return;
  }

  try {
    const { data } = await axios.post('/api/admin/orders/update-targeted', {
      customerPhone: phone,
      targetStatus,
      newStatus,
    });

    alert(`Updated ${Number(data?.updatedCount || 0)} order(s) for ${phone}.`);
  } catch (error) {
    const serverMessage = error?.response?.data?.message;
    alert(`Targeted update failed: ${serverMessage || error.message}`);
  }
}

// ── Notifications ──
async function loadNotificationsAdmin() {
  const tbody = document.getElementById('notificationsBody');
  if (!tbody) return;
  const { data, error } = await window.supabase
    .from('notifications').select('id, content, type, is_active, created_at')
    .order('created_at', { ascending: false }).limit(20);
  if (error) { tbody.innerHTML = `<tr><td colspan="5" class="state-msg">${esc(error.message)}</td></tr>`; return; }
  const rows = data || [];
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="5" class="state-msg">No notifications yet.</td></tr>'; return; }
  tbody.innerHTML = rows.map(n => {
    const nid = esc(n.id);
    return `<tr>
      <td>${esc(n.content)}</td>
      <td>${statusBadge(n.type)}</td>
      <td>${n.is_active ? '<span class="status-pill success">Active</span>' : '<span class="status-pill closed">Inactive</span>'}</td>
      <td>${esc(new Date(n.created_at).toLocaleString())}</td>
      <td><button class="tiny-btn ${n.is_active ? 'on' : 'off'}" onclick="toggleNotificationActive('${nid}', ${n.is_active ? 'false' : 'true'})">${n.is_active ? 'Deactivate' : 'Activate'}</button></td>
    </tr>`;
  }).join('');
}

async function createNotification(event) {
  event.preventDefault();
  const content = document.getElementById('notifContent').value.trim();
  const type = document.getElementById('notifType').value;
  if (!content) return;
  const { error } = await window.supabase.from('notifications').insert({ content, type, is_active: true });
  if (error) { alert('Notification create failed: ' + error.message); return; }
  document.getElementById('notifContent').value = '';
  await loadNotificationsAdmin();
}

async function toggleNotificationActive(id, nextValue) {
  const { error } = await window.supabase.from('notifications').update({ is_active: nextValue }).eq('id', id);
  if (error) { alert('Update failed: ' + error.message); return; }
  await loadNotificationsAdmin();
}

// ── Finance: Pending Funding ──
async function loadPendingFunding() {
  const tbody = document.getElementById('manualFundingBody');
  if (!tbody) return;
  const { data, error } = await window.supabase
    .from('transactions')
    .select('id, amount, reference, created_at, user_id, users(first_name, last_name, email)')
    .eq('type', 'Deposit (Manual)').eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) { tbody.innerHTML = `<tr><td colspan="6" class="state-msg">${esc(error.message)}</td></tr>`; return; }
  fundingCache = data || [];
  if (!fundingCache.length) { tbody.innerHTML = '<tr><td colspan="6" class="state-msg">No pending funding requests.</td></tr>'; return; }
  tbody.innerHTML = fundingCache.map(t => {
    const user = t.users || {};
    const name = esc(`${user.first_name || ''} ${user.last_name || ''}`.trim() || esc(user.email || 'Unknown'));
    const tid = esc(t.id);
    return `<tr>
      <td><input type="checkbox" class="funding-check" value="${tid}"></td>
      <td>${name}</td><td>${formatMoney(t.amount)}</td><td>${esc(t.reference || '-')}</td>
      <td>${esc(new Date(t.created_at).toLocaleString())}</td>
      <td>
        <button class="tiny-btn approve" onclick="approveFunding('${tid}')">✓</button>
        <button class="tiny-btn reject" onclick="rejectFunding('${tid}')">✗</button>
      </td>
    </tr>`;
  }).join('');
}

function toggleFundingSelectAll() {
  const checked = document.getElementById('fundingSelectAll')?.checked;
  document.querySelectorAll('.funding-check').forEach(cb => cb.checked = checked);
}

async function approveFunding(txId) {
  const tx = fundingCache.find(t => t.id === txId);
  if (!tx) return;
  const { error: txErr } = await window.supabase.from('transactions').update({ status: 'approved' }).eq('id', txId);
  if (txErr) { alert('Approve failed: ' + txErr.message); return; }
  // Credit user wallet
  const { data: userData } = await window.supabase.from('users').select('wallet_balance').eq('id', tx.user_id).single();
  if (userData) {
    const newBalance = Number(userData.wallet_balance || 0) + Number(tx.amount || 0);
    await window.supabase.from('users').update({ wallet_balance: newBalance }).eq('id', tx.user_id);
  }
  await loadPendingFunding();
  await loadMetrics();
}

async function rejectFunding(txId) {
  const { error } = await window.supabase.from('transactions').update({ status: 'rejected' }).eq('id', txId);
  if (error) { alert('Reject failed: ' + error.message); return; }
  await loadPendingFunding();
  await loadMetrics();
}

async function bulkApproveFunding() {
  const checked = Array.from(document.querySelectorAll('.funding-check:checked')).map(cb => cb.value);
  if (!checked.length) { alert('No items selected.'); return; }
  for (const txId of checked) { await approveFunding(txId); }
}

// ── Finance: Pending Settlements ──
async function loadPendingSettlements() {
  const tbody = document.getElementById('settlementsBody');
  if (!tbody) return;
  const { data, error } = await window.supabase
    .from('free_mode_settlements')
    .select('id, amount, reference, created_at, user_id, users(first_name, last_name, email)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) { tbody.innerHTML = `<tr><td colspan="6" class="state-msg">${esc(error.message)}</td></tr>`; return; }
  settlementsCache = data || [];
  if (!settlementsCache.length) { tbody.innerHTML = '<tr><td colspan="6" class="state-msg">No pending settlements.</td></tr>'; return; }
  tbody.innerHTML = settlementsCache.map(s => {
    const user = s.users || {};
    const name = esc(`${user.first_name || ''} ${user.last_name || ''}`.trim() || esc(user.email || 'Unknown'));
    const sid = esc(s.id);
    return `<tr>
      <td><input type="checkbox" class="settlement-check" value="${sid}"></td>
      <td>${name}</td><td>${formatMoney(s.amount)}</td><td>${esc(s.reference || '-')}</td>
      <td>${esc(new Date(s.created_at).toLocaleString())}</td>
      <td>
        <button class="tiny-btn approve" onclick="approveSettlement('${sid}')">✓</button>
        <button class="tiny-btn reject" onclick="rejectSettlement('${sid}')">✗</button>
      </td>
    </tr>`;
  }).join('');
}

function toggleSettlementSelectAll() {
  const checked = document.getElementById('settlementSelectAll')?.checked;
  document.querySelectorAll('.settlement-check').forEach(cb => cb.checked = checked);
}

async function approveSettlement(sId) {
  const { error } = await window.supabase.from('free_mode_settlements').update({ status: 'approved' }).eq('id', sId);
  if (error) { alert('Approve failed: ' + error.message); return; }
  await loadPendingSettlements();
  await loadMetrics();
}

async function rejectSettlement(sId) {
  const { error } = await window.supabase.from('free_mode_settlements').update({ status: 'rejected' }).eq('id', sId);
  if (error) { alert('Reject failed: ' + error.message); return; }
  await loadPendingSettlements();
  await loadMetrics();
}

async function bulkApproveSettlements() {
  const checked = Array.from(document.querySelectorAll('.settlement-check:checked')).map(cb => cb.value);
  if (!checked.length) { alert('No items selected.'); return; }
  for (const sId of checked) { await approveSettlement(sId); }
}

// ── AFA Registrations ──
async function loadAFARegistrations() {
  const { data, error } = await window.supabase
    .from('afa_registrations')
    .select('id, full_name, name, phone, type, tier, status, created_at, id_type, id_number, id_front_url, id_back_url')
    .order('created_at', { ascending: false });
  if (error) {
    const tbody = document.getElementById('afaBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="state-msg">${esc(error.message)}</td></tr>`;
    const normalBody = document.getElementById('afaNormalBody');
    const premiumBody = document.getElementById('afaPremiumBody');
    if (normalBody) normalBody.innerHTML = `<tr><td colspan="4" class="state-msg">${esc(error.message)}</td></tr>`;
    if (premiumBody) premiumBody.innerHTML = `<tr><td colspan="4" class="state-msg">${esc(error.message)}</td></tr>`;
    return;
  }
  allAFACache = data || [];
  const countEl = document.getElementById('afaCount');
  if (countEl) countEl.innerText = `${allAFACache.length} registrations`;
  afaPage = 1;
  renderAFATable(allAFACache);
  renderAFAReturnsTables(allAFACache);
}

function normalizedAfaTier(item) {
  return String(item?.tier || item?.type || '').trim().toLowerCase();
}

function renderAFAReturnsTables(items) {
  const normalRows = items.filter(i => normalizedAfaTier(i) === 'normal');
  const premiumRows = items.filter(i => normalizedAfaTier(i) === 'premium');

  const normalCount = document.getElementById('afaNormalCount');
  const premiumCount = document.getElementById('afaPremiumCount');
  if (normalCount) normalCount.innerText = `${normalRows.length} records`;
  if (premiumCount) premiumCount.innerText = `${premiumRows.length} records`;

  renderAFANormalRows(normalRows);
  renderAFAReturnRows('afaPremiumBody', premiumRows, 'No premium AFA returns yet.');
}

function renderAFANormalRows(rows) {
  const tbody = document.getElementById('afaNormalBody');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="state-msg">No normal AFA returns yet.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.slice(0, 30).map(r => {
    const displayName = esc(r.full_name || r.name || '-');
    const idNum = esc(r.id_number || '-');
    const hasDoc = r.id_front_url || r.id_back_url;
    const docBtn = hasDoc
      ? `<button class="tiny-btn role-save" onclick="viewAfaDocs('${esc(r.id)}','${esc(r.full_name || r.name || '')}','${encodeURIComponent(r.id_front_url || '')}','${encodeURIComponent(r.id_back_url || '')}','${esc(r.id_type || '')}','${esc(r.id_number || '')}')">&#128065; View Docs</button>`
      : '<span style="color:var(--muted);font-size:12px">No docs</span>';
    const actionBtns = buildAFAActionBtns(r.id, r.status);
    return `<tr><td>${displayName}</td><td>${esc(r.phone || '-')}</td><td>${idNum}</td><td>${statusBadge(r.status)}</td><td>${esc(new Date(r.created_at).toLocaleDateString())}</td><td>${docBtn}</td><td>${actionBtns}</td></tr>`;
  }).join('');
}

function renderAFAReturnRows(tbodyId, rows, emptyMessage) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="state-msg">${esc(emptyMessage)}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.slice(0, 30).map(r => {
    const displayName = esc(r.full_name || r.name || '-');
    const idNum = esc(r.id_number || '-');
    const actionBtns = buildAFAActionBtns(r.id, r.status);
    return `<tr><td>${displayName}</td><td>${esc(r.phone || '-')}</td><td>${idNum}</td><td>${statusBadge(r.status)}</td><td>${esc(new Date(r.created_at).toLocaleDateString())}</td><td>${actionBtns}</td></tr>`;
  }).join('');
}

function buildAFAActionBtns(id, status) {
  const s = String(status || '').toLowerCase();
  const approveBtn = `<button class="tiny-btn approve" onclick="updateAFAStatus('${esc(id)}','approved')" ${s === 'approved' ? 'disabled' : ''}>&#10003; Approve</button>`;
  const rejectBtn  = `<button class="tiny-btn reject"  onclick="updateAFAStatus('${esc(id)}','rejected')" ${s === 'rejected' ? 'disabled' : ''}>&#10007; Reject</button>`;
  return `<div class="support-actions">${approveBtn}${rejectBtn}</div>`;
}

async function updateAFAStatus(id, newStatus) {
  const { error } = await window.supabase
    .from('afa_registrations')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { alert('Update failed: ' + error.message); return; }
  // Update cache and re-render
  const rec = allAFACache.find(r => r.id === id);
  if (rec) rec.status = newStatus;
  renderAFAReturnsTables(allAFACache);
  renderAFATable(allAFACache);
}
window.updateAFAStatus = updateAFAStatus;

function viewAfaDocs(id, name, frontEncoded, backEncoded, idType, idNumber) {
  const frontUrl = decodeURIComponent(frontEncoded);
  const backUrl  = decodeURIComponent(backEncoded);
  const modal = document.getElementById('afaDocModal');
  if (!modal) return;

  document.getElementById('afaDocModalName').textContent = name || 'Unknown';
  document.getElementById('afaDocModalMeta').textContent =
    [idType, idNumber].filter(Boolean).join(' • ') || 'No ID details';

  const frontWrap = document.getElementById('afaDocFrontWrap');
  const backWrap  = document.getElementById('afaDocBackWrap');

  frontWrap.innerHTML = frontUrl
    ? `<img src="${frontUrl}" alt="ID Front" class="afa-doc-img">
       <a href="${frontUrl}" download target="_blank" class="btn sm" style="margin-top:8px">⬇ Download Front</a>`
    : '<p class="state-msg">No front image uploaded</p>';

  backWrap.innerHTML = backUrl
    ? `<img src="${backUrl}" alt="ID Back" class="afa-doc-img">
       <a href="${backUrl}" download target="_blank" class="btn sm" style="margin-top:8px">⬇ Download Back</a>`
    : '<p class="state-msg">No back image uploaded</p>';

  modal.classList.add('open');
}
window.viewAfaDocs = viewAfaDocs;

function closeAfaDocModal() {
  const modal = document.getElementById('afaDocModal');
  if (modal) modal.classList.remove('open');
}
window.closeAfaDocModal = closeAfaDocModal;

function renderAFATable(items) {
  const tbody = document.getElementById('afaBody');
  if (!tbody) return;
  if (!items.length) { tbody.innerHTML = '<tr><td colspan="5" class="state-msg">No AFA registrations.</td></tr>'; renderPagination('afaPagination', 1, 1, 'goAFAPage'); return; }
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  if (afaPage > totalPages) afaPage = totalPages;
  const start = (afaPage - 1) * PAGE_SIZE;
  const page = items.slice(start, start + PAGE_SIZE);
  tbody.innerHTML = page.map(a => `<tr><td>${esc(a.full_name || a.name || '-')}</td><td>${esc(a.phone || '-')}</td><td>${esc(a.type || '-')}</td><td>${statusBadge(a.status)}</td><td>${esc(new Date(a.created_at).toLocaleDateString())}</td></tr>`).join('');
  renderPagination('afaPagination', afaPage, totalPages, 'goAFAPage');
}

function goAFAPage(p) { afaPage = p; filterAFATable(); }

function filterAFATable() {
  const q = (document.getElementById('afaSearch')?.value || '').trim().toLowerCase();
  const filtered = allAFACache.filter(a => {
    return [a.full_name, a.name, a.phone, a.type, a.status].map(v => String(v || '').toLowerCase()).some(v => v.includes(q));
  });
  renderAFATable(filtered);
}

// ── Support Tickets ──
function getTicketPriority(ticket) {
  const createdAtMs = new Date(ticket.created_at || Date.now()).getTime();
  const ageHours = (Date.now() - createdAtMs) / (1000 * 60 * 60);
  const status = String(ticket.status || '').toLowerCase();

  if (status === 'open' && ageHours >= 48) return 'high';
  if ((status === 'open' && ageHours >= 12) || status === 'in_progress') return 'medium';
  return 'low';
}

function priorityBadge(level) {
  const safe = String(level || 'low').toLowerCase();
  return `<span class="priority-pill ${esc(safe)}">${esc(safe)}</span>`;
}

async function loadSupportTickets() {
  const { data, error } = await window.supabase
    .from('tickets')
    .select('id, subject, category, status, created_at, user_id, users(first_name, last_name, email)')
    .order('created_at', { ascending: false });
  if (error) {
    const tbody = document.getElementById('ticketsBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="state-msg">${esc(error.message)}</td></tr>`;
    return;
  }
  allTicketsCache = data || [];
  const countEl = document.getElementById('ticketsCount');
  if (countEl) countEl.innerText = `${allTicketsCache.length} tickets`;
  ticketsPage = 1;
  renderTicketsTable(getFilteredTickets());
}

function getFilteredTickets() {
  const q = (document.getElementById('ticketsSearch')?.value || '').trim().toLowerCase();
  const statusFilter = (document.getElementById('ticketsStatusFilter')?.value || '').toLowerCase();
  return allTicketsCache.filter(t => {
    const user = t.users || {};
    const name = `${user.first_name || ''} ${user.last_name || ''}`.trim().toLowerCase();
    const priority = getTicketPriority(t);
    const matchText = [name, t.subject, t.category, t.status, priority].map(v => String(v || '').toLowerCase()).some(v => v.includes(q));
    const matchStatus = !statusFilter || String(t.status || '').toLowerCase() === statusFilter;
    return matchText && matchStatus;
  });
}

function renderTicketsTable(tickets) {
  const tbody = document.getElementById('ticketsBody');
  if (!tbody) return;
  if (!tickets.length) { tbody.innerHTML = '<tr><td colspan="8" class="state-msg">No tickets found.</td></tr>'; renderPagination('ticketsPagination', 1, 1, 'goTicketsPage'); return; }
  const totalPages = Math.ceil(tickets.length / PAGE_SIZE);
  if (ticketsPage > totalPages) ticketsPage = totalPages;
  const start = (ticketsPage - 1) * PAGE_SIZE;
  const page = tickets.slice(start, start + PAGE_SIZE);

  const selectAll = document.getElementById('ticketsSelectAll');
  if (selectAll) selectAll.checked = false;

  tbody.innerHTML = page.map(t => {
    const user = t.users || {};
    const name = esc(`${user.first_name || ''} ${user.last_name || ''}`.trim() || esc(user.email || 'Unknown'));
    const tid = esc(t.id);
    const currentStatus = String(t.status || '').toLowerCase();
    const priority = getTicketPriority(t);
    const inProgressBtn = `<button class="tiny-btn role-save" ${currentStatus === 'in_progress' ? 'disabled' : ''} onclick="updateSupportTicketStatus('${tid}', 'in_progress')">In Progress</button>`;
    const resolvedBtn = `<button class="tiny-btn approve" ${currentStatus === 'resolved' ? 'disabled' : ''} onclick="updateSupportTicketStatus('${tid}', 'resolved')">Resolve</button>`;
    const closedBtn = `<button class="tiny-btn reject" ${currentStatus === 'closed' ? 'disabled' : ''} onclick="updateSupportTicketStatus('${tid}', 'closed')">Close</button>`;
    return `<tr><td><input type="checkbox" class="ticket-check" value="${tid}"></td><td>${name}</td><td>${esc(t.subject || '-')}</td><td>${esc(t.category || '-')}</td><td>${priorityBadge(priority)}</td><td>${statusBadge(t.status)}</td><td>${esc(new Date(t.created_at).toLocaleString())}</td><td><div class="support-actions">${inProgressBtn}${resolvedBtn}${closedBtn}</div></td></tr>`;
  }).join('');
  renderPagination('ticketsPagination', ticketsPage, totalPages, 'goTicketsPage');
}

async function updateSupportTicketStatus(ticketId, newStatus) {
  if (newStatus === 'closed') {
    const confirmed = confirm('Are you sure you want to close this support ticket?');
    if (!confirmed) return;
  }

  const { error } = await window.supabase
    .from('tickets')
    .update({ status: newStatus })
    .eq('id', ticketId);

  if (error) {
    alert('Ticket update failed: ' + error.message);
    return;
  }

  await loadSupportTickets();
  await loadMetrics();
}

function toggleTicketsSelectAll() {
  const checked = document.getElementById('ticketsSelectAll')?.checked;
  document.querySelectorAll('.ticket-check').forEach(cb => cb.checked = checked);
}

function getSelectedTicketIds() {
  return Array.from(document.querySelectorAll('.ticket-check:checked')).map(cb => cb.value);
}

async function bulkUpdateSupportTickets(newStatus) {
  const ticketIds = getSelectedTicketIds();
  if (!ticketIds.length) {
    alert('No tickets selected.');
    return;
  }

  if (newStatus === 'closed') {
    const confirmed = confirm(`Close ${ticketIds.length} selected ticket(s)?`);
    if (!confirmed) return;
  }

  const { error } = await window.supabase
    .from('tickets')
    .update({ status: newStatus })
    .in('id', ticketIds);

  if (error) {
    alert('Bulk ticket update failed: ' + error.message);
    return;
  }

  await loadSupportTickets();
  await loadMetrics();
}

async function bulkResolveSupportTickets() {
  await bulkUpdateSupportTickets('resolved');
}

async function bulkCloseSupportTickets() {
  await bulkUpdateSupportTickets('closed');
}

function goTicketsPage(p) { ticketsPage = p; renderTicketsTable(getFilteredTickets()); }

function filterTicketsTable() { ticketsPage = 1; renderTicketsTable(getFilteredTickets()); }

// ── Auto Refresh ──
function stopAutoRefresh() {
  if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
}

function startAutoRefresh() {
  stopAutoRefresh();
  const sec = Number(document.getElementById('refreshIntervalSelect')?.value || 20);
  autoRefreshTimer = setInterval(() => refreshPortal(), sec * 1000);
}

function toggleAutoRefresh() {
  if (document.getElementById('autoRefreshToggle')?.checked) startAutoRefresh();
  else stopAutoRefresh();
}

function applyAutoRefreshInterval() {
  if (document.getElementById('autoRefreshToggle')?.checked) startAutoRefresh();
}

// ── Portal Refresh ──
async function refreshPortal() {
  try {
    await Promise.all([
      loadMetrics(),
      loadDashUsers(),
      loadDashOrders(),
      loadAllUsers(),
      loadAllOrders(),
      loadNotificationsAdmin(),
      loadPendingFunding(),
      loadPendingSettlements(),
      loadRolesManager(),
      loadAFARegistrations(),
      loadSupportTickets(),
      loadScheduledMatrix(),
      loadGatewaySettings(),
    ]);
  } catch (err) {
    console.error('Portal refresh failed:', err);
  }
}

// ── Scheduled Deliveries Matrix ──
let allScheduledRows = [];
let filteredScheduledRows = [];

async function loadScheduledMatrix() {
  const matrixBody = document.getElementById('mxMatrixBody');
  if (!matrixBody) return;

  const { data, error } = await window.supabase
    .from('scheduled_orders')
    .select('id, user_id, phone, network, plan, amount, status, scheduled_at')
    .order('scheduled_at', { ascending: false })
    .limit(2000);

  if (error) {
    matrixBody.innerHTML = `<tr><td class="state-msg">${esc(error.message)}</td></tr>`;
    document.getElementById('mxDetailsBody').innerHTML = `<tr><td colspan="6" class="state-msg">${esc(error.message)}</td></tr>`;
    return;
  }

  allScheduledRows = data || [];
  hydrateMatrixNetworkFilter();
  applyMatrixFilters();
}

function hydrateMatrixNetworkFilter() {
  const select = document.getElementById('mxNetwork');
  if (!select) return;
  const current = select.value;
  const networks = Array.from(new Set(allScheduledRows.map(r => String(r.network || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  select.innerHTML = '<option value="">All Networks</option>' + networks.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  if (current && networks.includes(current)) select.value = current;
}

function applyMatrixFilters() {
  const network  = (document.getElementById('mxNetwork')?.value   || '').toLowerCase();
  const status   = (document.getElementById('mxStatus')?.value    || '').toLowerCase();
  const dateVal = document.getElementById('mxDate')?.value || '';
  const fromMs   = dateVal ? new Date(`${dateVal}T00:00:00`).getTime() : null;
  const toMs     = dateVal ? new Date(`${dateVal}T23:59:59.999`).getTime() : null;

  filteredScheduledRows = allScheduledRows.filter(row => {
    const rowMs = new Date(row.scheduled_at || 0).getTime();
    const matchNetwork = !network || String(row.network || '').toLowerCase() === network;
    const matchStatus  = !status  || String(row.status  || '').toLowerCase() === status;
    const matchDate = fromMs === null || (rowMs >= fromMs && rowMs <= toMs);
    return matchNetwork && matchStatus && matchDate;
  });

  renderMatrixSummary();
  renderMatrixTable();
  renderMatrixDetails();
  renderMatrixHistory();
}

function resetMatrixFilters() {
  ['mxNetwork','mxStatus','mxDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  applyMatrixFilters();
}

function renderMatrixSummary() {
  const total   = filteredScheduledRows.length;
  const amount  = filteredScheduledRows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const phones  = new Set(filteredScheduledRows.map(r => String(r.phone   || '').trim()).filter(Boolean));
  const networks= new Set(filteredScheduledRows.map(r => String(r.network || '').trim()).filter(Boolean));
  const el = id => document.getElementById(id);
  if (el('mxSumTotal'))    el('mxSumTotal').innerText    = String(total);
  if (el('mxSumAmount'))   el('mxSumAmount').innerText   = formatMoney(amount);
  if (el('mxSumPhones'))   el('mxSumPhones').innerText   = String(phones.size);
  if (el('mxSumNetworks')) el('mxSumNetworks').innerText = String(networks.size);
}

function mxToDateKey(value) {
  const d = new Date(value || Date.now());
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function renderMatrixTable() {
  const head = document.getElementById('mxMatrixHead');
  const body = document.getElementById('mxMatrixBody');
  const label = document.getElementById('mxMatrixLabel');
  if (!head || !body) return;

  if (!filteredScheduledRows.length) {
    head.innerHTML = '';
    body.innerHTML = '<tr><td class="state-msg">No scheduled deliveries match the selected filters.</td></tr>';
    if (label) label.innerText = '0 rows';
    return;
  }

  const dateKeys = Array.from(new Set(filteredScheduledRows.map(r => mxToDateKey(r.scheduled_at)))).sort();
  const nets     = Array.from(new Set(filteredScheduledRows.map(r => String(r.network || 'Unknown').trim() || 'Unknown'))).sort((a,b) => a.localeCompare(b));

  if (label) label.innerText = `${dateKeys.length} date${dateKeys.length !== 1 ? 's' : ''} × ${nets.length} network${nets.length !== 1 ? 's' : ''}`;

  head.innerHTML = `<tr><th>Date</th>${nets.map(n => `<th>${esc(n)}</th>`).join('')}<th>Total</th></tr>`;

  body.innerHTML = dateKeys.map(dateKey => {
    const byDate = filteredScheduledRows.filter(r => mxToDateKey(r.scheduled_at) === dateKey);
    const cells = nets.map(net => {
      const byNet = byDate.filter(r => String(r.network || 'Unknown').trim() === net);
      if (!byNet.length) return '<td style="color:var(--muted)">0</td>';
      const amt = byNet.reduce((s, r) => s + Number(r.amount || 0), 0);
      return `<td class="matrix-cell"><strong>${byNet.length}</strong><br><small style="color:var(--muted);font-size:11px">${formatMoney(amt)}</small></td>`;
    }).join('');
    return `<tr><td><strong>${esc(dateKey)}</strong></td>${cells}<td><strong>${byDate.length}</strong></td></tr>`;
  }).join('');
}

function renderMatrixDetails() {
  const tbody = document.getElementById('mxDetailsBody');
  const count = document.getElementById('mxDetailCount');
  if (!tbody) return;
  if (count) count.innerText = `${filteredScheduledRows.length} rows`;
  const selectAll = document.getElementById('mxSelectAll');
  if (selectAll) selectAll.checked = false;
  onMxSelectionChange();
  if (!filteredScheduledRows.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="state-msg">No records found.</td></tr>';
    return;
  }
  tbody.innerHTML = filteredScheduledRows.map(r =>
    `<tr>
      <td><input type="checkbox" class="mx-row-cb" data-id="${esc(String(r.id))}" onchange="onMxSelectionChange()"></td>
      <td style="font-size:12px;white-space:nowrap">${esc(new Date(r.scheduled_at).toLocaleString())}</td>
      <td>${esc(r.phone||'-')}</td><td>${esc(r.network||'-')}</td><td>${esc(r.plan||'-')}</td>
      <td>${formatMoney(r.amount)}</td><td>${statusBadge(r.status)}</td>
    </tr>`
  ).join('');
}

function onMxSelectionChange() {
  const checked = document.querySelectorAll('.mx-row-cb:checked');
  const bar = document.getElementById('mxBulkBar');
  const cnt = document.getElementById('mxSelectedCount');
  if (bar) bar.style.display = checked.length ? 'flex' : 'none';
  if (cnt) cnt.innerText = `${checked.length} selected`;
}

function mxToggleAllRows(masterCb) {
  document.querySelectorAll('.mx-row-cb').forEach(cb => { cb.checked = masterCb.checked; });
  onMxSelectionChange();
}

function mxGetSelectedIds() {
  return Array.from(document.querySelectorAll('.mx-row-cb:checked')).map(cb => cb.dataset.id);
}

async function mxProcessSelected() {
  const ids = mxGetSelectedIds();
  if (!ids.length) return;
  if (!confirm(`Mark ${ids.length} record(s) as Processed?`)) return;
  const { error } = await window.supabase
    .from('scheduled_orders').update({ status: 'processed' }).in('id', ids);
  if (error) return alert('Error: ' + error.message);
  alert(`${ids.length} record(s) marked as Processed.`);
  await loadScheduledMatrix();
}

async function mxDeleteSelected() {
  const ids = mxGetSelectedIds();
  if (!ids.length) return;
  if (!confirm(`Permanently DELETE ${ids.length} record(s)? This cannot be undone.`)) return;
  const { error } = await window.supabase
    .from('scheduled_orders').delete().in('id', ids);
  if (error) return alert('Error: ' + error.message);
  alert(`${ids.length} record(s) deleted.`);
  await loadScheduledMatrix();
}

async function mxRefundSelected() {
  const ids = mxGetSelectedIds();
  if (!ids.length) return;
  if (!confirm(`Refund wallet for ${ids.length} record(s) and mark as Refunded?`)) return;
  try {
    const res = await axios.post('/api/admin/refund-scheduled', { ids });
    if (res.data.success) {
      alert(`Refunded ${res.data.refundedCount} record(s) successfully.${res.data.errors?.length ? '\nSome wallet updates had errors.' : ''}`);
      await loadScheduledMatrix();
    } else {
      alert('Refund failed: ' + (res.data.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Refund error: ' + (err.response?.data?.error || err.message));
  }
}

function renderMatrixHistory() {
  const tbody = document.getElementById('mxHistoryBody');
  const count = document.getElementById('mxHistoryCount');
  if (!tbody) return;
  const historyRows = allScheduledRows.filter(r => String(r.status || '').toLowerCase() !== 'scheduled');
  if (count) count.innerText = `${historyRows.length} rows`;
  if (!historyRows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="state-msg">No history found.</td></tr>';
    return;
  }
  tbody.innerHTML = historyRows.map(r =>
    `<tr>
      <td style="font-size:12px;white-space:nowrap">${esc(new Date(r.scheduled_at).toLocaleString())}</td>
      <td>${esc(r.phone||'-')}</td><td>${esc(r.network||'-')}</td><td>${esc(r.plan||'-')}</td>
      <td>${formatMoney(r.amount)}</td><td>${statusBadge(r.status)}</td>
    </tr>`
  ).join('');
}

window.loadScheduledMatrix   = loadScheduledMatrix;
window.applyMatrixFilters    = applyMatrixFilters;
window.resetMatrixFilters    = resetMatrixFilters;
window.mxToggleAllRows       = mxToggleAllRows;
window.onMxSelectionChange   = onMxSelectionChange;
window.mxProcessSelected     = mxProcessSelected;
window.mxDeleteSelected      = mxDeleteSelected;
window.mxRefundSelected      = mxRefundSelected;

window.loadGatewaySettings      = loadGatewaySettings;
window.saveManualSettings       = saveManualSettings;
window.saveApiSettings          = saveApiSettings;
window.testApiConnection        = testApiConnection;
window.gwPreviewManualToggle    = gwPreviewManualToggle;
window.gwPreviewApiToggle       = gwPreviewApiToggle;
window.gwToggleApiKeyVisibility = gwToggleApiKeyVisibility;
window.renderGatewayFundingTable = renderGatewayFundingTable;
window.goGwFundingPage          = goGwFundingPage;

// ── Payment Gateway Controls ──
let gatewayFundingCache = [];
let gwFundingPage = 1;

async function loadGatewaySettings() {
  // Load app_settings keys for payment gateway
  const keys = [
    'manual_transfer_enabled',
    'manual_momo_number',
    'manual_momo_name',
    'datarjust_api_key',
    'datarjust_api_enabled',
    'api_auto_order',
  ];

  const { data: settings, error } = await window.supabase
    .from('app_settings')
    .select('key, value')
    .in('key', keys);

  if (!error && settings) {
    const map = {};
    settings.forEach(s => { map[s.key] = s.value; });

    const manualEnabled = (map['manual_transfer_enabled'] || 'false') === 'true';
    const apiEnabled    = (map['datarjust_api_enabled']   || 'false') === 'true';
    const autoOrder     = (map['api_auto_order']          || 'false') === 'true';

    const gwManualEl  = document.getElementById('gwManualEnabled');
    const gwApiEl     = document.getElementById('gwApiEnabled');
    const gwAutoEl    = document.getElementById('gwAutoOrder');
    const gwNumEl     = document.getElementById('gwMomoNumber');
    const gwNameEl    = document.getElementById('gwMomoName');
    const gwKeyEl     = document.getElementById('gwApiKey');

    if (gwManualEl)  gwManualEl.checked  = manualEnabled;
    if (gwApiEl)     gwApiEl.checked     = apiEnabled;
    if (gwAutoEl)    gwAutoEl.checked    = autoOrder;
    if (gwNumEl)     gwNumEl.value       = map['manual_momo_number']  || '';
    if (gwNameEl)    gwNameEl.value      = map['manual_momo_name']    || '';
    if (gwKeyEl)     gwKeyEl.value       = map['datarjust_api_key']   || '';

    // Update status cards
    const smEl = document.getElementById('gwStatusManual');
    const saEl = document.getElementById('gwStatusApi');
    const saoEl = document.getElementById('gwStatusAutoOrder');
    if (smEl)  smEl.innerText  = manualEnabled ? 'Enabled'  : 'Disabled';
    if (saEl)  saEl.innerText  = apiEnabled    ? 'Enabled'  : 'Disabled';
    if (saoEl) saoEl.innerText = autoOrder     ? 'Active'   : 'Off';
  }

  await loadGatewayFunding();
}

function gwPreviewManualToggle() {
  const enabled = document.getElementById('gwManualEnabled')?.checked;
  const el = document.getElementById('gwStatusManual');
  if (el) el.innerText = enabled ? 'Enabled' : 'Disabled';
}

function gwPreviewApiToggle() {
  const enabled = document.getElementById('gwApiEnabled')?.checked;
  const el = document.getElementById('gwStatusApi');
  if (el) el.innerText = enabled ? 'Enabled' : 'Disabled';
}

function gwToggleApiKeyVisibility() {
  const input = document.getElementById('gwApiKey');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function gwUpsertSetting(key, value) {
  const { error } = await window.supabase
    .from('app_settings')
    .upsert({ key, value }, { onConflict: 'key' });
  return error;
}

async function saveManualSettings() {
  const enabled = document.getElementById('gwManualEnabled')?.checked ? 'true' : 'false';
  const number  = (document.getElementById('gwMomoNumber')?.value  || '').trim();
  const name    = (document.getElementById('gwMomoName')?.value    || '').trim();

  if (!number) { alert('Please enter a MoMo number.'); return; }
  if (!name)   { alert('Please enter an account name.'); return; }

  const errors = await Promise.all([
    gwUpsertSetting('manual_transfer_enabled', enabled),
    gwUpsertSetting('manual_momo_number',      number),
    gwUpsertSetting('manual_momo_name',        name),
  ]);

  if (errors.some(Boolean)) {
    alert('Failed to save some settings. Please try again.');
  } else {
    alert('Manual MoMo settings saved successfully.');
    gwPreviewManualToggle();
  }
}

async function saveApiSettings() {
  const enabled   = document.getElementById('gwApiEnabled')?.checked  ? 'true' : 'false';
  const autoOrder = document.getElementById('gwAutoOrder')?.checked   ? 'true' : 'false';
  const apiKey    = (document.getElementById('gwApiKey')?.value || '').trim();

  const errors = await Promise.all([
    gwUpsertSetting('datarjust_api_enabled', enabled),
    gwUpsertSetting('api_auto_order',        autoOrder),
    gwUpsertSetting('datarjust_api_key',     apiKey),
    gwUpsertSetting('provider_api_base_url', 'https://cleanheartsolutions.com/api'),
    gwUpsertSetting('provider_api_auth_header', 'X-API-Key'),
    gwUpsertSetting('provider_api_purchase_path', '/purchase'),
    gwUpsertSetting('provider_api_balance_path', '/balance'),
    gwUpsertSetting('provider_api_order_status_path', '/orders'),
  ]);

  if (errors.some(Boolean)) {
    alert('Failed to save some settings. Please try again.');
  } else {
    alert('API Gateway settings saved successfully.');
    gwPreviewApiToggle();
    const saoEl = document.getElementById('gwStatusAutoOrder');
    if (saoEl) saoEl.innerText = autoOrder === 'true' ? 'Active' : 'Off';
  }
}

async function testApiConnection() {
  const apiKey = (document.getElementById('gwApiKey')?.value || '').trim();
  if (!apiKey) {
    alert('Please enter an API key before testing.');
    return;
  }

  const btn = document.querySelector('[onclick="testApiConnection()"]');
  const origText = btn?.innerText || '';
  if (btn) { btn.disabled = true; btn.innerText = '⏳ Testing...'; }

  async function restoreBtn() {
    if (btn) { btn.disabled = false; btn.innerText = origText; }
  }

  // ── Direct browser call to provider balance endpoint ──
  // This is the primary path. The API key is already visible in the admin UI,
  // so calling /balance directly is acceptable for testing purposes.
  try {
    const res = await fetch('https://cleanheartsolutions.com/api/balance', {
      method: 'GET',
      headers: { 'X-API-Key': apiKey },
    });

    const data = await res.json().catch(() => ({}));

    await restoreBtn();

    if (res.ok && data?.status === 'success') {
      const raw = data?.data?.rawBalance ?? data?.rawBalance;
      const bal = raw !== undefined ? `GHS ${Number(raw).toFixed(2)}` : (data?.data?.balance ?? '--');
      alert(`✅ Connection successful!\nProvider wallet balance: ${bal}`);
      return;
    }

    // Provider returned an error
    const errMsg = data?.message ?? data?.error ?? `HTTP ${res.status}`;
    alert(`❌ Connection failed: ${errMsg}`);
    return;

  } catch (directErr) {
    // Network/CORS issue with direct call — fall back to Edge Function
  }

  // ── Fallback: try via Supabase Edge Function ──
  try {
    const resp = await window.supabase.functions.invoke('test-api-connection', {
      body: { api_key: apiKey },
    });

    await restoreBtn();

    if (resp.error) {
      const errMsg = resp.error?.message || String(resp.error);
      alert(`❌ Connection test failed: ${errMsg}`);
      return;
    }

    const result = resp.data;

    if (result?.success === false) {
      alert(`❌ Connection test failed: ${result?.error || 'Provider rejected the request.'}`);
      return;
    }

    const rawBalance = result?.data?.rawBalance ?? result?.rawBalance;
    if (rawBalance !== undefined && rawBalance !== null) {
      alert(`✅ Connection successful!\nProvider wallet balance: GHS ${Number(rawBalance).toFixed(2)}`);
      return;
    }
    alert(result?.message || '✅ Connection successful.');

  } catch (err) {
    await restoreBtn();
    alert('❌ Connection test failed: ' + (err.message || 'Unknown error'));
  }
}

async function loadGatewayFunding() {
  const body = document.getElementById('gwFundingBody');
  if (!body) return;

  body.innerHTML = '<tr><td colspan="7" class="state-msg">Loading...</td></tr>';

  const { data, error } = await window.supabase
    .from('wallet_funding_orders')
    .select('id, user_id, amount, reference, gateway_reference, currency, status, created_at, users(first_name, last_name, email)')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    body.innerHTML = `<tr><td colspan="7" class="state-msg">${esc(error.message)}</td></tr>`;
    return;
  }

  gatewayFundingCache = data || [];

  const countEl = document.getElementById('gwFundingCount');
  if (countEl) countEl.innerText = gatewayFundingCache.length.toLocaleString();

  gwFundingPage = 1;
  renderGatewayFundingTable();
}

function renderGatewayFundingTable() {
  const body   = document.getElementById('gwFundingBody');
  if (!body) return;

  const filter = (document.getElementById('gwFundingFilter')?.value || '').toLowerCase();
  const rows   = filter
    ? gatewayFundingCache.filter(r => String(r.status || '').toLowerCase() === filter)
    : gatewayFundingCache;

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="7" class="state-msg">No funding requests found.</td></tr>';
    document.getElementById('gwFundingPagination').innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  if (gwFundingPage > totalPages) gwFundingPage = 1;
  const slice = rows.slice((gwFundingPage - 1) * PAGE_SIZE, gwFundingPage * PAGE_SIZE);

  body.innerHTML = slice.map(r => {
    const user = Array.isArray(r.users) ? (r.users[0] || {}) : (r.users || {});
    const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || esc(r.user_id || '--');
    return `<tr>
      <td>${esc(name)}</td>
      <td>${formatMoney(r.amount)}</td>
      <td><code style="font-size:11px">${esc(r.reference || '--')}</code></td>
      <td><code style="font-size:11px">${esc(r.gateway_reference || '--')}</code></td>
      <td>${esc(r.currency || 'GHS')}</td>
      <td>${statusBadge(r.status)}</td>
      <td style="font-size:12px;white-space:nowrap">${esc(new Date(r.created_at).toLocaleString())}</td>
    </tr>`;
  }).join('');

  renderPagination('gwFundingPagination', gwFundingPage, totalPages, 'goGwFundingPage');
}

function goGwFundingPage(page) {
  gwFundingPage = page;
  renderGatewayFundingTable();
}

// ── Logout ──
async function adminLogout() {
  await window.supabase.auth.signOut();
  window.location.href = 'admin-login.html';
}

// ── Expose to window ──
window.refreshPortal = refreshPortal;
window.adminLogout = adminLogout;
window.switchSection = switchSection;
window.toggleSidebar = toggleSidebar;
window.toggleDarkMode = toggleDarkMode;
window.filterUsersTable = filterUsersTable;
window.filterOrdersTable = filterOrdersTable;
window.filterRolesTable = filterRolesTable;
window.filterAFATable = filterAFATable;
window.filterTicketsTable = filterTicketsTable;
window.updateSupportTicketStatus = updateSupportTicketStatus;
window.toggleTicketsSelectAll = toggleTicketsSelectAll;
window.bulkResolveSupportTickets = bulkResolveSupportTickets;
window.bulkCloseSupportTickets = bulkCloseSupportTickets;
window.createNotification = createNotification;
window.toggleNotificationActive = toggleNotificationActive;
window.toggleAutoRefresh = toggleAutoRefresh;
window.applyAutoRefreshInterval = applyAutoRefreshInterval;
window.sortOrders = sortOrders;
window.toggleOrdersSelectAll = toggleOrdersSelectAll;
window.onOrdersSelectionChange = onOrdersSelectionChange;
window.bulkUpdateSelectedOrders = bulkUpdateSelectedOrders;
window.bulkDeleteSelectedOrders = bulkDeleteSelectedOrders;
window.refundLegacyOrder = refundLegacyOrder;
window.bulkRefundLegacyOrders = bulkRefundLegacyOrders;
window.detectTargetStatusFromPhone = detectTargetStatusFromPhone;
window.selectOrdersRelativeToTarget = selectOrdersRelativeToTarget;
window.updateTargetedCustomerOrders = updateTargetedCustomerOrders;
window.goUsersPage = goUsersPage;
window.goOrdersPage = goOrdersPage;
window.goAFAPage = goAFAPage;
window.goTicketsPage = goTicketsPage;
window.exportUsersCSV = exportUsersCSV;
window.exportOrdersCSV = exportOrdersCSV;
window.copyOrdersForExcel = copyOrdersForExcel;
window.exportAFACSV = exportAFACSV;
window.changeUserRole = changeUserRole;
window.approveFunding = approveFunding;
window.rejectFunding = rejectFunding;
window.bulkApproveFunding = bulkApproveFunding;
window.toggleFundingSelectAll = toggleFundingSelectAll;
window.approveSettlement = approveSettlement;
window.rejectSettlement = rejectSettlement;
window.bulkApproveSettlements = bulkApproveSettlements;
window.toggleSettlementSelectAll = toggleSettlementSelectAll;

// ── Online/Offline ──
window.addEventListener('online', () => {
  const el = document.getElementById('metricStatus');
  if (el) el.innerText = 'Online';
});
window.addEventListener('offline', () => {
  const el = document.getElementById('metricStatus');
  if (el) el.innerText = 'Offline';
});

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  restoreDarkMode();
  const admin = await requireAdmin();
  if (!admin) return;
  await refreshPortal();
  document.getElementById('autoRefreshToggle').checked = true;
  startAutoRefresh();
});
