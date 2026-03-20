// ...existing code...

function getBalanceBefore(tx) {
  return tx?.balance_before ?? tx?.before_balance ?? null;
}

function getBalanceAfter(tx) {
  return tx?.balance_after ?? tx?.after_balance ?? null;
}

function formatBalanceDisplay(value) {
  return value == null ? '—' : `₵${Number(value).toFixed(2)}`;
}

function openTransactionModal(txId) {
    const tx = allTransactions.find(item => String(item.id) === String(txId));
    if (!tx) return;

    document.getElementById('modalBody').innerHTML = `
        <div style="display:grid; gap:12px;">
            <div><strong>Type:</strong> ${tx.type || '-'}</div>
            <div><strong>Amount:</strong> ${formatMoney(tx.amount)}</div>
          <div><strong>Balance Before:</strong> ${formatBalanceDisplay(getBalanceBefore(tx))}</div>
          <div><strong>Balance After:</strong> ${formatBalanceDisplay(getBalanceAfter(tx))}</div>
            <div><strong>Status:</strong> ${tx.status || '-'}</div>
            <div><strong>Reference:</strong> ${tx.reference || '-'}</div>
            <div><strong>Date:</strong> ${tx.created_at ? new Date(tx.created_at).toLocaleString() : '-'}</div>
        </div>
    `;

    document.getElementById('transactionModal').style.display = 'flex';
}

// ...existing code...let allTransactions = [];
let currentPage = 1;
const itemsPerPage = 10;

async function fetchTransactions() {
  const { data: { user } } = await supabase.auth.getUser()

  if(!user){
    window.location.href="login.html"
    return
  }

  let { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  allTransactions = data || [];
  currentPage = 1;
  renderPaginatedTransactions();
}

function renderPaginatedTransactions() {
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedData = allTransactions.slice(startIndex, endIndex);

  renderTransactions(paginatedData);
  updatePaginationControls();
}

function renderTransactions(data) {
  let table = document.getElementById("transactionsTable")
  table.innerHTML = ""

  if(!data || data.length === 0){
    table.innerHTML = `
    <tr class="empty">
      <td colspan="8">No transactions found</td>
    </tr>
    `
    return
  }

  data.forEach(tx => {
    let row = document.createElement("tr")
    
    const statusClass = tx.status ? tx.status.toLowerCase().replace(/\s+/g, '-') : 'pending';
    const dateTime = new Date(tx.created_at).toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    row.innerHTML = `
      <td data-label="Type"><strong>${tx.type || '-'}</strong></td>
      <td data-label="Amount">₵${Number(tx.amount || 0).toFixed(2)}</td>
      <td data-label="Bal Before">${formatBalanceDisplay(getBalanceBefore(tx))}</td>
      <td data-label="Bal After">${formatBalanceDisplay(getBalanceAfter(tx))}</td>
      <td data-label="Status"><span class="status ${statusClass}">${tx.status || 'Pending'}</span></td>
      <td data-label="Reference">${tx.reference || '-'}</td>
      <td data-label="Date & Time">${dateTime}</td>
      <td data-label="Action"><button class="view-btn" onclick="viewTransactionDetails('${tx.id}')">View</button></td>
    `
    table.appendChild(row)
  })
}

function updatePaginationControls() {
  const totalPages = Math.ceil(allTransactions.length / itemsPerPage);
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const pageInfo = document.getElementById("pageInfo");

  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = currentPage === totalPages;
  
  pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${allTransactions.length} total)`;
}

function nextPage() {
  const totalPages = Math.ceil(allTransactions.length / itemsPerPage);
  if (currentPage < totalPages) {
    currentPage++;
    renderPaginatedTransactions();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function previousPage() {
  if (currentPage > 1) {
    currentPage--;
    renderPaginatedTransactions();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function viewTransactionDetails(transactionId) {
  const tx = allTransactions.find(t => t.id === transactionId);
  if (!tx) return;

  const dateTime = new Date(tx.created_at).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const statusClass = tx.status ? tx.status.toLowerCase().replace(/\s+/g, '-') : 'pending';

  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = `
    <div class="detail-row">
      <span class="detail-label">Transaction ID</span>
      <span class="detail-value">${tx.id}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Type</span>
      <span class="detail-value"><strong>${tx.type || '-'}</strong></span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Amount</span>
      <span class="detail-value">₵${Number(tx.amount || 0).toFixed(2)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Status</span>
      <span class="detail-value"><span class="status ${statusClass}">${tx.status || 'Pending'}</span></span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Reference</span>
      <span class="detail-value">${tx.reference || '-'}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Balance Before</span>
      <span class="detail-value">${formatBalanceDisplay(getBalanceBefore(tx))}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Balance After</span>
      <span class="detail-value">${formatBalanceDisplay(getBalanceAfter(tx))}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Date & Time</span>
      <span class="detail-value">${dateTime}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Description</span>
      <span class="detail-value">${tx.description || '-'}</span>
    </div>
  `;

  document.getElementById('transactionModal').style.display = 'block';
}

function closeTransactionModal() {
  document.getElementById('transactionModal').style.display = 'none';
}

window.onclick = function(event) {
  const modal = document.getElementById('transactionModal');
  if (event.target === modal) {
    modal.style.display = 'none';
  }
}

function applyFilters() {
  const searchVal = document.getElementById("searchInput").value.toLowerCase();
  const typeVal = document.getElementById("typeFilter").value;
  const statusVal = document.getElementById("statusFilter").value;
  const dateVal = document.getElementById("dateFilter").value;

  let filtered = allTransactions.filter(tx => {
    let match = true;
    
    if (searchVal) {
      const searchTarget = `${tx.id} ${tx.type} ${tx.reference}`.toLowerCase();
      match = match && searchTarget.includes(searchVal);
    }
    
    if (typeVal) {
      match = match && (tx.type && tx.type.toLowerCase() === typeVal.toLowerCase());
    }

    if (statusVal) {
      match = match && (tx.status && tx.status.toLowerCase() === statusVal.toLowerCase());
    }
    
    if (dateVal) {
      if(tx.created_at) {
        const txDate = new Date(tx.created_at).toISOString().split('T')[0];
        match = match && (txDate === dateVal);
      } else {
        match = false;
      }
    }
    
    return match;
  });

  allTransactions = filtered;
  currentPage = 1;
  renderPaginatedTransactions();
}

document.getElementById("searchInput").addEventListener("input", applyFilters);
document.getElementById("typeFilter").addEventListener("change", applyFilters);
document.getElementById("statusFilter").addEventListener("change", applyFilters);
document.getElementById("dateFilter").addEventListener("change", applyFilters);

fetchTransactions()

