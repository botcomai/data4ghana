// js/security.js
// Frontend deterrence logic to discourage casual inspection and DOM manipulation

(function() {
    // 1. Disable Right-click
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        console.warn("Security: Context menu disabled.");
    });

    // 2. Disable specialized developer short-cuts
    document.addEventListener('keydown', function(e) {
        // F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U (View Source), Ctrl+S (Save Page)
        if (
            e.keyCode === 123 || 
            (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) ||
            (e.ctrlKey && (e.keyCode === 85 || e.keyCode === 83))
        ) {
            e.preventDefault();
            return false;
        }
    });

    console.log("%c⚠️ SECURITY NOTICE: Server-side price verification is active. Any manipulation will result in order rejection. ⚠️", "color: yellow; background: red; padding: 5px; font-size: 15px;");

    // 3. Mute all standard terminal/developer logs
    const originalLog = console.log;
    console.log = function() {};
    console.warn = function() {};
    console.error = function() {};

    // 4. Intercept all native alerts (debugging popups) and convert them to smooth UI Toasts
    window.alert = function(message) {
        if (!document.body) {
            // If body not ready, fallback to original or delay
            setTimeout(() => window.alert(message), 100);
            return;
        }
        
        let toastBox = document.getElementById("global-toast-container");
        if (!toastBox) {
            toastBox = document.createElement("div");
            toastBox.id = "global-toast-container";
            toastBox.style.cssText = "position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:10px;";
            document.body.appendChild(toastBox);
        }
        const toast = document.createElement("div");
        toast.style.cssText = "background:rgba(15,23,42,0.9);color:white;padding:12px 20px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);border-left:4px solid #3b82f6;box-shadow:0 10px 25px rgba(0,0,0,0.5);font-family:sans-serif;font-size:14px;transform:translateX(100%);opacity:0;transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);backdrop-filter:blur(8px); max-width: 350px;";
        toast.innerHTML = String(message).replace(/\\n/g, '<br>');
        toastBox.appendChild(toast);
        
        // Trigger entrance animation
        requestAnimationFrame(() => {
            toast.style.transform = "translateX(0)";
            toast.style.opacity = "1";
        });

        // Trigger exit animation
        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateY(-10px)";
            setTimeout(() => {
                if(toast.parentElement) toast.remove();
            }, 300);
        }, 4000);
    };

})();

