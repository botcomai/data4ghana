async function openMenu() {
  console.log("openMenu triggered");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");
  
  if (!sidebar) {
    console.warn("Menu sidebar not found in DOM. Attempting emergency injection...");
    await injectMenu();
    const newSidebar = document.getElementById("sidebar");
    const newOverlay = document.getElementById("overlay");
    if (newSidebar) newSidebar.classList.add("active");
    if (newOverlay) newOverlay.classList.add("active");
    return;
  }

  sidebar.classList.add("active");
  if (overlay) overlay.classList.add("active");
  
  // Desktop shimmer feedback
  if (window.innerWidth >= 992) {
      sidebar.style.transition = 'all 0.3s ease';
      sidebar.style.boxShadow = '0 0 30px rgba(42,125,225,0.4)';
      setTimeout(() => sidebar.style.boxShadow = '', 500);
  }
}

async function injectMenu() {
  const menuContainer = document.getElementById("menu-container");
  if (!menuContainer) {
    console.error("Menu container (#menu-container) missing from page!");
    return;
  }
  try {
    const response = await fetch("components/menu.html");
    if (!response.ok) throw new Error("Menu component fetch failed");
    const html = await response.text();
    menuContainer.innerHTML = html;
    console.log("Menu injected successfully");
    // Re-run highlighting logic
    highlightActiveLink();
  } catch (err) {
    console.error("Failed to inject menu:", err);
  }
}

function highlightActiveLink() {
  const currentPage = window.location.pathname.split("/").pop() || "dashboard.html";
  const navLinks = document.querySelectorAll("#navMenu a");
  navLinks.forEach(link => {
    if (link.getAttribute("href") === currentPage) {
      link.parentElement.classList.add("active");
    }
  });

  // Auto-open the Finance dropdown if on a Finance page
  const financePages = ["wallet.html", "transactions.html", "orders.html"];
  if (financePages.includes(currentPage)) {
    const fd = document.getElementById("financeDropdown");
    if (fd) fd.classList.add("open");
  }

  // Auto-open the Settings dropdown if on a Settings/Support page
  const settingsPages = ["settings.html", "support.html"];
  if (settingsPages.includes(currentPage)) {
    const sd = document.getElementById("settingsDropdown");
    if (sd) sd.classList.add("open");
  }
}

function closeMenu() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");
  if (sidebar) sidebar.classList.remove("active");
  if (overlay) overlay.classList.remove("active");
}

function toggleDropdown(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open');
}

