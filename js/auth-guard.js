// js/auth-guard.js

(async function() {
  const { data: { user }, error } = await window.supabase.auth.getUser();

  if (error || !user) {
    console.warn("Unauthorized access - Redirecting to login...");
    window.location.href = "login.html";
    return;
  }

  // Optional: Role-based protection for admin pages
  const currentPage = window.location.pathname.split("/").pop();
  if (currentPage.startsWith("admin-")) {
    const { data: userData } = await window.supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      // 2a. Global Maintenance Mode Check
      try {
        const { data: maintSetting } = await window.supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'maintenance_mode')
          .single();

        if (maintSetting && maintSetting.value === 'true' && currentPage !== "maintenance.html") {
          console.warn("System is under maintenance. Redirecting...");
          window.location.href = "maintenance.html";
          return;
        }
      } catch (e) {
        console.error("Maintenance check failed:", e);
      }

      if (currentPage.startsWith("admin-")) {
        console.error("Access Denied: Admin privileges required.");
        window.location.href = "dashboard.html"; // Redirect unauthorized admins to dashboard
      }
    }
  } else {
    // Check maintenance for non-admin pages if user is not admin
    const { data: userData } = await window.supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      try {
        const { data: maintSetting } = await window.supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'maintenance_mode')
          .single();

        if (maintSetting && maintSetting.value === 'true' && currentPage !== "maintenance.html") {
          window.location.href = "maintenance.html";
          return;
        }
      } catch (e) {}
    }
  }
})();
