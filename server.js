const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({
  verify: (req, res, buf) => {
    // Needed for webhook signature verification.
    req.rawBody = buf;
  },
}));
app.use(express.static(__dirname)); // serve static HTML files

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const iWEBHOOK_MONITOR_TOKEN = process.env.WEBHOOK_MONITOR_TOKEN || '';

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

const processedPaystackRefs = new Set();
const webhookAuditLogs = [];
const MAX_AUDIT_LOGS = 200;

// ─── Mock In-Memory Database ───────────────────────────────────────────────
let users = [
  { id: 1, name: 'Alice',   is_free_mode: false, balance_owed: 0, wallet_balance: 50 },
  { id: 2, name: 'Bob',     is_free_mode: true,  balance_owed: 0, wallet_balance: 20 },
  { id: 3, name: 'Charlie', is_free_mode: false, balance_owed: 0, wallet_balance: 0 },
];

let orders = [
  { id: 1, customerPhone: '0240001111', status: 'Pending', amount: 10 },
  { id: 2, customerPhone: '0240001111', status: 'Failed', amount: 5 },
  { id: 3, customerPhone: '0240001111', status: 'Pending', amount: 20 },
  { id: 4, customerPhone: '0551234567', status: 'Processing', amount: 8 },
  { id: 5, customerPhone: '0551234567', status: 'Pending', amount: 15 },
];

// ─── Helper ────────────────────────────────────────────────────────────────
function findUser(id) {
  return users.find(u => String(u.id) === String(id));
}

function round2(value) {
  return parseFloat(Number(value || 0).toFixed(2));
}

function addWebhookAuditLog(entry) {
  webhookAuditLogs.unshift({
    ...entry,
    createdAt: new Date().toISOString(),
  });

  if (webhookAuditLogs.length > MAX_AUDIT_LOGS) {
    webhookAuditLogs.length = MAX_AUDIT_LOGS;
  }
}

function isMonitorAuthorized(req) {
  if (!WEBHOOK_MONITOR_TOKEN) return false;
  return req.headers['x-monitor-token'] === WEBHOOK_MONITOR_TOKEN;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(operation, options = {}) {
  const attempts = options.attempts || 3;
  const initialDelayMs = options.initialDelayMs || 250;
  const backoff = options.backoff || 2;

  let delayMs = initialDelayMs;
  let lastError;

  for (let i = 0; i < attempts; i += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await sleep(delayMs);
        delayMs *= backoff;
      }
    }
  }

  throw lastError;
}

async function creditWalletInSupabase(userId, netAmount, reference, payloadMeta) {
  const { data: existingTxn, error: existingTxnErr } = await supabaseAdmin
    .from('transactions')
    .select('id')
    .eq('reference', `PAYSTACK:${reference}`)
    .limit(1);

  if (existingTxnErr) {
    throw new Error(`Failed idempotency lookup: ${existingTxnErr.message}`);
  }

  if (existingTxn && existingTxn.length > 0) {
    return { duplicate: true };
  }

  const { data: userRow, error: userErr } = await supabaseAdmin
    .from('users')
    .select('id, wallet_balance')
    .eq('id', userId)
    .single();

  if (userErr || !userRow) {
    throw new Error(`User not found in Supabase: ${userErr?.message || userId}`);
  }

  const currentBalance = Number(userRow.wallet_balance || 0);
  const newBalance = round2(currentBalance + netAmount);

  const { error: updateErr } = await supabaseAdmin
    .from('users')
    .update({ wallet_balance: newBalance })
    .eq('id', userId);

  if (updateErr) {
    throw new Error(`Wallet update failed: ${updateErr.message}`);
  }

  const { error: insertTxnErr } = await supabaseAdmin
    .from('transactions')
    .insert({
      user_id: userId,
      type: 'Wallet Funding (Paystack)',
      amount: round2(netAmount),
      balance_before: round2(currentBalance),
      balance_after: newBalance,
      status: 'Verified',
      reference: `PAYSTACK:${reference}`,
    });

  if (insertTxnErr) {
    throw new Error(`Transaction log insert failed: ${insertTxnErr.message}`);
  }

  addWebhookAuditLog({
    source: 'supabase',
    status: 'credited',
    reference,
    userId,
    creditedAmount: round2(netAmount),
    newWalletBalance: newBalance,
    metadata: payloadMeta,
  });

  return {
    duplicate: false,
    userId,
    newWalletBalance: newBalance,
    source: 'supabase',
  };
}

async function creditWalletInMock(userId, netAmount, reference, payloadMeta) {
  const user = findUser(userId);
  if (!user) {
    throw new Error(`User with id ${userId} not found in mock database.`);
  }

  user.wallet_balance = round2(Number(user.wallet_balance || 0) + netAmount);

  addWebhookAuditLog({
    source: 'mock',
    status: 'credited',
    reference,
    userId,
    creditedAmount: round2(netAmount),
    newWalletBalance: user.wallet_balance,
    metadata: payloadMeta,
  });

  return {
    duplicate: false,
    userId,
    newWalletBalance: user.wallet_balance,
    source: 'mock',
  };
}

