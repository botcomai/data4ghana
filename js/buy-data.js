let selectedNetwork = "MTN"
let selectedBulkNetwork = "MTN";
let userPricePerGB = 5; // default fallback
let currentUserRoleForPricing = 'client';
let currentPricingVariants = []; // Store current network variants

function selectNetwork(el) {
  document.querySelectorAll(".network").forEach(n => n.classList.remove("active"));
  el.classList.add("active");
  selectedNetwork = el.querySelector('p').innerText.trim();
  updatePricingForSelectedNetwork();
}

function selectBulkNetwork(el) {
  el.closest('#bulkNetworkGrid').querySelectorAll(".network").forEach(n => n.classList.remove("active"));
  el.classList.add("active");
  selectedBulkNetwork = el.querySelector('p').innerText.trim();
  updatePricingForSelectedNetwork(true); // isBulk = true
  updateBulkCount(); // refresh total preview
}

function toggleBulkPanel() {
  const panel = document.getElementById('bulkPanel');
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';

  // Sync bundle sizes into the bulk dropdown if not already done
  if (!isOpen) {
    const mainOpts = document.getElementById('bundle').options;
    const bulkSel  = document.getElementById('bulkBundle');
    if (bulkSel.options.length <= 1) {
      for (let i = 1; i < mainOpts.length; i++) {
        const opt = document.createElement('option');
        opt.value = mainOpts[i].value;
        opt.textContent = mainOpts[i].textContent;
        bulkSel.appendChild(opt);
      }
    }

    // Attach live preview  listener on bulk bundle change
    bulkSel.addEventListener('change', updateBulkCount);
  }
}

// ==========================================
// PARSE BULK LINES — format: "phone GB"
// Returns array of valid { phone, gb } objects
// ==========================================
function parseBulkLines() {
  const raw = document.getElementById('bulkPhones')?.value || '';
  const valid   = [];
  const skipped = [];

  raw.split('\n').forEach(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) { if (line.trim()) skipped.push(line.trim()); return; }

    const phone   = parts[0].replace(/\D/g, ''); // digits only
    const gbRaw   = parseFloat(parts[1]);

    // Accept 9 or 10 digit phone numbers
    const phoneOk = /^\d{9,10}$/.test(phone);
    const gbOk    = !isNaN(gbRaw) && gbRaw > 0;

    if (phoneOk && gbOk) {
      valid.push({ phone, gb: gbRaw });
    } else {
      skipped.push(line.trim());
    }
  });

  return { valid, skipped };
}

function updateBulkCount() {
  const { valid, skipped } = parseBulkLines();
  const count = valid.length;

  // Update counter badges
  const lineCount = document.getElementById('bulkLineCount');
  if (lineCount) {
    lineCount.innerText = `${count} order${count !== 1 ? 's' : ''}${skipped.length > 0 ? ` · ${skipped.length} skipped` : ''}`;
    lineCount.style.color = skipped.length > 0 ? '#f59e0b' : '#2a7de1';
    lineCount.style.background = skipped.length > 0 ? 'rgba(245,158,11,0.1)': 'rgba(42,125,225,0.1)';
  }

  const badge = document.getElementById('bulkCountBadge');
  if (badge) {
    badge.style.display = count > 0 ? 'inline' : 'none';
    badge.innerText = `${count} orders`;
  }

  // Cost preview — sum each line's cost
  const preview     = document.getElementById('bulkTotalPreview');
  const previewText = document.getElementById('bulkTotalText');
  if (preview && previewText && count > 0) {
    const grandTotal = valid.reduce((sum, item) => {
        const variant = currentPricingVariants.find(v => v.gb_size === item.gb);
        const itemPrice = variant ? parseFloat(variant.price) : (item.gb * userPricePerGB);
        return sum + itemPrice;
    }, 0).toFixed(2);
    const totalGB    = valid.reduce((sum, item) => sum + item.gb, 0);
    previewText.innerHTML = `${count} orders &nbsp;·&nbsp; <strong>${totalGB}GB total</strong> &nbsp;·&nbsp; Grand total: <strong>₵${grandTotal}</strong>${skipped.length ? ` &nbsp;·&nbsp; <span style="color:#f59e0b;">${skipped.length} invalid line${skipped.length > 1 ? 's' : ''} skipped</span>` : ''}`;
    preview.style.display = 'block';
  } else if (preview) {
    preview.style.display = 'none';
  }
}

