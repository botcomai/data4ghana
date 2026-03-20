// ============================================
// BULK ORDER PAGE — bulk-order.js
// ============================================

let selectedNetwork = 'MTN';
let userPricePerGB  = 5;
let userWallet      = 0;
let currentUserRole = 'client';
let currentUserId   = null;
let pendingOrders   = [];

const roleConfig = {
  'admin':        { label: 'ADMIN',        bg: 'rgba(239,68,68,0.15)',   color: '#ef4444' },
  'super agent':  { label: 'SUPER AGENT',  bg: 'rgba(139,92,246,0.15)',  color: '#8b5cf6' },
  'elite agent':  { label: 'ELITE AGENT',  bg: 'rgba(59,130,246,0.15)',  color: '#3b82f6' },
  'vip_customer': { label: 'VIP CUSTOMER', bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b' },
  'client':       { label: 'CLIENT',       bg: 'rgba(100,116,139,0.15)', color: '#64748b' },
};

// ============================================
// GHANA NETWORK PREFIX MAP
// ============================================
const NETWORK_PREFIXES = {
  'MTN':     ['024','054','055','059','025','053','020','050'], // MTN Ghana
  'Telecel': ['020','050'],    // Telecel (was Vodafone)
  'Ishare':  ['026','027','056','057'], // AirtelTigo
  'Bigtime': ['026','027','056','057'], // Bigtime (AirtelTigo infra)
};

// Full prefix-to-network map (for mismatch detection)
const PREFIX_TO_NETWORK = {
  '024': 'MTN', '054': 'MTN', '055': 'MTN', '059': 'MTN', '025': 'MTN', '053': 'MTN',
  '020': 'Telecel', '050': 'Telecel',
  '026': 'Ishare',  '027': 'Ishare', '056': 'Ishare', '057': 'Ishare',
};

function getPrefix(phone) {
  const s = phone.replace(/\D/g, '');
  if (s.length === 10 && s[0] === '0') return s.substring(0, 3);        // e.g. 0241234567 → 024
  if (s.length === 9  && s[0] !== '0') return '0' + s.substring(0, 2); // e.g. 241234567  → 024
  return null;
}

function detectNetwork(phone) {
  const prefix = getPrefix(phone);
  return prefix ? (PREFIX_TO_NETWORK[prefix] || null) : null;
}

function isPhoneValidForNetwork(phone, network) {
  const detectedNet = detectNetwork(phone);
  if (!detectedNet) return { valid: false, reason: 'Unknown prefix' };
  if (detectedNet !== network) return {
    valid: false,
    reason: `Wrong network (${phone} is ${detectedNet}, not ${network})`
  };
  return { valid: true };
}

// ============================================
// TOAST NOTIFICATION
// ============================================
function showToast(message, type = 'info') {
  const existing = document.getElementById('bulkToast');
  if (existing) existing.remove();

  const colors = {
    info:    { bg: '#1e40af', icon: 'ℹ️' },
    success: { bg: '#065f46', icon: '✅' },
    warning: { bg: '#92400e', icon: '⚠️' },
    error:   { bg: '#7f1d1d', icon: '❌' },
  };
  const c = colors[type] || colors.info;

  const toast = document.createElement('div');
  toast.id = 'bulkToast';
  toast.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:9999;
    background:${c.bg}; color:white;
    padding:14px 20px; border-radius:12px;
    font-size:13px; font-weight:600; font-family:Inter,sans-serif;
    box-shadow:0 8px 30px rgba(0,0,0,0.25);
    display:flex; align-items:center; gap:10px;
    max-width:360px; line-height:1.5;
    animation: slideInToast 0.3s ease;
  `;
  toast.innerHTML = `<span style="font-size:18px;">${c.icon}</span><span>${message}</span>`;

  const style = document.createElement('style');
  style.textContent = `@keyframes slideInToast { from { transform:translateY(20px); opacity:0; } to { transform:translateY(0); opacity:1; } }`;
  document.head.appendChild(style);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

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
      .select('first_name, last_name, role, wallet_balance')
      .eq('id', user.id)
      .single();

    currentUserRole = userData?.role || 'client';
    userWallet      = parseFloat(userData?.wallet_balance || 0);

    const bannerWallet = document.getElementById('bannerWallet');
    if (bannerWallet) bannerWallet.innerText = `₵${userWallet.toFixed(2)}`;

    await updatePricingForSelectedNetwork();

  } catch (err) {
    console.error('Init error:', err);
  }
});

// Map UI Names back to DB Product Keys
function getDbProductKey(displayName) {
  const map = {
    'MTN': 'data_mtn',
    'Telecel': 'data_telecel',
    'Ishare': 'data_tigo',
    'AirtelTigo': 'data_tigo',
    'Bigtime': 'data_bigtime',
  };
  return map[displayName] || 'data_mtn';
}

async function updatePricingForSelectedNetwork() {
  const productKey = getDbProductKey(selectedNetwork);

  try {
    const { data: priceData } = await supabase
      .from('pricing')
      .select('price')
      .eq('role', currentUserRole)
      .eq('product', productKey)
      .single();

    if (priceData) {
        userPricePerGB = parseFloat(priceData.price);
    } else {
        userPricePerGB = 5; // fallback
    }

    const bannerRate = document.getElementById('bannerRate');
    if(bannerRate) bannerRate.innerText = `₵${userPricePerGB.toFixed(2)}/GB`;

    // Re-evaluate table prices if parsing has already happened
    parseAndPreview();

  } catch (err) {
    console.warn("Failed to fetch specific network rate:", err);
  }
}

// ============================================
// NETWORK SELECTION
// ============================================
function selectNet(el) {
  document.querySelectorAll('.net-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  selectedNetwork = el.dataset.net;
  updatePricingForSelectedNetwork();
}

// ============================================
// PARSE LINES — with network prefix validation
// ============================================
function parseLines() {
  const raw = document.getElementById('ordersInput')?.value || '';
  const valid      = [];
  const invalid    = [];
  const mismatched = [];

  raw.split('\n').forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const parts = trimmed.split(/\s+/);
    const phone  = (parts[0] || '').replace(/\D/g, '');
    const gb     = parseFloat(parts[1]);

    // Phone validation:
    // 10-digit must start with 0  (e.g. 0241234567)
    // 9-digit must NOT start with 0 (e.g. 241234567 = local format)
    const is10 = /^0\d{9}$/.test(phone);
    const is9  = /^[1-9]\d{8}$/.test(phone);
    const phoneOk = is10 || is9;
    const gbOk    = !isNaN(gb) && gb > 0;

    if (!phoneOk || !gbOk) {
      invalid.push({
        raw: trimmed, line: idx + 1,
        reason: !phoneOk ? 'Invalid phone (must be 9–10 digits)' : 'Invalid GB size'
      });
      return;
    }

    // Network prefix validation
    const netCheck = isPhoneValidForNetwork(phone, selectedNetwork);
    if (!netCheck.valid) {
      const detected = detectNetwork(phone);
      mismatched.push({
        raw: trimmed, phone, gb, line: idx + 1,
        reason: netCheck.reason,
        detectedNetwork: detected
      });
      return;
    }

    valid.push({
      phone, gb,
      amount: parseFloat((gb * userPricePerGB).toFixed(2)),
      line: idx + 1
    });
  });

  return { valid, invalid, mismatched };
}

// ============================================
// PARSE & PREVIEW
// ============================================
function parseAndPreview() {
  const { valid, invalid, mismatched } = parseLines();
  const allBad     = [...invalid, ...mismatched];
  const grandTotal = valid.reduce((s, o) => s + o.amount, 0);
  const totalGB    = valid.reduce((s, o) => s + o.gb, 0);

  const hasData = valid.length > 0 || allBad.length > 0;

  const statsBar = document.getElementById('statsBar');
  if (statsBar) statsBar.className = hasData ? 'stats-bar-premium' : 'stats-bar-premium hide';
  if (statsBar) statsBar.style.display = hasData ? 'flex' : 'none';

  const sValid = document.getElementById('statValid');
  const sSkip  = document.getElementById('statSkipped');
  const sGB    = document.getElementById('statGB');
  const sCost  = document.getElementById('statCost');

  if (sValid) sValid.innerText = valid.length;
  if (sSkip) sSkip.innerText = allBad.length;
  if (sGB) sGB.innerText = `${totalGB}GB`;
  if (sCost) sCost.innerText = `₵${grandTotal.toFixed(2)}`;

  // Mismatch notification (debounced)
  if (mismatched.length > 0) {
    const examples = mismatched.slice(0, 2).map(m => m.phone).join(', ');
    const more = mismatched.length > 2 ? ` (+${mismatched.length - 2} more)` : '';
    showToast(
      `${mismatched.length} number(s) skipped — network mismatch. ${examples}${more}`,
      'warning'
    );
  }

  const walletWarn = document.getElementById('walletWarning');
  if (walletWarn) {
    if (valid.length > 0 && userWallet < grandTotal) {
        document.getElementById('walletWarningText').innerText =
          `Insufficient wallet balance. Need ₵${grandTotal.toFixed(2)}, have ₵${userWallet.toFixed(2)}.`;
        walletWarn.style.display = 'flex';
    } else {
        walletWarn.style.display = 'none';
    }
  }

  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) submitBtn.disabled = (valid.length === 0 || userWallet < grandTotal);
  
  const pBadge = document.getElementById('previewBadge');
  if (pBadge) pBadge.innerText = `${valid.length} verified · ${allBad.length} flagged`;

  const tableEl = document.getElementById('previewTable');
  if (!hasData) {
    tableEl.innerHTML = `
      <div class="preview-empty-premium">
        <div class="empty-icon-p">📡</div>
        <p>Ready for input</p>
        <span>Matrix verification will appear here</span>
      </div>`;
    return;
  }

  let html = '';
  let num  = 1;

  valid.forEach(o => {
    html += `
      <div class="matrix-row">
        <div class="m-idx">${num++}</div>
        <div class="m-phone"><span>${o.phone}</span></div>
        <span class="m-gb">${o.gb}GB</span>
        <span class="m-val">₵${o.amount.toFixed(2)}</span>
      </div>`;
  });

  mismatched.forEach(o => {
    const det = o.detectedNetwork ? ` (${o.detectedNetwork})` : '';
    html += `
      <div class="matrix-row invalid" title="${o.reason}">
        <div class="m-idx" style="background:#fffbeb; color:#d97706; border-color:#fde68a;">⚡</div>
        <div class="m-phone" style="color:#d97706;">${o.phone}</div>
        <span class="m-val" style="color:#d97706; border-color:#fde68a;">Mismatch${det}</span>
      </div>`;
  });

  invalid.forEach(o => {
    html += `
      <div class="matrix-row invalid">
        <div class="m-idx" style="background:#fff1f2; color:#e11d48; border-color:#fecaca;">✕</div>
        <div class="m-phone">${o.raw}</div>
        <span class="m-val" style="color:#e11d48; border-color:#fecaca;">Invalid</span>
      </div>`;
  });

  tableEl.innerHTML = html;
}

// ============================================
// CHECK PENDING DUPLICATES in Supabase
// ============================================
async function checkPendingDuplicates(phones) {
  try {
    const { data } = await supabase
      .from('orders')
      .select('phone, id, plan, network, created_at')
      .eq('user_id', currentUserId)
      .eq('status', 'pending')
      .in('phone', phones);
    return data || [];
  } catch {
    return [];
  }
}

// ============================================
// SUBMIT — show confirmation with duplicate check
// ============================================
async function submitBulkOrder() {
  const { valid } = parseLines();
  if (!valid.length) return;

  const btn = document.getElementById('submitBtn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:18px; height:18px; border-width:2px; margin-right:8px; border-top-color:white;"></div> Checking Balance...';

  try {
    // Check for duplicate pending orders
    const phones = valid.map(o => o.phone);
    const existingPending = await checkPendingDuplicates(phones);

    const duplicatePhones = new Set(existingPending.map(e => e.phone));
    const normalOrders    = valid.filter(o => !duplicatePhones.has(o.phone));
    const scheduleOrders  = valid.filter(o => duplicatePhones.has(o.phone));

    pendingOrders = valid; // store all for confirmation

    const grandTotal = normalOrders.reduce((s, o) => s + o.amount, 0);
    const totalGB    = normalOrders.reduce((s, o) => s + o.gb, 0);

    // Build confirmation detail
    let detailHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid #f1f5f9; padding-bottom:12px;">
        <span style="color:#64748b; font-weight:600;">Service Provider</span>
        <strong style="color:#059669;">${selectedNetwork}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
        <span style="color:#64748b;">Direct Success</span>
        <strong style="color:#0f172a;">${normalOrders.length} recipients</strong>
      </div>`;

    if (scheduleOrders.length > 0) {
      detailHTML += `
        <div style="display:flex; justify-content:space-between; margin-bottom:8px; padding:10px 14px; background:#fffbeb; border-radius:12px; border:1.5px solid #fde68a;">
          <span style="color:#92400e; font-weight:700;">📅 Queued Delivery</span>
          <strong style="color:#d97706;">${scheduleOrders.length} duplicates</strong>
        </div>`;
    }

    detailHTML += `
      <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
        <span style="color:#64748b;">Total Dispatch</span>
        <strong style="color:#0f172a;">${totalGB}GB</strong>
      </div>
      <div style="display:flex; justify-content:space-between; padding-top:12px; border-top:2px solid #f1f5f9; margin-top:10px;">
        <span style="color:#059669; font-weight:800; font-size:16px;">Total Checkout</span>
        <strong style="color:#059669; font-size:22px;">₵${grandTotal.toFixed(2)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; margin-top:10px; font-size:12px; color:#64748b; background:#f8fafc; padding:12px; border-radius:12px; border:1px solid #f1f5f9;">
        <span>Wallet After Dispatch</span>
        <span style="font-weight:700; color:#0f172a;">₵${(userWallet - grandTotal).toFixed(2)}</span>
      </div>`;

    const titleText = scheduleOrders.length > 0
      ? `Verify Mixed Batch`
      : `Complete Bulk Dispatch`;

    const bodyText = scheduleOrders.length > 0
      ? `${normalOrders.length} orders process now, ${scheduleOrders.length} will be queued automatically.`
      : `Confirm ${valid.length} data dispatches via ${selectedNetwork}. Safe and encrypted.`;

    document.getElementById('confirmTitle').innerText   = titleText;
    document.getElementById('confirmBody').innerText    = bodyText;
    document.getElementById('confirmDetail').innerHTML  = detailHTML;
    document.getElementById('confirmOverlay').classList.add('active');

    // Store split for execution
    window._normalOrders   = normalOrders;
    window._scheduleOrders = scheduleOrders;

  } catch (err) {
    showToast('Dispatch audit failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

function closeConfirm() {
  document.getElementById('confirmOverlay').classList.remove('active');
}

// ============================================
// EXECUTE — process normal + scheduled orders
// ============================================
async function executeBulkOrder() {
  const btn = document.getElementById('confirmBtn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:18px; height:18px; border-width:2px; margin-right:8px; border-color:white;"></div> Processing...';

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = 'login.html'; return; }

    const normalOrders   = window._normalOrders   || [];
    const scheduleOrders = window._scheduleOrders || [];

    let currentBalance = userWallet;
    let successCount   = 0;
    const normalTotal    = normalOrders.reduce((s, o) => s + o.amount, 0);
    const scheduledTotal = scheduleOrders.reduce((s, o) => s + o.amount, 0);
    const grandTotal     = normalTotal + scheduledTotal;

    // --- Process NORMAL orders ---
    for (const order of normalOrders) {
      const newBalance = parseFloat((currentBalance - order.amount).toFixed(2));

      await supabase.from('users').update({ wallet_balance: newBalance }).eq('id', user.id);

      await supabase.from('orders').insert({
        user_id: user.id,
        network: selectedNetwork,
        phone:   order.phone,
        plan:    `${order.gb}GB`,
        amount:  order.amount,
        status:  'pending'
      });

      await supabase.from('transactions').insert({
        user_id:        user.id,
        type:           'Bulk Data Purchase',
        amount:         order.amount,
        balance_before: currentBalance,
        balance_after:  newBalance,
        status:         'Pending',
      });

      if (window.sendSmsNotification) {
        window.sendSmsNotification(
          order.phone,
          `Dear Customer, your ${order.gb}GB ${selectedNetwork} data order is being processed. Thank you for using Data4Ghana!`
        );
      }

      currentBalance = newBalance;
      successCount++;
    }

    // --- Process SCHEDULED orders (deduct wallet immediately) ---
    let scheduledCount = 0;
    for (const order of scheduleOrders) {
      const newBalance = parseFloat((currentBalance - order.amount).toFixed(2));

      await supabase.from('users').update({ wallet_balance: newBalance }).eq('id', user.id);

      await supabase.from('scheduled_orders').insert({
        user_id:      user.id,
        network:      selectedNetwork,
        phone:        order.phone,
        plan:         `${order.gb}GB`,
        amount:       order.amount,
        status:       'scheduled',
        note:         'Multiple order — pending delivery already exists',
        scheduled_at: new Date().toISOString(),
      });

      await supabase.from('transactions').insert({
        user_id:        user.id,
        type:           'Scheduled Data Purchase',
        amount:         order.amount,
        balance_before: currentBalance,
        balance_after:  newBalance,
        status:         'Scheduled',
      });

      currentBalance = newBalance;
      scheduledCount++;
    }

    // Update wallet display
    userWallet = currentBalance;
    const bannerWallet = document.getElementById('bannerWallet');
    if (bannerWallet) bannerWallet.innerText = `₵${currentBalance.toFixed(2)}`;

    closeConfirm();

    // Show success receipt
    const totalGB      = normalOrders.reduce((s, o) => s + o.gb, 0);
    const schedGB      = scheduleOrders.reduce((s, o) => s + o.gb, 0);

    document.getElementById('successTitle').innerText = `Batch Dispatched!`;
    document.getElementById('successBody').innerText  = scheduledCount > 0
      ? `${successCount} processed, ${scheduledCount} queued for next window.`
      : `Your bulk dispatch is now processing. Check your history for live updates.`;

    document.getElementById('successReceipt').innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
        <span style="color:#64748b; font-weight:600;">Success Count</span><strong style="color:#0f172a;">${successCount}</strong>
      </div>
      ${scheduledCount > 0 ? `
      <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
        <span style="color:#92400e; font-weight:600;">📅 Scheduled</span><strong style="color:#d97706;">${scheduledCount}</strong>
      </div>` : ''}
      <div style="display:flex; justify-content:space-between; margin-bottom:8px; border-bottom:1.5px solid #f1f5f9; padding-bottom:8px;">
        <span style="color:#64748b; font-weight:600;">Network</span><strong style="color:#059669;">${selectedNetwork}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; margin-top:12px;">
        <span style="color:#059669; font-weight:800; font-size:15px;">Total Charged</span><strong style="color:#059669; font-size:20px;">₵${grandTotal.toFixed(2)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:13px; margin-top:4px;">
        <span style="color:#64748b;">Current Balance</span><strong style="color:#0f172a;">₵${currentBalance.toFixed(2)}</strong>
      </div>
    `;

    document.getElementById('successOverlay').classList.add('active');

    document.getElementById('ordersInput').value = '';
    pendingOrders = [];
    parseAndPreview();

  } catch (err) {
    showToast('Dispatch failure: ' + err.message, 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

function closeBulkSuccess() {
  document.getElementById('successOverlay').classList.remove('active');

  if ((window._scheduleOrders || []).length > 0) {
    window.location.href = 'schedule.html';
  } else {
    window.location.href = 'orders.html';
  }
}

// ============================================
// HELPERS
// ============================================
function clearOrders() {
  document.getElementById('ordersInput').value = '';
  parseAndPreview();
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    document.getElementById('ordersInput').value += text;
    parseAndPreview();
  } catch {
    document.getElementById('ordersInput').focus();
    showToast('Clipboard permission denied. Please use Ctrl+V.', 'info');
  }
}
