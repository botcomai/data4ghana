// ============================================
// NORMAL AFA PORTAL — afa-normal.js
// Handles normal registration, file uploads, and history
// ============================================

let afaNormalPrice = 25;
let afaCurrentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = 'login.html'; return; }
    afaCurrentUser = user;

    await updateNormalWallet();
    await loadAfaPricing();
    await loadNormalHistory();

    // File input feedback
    document.querySelectorAll('input[type="file"]').forEach(input => {
        input.addEventListener('change', function() {
            const dummy = this.nextElementSibling;
            if (this.files && this.files[0]) {
                dummy.querySelector('.file-msg').textContent = this.files[0].name;
                dummy.querySelector('.file-icon').textContent = '✅';
            }
        });
    });

  } catch (e) {
    console.error('AFA Normal init error:', e);
  }
});

async function updateNormalWallet() {
  const { data } = await supabase.from('users').select('wallet_balance').eq('id', afaCurrentUser.id).single();
  const balance = parseFloat(data?.wallet_balance || 0);
  const walletDisplay = document.getElementById('afaWalletDisplay');
  if (walletDisplay) {
      walletDisplay.textContent = `₵${balance.toFixed(2)}`;
  }
  return balance;
}

// Keep legacy for compatibility
async function getWallet() {
    return await updateNormalWallet();
}

async function loadAfaPricing() {
  try {
    const { data: config } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'afa_settings')
      .single();

    if (config && config.value && config.value.normal_tier_price !== undefined) {
        afaNormalPrice = parseFloat(config.value.normal_tier_price);
        document.querySelectorAll('.normal-price-label').forEach(el => {
            el.textContent = `₵${afaNormalPrice.toFixed(2)}`;
        });
    }
  } catch (e) {
    console.error('Failed to load AFA pricing:', e);
  }
}

async function loadNormalHistory() {
  try {
    const { data: history, error } = await supabase
      .from('afa_registrations')
      .select('*')
      .eq('user_id', afaCurrentUser.id)
      .eq('tier', 'normal')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Update Pending Stat
    const pendingCount = history ? history.filter(i => i.status === 'pending' || i.status === 'pending_verification').length : 0;
    const totalCountElem = document.getElementById('totalAfaCount');
    if (totalCountElem) {
        totalCountElem.innerText = pendingCount;
    }

    const tbody = document.querySelector('#normalHistoryTable tbody');
    tbody.innerHTML = '';

    if (!history || history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:60px; color:#94a3b8;"><div class="loading-state"><span style="font-size:32px;">📑</span><span>No normal registrations found.</span></div></td></tr>';
      return;
    }

    history.forEach(item => {
      const dateStr = new Date(item.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
      
      let statusHtml = '';
      if (item.status === 'completed' || item.status === 'approved') {
        statusHtml = `<span class="status-badge status-completed"><span class="status-dot"></span>Completed</span>`;
      } else if (item.status === 'failed' || item.status === 'rejected') {
        statusHtml = `<span class="status-badge status-failed"><span class="status-dot"></span>Failed</span>`;
      } else if (item.status === 'pending_verification' || item.status === 'pending') {
        statusHtml = `<span class="status-badge status-pending" style="color:#0284c7; background:rgba(2,132,199,0.1); border-color:rgba(2,132,199,0.2);"><span class="status-dot" style="background:#0284c7; box-shadow:0 0 6px #0284c7;"></span>Reviewing</span>`;
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
    console.error('Error loading normal history:', err);
    document.querySelector('#normalHistoryTable tbody').innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444; padding:40px;">Failed to load history matrix.</td></tr>';
  }
}

document.getElementById('normalAfaForm').addEventListener('submit', async function(e) {
  e.preventDefault();

  const idFront = document.getElementById('nIdFront').files[0];
  const idBack  = document.getElementById('nIdBack').files[0];

  if (!idFront || !idBack) {
    alert('Please upload both the front and back of your ID card.');
    return;
  }

  const btn = document.getElementById('submitBtn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:18px; height:18px; border-width:2px; margin-right:8px;"></div> Processing...';

  try {
    const walletBalance = await updateNormalWallet();
    const price = afaNormalPrice;

    if (walletBalance < price) {
      alert(`Insufficient wallet balance. You need ₵${price.toFixed(2)} but have ₵${walletBalance.toFixed(2)}.`);
      btn.disabled = false;
      btn.innerHTML = originalText;
      return;
    }

    btn.innerHTML = '<div class="spinner" style="width:18px; height:18px; border-width:2px; margin-right:8px;"></div> Uploading Docs...';

    const frontPath = `afa/${afaCurrentUser.id}/id_front_${Date.now()}.${idFront.name.split('.').pop()}`;
    const { error: frontErr } = await supabase.storage.from('tickets').upload(frontPath, idFront);
    if (frontErr) throw new Error('ID front upload failed: ' + frontErr.message);

    const backPath = `afa/${afaCurrentUser.id}/id_back_${Date.now()}.${idBack.name.split('.').pop()}`;
    const { error: backErr } = await supabase.storage.from('tickets').upload(backPath, idBack);
    if (backErr) throw new Error('ID back upload failed: ' + backErr.message);

    btn.innerHTML = '<div class="spinner" style="width:18px; height:18px; border-width:2px; margin-right:8px;"></div> Finalizing...';

    const { error: insertErr } = await supabase
      .from('afa_registrations')
      .insert({
        user_id:   afaCurrentUser.id,
        full_name: document.getElementById('nName').value,
        phone:     document.getElementById('nPhone').value,
        id_type:   document.getElementById('nIdType').value,
        id_number: document.getElementById('nIdNumber').value,
        dob:       document.getElementById('nDob').value,
        id_front_url: frontPath,
        id_back_url:  backPath,
        tier:      'normal',
        status:    'pending'
      });

    if (insertErr) throw insertErr;

    const newBalance = parseFloat((walletBalance - price).toFixed(2));
    await supabase.from('users').update({ wallet_balance: newBalance }).eq('id', afaCurrentUser.id);

    await supabase.from('transactions').insert({
      user_id:        afaCurrentUser.id,
      type:           'AFA Normal Registration',
      amount:         price,
      balance_before: walletBalance,
      balance_after:  newBalance,
      status:         'Completed'
    });

    if (window.sendSmsNotification) {
      window.sendSmsNotification(document.getElementById('nPhone').value, 'Data4Ghana: Your Normal AFA Registration has been submitted and is currently pending verification.');
    }

    if (window.showSuccessPopup) {
      window.showSuccessPopup('Request Submitted!', `Your Normal AFA registration is pending verification. Wallet charged ₵${price.toFixed(2)}.`, () => {
        window.location.reload();
      });
    } else {
      alert('Normal AFA Registered!');
      window.location.reload();
    }

  } catch (err) {
    console.error('Normal AFA error:', err);
    alert('Registration failed: ' + err.message);
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
});
