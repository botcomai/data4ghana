function togglePassword(){
let password = document.getElementById("password");

if(password.type === "password"){
password.type = "text";
}else{
password.type = "password";
}
}

function toggleConfirm(){
let confirmPassword = document.getElementById("confirmPassword");

if(confirmPassword.type === "password"){
confirmPassword.type = "text";
}else{
confirmPassword.type = "password";
}
}

document.getElementById("signupForm").addEventListener("submit", async function(e){
  e.preventDefault();
  
  let pass = document.getElementById("password").value;
  let confirm = document.getElementById("confirmPassword").value;
  
  if(pass !== confirm){
    alert("Passwords do not match");
    return;
  }
  
  let email = document.getElementById("email").value;
  let firstName = document.getElementById("firstName").value;
  let lastName = document.getElementById("lastName").value;
  let phone = document.getElementById("phone").value.trim();
  let businessName = document.getElementById("businessName").value.trim();
  let region = document.getElementById("region").value;
  
  const submitButton = this.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.innerText = "Checking...";
  
  try {
    // ==========================================
    // CHECK IF PHONE NUMBER ALREADY EXISTS (via Secure RPC)
    // ==========================================
    const { data: phoneExists, error: phoneCheckError } = await supabase
      .rpc('check_phone_exists', { phone_val: phone });

    if (phoneCheckError) {
      console.error("Phone check error:", phoneCheckError);
      // We continue to signUp if RPC fails, as auth will catch duplicates anyway, 
      // but RPC is preferred for better UX.
    }

    if (phoneExists) {
      alert("This phone number is already registered. Please use a different phone number or sign in to your existing account.");
      submitButton.disabled = false;
      submitButton.innerText = "Create Account";
      return;
    }

    submitButton.innerText = "Creating Account...";

    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: pass,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          phone: phone,
          business_name: businessName,
          region: region
        }
      }
    });
    
    if (error) throw error;
    
    // Dispatch Welcome SMS
    if(window.sendSmsNotification) {
      await window.sendSmsNotification(phone, "Welcome to Data4Ghana! Your account has been successfully created. Enjoy fast, secure data and airtime purchases.");
    }
    
    alert("Account created successfully! Please log in.");
    window.location.href = "login.html";
    
  } catch(error) {
    alert("Signup failed: " + error.message);
    submitButton.disabled = false;
    submitButton.innerText = "Create Account";
  }
});
