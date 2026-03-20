let allOrders = [];

async function fetchOrders() {
  const { data: { user } } = await supabase.auth.getUser()

  if(!user){
    window.location.href="login.html"
    return
  }

  let { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  allOrders = data || [];
  renderOrders(allOrders);
}

function getFriendlyRef(order, sequenceNum) {
  const prefix = (order.network || 'ORD').toUpperCase();
  if (sequenceNum) return `${prefix}-${sequenceNum}`;
  
  // Fallback for searches/filters
  const fullAsc = [...allOrders].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const num = fullAsc.findIndex(o => o.id === order.id) + 1;
  return `${prefix}-${num || '?'}`;
}

function renderOrders(data) {
  let table = document.getElementById("ordersTable");
  table.innerHTML = "";

  // Update Stats
  if (data) {
    document.getElementById('totalOrdersCount').innerText = data.length;
    const completedCount = data.filter(o => 
        o.status && (o.status.toLowerCase() === 'completed' || o.status.toString().toLowerCase() === 'true')
    ).length;
    const receivedCount = data.filter(o =>
        o.status && o.status.toLowerCase() === 'received'
    ).length;
    document.getElementById('completedOrdersCount').innerText = completedCount + receivedCount;
  }

  if(!data || data.length === 0){
    table.innerHTML = `
    <tr class="empty">
      <td colspan="8">
        <div class="loading-state">
          <span style="font-size: 48px; margin-bottom: 10px;">📦</span>
          <span>No orders matching your criteria were found.</span>
        </div>
      </td>
    </tr>
    `;
    return;
  }
  
  data.forEach((order) => {
    const fullAsc = [...allOrders].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const sequenceNum = fullAsc.findIndex(o => o.id === order.id) + 1;

    let row = document.createElement("tr");
    
    let statusClass = order.status ? order.status.toLowerCase().replace(/\s+/g, '-') : 'pending';
    if (statusClass === 'true') statusClass = 'completed';
    if (statusClass === 'received') statusClass = 'received';

    const net = (order.network || '').toLowerCase();
    let netIcon = '🌐';
    if (net.includes('mtn')) netIcon = '🟡';
    else if (net.includes('telecel') || net.includes('vodafone')) netIcon = '🔴';
    else if (net.includes('tigo') || net.includes('airtel')) netIcon = '🔵';
    else if (net.includes('bigtime') || net.includes('big')) netIcon = '🟣';

    const isDelivered = order.status && (order.status.toLowerCase() === 'completed' || order.status.toString().toLowerCase() === 'true');
    const isReceived  = order.status && order.status.toLowerCase() === 'received';
    const dateStr = new Date(order.created_at).toLocaleDateString('en-GB', {
        day:'numeric',
        month:'short',
        year:'numeric'
    });

    const statusLabel = isDelivered ? 'Completed' : isReceived ? 'Sent to Provider' : (order.status || 'Pending');
    const deliveredLabel = isDelivered
        ? '<b style="color:#059669;">YES</b>'
        : isReceived
        ? '<b style="color:#0e7490;">PROCESSING</b>'
        : '<b style="color:#ef4444;">NO</b>';

    row.innerHTML = `
      <td data-label="Order ID" style="font-weight:700; color:#1e293b;">
        ${getFriendlyRef(order, sequenceNum)}
        ${order.is_store_order ? '<span style="display:inline-block; font-size:9px; background:#f0fdf4; color:#059669; border:1px solid #bbf7d0; padding:1px 4px; border-radius:4px; margin-left:4px;">STORE</span>' : ''}
      </td>
      <td data-label="Status"><span class="status ${statusClass}">${statusLabel}</span></td>
      <td data-label="Recipient" style="font-weight:600;">${order.phone || '-'}</td>
      <td data-label="Plan / Size" style="font-weight:700; color:#334155;">
        ${(order.bundle || order.plan || '-').toString().includes('GB') ? (order.bundle || order.plan) : (order.bundle || order.plan) + ' GB'}
      </td>
      <td data-label="Price" style="font-weight:800; color:#059669;">₵${order.price || order.amount || '0'}</td>
      <td data-label="Network">
        <div class="network-badge">
            <span class="net-icon">${netIcon}</span>
            ${order.network || '-'}
        </div>
      </td>
      <td data-label="Delivered">${deliveredLabel}</td>
      <td data-label="Date" style="color:#64748b; font-weight:500;">${dateStr}</td>
    `;
    table.appendChild(row);
  });
}

function resetFilters() {
    document.getElementById("searchOrder").value = "";
    document.getElementById("statusFilter").value = "";
    document.getElementById("dateFilter").value = "";
    document.getElementById("phoneFilter").value = "";
    renderOrders(allOrders);
}


// ==========================================
// CHECK ORDER STATUS VIA DATA4GHANA API
// ==========================================
async function checkStatus(phone, reference, btnElement) {
  if (!reference) {
    alert("Order reference is required for status check.");
    return;
  }

  // Show loading state
  const originalText = btnElement.innerText;
  btnElement.innerText = "Checking...";
  btnElement.disabled = true;

  try {
    if (window.checkOrderStatus) {
      const result = await checkOrderStatus(null, reference);
      
      if (result.success) {
        const statusData = result.data;
        let statusMsg = "Status: " + JSON.stringify(statusData, null, 2);
        
        // Try to extract meaningful status info
        if (statusData.status) {
          statusMsg = `Status: ${statusData.status}`;
          if (statusData.reference) statusMsg += `\nRef: ${statusData.reference}`;
          if (statusData.message) statusMsg += `\n${statusData.message}`;
        }

        alert(statusMsg);
        
        // If we got a status update, refresh the orders
        fetchOrders();
      } else {
        alert("Status check failed: " + (result.error || "Unknown error"));
      }
    } else {
      alert("API service not available. Please reload the page.");
    }
  } catch(err) {
    console.error("Status check error:", err);
    alert("Failed to check order status.");
  }

  // Restore button
  btnElement.innerText = originalText;
  btnElement.disabled = false;
}


function applyFilters() {
  const searchVal = document.getElementById("searchOrder").value.toLowerCase();
  const statusVal = document.getElementById("statusFilter").value;
  const dateVal = document.getElementById("dateFilter").value;
  const phoneVal = document.getElementById("phoneFilter").value;

  let filtered = allOrders.filter(order => {
    let match = true;
    
    // Search by ID or Product (Network/Bundle logic fallback)
      const friendlyRef = getFriendlyRef(order).toLowerCase();
      const searchTarget = `${friendlyRef} ${order.id} ${order.network} ${order.bundle} ${order.api_reference || ''}`.toLowerCase();
      match = match && searchTarget.includes(searchVal);
    
    // Filter by Exact Status
    if (statusVal) {
      match = match && (order.status && order.status.toLowerCase() === statusVal.toLowerCase());
    }
    
    // Filter by Exact Date Formatted
    if (dateVal) {
      if(order.created_at) {
        const orderDate = new Date(order.created_at).toISOString().split('T')[0];
        match = match && (orderDate === dateVal);
      } else {
        match = false; // If no date on record, drop it from results
      }
    }
    
    // Filter by Phone
    if (phoneVal) {
      match = match && (order.phone && String(order.phone).includes(phoneVal));
    }
    
    return match;
  });

  renderOrders(filtered);
}

// Attach Event Listeners to all 4 inputs
document.getElementById("searchOrder").addEventListener("input", applyFilters);
document.getElementById("statusFilter").addEventListener("change", applyFilters);
document.getElementById("dateFilter").addEventListener("change", applyFilters);
document.getElementById("phoneFilter").addEventListener("input", applyFilters);

// Initial Load
fetchOrders()
