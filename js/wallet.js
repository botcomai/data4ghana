// ==========================================
// MANUAL FUNDING SETTINGS (loaded from DB)
// ==========================================
let manualEnabled = false;
let manualMomoNumber = '';
let manualMomoName = '';
let paystackEnabled = false;
let paystackPublicKey = '';
let selectedFundingMethod = 'manual';

async function loadPaymentSettings() {
  try {
    const { data: settings } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['manual_transfer_enabled', 'manual_momo_number', 'manual_momo_name', 'paystack_enabled', 'paystack_public_key']);

    if (settings) {
      settings.forEach((s) => {
        if (s.key === 'manual_transfer_enabled') manualEnabled = s.value === 'true';
        if (s.key === 'manual_momo_number') manualMomoNumber = s.value;
        if (s.key === 'manual_momo_name') manualMomoName = s.value;
        if (s.key === 'paystack_enabled') paystackEnabled = s.value === 'true';
        if (s.key === 'paystack_public_key') paystackPublicKey = s.value;
      });
    }

    const momoNumInline = document.getElementById('momoNumberInline');
    const momoNameInline = document.getElementById('momoNameInline');
    if (momoNumInline) momoNumInline.innerText = manualMomoNumber || '---';
    if (momoNameInline) momoNameInline.innerText = manualMomoName || '---';

    const manualOpt = document.getElementById('optManual');
    const paystackOpt = document.getElementById('optPaystack');
    const fundBtn = document.getElementById('fundBtn');

    if (!manualEnabled && manualOpt) {
      manualOpt.style.opacity = '0.4';
      manualOpt.style.pointerEvents = 'none';
      manualOpt.innerHTML = '<h4>Manual Transfer (Agent)</h4><p style="color:#ef4444; font-weight:600;">Currently unavailable</p>';
    }

    if (!manualEnabled && fundBtn) {
      fundBtn.disabled = true;
      fundBtn.innerText = 'Manual funding is currently disabled';
      fundBtn.style.background = '#94a3b8';
    }

    if (paystackOpt && (!paystackEnabled || !paystackPublicKey)) {
      paystackOpt.classList.add('disabled-method');
      paystackOpt.innerHTML = '<h4>Paystack (Instant)</h4><p style="color:#ef4444; font-weight:600;">Currently unavailable</p>';
    }

    // Set default mode based on availability (prefer Paystack first).
    if (paystackEnabled && paystackPublicKey) {
      selectPaymentMethod('paystack');
    } else if (manualEnabled) {
      selectPaymentMethod('manual');
    }
  } catch (e) {
    console.error('Failed to load payment settings:', e);
  }
}

document.addEventListener('DOMContentLoaded', loadPaymentSettings);

function processFunding() {
  if (selectedFundingMethod === 'paystack') {
    startPaystackPayment();
    return;
  }
  submitManualRequest();
}

function selectPaymentMethod(method) {
  const manualOpt = document.getElementById('optManual');
  const paystackOpt = document.getElementById('optPaystack');
  const fundBtn = document.getElementById('fundBtn');
  const manualAmountSection = document.getElementById('manualAmountSection');
  const manualDetails = document.getElementById('manualDetails');
  const refBox = document.getElementById('refBox');

  if (method === 'paystack') {
    if (!paystackEnabled || !paystackPublicKey) {
      alert('Paystack is currently unavailable.');
      return;
    }

    selectedFundingMethod = 'paystack';
    if (manualOpt) manualOpt.classList.remove('selected-manual');
    if (paystackOpt) paystackOpt.classList.add('selected-paystack');
    if (manualAmountSection) manualAmountSection.style.display = 'none';
    if (manualDetails) manualDetails.style.display = 'none';
    if (refBox) refBox.style.display = 'none';
    if (fundBtn) {
      fundBtn.disabled = false;
      fundBtn.innerText = 'Pay with Paystack';
      fundBtn.style.background = 'linear-gradient(135deg, #2a7de1 0%, #3498db 100%)';
    }
    return;
  }

  // default manual mode
  if (!manualEnabled) {
    alert('Manual funding is currently unavailable.');
    return;
  }

  selectedFundingMethod = 'manual';
  if (paystackOpt) paystackOpt.classList.remove('selected-paystack');
  if (manualOpt) manualOpt.classList.add('selected-manual');
  if (manualAmountSection) manualAmountSection.style.display = 'block';
  if (manualDetails) manualDetails.style.display = 'block';
  prepareManualTransfer();
  if (refBox) refBox.style.display = 'flex';
  if (fundBtn) {
    fundBtn.disabled = false;
    fundBtn.innerText = 'Submit Manual Request';
    fundBtn.style.background = 'linear-gradient(135deg, #2a7de1 0%, #3498db 100%)';
  }
}

function calculateFundingFee() {
  if (selectedFundingMethod === 'manual') {
    prepareManualTransfer();
  }
}

