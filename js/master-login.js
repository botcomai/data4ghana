// js/master-login.js

function togglePassword() {
  const passwordInput = document.getElementById("password");
  if (passwordInput.type === "password") {
    passwordInput.type = "text";
  } else {
    passwordInput.type = "password";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("masterLoginForm");

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      const submitButton = loginForm.querySelector("button[type='submit']");

      submitButton.disabled = true;
      submitButton.innerHTML = `
        Authenticating...
        <svg class="animate-spin" style="margin-left:8px; animation: spin 1s linear infinite;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
      `;

      try {
        // 1. Authenticate with Supabase
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: email,
          password: password,
        });

        if (authError) throw authError;

        // 2. Verify Admin Role
        const userId = authData.user.id;
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("role")
          .eq("id", userId)
          .single();

        if (userError) throw userError;

        if (userData && userData.role === 'admin') {
          // Success: Redirect to master dashboard
          window.location.href = "master-dashboard.html";
        } else {
          // Not an admin: sign them back out and show error
          await supabase.auth.signOut();
          throw new Error("Access Denied: You do not have administrative privileges.");
        }

      } catch (error) {
        if (window.showErrorPopup) {
            window.showErrorPopup("Authentication Failed", error.message);
        } else {
            alert("Authentication Failed: " + error.message);
        }
        submitButton.disabled = false;
        submitButton.innerHTML = `
          Initialize Session
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        `;
      }
    });
  }
});
