// ============================================
// SCHEDULE PAGE — schedule.js
// ============================================

let allOrders      = [];
let filteredOrders = [];
let currentUserId  = null;
let userWallet     = 0;
let ordersToProcess = [];

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = 'login.html'; return; }
    currentUserId = user.id;

    const { data: userData } = await supabase
      .from('users')
      .select('wallet_balance')
      .eq('id', user.id)
      .single();

    userWallet = parseFloat(userData?.wallet_balance || 0);

    await loadScheduledOrders();
  } catch (err) {
    console.error('Init error:', err);
    showError('Failed to load. Please refresh.');
  }
});

// ============================================
// LOAD SCHEDULED ORDERS
// ============================================
async function loadScheduledOrders() {
  document.getElementById('schedOrders').innerHTML = `
    <div class="sched-empty">
      <div class="spinner"></div>
      <p>Loading scheduled orders…</p>
    </div>`;

  try {
    const { data, error } = await supabase
      .from('scheduled_orders')
      .select('*')
      .eq('user_id', currentUserId)
      .eq('status', 'scheduled')
      .order('scheduled_at', { ascending: false });

    if (error) throw error;

    allOrders = data || [];
    filteredOrders = [...allOrders];
    renderStats();
    renderTable();
  } catch (err) {
    document.getElementById('schedOrders').innerHTML = `
      <div class="sched-empty">
        <p style="color:#ef4444;">Error loading orders: ${err.message}</p>
      </div>`;
  }
}

// ============================================
// STATS
// ============================================
function renderStats() {
  const statsEl = document.getElementById('schedStats');
  // We always show stats in the hero now
  
  const totalGB    = allOrders.reduce((s, o) => s + parseFloat(o.plan?.replace('GB','') || 0), 0);
  const totalCost  = allOrders.reduce((s, o) => s + parseFloat(o.amount || 0), 0);

  document.getElementById('statTotal').innerText    = allOrders.length;
  document.getElementById('statGB').innerText       = `${totalGB}GB`;
  document.getElementById('statCost').innerText     = `₵${totalCost.toFixed(2)}`;
  
  const multEl = document.getElementById('statMultiple');
  if (multEl) multEl.innerText = allOrders.filter(o => o.note?.includes('Multiple')).length;
}

