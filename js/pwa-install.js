(function () {
  let deferredInstallPrompt = null;

  function isIosDevice() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  }

  function isStandaloneMode() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function ensureInstallButton() {
    const existingButton = document.getElementById('installAppBtn');
    if (existingButton) {
      existingButton.style.display = 'none';
      return existingButton;
    }

    const button = document.createElement('button');
    button.id = 'installAppBtn';
    button.type = 'button';
    button.textContent = 'Install App';
    button.style.position = 'fixed';
    button.style.right = '16px';
    button.style.bottom = '16px';
    button.style.zIndex = '9999';
    button.style.display = 'none';
    button.style.border = 'none';
    button.style.borderRadius = '999px';
    button.style.padding = '12px 16px';
    button.style.fontWeight = '600';
    button.style.background = '#0b1220';
    button.style.color = '#ffffff';
    button.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)';
    button.style.cursor = 'pointer';
    document.body.appendChild(button);
    return button;
  }

  function showIosHint() {
    const existingHint = document.getElementById('installHint');
    const hintText = 'On iPhone/iPad, tap Share and choose Add to Home Screen.';

    if (existingHint) {
      existingHint.textContent = hintText;
      existingHint.style.display = 'block';
      return;
    }

    const hint = document.createElement('p');
    hint.id = 'installHint';
    hint.textContent = hintText;
    hint.style.position = 'fixed';
    hint.style.left = '16px';
    hint.style.right = '16px';
    hint.style.bottom = '72px';
    hint.style.zIndex = '9998';
    hint.style.margin = '0';
    hint.style.padding = '10px 12px';
    hint.style.borderRadius = '10px';
    hint.style.background = '#ffffff';
    hint.style.color = '#0b1220';
    hint.style.boxShadow = '0 6px 20px rgba(0,0,0,0.14)';
    hint.style.fontSize = '0.9rem';
    document.body.appendChild(hint);
  }

  function hideIosHint() {
    const hint = document.getElementById('installHint');
    if (hint) {
      hint.style.display = 'none';
    }
  }

  function applyNativeAppStyles() {
    if (document.getElementById('pwaNativeStyles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'pwaNativeStyles';
    style.textContent = [
      '/* 1. Prevent the "pull-to-refresh" bounce on mobile browsers */',
      'body { overscroll-behavior-y: none; }',
      '',
      '/* 2. Remove the blue flash when tapping buttons or links */',
      '* { -webkit-tap-highlight-color: transparent; }',
      '',
      '/* 3. Disable text highlighting (makes it feel like a real app interface) */',
      'body { -webkit-user-select: none; user-select: none; }',
      '',
      '/* Re-enable text selection ONLY for actual input fields and text areas */',
      'input, textarea { -webkit-user-select: auto; user-select: auto; }',
      '',
      '/* 4. Disable the default iOS popup menu on long-press (like on images) */',
      'body { -webkit-touch-callout: none; }',
      '',
      '/* Safe-area support for notched devices */',
      '.app-header { padding-top: env(safe-area-inset-top); }',
      '.bottom-nav { padding-bottom: env(safe-area-inset-bottom); }'
    ].join('\n');

    document.head.appendChild(style);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function (error) {
        console.error('Service Worker registration failed:', error);
      });
    });
  }

  window.addEventListener('DOMContentLoaded', function () {
    applyNativeAppStyles();
    const installButton = ensureInstallButton();
    const ios = isIosDevice();
    const standalone = isStandaloneMode();

    function showInstallButton() {
      if (!standalone) {
        installButton.style.display = 'inline-flex';
      }
    }

    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      deferredInstallPrompt = event;
      showInstallButton();
    });

    installButton.addEventListener('click', async function () {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        installButton.style.display = 'none';
        hideIosHint();
        return;
      }

      if (ios && !isStandaloneMode()) {
        alert('To install this app on iPhone/iPad: tap Share, then choose Add to Home Screen.');
      }
    });

    window.addEventListener('appinstalled', function () {
      deferredInstallPrompt = null;
      installButton.style.display = 'none';
      hideIosHint();
    });

    if (ios && !standalone) {
      showInstallButton();
      showIosHint();
    }
  });

  registerServiceWorker();
})();
