let currentUser = null;

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Initialize syntax highlighting for code blocks
    if(window.hljs) {
        hljs.highlightAll();
    }

    if (!window.supabase) return;

    // 2. Auth Check
    const { data: { user }, error } = await window.supabase.auth.getUser();
    if (!user || error) {
        window.location.href = "login.html";
        return;
    }
    currentUser = user;

    loadDeveloperKeys();
});

async function loadDeveloperKeys() {
    try {
        const { data, error } = await window.supabase
            .from('users')
            .select('merchant_id')
            .eq('id', currentUser.id)
            .single();

        if (error) throw error;

        if(data.merchant_id) {
            document.getElementById('merchantId').value = data.merchant_id.toUpperCase();
        }

        // Setup mock secret key for demonstration.
        // In a true prod app, secret keys should NEVER be sent to the frontend DB,
        // and should only be generated/rolled by an Edge Function and displayed once.
        const mockSecret = "sk_live_" + (data.merchant_id ? data.merchant_id.substring(0,24).toLowerCase() : "xxxxx");
        document.getElementById('secretKey').value = mockSecret;

    } catch (err) {
        console.error("Failed to load developer profile:", err);
        document.getElementById('merchantId').value = "Error loading key";
    }
}

// UI Helpers
function copyToClipboard(elementId) {
    const copyText = document.getElementById(elementId);
    copyText.select();
    copyText.setSelectionRange(0, 99999); // Mobile compatibility
    navigator.clipboard.writeText(copyText.value);
    
    // Quick tooltip feedback natively
    if(window.showSuccessPopup) {
        // Just use a native alert to not interrupt Dev Flow
        alert("Copied to clipboard!");
    } else {
        alert("Copied!");
    }
}

function toggleVisibility(elementId) {
    const input = document.getElementById(elementId);
    if (input.type === "password") {
        input.type = "text";
    } else {
        input.type = "password";
    }
}

async function rollKey() {
    const confirmed = confirm("WARNING: Rolling your API key will immediately break any existing API integrations you have running. Are you absolutely sure you want to generate a new key?");
    
    if(!confirmed) return;

    // In a prod environment this would hit a Supabase Edge Function that actually issues a new HMAC key.
    alert("In this demonstration environment, API key rolling is disabled. To securely implement rolling, deploy an Edge Function that resets the UUID.");
}
