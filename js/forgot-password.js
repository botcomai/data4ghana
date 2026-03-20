document.getElementById("forgotForm").addEventListener("submit", async function(e) {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const btn = document.getElementById("resetBtn");
  const successBox = document.getElementById("successBox");
  const errorBox = document.getElementById("errorBox");

  // Hide previous messages
  successBox.style.display = "none";
  errorBox.style.display = "none";

  btn.disabled = true;
  btn.innerText = "Sending Reset Link...";

  try {
    // 1. Send Supabase password reset email
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password.html'
    });

    if (error) throw error;

    // 2. Look up the user's phone number to send SMS notification
    const { data: userData } = await supabase
      .from("users")
      .select("phone, first_name")
      .eq("email", email)
      .maybeSingle();

    if (userData && userData.phone) {
      // Send SMS notification about the reset
      try {
        const SUPABASE_FUNCTIONS_URL = "https://wynmejzsybkxhqvazjzu.supabase.co/functions/v1";
        await fetch(`${SUPABASE_FUNCTIONS_URL}/send-sms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            to: userData.phone,
            msg: `Dear ${userData.first_name || 'Customer'}, a password reset was requested for your Data4Ghana account. Check your email (${email}) for the reset link. If you didn't request this, please ignore it.`,
            sender_id: 'Data4Ghana'
          }),
        });
      } catch(smsErr) {
        console.error("SMS notification failed:", smsErr);
        // Don't block the flow if SMS fails
      }
    }

    // Show success
    successBox.innerHTML = `
      <strong>✅ Reset link sent!</strong><br>
      Check your email at <strong>${email}</strong> for the reset link.
      ${userData?.phone ? `<br>An SMS notification was also sent to your phone.` : ''}
    `;
    successBox.style.display = "block";

    btn.innerText = "Link Sent ✓";
    btn.style.background = "#059669";

  } catch(err) {
    errorBox.innerHTML = `<strong>❌ Error:</strong> ${err.message}`;
    errorBox.style.display = "block";
    btn.disabled = false;
    btn.innerText = "Send Reset Link";
  }
});