async function logout() {
  if (window.supabase) {
    await window.supabase.auth.signOut();
    window.location.href = "login.html";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Inject Menu
  await injectMenu();

  // 2. Fetch Full User Data for Menu if Supabase is available
  if (window.supabase) {
    const { data: { user }, error: authErr } = await window.supabase.auth.getUser();
    
    if (user && !authErr) {
      
      // Ping database for the custom fields
      const { data, error } = await window.supabase
        .from('users')
        .select('first_name, last_name, avatar_url, merchant_id, role, wallet_balance')
        .eq('id', user.id)
        .single();
        
      setTimeout(() => {
        // Name Logic
        let firstName = data?.first_name || "User";
        let lastName = data?.last_name || "";
        const sidebarNameElem = document.getElementById("sidebarName");
        if (sidebarNameElem) sidebarNameElem.innerText = `${firstName} ${lastName}`.trim();

        // Email
        const sidebarEmailElem = document.getElementById("sidebarEmail");
        if(sidebarEmailElem) sidebarEmailElem.innerText = user.email;

        // Balance
        const sidebarBalance = document.getElementById("sidebarBalance");
        if(sidebarBalance) {
          sidebarBalance.innerText = parseFloat(data?.wallet_balance || 0).toFixed(2);
        }

        // ==========================================
        // ROLE BADGE LOGIC
        // ==========================================
        const roleConfig = {
          'admin':        { label: 'ADMIN',        bg: 'rgba(239,68,68,0.15)',  color: '#ef4444', prefix: 'ADMIN-CODE: ' },
          'super_agent':  { label: 'SUPER AGENT',  bg: 'rgba(139,92,246,0.15)', color: '#8b5cf6', prefix: 'AGENT-CODE: ' },
          'elite_agent':  { label: 'ELITE AGENT',  bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', prefix: 'AGENT-CODE: ' },
          'vip_customer': { label: 'VIP CUSTOMER', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', prefix: 'VIP-CODE: ' },
          'client':       { label: 'CLIENT',       bg: '#e2e8f0',               color: '#64748b', prefix: 'CLIENT CODE: ' },
        };

        const userRole = data?.role || 'client';
        const roleStyle = roleConfig[userRole] || roleConfig['client'];

        // Merchant ID / Client Code Logic
        const sidebarMerchantElem = document.getElementById("sidebarMerchant");
        if(sidebarMerchantElem && data?.merchant_id) {
          sidebarMerchantElem.innerText = (roleStyle.prefix || 'CODE: ') + data.merchant_id.toUpperCase();
        }

        // Store role globally for other pages
        window.currentUserRole = userRole;

        // Visibility Toggles using classes instead of broken div structure
        const adminItems = document.querySelectorAll(".admin-nav-item");
        const agentItems = document.querySelectorAll(".agent-nav-item");

        adminItems.forEach(el => {
          el.style.display = (userRole === 'admin') ? 'block' : 'none';
        });

        agentItems.forEach(el => {
          el.style.display = (userRole === 'client') ? 'none' : 'block';
        });

        // Avatar Logic
        let initials = (firstName.charAt(0) + (lastName.charAt(0) || '')).toUpperCase() || 'D4';
        const avatarElem = document.querySelector(".avatar");
        
        if (avatarElem) {
            if(data?.avatar_url) {
                avatarElem.innerHTML = `<img src="${data.avatar_url}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                avatarElem.style.background = 'transparent';
                avatarElem.style.color = 'transparent';
            } else {
                avatarElem.innerText = initials;
            }
        }
      }, 100);
    }
  }
});

// GLOBAL SUCCESS MODAL INJECTOR
window.showSuccessPopup = function(title, message, callback) {
  let overlay = document.getElementById("globalSuccessOverlay");
  
  // Create it on the fly if it doesn't exist
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "globalSuccessOverlay";
    overlay.className = "success-overlay";
    overlay.innerHTML = `
      <div class="success-modal">
        <div class="success-icon">✓</div>
        <h3 id="successTitle">Success!</h3>
        <p id="successMessage">Action completed successfully.</p>
        <button class="success-btn" id="successBtn">Continue</button>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  
  // Set Text
  document.getElementById("successTitle").innerText = title;
  document.getElementById("successMessage").innerText = message;
  
  // Refresh Button Listeners
  const btn = document.getElementById("successBtn");
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  
  newBtn.addEventListener("click", () => {
    overlay.classList.remove("active");
    if (callback) callback();
  });
  
  // Activate CSS animations
  setTimeout(() => overlay.classList.add("active"), 10);
};

// GLOBAL ERROR MODAL INJECTOR
window.showErrorPopup = function(title, message, callback) {
  let overlay = document.getElementById("globalErrorOverlay");
  
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "globalErrorOverlay";
    overlay.className = "error-overlay";
    overlay.innerHTML = `
      <div class="error-modal">
        <div class="error-icon">✕</div>
        <h3 id="errorTitle">Error!</h3>
        <p id="errorMessage">An error occurred.</p>
        <button class="error-btn" id="errorBtn">Okay</button>
      </div>
    `;
    document.body.appendChild(overlay);
    
    // Add CSS if not already present
    if (!document.getElementById("errorModalStyles")) {
      const style = document.createElement("style");
      style.id = "errorModalStyles";
      style.innerHTML = `
        .error-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.3s; }
        .error-overlay.active { opacity: 1; }
        .error-modal { background: white; border-radius: 16px; padding: 32px; text-align: center; max-width: 400px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
        .error-icon { font-size: 48px; color: #ef4444; margin-bottom: 16px; font-weight: bold; }
        .error-modal h3 { color: #1f2937; margin-bottom: 12px; font-size: 20px; }
        .error-modal p { color: #6b7280; margin-bottom: 24px; line-height: 1.5; }
        .error-btn { background: #ef4444; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
        .error-btn:hover { background: #dc2626; }
      `;
      document.head.appendChild(style);
    }
  }
  
  document.getElementById("errorTitle").innerText = title;
  document.getElementById("errorMessage").innerText = message;
  
  const btn = document.getElementById("errorBtn");
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  
  newBtn.addEventListener("click", () => {
    overlay.classList.remove("active");
    if (callback) callback();
  });
  
  setTimeout(() => overlay.classList.add("active"), 10);
};

// GLOBAL WARNING MODAL INJECTOR
window.showWarningPopup = function(title, message, callback) {
  let overlay = document.getElementById("globalWarningOverlay");
  
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "globalWarningOverlay";
    overlay.className = "warning-overlay";
    overlay.innerHTML = `
      <div class="warning-modal">
        <div class="warning-icon">⚠</div>
        <h3 id="warningTitle">Warning!</h3>
        <p id="warningMessage">Please note.</p>
        <button class="warning-btn" id="warningBtn">Got It</button>
      </div>
    `;
    document.body.appendChild(overlay);
    
    // Add CSS if not already present
    if (!document.getElementById("warningModalStyles")) {
      const style = document.createElement("style");
      style.id = "warningModalStyles";
      style.innerHTML = `
        .warning-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.3s; }
        .warning-overlay.active { opacity: 1; }
        .warning-modal { background: white; border-radius: 16px; padding: 32px; text-align: center; max-width: 400px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
        .warning-icon { font-size: 48px; color: #f59e0b; margin-bottom: 16px; font-weight: bold; }
        .warning-modal h3 { color: #1f2937; margin-bottom: 12px; font-size: 20px; }
        .warning-modal p { color: #6b7280; margin-bottom: 24px; line-height: 1.5; }
        .warning-btn { background: #f59e0b; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
        .warning-btn:hover { background: #d97706; }
      `;
      document.head.appendChild(style);
    }
  }
  
  document.getElementById("warningTitle").innerText = title;
  document.getElementById("warningMessage").innerText = message;
  
  const btn = document.getElementById("warningBtn");
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  
  newBtn.addEventListener("click", () => {
    overlay.classList.remove("active");
    if (callback) callback();
  });
  
  setTimeout(() => overlay.classList.add("active"), 10);
};

// GLOBAL SMS DISPATCHER (moved to supabase.js)
