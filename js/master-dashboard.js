// js/master-dashboard.js

// Tab Switching
window.switchTab = function(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.getElementById('tab-' + tabName).style.display = 'block';

  document.querySelectorAll('.nav-links li').forEach(el => el.classList.remove('active'));
  if(event && event.currentTarget) {
    event.currentTarget.parentElement.classList.add('active');
  }

  const titles = {
    'overview': 'Overview',
    'users': 'User Global Directory',
    'orders': 'Global Order Ledger'
  };
  document.getElementById("pageTitle").innerText = titles[tabName] || 'Dashboard';
}

// Authentication & Initialization
let revenueChartInstance = null;
let allUsersCache = [];

async function initializeMasterDashboard() {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    window.location.href = "master-login.html";
    return;
  }

  const { data: userData, error: userErr } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (userErr || !userData || userData.role !== 'admin') {
    window.location.href = "dashboard.html";
    return;
  }

  loadGlobalMetrics();
  loadRecentOrders(100, 'allOrdersTableBody');   
  loadUsers();
  loadWeeklyChartData();
}



// Stats & Metrics
async function loadGlobalMetrics() {
  // Users
  const { count: userCount } = await supabase.from("users").select('*', { count: 'exact', head: true });
  if (userCount !== null) animateValue(document.getElementById("metricUsers"), 0, userCount, 1000);

  // Orders
  const { count: orderCount } = await supabase.from("orders").select('*', { count: 'exact', head: true });
  if (orderCount !== null) animateValue(document.getElementById("metricOrders"), 0, orderCount, 1000);

  // Revenue
  const { data: revenueData } = await supabase.from("orders").select("amount").in("status", ["completed", "success", "true"]);
  if (revenueData) {
    const totalRev = revenueData.reduce((acc, order) => acc + (Number(order.amount) || 0), 0);
    animateValue(document.getElementById("metricRevenue"), 0, totalRev, 1000, '₵', 2);
  }
}

function animateValue(obj, start, end, duration, prefix = '', decimals = 0) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const current = (progress * (end - start) + start).toFixed(decimals);
        obj.innerHTML = prefix + current;
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

// Chart.js Timeline 
async function loadWeeklyChartData() {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    // Get orders from last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { data: orders } = await supabase
        .from('orders')
        .select('created_at, amount')
        .gte('created_at', sevenDaysAgo.toISOString())
        .in('status', ['completed', 'success']);

    // Group by day
    const labels = [];
    const dataPoints = [];
    
    for(let i=6; i>=0; i--) {
       let d = new Date();
       d.setDate(d.getDate() - i);
       let dateStr = d.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
       labels.push(dateStr);
       
       let dayTotal = 0;
       if (orders) {
           orders.forEach(o => {
               if(new Date(o.created_at).getDate() === d.getDate()) {
                   dayTotal += Number(o.amount || 0);
               }
           });
       }
       dataPoints.push(dayTotal);
    }

    if (revenueChartInstance) revenueChartInstance.destroy();

    revenueChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Revenue (₵)',
                data: dataPoints,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2,
                pointBackgroundColor: '#020817',
                pointBorderColor: '#10b981',
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4 // Smooth curves
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
               legend: { display: false }
            },
            scales: {
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: { color: '#64748b', font: {family: 'Inter', size: 11} }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
                    ticks: { color: '#64748b', font: {family: 'Inter', size: 11}, callback: v => '₵'+v }
                }
            }
        }
    });
}