function bulkAddToCart() {
  const { valid, skipped } = parseBulkLines();

  if (valid.length === 0) {
    alert('No valid orders found.\n\nFormat each line as:\n  phone_number GB_size\n\nExample:\n  0559623850 2\n  0241234567 5\n\nPhone numbers must be 9 or 10 digits.');
    return;
  }

  const rcfg = (typeof roleConfig !== 'undefined' ? roleConfig[currentUserRoleForPricing] : null) || { label: 'CLIENT', color: '#64748b' };

  valid.forEach(({ phone, gb }) => {
    const variant = currentPricingVariants.find(v => v.gb_size === gb);
    const amount = variant ? parseFloat(variant.price) : parseFloat((gb * userPricePerGB).toFixed(2));
    cartItems.push({
      id:        Date.now() + Math.random(),
      phone,
      network:   selectedBulkNetwork,
      gb,
      amount,
      role:      currentUserRoleForPricing,
      roleLabel: rcfg.label,
      roleColor: rcfg.color
    });
  });

  renderCart();

  // Reset panel
  document.getElementById('bulkPhones').value = '';
  document.getElementById('bulkTotalPreview').style.display = 'none';
  document.getElementById('bulkLineCount').innerText = '0 orders';
  document.getElementById('bulkCountBadge').style.display = 'none';
  document.getElementById('bulkPanel').style.display = 'none';

  const msg = skipped.length > 0
    ? `✅ ${valid.length} order${valid.length > 1 ? 's' : ''} added to cart!\n⚠️ ${skipped.length} invalid line${skipped.length > 1 ? 's were' : ' was'} skipped (bad phone number or missing GB size).`
    : `✅ ${valid.length} order${valid.length > 1 ? 's' : ''} added to cart! Review below and click Pay Now.`;
  alert(msg);
}


// ==========================================
// MAP NETWORK DISPLAY NAMES TO API VALUES
// ==========================================
function getApiNetworkName(displayName) {
  const map = {
    'MTN': 'YELLO',
    'Telecel': 'TELECEL',
    'Ishare': 'AT_PREMIUM',
    'AirtelTigo': 'AT_PREMIUM',
    'Bigtime': 'AT_BIGTIME',
  };
  return map[displayName] || displayName;
}

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

async function updatePricingForSelectedNetwork(isBulk = false) {
  const netName = isBulk ? selectedBulkNetwork : selectedNetwork;
  const productKey = getDbProductKey(netName);

  try {
    // 1. Fetch available variants for this network and user's role
    const { data: variants, error } = await supabase
      .from('pricing')
      .select('gb_size, price, is_in_stock')
      .eq('role', currentUserRoleForPricing)
      .eq('product', productKey);

    if (error) throw error;
    
    currentPricingVariants = variants || [];

    // 2. Identify the Fallback "Per GB" price (size = 0 or NULL)
    const fallback = variants.find(v => v.gb_size === 0 || v.gb_size === null);
    userPricePerGB = fallback ? parseFloat(fallback.price) : 5;

    // 3. Rebuild bundle dropdown
    if (!isBulk) {
        const bundleSelect = document.getElementById('bundle');
        if (bundleSelect) {
            const currentVal = bundleSelect.value;
            bundleSelect.innerHTML = '<option value="">— Select size —</option>';
            
            // Only show sizes that are explicitly defined in the database
            const allSizes = [...new Set([...variants.map(v => v.gb_size).filter(s => s > 0)])].sort((a,b) => a-b);

            allSizes.forEach(size => {
                const variant = variants.find(v => v.gb_size === size);
                
                // Skip if explicitly marked out of stock
                if (variant && variant.is_in_stock === false) return;

                const priceValue = variant ? parseFloat(variant.price) : (size * userPricePerGB);
                const opt = document.createElement('option');
                opt.value = size;
                opt.dataset.price = priceValue;
                opt.textContent = `${size}GB  —  ₵${parseFloat(priceValue).toFixed(2)}`;
                if(currentVal == size) opt.selected = true;
                bundleSelect.appendChild(opt);
            });

            // Update banner rate display
            const bannerRate = document.getElementById('bannerRate');
            if (bannerRate) bannerRate.innerText = `₵${userPricePerGB}/GB (Base)`;

            if(currentVal) bundleSelect.dispatchEvent(new Event('change'));
        }
    }

  } catch (err) {
    console.warn("Failed to fetch specific network rate:", err);
  }
}


// ==========================================
// LOAD ROLE-BASED PRICING + USER BANNER
// ==========================================
let cartItems = [];
let currentUserData = null;