async function startPaystackPayment() {
  let amount = parseFloat(document.getElementById('amount').value);

  if (selectedFundingMethod === 'paystack') {
    const input = window.prompt('Enter amount to pay with Paystack (GHS):');
    if (input === null) return;
    amount = parseFloat(input);
  }

  if (isNaN(amount) || amount <= 0) {
    alert('Please enter a valid amount.');
    return;
  }

  if (!window.PaystackPop || !paystackPublicKey) {
    alert('Paystack SDK is unavailable. Try refreshing the page.');
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  const reference = `PSK_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const amountInPesewas = Math.round(amount * 100);
  const pendingNote = document.getElementById('paymentPendingNote');

  if (pendingNote) {
    pendingNote.style.display = 'none';
    pendingNote.innerText = 'Payment pending confirmation. Wallet balance updates after webhook verification.';
  }

  const handler = window.PaystackPop.setup({
    key: paystackPublicKey,
    email: user.email,
    amount: amountInPesewas,
    currency: 'GHS',
    ref: reference,
    metadata: {
      userId: user.id,
      source: 'wallet_topup',
    },
    callback: function(response) {
      // Show a non-blocking banner and start polling for the balance update
      showPaymentPendingBanner(response.reference, amount);
      watchForBalanceUpdate(user.id, amount);
    },
    onClose: function() {
      // user closed the popup without paying — nothing to do
    },
  });

  handler.openIframe();
}

function showPaymentPendingBanner(reference, amount) {
  let banner = document.getElementById('_paymentStatusBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = '_paymentStatusBanner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;padding:14px 20px;text-align:center;font-weight:600;font-size:15px;transition:background 0.4s';
    document.body.prepend(banner);
  }
  banner.style.background = '#f59e0b';
  banner.style.color = '#fff';
  banner.innerText = `⏳ Payment of ₵${Number(amount).toFixed(2)} received. Confirming… your wallet will update automatically.`;
}

function showPaymentConfirmedBanner(newBalance) {
  const banner = document.getElementById('_paymentStatusBanner');
  if (banner) {
    banner.style.background = '#22c55e';
    banner.innerText = `✅ Wallet funded! New balance: ₵${Number(newBalance).toFixed(2)}`;
    setTimeout(() => { banner.remove(); }, 6000);
  }
}

async function watchForBalanceUpdate(userId, paidAmount) {
  // Get the balance right now before the webhook hits
  const { data: before } = await supabase
    .from('users')
    .select('wallet_balance')
    .eq('id', userId)
    .single();

  const balanceBefore = Number(before?.wallet_balance || 0);
  let attempts = 0;
  const maxAttempts = 20; // poll for up to ~60 seconds

  const poll = setInterval(async () => {
    attempts++;
    try {
      const { data: current } = await supabase
        .from('users')
        .select('wallet_balance')
        .eq('id', userId)
        .single();

      const currentBalance = Number(current?.wallet_balance || 0);

      if (currentBalance > balanceBefore) {
        clearInterval(poll);
        showPaymentConfirmedBanner(currentBalance);
        // Refresh wallet display
        if (typeof loadWallet === 'function') loadWallet();
      } else if (attempts >= maxAttempts) {
        clearInterval(poll);
        const banner = document.getElementById('_paymentStatusBanner');
        if (banner) {
          banner.style.background = '#64748b';
          banner.innerText = '⚠️ Payment sent but not confirmed yet. Refresh in a moment.';
          setTimeout(() => { banner.remove(); }, 8000);
        }
      }
    } catch (_) {}
  }, 3000);
}

function prepareManualTransfer() {
  const amountInput = parseFloat(document.getElementById("amount").value);
  if(isNaN(amountInput) || amountInput <= 0) {
    // Keep transfer panel visible without forcing an alert until submit.
    return;
  }

  // Generate Reference ID if not already set
  let refEl = document.getElementById("refId");
  if (refEl && !refEl.innerText) {
    let randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();
    refEl.innerText = "D4G-" + randomChars;
  }
  
  // Inject latest details from settings
  const momoNum = document.getElementById("momoNumberInline");
  const momoName = document.getElementById("momoNameInline");
  if (momoNum) momoNum.innerText = manualMomoNumber || '---';
  if (momoName) momoName.innerText = manualMomoName || '---';

  // Manual requests are finalized by the user clicking 'Submit Manual Request'
}

function closeManualModal() {
  // Keeping for compatibility with possible state resets
}

async function submitManualRequest() {
  let amount = parseFloat(document.getElementById("amount").value);
  let refId = document.getElementById("refId").innerText;

  if(isNaN(amount) || amount <= 0) {
    alert("Invalid amount.");
    return;
  }

  if (amount < 100) {
    alert("Minimum manual transfer amount is ₵100.");
    return;
  }

  const submitBtn = document.getElementById("fundBtn") || document.getElementById("submitManualBtn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = "Submitting Request...";
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if(!user) {
      window.location.href = "login.html";
      return;
    }

    // Fetch user phone natively
    let { data: currUser } = await supabase
      .from("users")
      .select("phone")
      .eq("id", user.id)
      .single();

    // Insert pending transaction (balance remains untouched)
    const { error: insertError } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        type: "Deposit (Manual)",
        amount: amount,
        status: "pending",
        reference: refId
      });

    if (insertError) throw insertError;

    // Dispatch SMS Notification
    if(window.sendSmsNotification && currUser?.phone) {
      window.sendSmsNotification(currUser.phone, `Your manual funding request of ₵${amount} with Ref: ${refId} is pending review by our agents.`);
    }

    closeManualModal();
    
    if(window.showSuccessPopup) {
      window.showSuccessPopup("Request Submitted!", "Your manual funding request has been submitted. We will process it shortly.", () => {
        window.location.reload();
      });
    } else {
      alert("Manual funding request submitted successfully! We will process it shortly.");
      window.location.reload();
    }
    
  } catch (err) {
    alert("Failed to submit request.");
    console.error(err);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = "Submit Manual Request";
    }
  }
}

// Globalize all necessary functions
window.submitManualRequest = submitManualRequest;
window.processFunding = processFunding;
window.selectPaymentMethod = selectPaymentMethod;
window.calculateFundingFee = calculateFundingFee;
window.startPaystackPayment = startPaystackPayment;