// User Management
async function loadUsers() {
  const { data: users, error } = await supabase
    .from("users")
    .select("id, email, role, wallet_balance, created_at")
    .order("created_at", { ascending: false });

  if (!error && users) allUsersCache = users; // Cache for command palette
  
  const tbody = document.getElementById("usersTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (error || !users || users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4">No users.</td></tr>`;
    return;
  }

  users.forEach(u => {
    let rColor = u.role === 'admin' ? '#ef4444' : '#64748b';
    tbody.innerHTML += `
      <tr>
        <td>
          <div style="font-weight: 500; font-size:15px;">${u.email}</div>
          <div style="font-size: 11px; color:var(--text-muted); font-family:monospace; margin-top:4px;">${u.id}</div>
        </td>
        <td><span style="color:${rColor}; font-weight:700; font-size:12px; text-transform:uppercase; letter-spacing:1px;">${u.role}</span></td>
        <td><strong style="font-size:16px;">₵${Number(u.wallet_balance || 0).toFixed(2)}</strong></td>
        <td>
           <button class="btn-action" onclick="promptAdjustWallet('${u.id}', '${escapeQuote(u.email)}')">± Bank</button>
           <button class="btn-action" onclick="promptChangeRole('${u.id}', '${u.role}', '${escapeQuote(u.email)}')">Auth</button>
        </td>
      </tr>
    `;
  });
}

// Orders Ledger
async function loadRecentOrders(limit, tbodyId) {
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, user_id, network, phone, plan, amount, status, created_at, users(email)")
    .order("created_at", { ascending: false })
    .limit(limit);

  const tbody = document.getElementById(tbodyId);
  if (!tbody || error || !orders) return;
  tbody.innerHTML = "";

  orders.forEach(order => {
    const d = new Date(order.created_at).toLocaleDateString('en-GB') + ' ' + new Date(order.created_at).toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'});
    const email = order.users ? order.users.email : order.user_id;

    let statusCls = 'pending';
    const st = String(order.status).toLowerCase();
    if(st.includes('success') || st.includes('completed') || st.includes('true')) statusCls = 'success';
    else if(st.includes('failed')) statusCls = 'failed';

    tbody.innerHTML += `
      <tr>
        <td style="color:var(--text-muted); font-size:12px; font-family:monospace;">${d}</td>
        <td><div style="font-weight:500;">${email}</div><div style="font-size:11px; color:#64748b;">${order.phone}</div></td>
        <td><strong>${order.network}</strong> • ${order.plan}</td>
        <td><span style="font-weight:600">₵${Number(order.amount).toFixed(2)}</span></td>
        <td><span class="status-badge ${statusCls}">${order.status}</span></td>
      </tr>
    `;
  });
}

const escapeQuote = (str) => String(str).replace(/'/g, "\\'");

// Command Palette Logic
const overlay = document.getElementById("commandPaletteOverlay");
const cmdInput = document.getElementById("cmdInput");
const cmdResults = document.getElementById("cmdResults");

window.openCommandPalette = () => {
    overlay.style.display = 'flex';
    cmdInput.value = '';
    cmdInput.focus();
    renderCmdResults('');
};

window.closeCommandPalette = () => {
    overlay.style.display = 'none';
};

document.addEventListener('keydown', (e) => {
    // Ctrl+K to open
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openCommandPalette();
    }
    // Esc to close
    if (e.key === 'Escape' && overlay.style.display === 'flex') {
        closeCommandPalette();
    }
});

cmdInput.addEventListener('input', (e) => {
    renderCmdResults(e.target.value.toLowerCase());
});

function renderCmdResults(query) {
    let html = '';
    
    // Default commands
    html += `
        <li class="cmd-item" onclick="switchTab('overview'); closeCommandPalette()">
            <div class="cmd-icon">📊</div> View Overview Analytics
        </li>
        <li class="cmd-item" onclick="switchTab('users'); closeCommandPalette()">
            <div class="cmd-icon">👥</div> Manage Users
        </li>
        <li class="cmd-item" onclick="switchTab('orders'); closeCommandPalette()">
            <div class="cmd-icon">📦</div> View Global Ledger
        </li>
    `;

    // Filter users
    if (query.trim().length > 0) {
        const matches = allUsersCache.filter(u => String(u.email).toLowerCase().includes(query) || String(u.id).toLowerCase().includes(query));
        if (matches.length > 0) {
            html += `<div class="cmd-section-title" style="margin-top:16px;">USER MATCHES</div>`;
            matches.slice(0, 5).forEach(m => {
                html += `
                <li class="cmd-item" onclick="closeCommandPalette(); promptAdjustWallet('${m.id}', '${escapeQuote(m.email)}')">
                    <div class="cmd-icon" style="color:#10b981;">₵</div> Adjust Wallet: ${m.email}
                </li>
                `;
            });
        }
    }

    cmdResults.innerHTML = html;
}

document.addEventListener("DOMContentLoaded", () => {
   initializeMasterDashboard();
});

// Admin Control Functions
window.promptAdjustWallet = async function(userId, email) {
  const amountStr = prompt(`Adjust wallet for ${email} (Use negative numbers to deduct):`, "0");
  if (!amountStr) return;
  const amount = Number(amountStr);
  if (isNaN(amount) || amount === 0) return window.showErrorPopup("Invalid Amount", "Please enter a valid number.");

  try {
    const { data, error } = await supabase.rpc("admin_adjust_wallet", {
      target_user_id: userId,
      amount_change: amount,
      trx_type: amount > 0 ? "Admin Credit" : "Admin Debit"
    });

    if (error) throw error;
    window.showSuccessPopup("Wallet Adjusted", `New balance is ₵${data.new_balance}`);
    loadUsers();
  } catch (err) {
    window.showErrorPopup("Operation Failed", err.message);
  }
}

window.promptChangeRole = async function(userId, currentRole, email) {
  const newRole = prompt(`Change role for ${email}:\nCurrent: ${currentRole}`, currentRole);
  if (!newRole || newRole === currentRole) return;

  try {
    const { error } = await supabase.rpc("admin_update_role", {
      target_user_id: userId,
      new_role: newRole
    });

    if (error) throw error;
    window.showSuccessPopup("Role Updated", `User role is now ${newRole}`);
    loadUsers();
  } catch (err) {
    window.showErrorPopup("Operation Failed", err.message);
  }
}