const roleConfig = {
  'admin':        { label: 'ADMIN',        bg: 'rgba(239,68,68,0.15)',   color: '#ef4444' },
  'super agent':  { label: 'SUPER AGENT',  bg: 'rgba(139,92,246,0.15)',  color: '#8b5cf6' },
  'elite agent':  { label: 'ELITE AGENT',  bg: 'rgba(59,130,246,0.15)',  color: '#3b82f6' },
  'vip_customer': { label: 'VIP CUSTOMER', bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b' },
  'client':       { label: 'CLIENT',       bg: 'rgba(100,116,139,0.15)', color: '#64748b' },
};

async function loadBundlePrices() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = 'login.html'; return; }

    // Fetch full user profile
    const { data: userData } = await supabase
      .from('users')
      .select('first_name, last_name, role, wallet_balance, merchant_id, is_free_mode, balance_owed')
      .eq('id', user.id)
      .single();

    currentUserData = userData;
    currentUserRoleForPricing = userData?.role || 'client';

    // --- Populate User Info Banner ---
    const banner = document.getElementById('userInfoBanner');
    if (banner) {
      banner.style.display = 'flex';
      const firstName = userData?.first_name || 'User';
      const lastName  = userData?.last_name  || '';
      const fullName  = `${firstName} ${lastName}`.trim();
      const initials  = (firstName[0] + (lastName[0] || '')).toUpperCase();

      const rcfg = roleConfig[currentUserRoleForPricing] || roleConfig['client'];

      document.getElementById('bannerAvatar').innerText = initials;
      document.getElementById('bannerName').innerText   = fullName;
      document.getElementById('bannerEmail').innerText  = user.email;
      const bannerRole = document.getElementById('bannerRole');
      bannerRole.innerText = rcfg.label;
      bannerRole.style.background = rcfg.bg;
      bannerRole.style.color      = rcfg.color;
      document.getElementById('bannerWallet').innerText = `₵${parseFloat(userData?.wallet_balance || 0).toFixed(2)}`;
    }

    // --- Populate Hero Banner Stats ---
    const bannerWallet = document.getElementById('bannerWallet');
    if (bannerWallet) bannerWallet.innerText = `₵${parseFloat(userData?.wallet_balance || 0).toFixed(2)}`;

    const bannerRate = document.getElementById('bannerRate');
    if (bannerRate) bannerRate.innerText = `₵${userPricePerGB}/GB (Base)`;

    // Free Mode visibility in checkout hero
    const freeModeOn = userData?.is_free_mode === true;
    const freeModeStat = document.getElementById('freeModeHeroStat');
    const freeModeDivider = document.getElementById('freeModeDivider');
    const owedElem = document.getElementById('bannerBalanceOwed');
    if (freeModeStat && freeModeDivider && owedElem) {
      freeModeStat.style.display = freeModeOn ? 'flex' : 'none';
      freeModeDivider.style.display = freeModeOn ? 'block' : 'none';
      owedElem.innerText = `₵${parseFloat(userData?.balance_owed || 0).toFixed(2)}`;
    }

    // --- Build bundle dropdown with prices based on initial network ---
    await updatePricingForSelectedNetwork();

    // --- Live price preview on bundle change ---
    const bundleSelect = document.getElementById('bundle');
    if (bundleSelect) {
        bundleSelect.addEventListener('change', () => {
          const val = parseFloat(bundleSelect.value);
          const preview = document.getElementById('pricePreview');
          const previewText = document.getElementById('pricePreviewText');
          if (val && preview && previewText) {
            const selectedOpt = bundleSelect.options[bundleSelect.selectedIndex];
            const exactPrice = parseFloat(selectedOpt.dataset.price);
            previewText.innerHTML = `Dispatching ${val}GB will cost <strong>₵${exactPrice.toFixed(2)}</strong>`;
            preview.style.display = 'block';
          } else if (preview) {
            preview.style.display = 'none';
          }
        });
    }

  } catch(e) {
    console.error('Failed to load pricing:', e);
  }
}

document.addEventListener('DOMContentLoaded', loadBundlePrices);


// ==========================================
// GHANA NETWORK VALIDATION UTILITIES
// (mirrors bulk-order.js — single orders too)
// ==========================================
const CART_NETWORK_PREFIXES = {
  'MTN':     ['024','054','055','059','025','053','020','050'],
  'Telecel': ['020','050'],
  'Ishare':  ['026','027','056','057'],
  'Bigtime': ['026','027','056','057'],
};