// ============================================
// RENDER TABLE
// ============================================
function renderTable() {
  const container = document.getElementById('schedOrders');
  if (filteredOrders.length === 0) {
    container.innerHTML = `
      <div class="sched-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5" style="margin-bottom:12px; opacity:0.5;">
          <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
        </svg>
        <p style="font-weight:500;">${allOrders.length === 0 ? 'Your queue is empty' : 'No results found for your filters'}</p>
        <p style="font-size:13px; opacity:0.8; margin-top:4px;">${allOrders.length === 0 ? 'Orders will appear here when a line is busy.' : 'Try adjusting your search criteria.'}</p>
      </div>`;
    return;
  }

  const rows = filteredOrders.map(o => {
    const date     = new Date(o.scheduled_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
    const isMulti  = o.note?.includes('Multiple');
    const badgeClass = !isMulti ? 'scheduled' : '';
    const badgeText  = !isMulti ? 'Scheduled' : 'Multiple';

    return `
      <div class="sched-row" data-id="${o.id}">
        <div class="row-check"><input type="checkbox" value="${o.id}" onchange="onCheckChange()"></div>
        <div class="row-phone"><span>${o.phone}</span></div>
        <div class="row-network"><span>${o.network}</span></div>
        <div class="row-plan"><span>${o.plan}</span></div>
        <div class="row-amount"><span>₵${parseFloat(o.amount).toFixed(2)}</span></div>
        <div class="row-date"><span>${date}</span></div>
        <div class="row-type"><span class="type-badge ${badgeClass}">${badgeText}</span></div>
        <div class="row-actions">
          <button class="row-btn process" title="Process Now" onclick="processSingle('${o.id}')">Process</button>
          <button class="row-btn delete" title="Cancel & Refund" onclick="deleteSingle('${o.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = rows;
}


// ============================================
// FILTER
// ============================================
function filterOrders() {
  const phone   = (document.getElementById('filterPhone').value || '').toLowerCase();
  const network = (document.getElementById('filterNetwork').value || '').toLowerCase();

  filteredOrders = allOrders.filter(o => {
    const matchPhone   = !phone   || o.phone.includes(phone);
    const matchNetwork = !network || o.network.toLowerCase() === network;
    return matchPhone && matchNetwork;
  });

  renderTable();
}

function clearFilters() {
  document.getElementById('filterPhone').value   = '';
  document.getElementById('filterNetwork').value = '';
  filteredOrders = [...allOrders];
  renderTable();
}

// ============================================
// CHECKBOX SELECTION
// ============================================
function toggleSelectAll(cb) {
  document.querySelectorAll('#schedOrders input[type=checkbox]').forEach(c => c.checked = cb.checked);
  onCheckChange();
}

function onCheckChange() {
  const checked = document.querySelectorAll('#schedOrders input[type=checkbox]:checked');
  const bar     = document.getElementById('bulkActionBar');
  const countEl = document.getElementById('selectedCount');

  if (checked.length > 0) {
    bar.style.display = 'flex';
    countEl.innerText = `${checked.length} selected`;
  } else {
    bar.style.display = 'none';
  }
}

function getSelectedIds() {
  return [...document.querySelectorAll('#schedOrders input[type=checkbox]:checked')].map(c => c.value);
}

// ============================================
// SHOW PROCESS MODAL
// ============================================
function showProcessModal(orders) {
  ordersToProcess = orders;
  const totalGB = orders.reduce((s, o) => s + parseFloat(o.plan?.replace('GB','') || 0), 0);

  document.getElementById('modalTitle').innerText = `Process ${orders.length} Order${orders.length > 1 ? 's' : ''}`;
  document.getElementById('modalBody').innerText  = `These orders will be moved to pending for delivery. (Already paid)`;
  document.getElementById('modalDetail').innerHTML = `
    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
      <span style="color:#64748b;">Orders</span><strong>${orders.length}</strong>
    </div>
    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
      <span style="color:#64748b;">Total Data</span><strong>${totalGB}GB</strong>
    </div>
    <div style="display:flex; justify-content:space-between; margin-bottom:5px; padding-top:6px; border-top:1px solid #e2e8f0;">
      <span style="color:#059669; font-weight:700;">Payment Status</span>
      <strong style="color:#059669;">Already Deducted</strong>
    </div>
  `;

  document.getElementById('modalConfirmBtn').disabled = false;
  document.getElementById('processModal').classList.add('active');
}

function closeModal() {
  document.getElementById('processModal').classList.remove('active');
  ordersToProcess = [];
}

// ============================================
// PROCESS SELECTED
// ============================================
function processSelected() {
  const ids    = getSelectedIds();
  const orders = filteredOrders.filter(o => ids.includes(o.id));
  if (!orders.length) return;
  showProcessModal(orders);
}

// ============================================
// PROCESS ALL
// ============================================
function processAllScheduled() {
  if (!allOrders.length) { showToast('No scheduled orders to process.', 'info'); return; }
  showProcessModal([...allOrders]);
}

// ============================================
// PROCESS SINGLE
// ============================================
function processSingle(id) {
  const order = allOrders.find(o => o.id === id);
  if (!order) return;
  showProcessModal([order]);
}

// ============================================
// CONFIRM & EXECUTE PROCESSING
// ============================================
async function confirmProcessOrders() {
  const btn = document.getElementById('modalConfirmBtn');
  btn.disabled = true;
  btn.innerText = '⏳ Processing...';

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let successCount = 0;

    for (const order of ordersToProcess) {
      // Insert into live orders (payment already deducted when scheduled)
      await supabase.from('orders').insert({
        user_id: user.id,
        network: order.network,
        phone:   order.phone,
        plan:    order.plan,
        amount:  order.amount,
        status:  'pending'
      });

      // Mark scheduled order as processed
      await supabase
        .from('scheduled_orders')
        .update({ status: 'processed' })
        .eq('id', order.id);

      // SMS notification
      if (window.sendSmsNotification) {
        window.sendSmsNotification(
          order.phone,
          `Dear Customer, your ${order.plan} ${order.network} scheduled data order is now being processed. Thank you for using Data4Ghana!`
        );
      }

      successCount++;
    }

    closeModal();

    showToast(`✅ ${successCount} order${successCount > 1 ? 's' : ''} processed successfully!`, 'success');

    // Reload list
    setTimeout(() => loadScheduledOrders(), 800);

  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerText = '✅ Process Now';
  }
}

// ============================================
// DELETE SINGLE
// ============================================
async function deleteSingle(id) {
  if (!confirm('Cancel this scheduled order and receive a refund? This cannot be undone.')) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const order = allOrders.find(o => o.id === id);
    if (!order) return;

    // Get latest wallet balance for accurate refund
    const { data: userData } = await supabase.from('users').select('wallet_balance').eq('id', user.id).single();
    let currentBalance = parseFloat(userData?.wallet_balance || 0);
    const refundAmount = parseFloat(order.amount);
    const newBalance = parseFloat((currentBalance + refundAmount).toFixed(2));

    await supabase.from('users').update({ wallet_balance: newBalance }).eq('id', user.id);
    
    await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'Scheduled Order Refund',
      amount: refundAmount,
      balance_before: currentBalance,
      balance_after: newBalance,
      status: 'Refunded'
    });

    await supabase.from('scheduled_orders').delete().eq('id', id);
    
    userWallet = newBalance;
    allOrders = allOrders.filter(o => o.id !== id);
    filteredOrders = filteredOrders.filter(o => o.id !== id);
    renderStats();
    renderTable();
    showToast(`Scheduled order canceled. ₵${refundAmount.toFixed(2)} refunded.`, 'success');
  } catch (err) {
    showToast('Error canceling: ' + err.message, 'error');
  }
}

// ============================================
// DELETE SELECTED
// ============================================
async function deleteSelected() {
  const ids = getSelectedIds();
  if (!ids.length) return;
  if (!confirm(`Cancel ${ids.length} scheduled order(s) and receive a refund?`)) return;
  
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const ordersToRefund = allOrders.filter(o => ids.includes(o.id));
    const totalRefund = ordersToRefund.reduce((s, o) => s + parseFloat(o.amount), 0);

    const { data: userData } = await supabase.from('users').select('wallet_balance').eq('id', user.id).single();
    let currentBalance = parseFloat(userData?.wallet_balance || 0);
    const newBalance = parseFloat((currentBalance + totalRefund).toFixed(2));

    await supabase.from('users').update({ wallet_balance: newBalance }).eq('id', user.id);
    
    await supabase.from('transactions').insert({
      user_id: user.id,
      type: 'Scheduled Orders Bulk Refund',
      amount: totalRefund,
      balance_before: currentBalance,
      balance_after: newBalance,
      status: 'Refunded'
    });

    await supabase.from('scheduled_orders').delete().in('id', ids);
    
    userWallet = newBalance;
    allOrders = allOrders.filter(o => !ids.includes(o.id));
    filteredOrders = filteredOrders.filter(o => !ids.includes(o.id));
    renderStats();
    renderTable();
    document.getElementById('bulkActionBar').style.display = 'none';
    showToast(`${ids.length} order(s) canceled. ₵${totalRefund.toFixed(2)} refunded.`, 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ============================================
// TOAST
// ============================================
function showToast(message, type = 'info') {
  const existing = document.getElementById('schedToast');
  if (existing) existing.remove();

  const colors = {
    info:    { bg: '#1e40af', icon: 'ℹ️' },
    success: { bg: '#065f46', icon: '✅' },
    warning: { bg: '#92400e', icon: '⚠️' },
    error:   { bg: '#7f1d1d', icon: '❌' },
  };
  const c = colors[type] || colors.info;

  const toast = document.createElement('div');
  toast.id = 'schedToast';
  toast.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:9999;
    background:${c.bg}; color:white;
    padding:14px 20px; border-radius:12px;
    font-size:13px; font-weight:600; font-family:Inter,sans-serif;
    box-shadow:0 8px 30px rgba(0,0,0,0.25);
    display:flex; align-items:center; gap:10px;
    max-width:360px; line-height:1.5;
  `;
  toast.innerHTML = `<span style="font-size:18px;">${c.icon}</span><span>${message}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}

function showError(msg) {
  document.getElementById('schedOrders').innerHTML = `<div class="sched-empty"><p style="color:#ef4444;">${msg}</p></div>`;
}
