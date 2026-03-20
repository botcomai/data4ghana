let currentUser = null;

// 1. Initialization and Auth Check
document.addEventListener("DOMContentLoaded", async () => {
    if (!window.supabase) return;

    const { data: { user }, error } = await window.supabase.auth.getUser();
    if (!user || error) {
        window.location.href = "login.html";
        return;
    }
    currentUser = user;

    // Load user's phone number as a default if possible
    const { data: userData } = await window.supabase
        .from('users')
        .select('phone')
        .eq('id', user.id)
        .single();
    if(userData?.phone) {
        document.getElementById('phone').value = userData.phone;
    }

    // Load active tickets
    fetchUserTickets();
    
    // Load user orders for selection
    fetchUserOrders();
});

// Cache for order data to avoid re-fetching on change
let userOrdersCache = [];

// 2. Drag and Drop UI Effects
const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('screenshot');
const fileMsg = document.querySelector('.file-msg');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
});
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, () => dropArea.classList.add('dragover'), false);
});
['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, () => dropArea.classList.remove('dragover'), false);
});

dropArea.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    fileInput.files = files;
    updateFileMessage(files);
});

fileInput.addEventListener('change', function() {
    updateFileMessage(this.files);
});

function updateFileMessage(files) {
    if(files.length > 0) {
        fileMsg.innerText = files[0].name;
        dropArea.style.borderColor = "#27ae60";
    }
}

// Helper to manage button state
function updateSubmitButtonState() {
    const phoneWarning = document.getElementById('phoneWarning');
    const orderWarning = document.getElementById('orderWarning');
    const submitBtn = document.getElementById('submitBtn');
    
    const isPhoneValid = phoneWarning.style.display === 'none';
    const isOrderValid = orderWarning.style.display === 'none';
    
    submitBtn.disabled = !(isPhoneValid && isOrderValid);
}

// 3. Order Selection and Validation Logic
async function fetchUserOrders() {
    if(!currentUser) return;
    
    const orderSelect = document.getElementById('orderSelect');
    
    try {
        const { data, error } = await window.supabase
            .from('orders')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(15);
            
        if (error) throw error;
        
        userOrdersCache = data;
        
        data.forEach(order => {
            const shortId = order.id.split('-')[0].toUpperCase();
            const dateStr = new Date(order.created_at).toLocaleDateString();
            const opt = document.createElement('option');
            opt.value = order.id;
            opt.innerText = `#${shortId} (${order.status}) - ${dateStr}`;
            orderSelect.appendChild(opt);
        });
        
    } catch (err) {
        console.error("Failed to load orders:", err);
    }
}

// Phone Number Validation
document.getElementById('phone').addEventListener('input', async function() {
    const phone = this.value.trim();
    const phoneWarning = document.getElementById('phoneWarning');
    const submitBtn = document.getElementById('submitBtn');

    if(phone.length < 10) {
        phoneWarning.style.display = 'none';
        updateSubmitButtonState();
        return;
    }

    try {
        const { data, error } = await window.supabase
            .from('orders')
            .select('id, status')
            .eq('phone', phone)
            .eq('user_id', currentUser.id)
            .eq('status', 'Completed'); // Check for specifically "Completed"

        if (error) throw error;

        if (!data || data.length === 0) {
            phoneWarning.style.display = 'block';
        } else {
            phoneWarning.style.display = 'none';
        }
        updateSubmitButtonState();

    } catch (err) {
        console.error("Phone validation error:", err);
    }
});

document.getElementById('orderSelect').addEventListener('change', function() {
    const orderId = this.value;
    const warning = document.getElementById('orderWarning');
    
    if(!orderId) {
        warning.style.display = 'none';
        updateSubmitButtonState();
        return;
    }
    
    const order = userOrdersCache.find(o => o.id === orderId);
    if(!order) return;
    
    const status = order.status.toLowerCase();
    const createdAt = new Date(order.created_at);
    const now = new Date();
    const diffHours = (now - createdAt) / (1000 * 60 * 60);
    
    if((status === 'completed' || status === 'delivered') && diffHours > 24) {
        warning.style.display = 'block';
    } else {
        warning.style.display = 'none';
    }
    updateSubmitButtonState();
});

// 4. Ticket Submission Logic (Upload to Storage -> Insert to DB)
document.getElementById("supportForm").addEventListener("submit", async function(e) {
    e.preventDefault();

    if(!currentUser) return;

    const phone = document.getElementById("phone").value;
    const issue = document.getElementById("issue").value;
    const orderId = document.getElementById("orderSelect").value;
    const file = fileInput.files[0];

    const submitBtn = document.getElementById("submitBtn");
    submitBtn.disabled = true;
    submitBtn.innerText = "Uploading Evidence...";

    try {
        let screenshotUrl = null;

        // Step A: Upload Image to Supabase Storage if provided
        if (file) {
            const fileExt = file.name.split('.').pop();
            const fileName = `${currentUser.id}_${Date.now()}.${fileExt}`;
            const filePath = `tickets/${fileName}`;

            const { data: uploadData, error: uploadError } = await window.supabase.storage
                .from('tickets')
                .upload(filePath, file);

            if (uploadError) throw new Error("Image upload failed: " + uploadError.message);

            // Get Public URL
            const { data: { publicUrl } } = window.supabase.storage
                .from('tickets')
                .getPublicUrl(filePath);
                
            screenshotUrl = publicUrl;
        }

        submitBtn.innerText = "Creating Ticket...";

        // Step B: Insert into Support Tickets Table
        const { error: dbError } = await window.supabase
            .from('support_tickets')
            .insert({
                user_id: currentUser.id,
                order_id: orderId || null,
                phone: phone,
                issue: issue,
                screenshot_url: screenshotUrl,
                status: 'checking'
            });

        if (dbError) throw new Error("Database error: " + dbError.message);

        // Success
        if(window.showSuccessPopup) {
            window.showSuccessPopup("Ticket Submitted", "Your support ticket has been received. Our team is checking the issue.", () => {
                window.location.reload();
            });
        } else {
            alert("Ticket successfully submitted!");
            window.location.reload();
        }

    } catch (err) {
        console.error("Submission Error:", err);
        alert(err.message);
        submitBtn.disabled = false;
        submitBtn.innerText = "Submit Ticket";
    }
});

// 4. Fetch Ticket History
async function fetchUserTickets() {
    if(!currentUser) return;

    const tbody = document.getElementById("ticketTableBody");

    try {
        const { data, error } = await window.supabase
            .from('support_tickets')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });
            
        if (error) throw error;

        tbody.innerHTML = "";

        if(data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #8592a3;">No active tickets found.</td></tr>`;
            return;
        }

        data.forEach(ticket => {
            const shortId = ticket.id.split('-')[0].toUpperCase();
            const dateStr = new Date(ticket.created_at).toLocaleDateString();
            const statusClass = ticket.status.toLowerCase();

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>#TKT-${shortId}</td>
                <td>${dateStr}</td>
                <td><span class="status ${statusClass}">${ticket.status}</span></td>
            `;
            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error("Failed to load tickets:", err);
        tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #e74c3c;">Failed to load ticket history.</td></tr>`;
    }
}