const CART_PREFIX_TO_NET = {
  '024':'MTN','054':'MTN','055':'MTN','059':'MTN','025':'MTN','053':'MTN',
  '020':'Telecel','050':'Telecel',
  '026':'Ishare','027':'Ishare','056':'Ishare','057':'Ishare',
};

function getCartPrefix(phone) {
  const s = phone.replace(/\D/g,'');
  if (s.length === 10 && s[0] === '0') return s.substring(0,3);       // e.g. 0241234567 → 024
  if (s.length === 9  && s[0] !== '0') return '0' + s.substring(0,2); // e.g. 241234567  → 024
  return null;
}

function detectCartNetwork(phone) {
  const prefix = getCartPrefix(phone);
  return prefix ? (CART_PREFIX_TO_NET[prefix] || null) : null;
}

function isValidCartPhone(phone) {
  const s = phone.replace(/\D/g,'');
  return /^0\d{9}$/.test(s) || /^[1-9]\d{8}$/.test(s);
}

function showCartToast(msg, type = 'info') {
  const old = document.getElementById('cartToast');
  if (old) old.remove();
  const colors = {
    info:    '#1e40af', success: '#059669',
    warning: '#d97706', error:   '#dc2626'
  };
  const icons  = { info:'ℹ️', success:'✅', warning:'⚠️', error:'❌' };
  const t = document.createElement('div');
  t.id = 'cartToast';
  t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;background:${colors[type]||colors.info};color:white;padding:14px 18px;border-radius:12px;font-size:13px;font-weight:600;font-family:Inter,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.25);display:flex;align-items:center;gap:10px;max-width:360px;line-height:1.5;animation:slideInToast 0.3s ease;`;
  
  const style = document.createElement('style');
  style.textContent = `@keyframes slideInToast { from { transform:translateY(20px); opacity:0; } to { transform:translateY(0); opacity:1; } }`;
  document.head.appendChild(style);

  t.innerHTML = `<span style="font-size:18px;">${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 5000);
}

// ==========================================
// ADD TO CART  (with network + duplicate check)
// ==========================================
async function addToCart() {
  const rawPhone = document.getElementById('phone').value.trim();
  const phone    = rawPhone.replace(/\D/g,'');
  const bundleSelect = document.getElementById('bundle');
  const bundle   = bundleSelect.value;

  // --- Phone format validation ---
  if (!isValidCartPhone(phone)) {
    showCartToast(
      phone.startsWith('0') && phone.length === 9
        ? 'A 9-digit number must NOT start with 0.'
        : 'Please enter a valid phone number.',
      'error'
    );
    return;
  }

  if (!bundle) { showCartToast('Please select a bundle package.', 'error'); return; }

  // --- Network prefix validation ---
  const detectedNet = detectCartNetwork(phone);
  if (detectedNet && detectedNet !== selectedNetwork) {
    showCartToast(
      `⚠️ ${phone} is ${detectedNet}, not ${selectedNetwork}.`,
      'warning'
    );
    return;
  }
  if (!detectedNet) {
    showCartToast(`Unknown network prefix.`, 'warning');
    return;
  }

  // --- Duplicate pending order check ---
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: existing } = await supabase
        .from('orders')
        .select('plan, network')
        .eq('user_id', user.id)
        .eq('phone', phone)
        .eq('status', 'pending')
        .limit(1);

      if (existing && existing.length > 0) {
        showCartToast(`📅 Duplicate detected. Queued for schedule.`, 'warning');
        const gb = parseFloat(bundle);
        const selectedOpt = bundleSelect.options[bundleSelect.selectedIndex];
        const amount = parseFloat(selectedOpt.dataset.price);
        cartItems.push({
          id: Date.now(), phone, network: selectedNetwork, gb, amount, isScheduled: true
        });
        renderCart();
        clearInputs();
        return;
      }
    }
  } catch (e) { console.warn('Duplicate check failed:', e); }

  // --- Normal cart add ---
  const gb = parseFloat(bundle);
  const selectedOpt = bundleSelect.options[bundleSelect.selectedIndex];
  const amount = parseFloat(selectedOpt.dataset.price);

  const rcfg = roleConfig[currentUserRoleForPricing] || roleConfig['client'];

  cartItems.push({
    id: Date.now(), 
    phone, 
    network: selectedNetwork, 
    gb, 
    amount, 
    isScheduled: false,
    roleLabel: rcfg.label,
    roleColor: rcfg.color
  });

  renderCart();

  showCartToast(`✅ Package added to queue`, 'success');
  clearInputs();
}

