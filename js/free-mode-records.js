let currentAdminId = null;
let usersMap = {};

function asMoney(value) {
    return Number(value || 0).toFixed(2);
}

function userDisplay(user) {
    if (!user) return 'Unknown User';
    const full = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    return full || user.email || `User ${String(user.id).slice(0, 8)}`;
}

async function verifyAdmin() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        window.location.href = 'admin-login.html';
        return false;
    }

    const { data: profile, error: roleErr } = await supabase
        .from('users')
        .select('id, role')
        .eq('id', user.id)
        .single();

    if (roleErr || !profile || profile.role !== 'admin') {
        window.location.href = 'admin-login.html';
        return false;
    }

    currentAdminId = profile.id;
    return true;
}

async function loadUsersForForm() {
    const select = document.getElementById('userSelect');

    const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, balance_owed, is_free_mode')
        .gt('balance_owed', 0)
        .order('balance_owed', { ascending: false });

    if (error) {
        select.innerHTML = '<option value="">Failed to load users</option>';
        return;
    }

    const users = data || [];
    usersMap = {};
    users.forEach(u => {
        usersMap[u.id] = u;
    });

    if (!users.length) {
        select.innerHTML = '<option value="">No users with debt found</option>';
        return;
    }

    select.innerHTML = '<option value="">Select user</option>' + users.map(u => (
        `<option value="${u.id}">${userDisplay(u)} - Owed: GHS ${asMoney(u.balance_owed)}</option>`
    )).join('');
}

async function createSettlementRecord(event) {
    event.preventDefault();

    const userId = document.getElementById('userSelect').value;
    const amountPaid = Number(document.getElementById('amountPaid').value);
    const paymentMethod = document.getElementById('paymentMethod').value;
    const reference = document.getElementById('reference').value.trim();
    const note = document.getElementById('note').value.trim();
    const btn = document.getElementById('createRecordBtn');

    if (!userId || !amountPaid || amountPaid <= 0) {
        alert('Select user and enter a valid amount.');
        return;
    }

    btn.disabled = true;
    btn.innerText = 'Creating...';

    const { error } = await supabase
        .from('free_mode_settlements')
        .insert({
            user_id: userId,
            amount_paid: amountPaid,
            payment_method: paymentMethod,
            reference: reference || null,
            note: note || null,
            submitted_by: currentAdminId,
            status: 'pending'
        });

    btn.disabled = false;
    btn.innerText = 'Create Pending Record';

    if (error) {
        alert('Failed to create record: ' + error.message);
        return;
    }

    document.getElementById('settlementForm').reset();
    alert('Settlement record created and waiting for approval.');
    await refreshAll();
}

async function approveRecord(recordId) {
    const { error } = await supabase.rpc('admin_approve_free_mode_settlement', {
        p_record_id: recordId,
        p_admin_note: null
    });

    if (error) {
        alert('Approval failed: ' + error.message);
        return;
    }

    await refreshAll();
}

async function rejectRecord(recordId) {
    const note = prompt('Optional rejection note:') || null;

    const { error } = await supabase.rpc('admin_reject_free_mode_settlement', {
        p_record_id: recordId,
        p_admin_note: note
    });

    if (error) {
        alert('Reject failed: ' + error.message);
        return;
    }

    await refreshAll();
}

function statusClass(status) {
    const value = (status || '').toLowerCase();
    if (value === 'approved') return 'status-approved';
    if (value === 'rejected') return 'status-rejected';
    return 'status-pending';
}

async function loadRecords() {
    const pendingBody = document.getElementById('pendingBody');
    const historyBody = document.getElementById('historyBody');

    const { data: rows, error } = await supabase
        .from('free_mode_settlements')
        .select('id, user_id, amount_paid, payment_method, reference, note, status, created_at, approved_at')
        .order('created_at', { ascending: false })
        .limit(300);

    if (error) {
        pendingBody.innerHTML = `<tr><td colspan="6" class="state-msg">Failed: ${error.message}</td></tr>`;
        historyBody.innerHTML = `<tr><td colspan="6" class="state-msg">Failed: ${error.message}</td></tr>`;
        return;
    }

    const all = rows || [];
    const userIds = [...new Set(all.map(r => r.user_id).filter(Boolean))];

    if (userIds.length) {
        const { data: users } = await supabase
            .from('users')
            .select('id, first_name, last_name, email, balance_owed')
            .in('id', userIds);

        (users || []).forEach(u => {
            usersMap[u.id] = u;
        });
    }

    const pending = all.filter(r => r.status === 'pending');
    const history = all.filter(r => r.status !== 'pending');

    if (!pending.length) {
        pendingBody.innerHTML = '<tr><td colspan="6" class="state-msg">No pending approvals.</td></tr>';
    } else {
        pendingBody.innerHTML = pending.map(r => {
            const user = usersMap[r.user_id];
            return `
                <tr>
                    <td>${userDisplay(user)}</td>
                    <td>GHS ${asMoney(r.amount_paid)}</td>
                    <td>${(r.payment_method || 'manual').replace('_', ' ')}</td>
                    <td>${r.reference || '-'}</td>
                    <td>${new Date(r.created_at).toLocaleString()}</td>
                    <td>
                        <button class="approve-btn" onclick="approveRecord('${r.id}')">Approve</button>
                        <button class="reject-btn" onclick="rejectRecord('${r.id}')">Reject</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    if (!history.length) {
        historyBody.innerHTML = '<tr><td colspan="6" class="state-msg">No history yet.</td></tr>';
    } else {
        historyBody.innerHTML = history.map(r => {
            const user = usersMap[r.user_id];
            const reviewedAt = r.approved_at ? new Date(r.approved_at).toLocaleString() : '-';
            return `
                <tr>
                    <td>${userDisplay(user)}</td>
                    <td>GHS ${asMoney(r.amount_paid)}</td>
                    <td><span class="status-pill ${statusClass(r.status)}">${r.status}</span></td>
                    <td>${(r.payment_method || 'manual').replace('_', ' ')}</td>
                    <td>${r.reference || '-'}</td>
                    <td>${reviewedAt}</td>
                </tr>
            `;
        }).join('');
    }

    const pendingCount = pending.length;
    const approvedToday = history.filter(r => {
        if (r.status !== 'approved' || !r.approved_at) return false;
        const d = new Date(r.approved_at);
        const now = new Date();
        return d.toDateString() === now.toDateString();
    }).length;
    const totalSettled = history
        .filter(r => r.status === 'approved')
        .reduce((sum, r) => sum + Number(r.amount_paid || 0), 0);

    document.getElementById('pendingCount').innerText = String(pendingCount);
    document.getElementById('approvedToday').innerText = String(approvedToday);
    document.getElementById('totalSettled').innerText = asMoney(totalSettled);
}

async function refreshAll() {
    const btn = document.getElementById('refreshBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Refreshing...';
    }

    await loadUsersForForm();
    await loadRecords();

    if (btn) {
        btn.disabled = false;
        btn.innerText = 'Refresh';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const ok = await verifyAdmin();
    if (!ok) return;

    document.getElementById('settlementForm').addEventListener('submit', createSettlementRecord);
    await refreshAll();
});
