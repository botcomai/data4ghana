document.getElementById("adminLoginForm").addEventListener("submit", async function(e) {
    e.preventDefault();

    if(!window.supabase) {
        showError("Critical infrastructure failure: Supabase core missing.");
        return;
    }

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const btn = document.getElementById("loginBtn");
    
    btn.disabled = true;
    btn.innerText = "Authenticating Administrator...";
    hideError();

    try {
        // Step 1: Base Supabase Authentication
        const { data: authData, error: authError } = await window.supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (authError) throw new Error(authError.message);

        const userId = authData.user.id;

        // Step 2: Role Authorization Gate
        // We explicitly check the 'users' table to read their 'role' designation
        const { data: dbData, error: dbError } = await window.supabase
            .from('users')
            .select('role')
            .eq('id', userId)
            .single();

        if (dbError) throw new Error("Admin role check failed: " + dbError.message + " (Code: " + dbError.code + ")");

        // DENY ACCESS IF NOT ADMIN
        const allowedRoles = ['admin'];
        if (!dbData || !allowedRoles.includes(dbData.role)) {
            // Immediately sign them back out
            await window.supabase.auth.signOut();
            throw new Error("Access denied. You do not have administrator privileges.");
        }

        // Access Granted
        const roleLabel = 'Administrator';
        btn.innerText = `Clearance Granted (${roleLabel}). Redirecting...`;
        btn.style.background = "#059669"; // Green
        
        // Push payload to dashboard
        setTimeout(() => {
            window.location.href = "admin-portal.html";
        }, 800);

    } catch (err) {
        showError(err.message);
        btn.disabled = false;
        btn.innerText = "Authenticate to Dashboard";
    }
});

function showError(msg) {
    const banner = document.getElementById("errorMsg");
    banner.style.display = "flex";
    banner.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ${msg}`;
}

function hideError() {
    document.getElementById("errorMsg").style.display = "none";
}
