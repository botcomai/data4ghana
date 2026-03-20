function togglePassword() {

  let password = document.getElementById("password");

  if (password.type === "password") {
    password.type = "text";
  } else {
    password.type = "password";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;
      const submitButton = loginForm.querySelector("button[type='submit']");

      submitButton.disabled = true;
      submitButton.innerText = "Signing In...";

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email,
          password: password,
        });

        if (error) throw error;

        // Success: Redirect to dashboard
        window.location.href = "dashboard.html";

      } catch (error) {
        alert("Login failed: " + error.message);
        submitButton.disabled = false;
        submitButton.innerText = "Sign In";
      }
    });
  }
});