function clearInputs() {
    document.getElementById('phone').value  = '';
    document.getElementById('bundle').value = '';
    const preview = document.getElementById('pricePreview');
    if (preview) preview.style.display = 'none';
}

// ==========================================
// RENDER CART
// ==========================================
function renderCart() {
  const container  = document.getElementById('cartItems');
  const totalBox   = document.getElementById('cartTotal');
  const countBadge = document.getElementById('cartCount');
  const payBtn     = document.getElementById('payBtn');

  if (!cartItems.length) {
    container.innerHTML = '<div class="empty-cart"><p>Your queue is currently empty</p></div>';
    if (totalBox) totalBox.style.display = 'none';
    if (countBadge) countBadge.innerText = '0 items';
    if (payBtn) payBtn.style.display = 'none';
    return;
  }

  if (payBtn) payBtn.style.display = 'flex';
  const normalCount = cartItems.filter(i => !i.isScheduled).length;
  const schedCount  = cartItems.filter(i => i.isScheduled).length;
  
  if (countBadge) {
    countBadge.innerText = schedCount > 0 
        ? `${normalCount} direct · ${schedCount} sched` 
        : `${cartItems.length} items`;
  }

  let html = '';
  let grandTotal = 0;

  cartItems.forEach(item => {
    grandTotal += item.amount;
    const roleBadge = item.roleLabel ? `<span class="cart-role-badge" style="background:${item.roleColor}1a; color:${item.roleColor};">${item.roleLabel}</span>` : '';
    html += `
      <div class="cart-item">
        <div class="item-info">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            <strong>${item.network} ${item.gb}GB ${item.isScheduled ? '📅' : ''}</strong>
            ${roleBadge}
          </div>
          <span>📱 ${item.phone}</span>
        </div>
        <div style="display:flex; align-items:center;">
          <span class="item-price">₵${item.amount.toFixed(2)}</span>
          <button class="remove-btn" onclick="removeFromCart(${item.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
    `;
  });


  container.innerHTML = html;

  if (totalBox) {
      totalBox.style.display = 'flex';
      totalBox.innerHTML = `
        <span style="color:var(--text-muted); font-size:13px; font-weight:600;">Check-out Total</span>
        <span>₵${grandTotal.toFixed(2)}</span>
      `;
  }
}


// ==========================================
// REMOVE FROM CART
// ==========================================
function removeFromCart(id) {
  cartItems = cartItems.filter(i => i.id !== id);
  renderCart();
}


