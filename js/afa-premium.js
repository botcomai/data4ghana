// ============================================
// PREMIUM AFA PORTAL — afa-premium.js
// Handles premium registration, payments, and history
// ============================================

let afaPremiumPrice = 30;
let afaCurrentUser  = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = 'login.html'; return; }
    afaCurrentUser = user;

    await updateAfaWallet();
    await loadAfaPricing();
    await loadPremiumHistory();

  } catch (e) {
    console.error('AFA Premium init error:', e);
  }
});

async function updateAfaWallet() {
  const { data } = await supabase.from('users').select('wallet_balance').eq('id', afaCurrentUser.id).single();
  const balance = parseFloat(data?.wallet_balance || 0);
  const walletDisplay = document.getElementById('afaWalletDisplay');
  if (walletDisplay) {
      walletDisplay.textContent = `₵${balance.toFixed(2)}`;
  }
  return balance;
}

// Keep legacy for compatibility in form handler
async function getWallet() {
    return await updateAfaWallet();
}

async function loadAfaPricing() {
  try {
    const { data: config } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'afa_settings')
      .single();

    if (config && config.value && config.value.premium_tier_price !== undefined) {
        afaPremiumPrice = parseFloat(config.value.premium_tier_price);
        document.querySelectorAll('.premium-price-label').forEach(el => {
            el.textContent = `₵${afaPremiumPrice.toFixed(2)}`;
        });
    }
  } catch (e) {
    console.error('Failed to load AFA pricing:', e);
  }
}

async function loadPremiumHistory() {
  try {
    const { data: history, error } = await supabase
      .from('afa_registrations')
      .select('*')
      .eq('user_id', afaCurrentUser.id)
      .eq('tier', 'premium')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Update Global Count Stat
    const totalCountElem = document.getElementById('totalAfaCount');
    if (totalCountElem) {
        totalCountElem.innerText = history ? history.length : 0;
    }

    const tbody = document.querySelector('#premiumHistoryTable tbody');
    tbody.innerHTML = '';

    if (!history || history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:60px; color:#94a3b8;"><div class="loading-state"><span style="font-size:32px;">📑</span><span>No premium registrations found.</span></div></td></tr>';
      return;
    }

    history.forEach(item => {
      const dateStr = new Date(item.created_at).toLocaleDateString('en-GB', { 
          day:'numeric', 
          month:'short', 
          year:'numeric' 
      });
      
      let statusHtml = '';
      if (item.status === 'completed' || item.status === 'approved') {
        statusHtml = `<span class="status-badge status-completed"><span class="status-dot"></span>Completed</span>`;
      } else if (item.status === 'failed' || item.status === 'rejected') {
        statusHtml = `<span class="status-badge status-failed"><span class="status-dot"></span>Failed</span>`;
      } else {
        statusHtml = `<span class="status-badge status-pending"><span class="status-dot"></span>Pending</span>`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-label="Date" style="font-weight:600; color:#475569;">${dateStr}</td>
        <td data-label="Beneficiary" style="font-weight:700; color:#1e293b;">${item.full_name}</td>
        <td data-label="Phone" style="font-weight:600;">${item.phone}</td>
        <td data-label="Identity Details">
            <div style="font-size:11px; font-weight:800; color:var(--quantum-cyan); text-transform:uppercase;">${item.id_type}</div>
            <div style="font-weight:700; margin:2px 0;">${item.id_number}</div>
            <div style="font-size:11px; color:#64748b;">DOB: ${item.dob || 'N/A'}</div>
        </td>
        <td data-label="Status">${statusHtml}</td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error('Error loading premium history:', err);
    document.querySelector('#premiumHistoryTable tbody').innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444; padding:40px;">Failed to load history matrix.</td></tr>';
  }
}

document.getElementById('premiumAfaForm').addEventListener('submit', async function(e) {
  e.preventDefault();

  const btn = document.getElementById('submitBtn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:18px; height:18px; border-width:2px; margin-right:8px;"></div> Processing...';

  try {
    const walletBalance = await updateAfaWallet();
    const price = afaPremiumPrice;

    if (walletBalance < price) {
      alert(`Insufficient wallet balance. You need ₵${price.toFixed(2)} but have ₵${walletBalance.toFixed(2)}.`);
      btn.disabled = false;
      btn.innerHTML = originalText;
      return;
    }

    const { error: insertErr } = await supabase
      .from('afa_registrations')
      .insert({
        user_id:   afaCurrentUser.id,
        full_name: document.getElementById('pName').value,
        phone:     document.getElementById('pPhone').value,
        id_type:   document.getElementById('pIdType').value,
        id_number: document.getElementById('pIdNumber').value,
        dob:       document.getElementById('pDob').value,
        tier:      'premium',
        status:    'pending'
      });

    if (insertErr) throw insertErr;

    const newBalance = parseFloat((walletBalance - price).toFixed(2));
    await supabase.from('users').update({ wallet_balance: newBalance }).eq('id', afaCurrentUser.id);

    await supabase.from('transactions').insert({
      user_id:        afaCurrentUser.id,
      type:           'AFA Premium Registration',
      amount:         price,
      balance_before: walletBalance,
      balance_after:  newBalance,
      status:         'Completed'
    });

    if (window.sendSmsNotification) {
      window.sendSmsNotification(document.getElementById('pPhone').value, 'Welcome to Data4Ghana! Your Premium AFA Registration has been successfully completed.');
    }

    if (window.showSuccessPopup) {
      window.showSuccessPopup('AFA Registered!', `Your Premium AFA account has been configured. Wallet charged ₵${price.toFixed(2)}.`, () => {
        window.location.reload();
      });
    } else {
      alert('Premium AFA Registered!');
      window.location.reload();
    }

  } catch (err) {
    console.error('Premium AFA error:', err);
    alert('Registration failed: ' + err.message);
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
});
