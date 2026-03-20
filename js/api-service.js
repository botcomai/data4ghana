// ==========================================
// DATA4GHANA API SERVICE MODULE
// Reusable functions to interact with the
// external VTU provider via Supabase Edge Functions
// ==========================================

const SUPABASE_FUNCTIONS_URL = "https://wynmejzsybkxhqvazjzu.supabase.co/functions/v1";
const PROVIDER_BASE_URL = "https://cleanheartsolutions.com/api";

const NETWORK_KEY_MAP = {
  MTN: "YELLO",
  YELLO: "YELLO",
  TELECEL: "TELECEL",
  VODAFONE: "TELECEL",
  AIRTELTIGO: "AT_PREMIUM",
  TIGO: "AT_PREMIUM",
  ISHARE: "AT_PREMIUM",
  AT_PREMIUM: "AT_PREMIUM",
  BIGTIME: "AT_BIGTIME",
  AT_BIGTIME: "AT_BIGTIME",
};

function normalizeNetworkKey(network) {
  const key = String(network || "").trim().toUpperCase().replace(/\s+/g, "");
  return NETWORK_KEY_MAP[key] || null;
}

function normalizeRecipient(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!/^0\d{9}$/.test(digits)) return null;
  return digits;
}

function normalizeCapacity(dataSize) {
  const raw = String(dataSize || "").trim().toUpperCase();
  const num = parseFloat(raw.replace("GB", "").trim());
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

/**
 * Place a data order via provider purchase endpoint.
 * @param {string} network - Display network or networkKey
 * @param {string} phone - Recipient phone number
 * @param {string|number} dataSize - Data size (e.g., "1GB", 1, "2GB")
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
async function placeDataOrder(network, phone, dataSize) {
  const networkKey = normalizeNetworkKey(network);
  const recipient = normalizeRecipient(phone);
  const capacity = normalizeCapacity(dataSize);

  if (!networkKey) {
    return { success: false, error: 'Invalid network selected.' };
  }
  if (!recipient) {
    return { success: false, error: 'Recipient must be a 10-digit number starting with 0.' };
  }
  if (!capacity) {
    return { success: false, error: 'Invalid capacity. Use a value greater than 0.' };
  }

  try {
    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/place-data-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${window.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        // Official provider payload
        networkKey,
        recipient,
        capacity,
        // Metadata used by edge function router
        provider_base_url: PROVIDER_BASE_URL,
        provider_endpoint: '/purchase',
        provider_auth_header: 'X-API-Key',
        // Legacy compatibility for existing edge-function implementations
        network: network,
        phone: recipient,
        data_size: `${capacity}GB`,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: result.error || 'Order placement failed',
        api_response: result.data || result.api_response || null,
      };
    }

    return {
      success: true,
      data: result.data,
    };

  } catch (error) {
    console.error('API Service Error (placeDataOrder):', error);
    return {
      success: false,
      error: 'Network error: Unable to reach the API. Please try again.',
    };
  }
}

/**
 * Check provider order status by reference.
 * @param {string|null} phone - legacy arg (ignored by official endpoint)
 * @param {string|null} reference - Order reference ID
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
async function checkOrderStatus(phone, reference) {
  const ref = String(reference || '').trim();
  if (!ref) {
    return { success: false, error: 'Reference is required for status checks.' };
  }

  try {
    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/check-order-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${window.SUPABASE_ANON_KEY}`,
      },
      // Edge function can read these query params and proxy to:
      // GET /orders?reference=XXX
      // while remaining backward compatible with current deployment.
      body: JSON.stringify({
        reference: ref,
        provider_base_url: PROVIDER_BASE_URL,
        provider_endpoint: '/orders',
        provider_auth_header: 'X-API-Key',
        provider_query: { reference: ref },
        // Legacy fallback payload for old implementations
        phone: phone || null,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: result.error || 'Status check failed',
        api_response: result.data || result.api_response || null,
      };
    }

    return {
      success: true,
      data: result.data,
    };

  } catch (error) {
    console.error('API Service Error (checkOrderStatus):', error);
    return {
      success: false,
      error: 'Network error: Unable to reach the API. Please try again.',
    };
  }
}

/**
 * Check the external API wallet balance.
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
async function checkApiBalance() {
  try {
    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/check-api-balance`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${window.SUPABASE_ANON_KEY}`,
      },
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: result.error || 'Failed to fetch API balance',
      };
    }

    return {
      success: true,
      data: result.data,
    };

  } catch (error) {
    console.error('API Service Error (checkApiBalance):', error);
    return {
      success: false,
      error: 'Network error: Unable to reach the API.',
    };
  }
}

// Export to window for global access
window.placeDataOrder = placeDataOrder;
window.checkOrderStatus = checkOrderStatus;
window.checkApiBalance = checkApiBalance;