async function creditWallet(userId, netAmount, reference, payloadMeta) {
  if (supabaseAdmin) {
    return creditWalletInSupabase(userId, netAmount, reference, payloadMeta);
  }

  return creditWalletInMock(userId, netAmount, reference, payloadMeta);
}

function verifyPaystackSignature(req) {
  if (!PAYSTACK_SECRET_KEY) return false;
  const signature = req.headers['x-paystack-signature'];
  if (!signature || !req.rawBody) return false;

  const expected = crypto
    .createHmac('sha512', PAYSTACK_SECRET_KEY)
    .update(req.rawBody)
    .digest('hex');

  return signature === expected;
}

// ─── GET /api/users  (list all users for the UI) ──────────────────────────
app.get('/api/users', (req, res) => {
  res.json(users);
});

// ─── POST /api/admin/orders/update-targeted ───────────────────────────────
// Body: { customerPhone: string, targetStatus: string, newStatus: string }
app.post('/api/admin/orders/update-targeted', (req, res) => {
  const customerPhone = String(req.body.customerPhone || '').trim();
  const targetStatus = String(req.body.targetStatus || '').trim();
  const newStatus = String(req.body.newStatus || '').trim();

  if (!customerPhone || !targetStatus || !newStatus) {
    return res.status(400).json({
      status: 'error',
      message: 'customerPhone, targetStatus, and newStatus are required.',
    });
  }

  let updatedCount = 0;

  for (const order of orders) {
    if (order.customerPhone === customerPhone && order.status === targetStatus) {
      order.status = newStatus;
      updatedCount += 1;
    }
  }

  return res.json({
    status: 'success',
    updatedCount,
    message: 'Orders updated successfully',
  });
});

// ─── POST /api/admin/toggle-free-mode ─────────────────────────────────────
// Body: { userId: number }
app.post('/api/admin/toggle-free-mode', (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required.' });
  }

  const user = findUser(userId);
  if (!user) {
    return res.status(404).json({ error: `User with id ${userId} not found.` });
  }

  user.is_free_mode = !user.is_free_mode;

  return res.json({
    message: `Free Mode for "${user.name}" is now ${user.is_free_mode ? 'ENABLED' : 'DISABLED'}.`,
    user,
  });
});

// ─── POST /api/checkout ───────────────────────────────────────────────────
// Body: { userId: number, orderTotal: number }
app.post('/api/checkout', (req, res) => {
  const { userId, orderTotal } = req.body;

  if (!userId || orderTotal === undefined) {
    return res.status(400).json({ error: 'userId and orderTotal are required.' });
  }

  const total = parseFloat(orderTotal);
  if (isNaN(total) || total <= 0) {
    return res.status(400).json({ error: 'orderTotal must be a positive number.' });
  }

  const user = findUser(userId);
  if (!user) {
    return res.status(404).json({ error: `User with id ${userId} not found.` });
  }

  if (user.is_free_mode) {
    // Skip payment — add to balance owed
    user.balance_owed = parseFloat((user.balance_owed + total).toFixed(2));

    return res.json({
      success: true,
      free_mode: true,
      message: `Order placed in Free Mode. Payment deferred.`,
      new_balance_owed: user.balance_owed,
      user,
    });
  }

  // Standard payment flow (mock)
  return res.json({
    success: true,
    free_mode: false,
    message: `Payment of GHS ${total.toFixed(2)} processed successfully for "${user.name}".`,
    user,
  });
});

