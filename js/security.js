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

})();

