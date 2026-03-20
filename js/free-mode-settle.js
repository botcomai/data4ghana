let currentUser = null;

function money(v) {
    return Number(v || 0).toFixed(2);
}

function statusClass(status) {
    const value = (status || '').toLowerCase();
    if (value === 'approved') return 'status-approved';
    if (value === 'rejected') return 'status-rejected';
    return 'status-pending';
}

async function initUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        window.location.href = 'login.html';
        return false;
    }

    const { data: profile, error: profileErr } = await supabase
        .from('users')
        .select('id, is_free_mode, balance_owed')
        .eq('id', user.id)
        .single();

    if (profileErr || !profile) {
        alert('Failed to load profile: ' + (profileErr?.message || 'Unknown error'));
        return false;
    }

    currentUser = profile;

    const modeElem = document.getElementById('accountMode');
    const owedElem = document.getElementById('balanceOwed');

    if (modeElem) modeElem.innerText = profile.is_free_mode ? 'Free Mode' : 'Standard';
    if (owedElem) owedElem.innerText = `₵${money(profile.balance_owed)}`;

    return true;
}

async function submitSettlement(event) {
    event.preventDefault();

    const amountPaid = Number(document.getElementById('amountPaid').value);
    const paymentMethod = document.getElementById('paymentMethod').value;
    const reference = document.getElementById('reference').value.trim();
    const note = document.getElementById('note').value.trim();
    const btn = document.getElementById('submitBtn');

    if (!currentUser?.id) {
        alert('Session expired. Reload page.');
        return;
    }

    if (!amountPaid || amountPaid <= 0) {
        alert('Enter a valid amount.');
        return;
    }

    if (!reference) {
        alert('Transaction reference is required.');
        return;
    }

    btn.disabled = true;
    btn.innerText = 'Submitting...';

    const { error } = await supabase
        .from('free_mode_settlements')
        .insert({
            user_id: currentUser.id,
            amount_paid: amountPaid,
            payment_method: paymentMethod,
            reference,
            note: note || null,
            submitted_by: currentUser.id,
            status: 'pending'
        });

    btn.disabled = false;
    btn.innerText = 'Submit for Approval';

    if (error) {
        alert('Submit failed: ' + error.message);
        return;
    }

    document.getElementById('settlementForm').reset();
    alert('Record submitted. Admin approval is pending.');
    await loadHistory();
}

async function loadHistory() {
    const body = document.getElementById('historyBody');

    const { data, error } = await supabase
        .from('free_mode_settlements')
        .select('amount_paid, payment_method, reference, status, created_at, approved_at')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) {
        body.innerHTML = `<tr><td colspan="6" class="state-msg">Failed to load: ${error.message}</td></tr>`;
        return;
    }

    const rows = data || [];
    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="6" class="state-msg">No settlement records yet.</td></tr>';
        return;
    }

    body.innerHTML = rows.map(r => `
        <tr>
            <td>₵${money(r.amount_paid)}</td>
            <td>${(r.payment_method || 'manual').replace('_', ' ')}</td>
            <td>${r.reference || '-'}</td>
            <td><span class="status-pill ${statusClass(r.status)}">${r.status}</span></td>
            <td>${new Date(r.created_at).toLocaleString()}</td>
            <td>${r.approved_at ? new Date(r.approved_at).toLocaleString() : '-'}</td>
        </tr>
    `).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
    const ok = await initUser();
    if (!ok) return;

    document.getElementById('settlementForm').addEventListener('submit', submitSettlement);
    await loadHistory();
});