// ==========================================
// MAKE PAYMENT (splits normal vs scheduled)
// ==========================================
async function makePayment() {
  if (!cartItems.length) {
    showCartToast('Your cart is empty. Please add at least one item.', 'error');
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { window.location.href = 'login.html'; return; }

  const normalItems    = cartItems.filter(i => !i.isScheduled);
  const scheduledItems = cartItems.filter(i =>  i.isScheduled);

  // Check wallet for ALL items (normal + scheduled)
  const normalTotal    = normalItems.reduce((sum, i) => sum + i.amount, 0);
  const scheduledTotal = scheduledItems.reduce((sum, i) => sum + i.amount, 0);
  const grandTotal     = normalTotal + scheduledTotal;

  const { data: walletData } = await supabase
    .from('users').select('wallet_balance').eq('id', user.id).single();

  if ((walletData?.wallet_balance || 0) < grandTotal) {
    showCartToast(
      `Insufficient wallet balance. Need ₵${grandTotal.toFixed(2)}, have ₵${(walletData?.wallet_balance || 0).toFixed(2)}.`,
      'error'
    );
    return;
  }

  let successCount   = 0;
  let currentBalance = walletData.wallet_balance;

  // --- Process NORMAL orders ---
  for (const item of normalItems) {
    const newBalance = parseFloat((currentBalance - item.amount).toFixed(2));

    await supabase.from('users').update({ wallet_balance: newBalance }).eq('id', user.id);

    await supabase.from('orders').insert({
      user_id: user.id, network: item.network,
      phone: item.phone, plan: `${item.gb}GB`,
      amount: item.amount, status: 'pending'
    });

    await supabase.from('transactions').insert({
      user_id: user.id, type: 'Data Purchase',
      amount: item.amount, balance_before: currentBalance,
      balance_after: newBalance, status: 'Pending',
    });

    if (window.sendSmsNotification) {
      window.sendSmsNotification(item.phone,
        `Dear Customer, your ${item.gb}GB ${item.network} data order has been received and is being processed. Thank you for using Data4Ghana!`);
    }

    currentBalance = newBalance;
    successCount++;
  }

  // --- Queue SCHEDULED orders (deduct wallet immediately) ---
  let scheduledCount = 0;
  for (const item of scheduledItems) {
    const newBalance = parseFloat((currentBalance - item.amount).toFixed(2));

    await supabase.from('users').update({ wallet_balance: newBalance }).eq('id', user.id);

    await supabase.from('scheduled_orders').insert({
      user_id: user.id, network: item.network,
      phone: item.phone, plan: `${item.gb}GB`,
      amount: item.amount, status: 'scheduled',
      note: 'Multiple order — pending delivery already exists',
      scheduled_at: new Date().toISOString(),
    });

    await supabase.from('transactions').insert({
      user_id: user.id, type: 'Scheduled Data Purchase',
      amount: item.amount, balance_before: currentBalance,
      balance_after: newBalance, status: 'Scheduled',
    });

    currentBalance = newBalance;
    scheduledCount++;
  }

  // Clear cart and update wallet display
  cartItems = [];
  renderCart();
  document.getElementById('bannerWallet').innerText = `₵${currentBalance.toFixed(2)}`;

  const totalDeducted = normalTotal + scheduledTotal;
  let title = `${successCount} Order${successCount > 1 ? 's' : ''} Placed!`;
  let body  = `₵${totalDeducted.toFixed(2)} deducted from your wallet.`;
  if (scheduledCount > 0) {
    title += ` + ${scheduledCount} Scheduled`;
    body  += ` ${scheduledCount} scheduled order${scheduledCount > 1 ? 's are' : ' is'} queued and will be processed from your Schedule page.`;
  }

  if (currentUserData?.is_free_mode === true) {
    const latestOwed = Number(currentUserData.balance_owed || 0).toFixed(2);
    body += ` Free Mode is active on your account. Current balance owed: ₵${latestOwed}.`;
  }

  if (window.showSuccessPopup) {
    window.showSuccessPopup(title, body, () => {
      if (scheduledCount > 0) window.location.href = 'schedule.html';
      else window.location.reload();
    });
  } else {
    alert(`${successCount} order(s) placed!${scheduledCount > 0 ? ` ${scheduledCount} scheduled.` : ''}`);
    if (scheduledCount > 0) window.location.href = 'schedule.html';
    else window.location.reload();
  }
}



// ==========================================
// BUY DATA - WITH DATA4GHANA API INTEGRATION
// ==========================================
async function buyData(){

let phone = document.getElementById("phone").value
let bundle = document.getElementById("bundle").value

if(phone === "" || bundle === ""){

alert("Fill all fields")
return

}

const { data: { user } } = await supabase.auth.getUser()

if(!user){

window.location.href="login.html"
return

}


  const bundleSelect = document.getElementById('bundle');
  const selectedOpt  = bundleSelect.options[bundleSelect.selectedIndex];
  if (!selectedOpt || selectedOpt.value === "") {
    alert("Please select a bundle size");
    return;
  }
  const price = parseFloat(selectedOpt.dataset.price);


let { data } = await supabase
.from("users")
.select("wallet_balance")
.eq("id",user.id)
.single()


if(data.wallet_balance < price){

alert("Insufficient wallet balance")
return

}


let newBalance = data.wallet_balance - price


// Deduct wallet balance first
await supabase
.from("users")
.update({ wallet_balance:newBalance })
.eq("id",user.id)


// Record the transaction (debit)
await supabase
.from("transactions")
.insert({
  user_id: user.id,
  type: "Data Purchase",
  amount: price,
  balance_before: data.wallet_balance,
  balance_after: newBalance,
  status: "Pending"
});

// Insert order record
await supabase
.from("orders")
.insert({
  user_id:user.id,
  network:selectedNetwork,
  phone:phone,
  bundle:bundle,
  price:price,
  status: "pending"
})

// Dispatch SMS Confirmation
if (window.sendSmsNotification) {
  window.sendSmsNotification(phone, `Dear Customer, your order for ${bundle}GB ${selectedNetwork} data has been received and is processing. Thank you for using Data4Ghana!`);
}

// Show Premium Animated Success Modal
if (window.showSuccessPopup) {
  window.showSuccessPopup("Order Placed!", `Your order for ${bundle}GB ${selectedNetwork} data has been placed and is being processed.`, () => {
    window.location.reload();
  });
} else {
  alert("Order placed successfully");
  window.location.reload();
}

}