// ─── POST /api/webhook/paystack ──────────────────────────────────────────
// Expects Paystack event payload and credits user's wallet net of 2.5% fee.
app.post('/api/webhook/paystack', async (req, res) => {
  if (!verifyPaystackSignature(req)) {
    addWebhookAuditLog({ source: 'paystack', status: 'rejected', reason: 'invalid_signature' });
    return res.status(401).json({ error: 'Invalid Paystack signature.' });
  }

  const event = req.body;

  if (!event || event.event !== 'charge.success') {
    // Acknowledge other events so Paystack does not retry unnecessarily.
    return res.status(200).json({ message: 'Event ignored.' });
  }

  // 1) Extract actual amount charged in smallest currency unit (pesewas).
  const chargedInPesewas = Number(event?.data?.amount || 0);
  if (!chargedInPesewas || chargedInPesewas <= 0) {
    return res.status(400).json({ error: 'Invalid charged amount from webhook.' });
  }

  // 2) Convert to standard currency.
  const chargedAmount = chargedInPesewas / 100;

  // 3) Calculate 2.5% processing fee.
  const processingFee = chargedAmount * 0.025;

  // 4) Calculate net amount to credit.
  const netAmount = chargedAmount - processingFee;

  const reference = String(
    event?.data?.reference ||
    event?.data?.id ||
    event?.data?.metadata?.reference ||
    ''
  );

  if (!reference) {
    addWebhookAuditLog({ source: 'paystack', status: 'rejected', reason: 'missing_reference' });
    return res.status(400).json({ error: 'Missing transaction reference.' });
  }

  if (processedPaystackRefs.has(reference)) {
    addWebhookAuditLog({ source: 'paystack', status: 'duplicate', reference });
    return res.status(200).json({ success: true, duplicate: true, message: 'Already processed.' });
  }

  // 5) Find user by metadata userId and credit net amount only.
  const metadata = event?.data?.metadata || {};
  const userId = metadata.userId || metadata.user_id;
  if (!userId) {
    addWebhookAuditLog({ source: 'paystack', status: 'rejected', reason: 'missing_user_id', reference });
    return res.status(400).json({ error: 'Missing userId in Paystack metadata.' });
  }

  try {
    const creditResult = await withRetry(
      () => creditWallet(userId, netAmount, reference, metadata),
      { attempts: 3, initialDelayMs: 300, backoff: 2 }
    );

    if (creditResult.duplicate) {
      processedPaystackRefs.add(reference);
      return res.status(200).json({ success: true, duplicate: true, message: 'Already processed.' });
    }

    processedPaystackRefs.add(reference);

    return res.status(200).json({
      success: true,
      message: 'Webhook processed successfully.',
      userId: creditResult.userId,
      chargedAmount: round2(chargedAmount),
      processingFee: round2(processingFee),
      creditedAmount: round2(netAmount),
      newWalletBalance: round2(creditResult.newWalletBalance),
      source: creditResult.source,
    });
  } catch (error) {
    addWebhookAuditLog({
      source: 'paystack',
      status: 'failed',
      reference,
      userId,
      error: error.message,
    });
    // Return non-2xx to allow Paystack retry when processing failed.
    return res.status(500).json({ error: `Webhook processing failed: ${error.message}` });
  }
});

// ─── GET /api/admin/webhooks/paystack-status ─────────────────────────────
// Lightweight monitoring endpoint, protected by x-monitor-token header.
app.get('/api/admin/webhooks/paystack-status', (req, res) => {
  if (!WEBHOOK_MONITOR_TOKEN) {
    return res.status(503).json({ error: 'Monitoring token not configured.' });
  }

  if (!isMonitorAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized monitor token.' });
  }

  const summary = webhookAuditLogs.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  return res.status(200).json({
    healthy: true,
    supabaseMode: Boolean(supabaseAdmin),
    processedReferenceCount: processedPaystackRefs.size,
    summary,
    recent: webhookAuditLogs.slice(0, 30),
  });
});

// ─── DELETE /api/admin/users/:id ───────────────────────────────────────────
app.delete('/api/admin/users/:id', async (req, res) => {
  const userId = String(req.params.id || '').trim();
  if (!userId) return res.status(400).json({ error: 'User ID is required.' });

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Admin client not configured. Set SUPABASE_SERVICE_ROLE_KEY.' });
  }

  // Delete from auth.users — cascades to public.users via FK
  const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authErr) {
    // Fallback: delete from public.users directly if auth delete failed
    const { error: dbErr } = await supabaseAdmin.from('users').delete().eq('id', userId);
    if (dbErr) {
      return res.status(500).json({ error: `Delete failed: ${authErr.message}` });
    }
  }

  return res.json({ success: true, deletedUserId: userId });
});

// ─── Refund Scheduled Orders ──────────────────────────────────────────────
app.post('/api/admin/refund-scheduled', async (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: 'No IDs provided.' });
  }
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Admin client not configured.' });
  }

  // Fetch the scheduled orders to get user_id + amount
  const { data: orders, error: fetchErr } = await supabaseAdmin
    .from('scheduled_orders')
    .select('id, user_id, amount')
    .in('id', ids);
  if (fetchErr) return res.status(500).json({ error: fetchErr.message });

  // Sum amounts per user
  const userAmounts = {};
  for (const o of orders) {
    if (o.user_id) {
      userAmounts[o.user_id] = (userAmounts[o.user_id] || 0) + Number(o.amount || 0);
    }
  }

  // Increment each user's wallet_balance
  const walletErrors = [];
  for (const [userId, amount] of Object.entries(userAmounts)) {
    const { data: userRow } = await supabaseAdmin
      .from('users').select('wallet_balance').eq('id', userId).single();
    const newBal = (Number(userRow?.wallet_balance) || 0) + amount;
    const { error: upErr } = await supabaseAdmin
      .from('users').update({ wallet_balance: newBal }).eq('id', userId);
    if (upErr) walletErrors.push(upErr.message);
  }

  // Mark orders as refunded
  await supabaseAdmin
    .from('scheduled_orders')
    .update({ status: 'refunded' })
    .in('id', ids);

  return res.json({ success: true, refundedCount: orders.length, errors: walletErrors });
});


// ─── Start Server ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT}/free-mode.html to use the demo UI`);
  console.log(`Webhook endpoint ready at POST http://localhost:${PORT}/api/webhook/paystack`);
});

module.exports = app;

module.exports = app;
