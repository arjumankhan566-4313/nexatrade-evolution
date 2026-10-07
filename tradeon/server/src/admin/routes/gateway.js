/** Direct port of src/app/api/admin/gateway/route.js; transport imports only. */
import { requireAdmin, json, fail, route, readJson } from '../http';
import { sql, one, uuid, getSettings } from '../db';
import { PERMISSIONS } from '../lib/rbac.js';
import { logSecurity } from '../http';
import { publish } from '../lib/realtime.js';
import { gatewayPublicConfig } from '../lib/gateway.js';


/**
 * GET: List all configured payment gateway providers
 */
export const GET = route(async (req) => {
  const { user: admin, response } = await requireAdmin(PERMISSIONS.FINANCE_VIEW);
  if (response) return response;

  const settings = await getSettings();
  const providers = settings.gateway_providers || [];

  return json({
    providers: providers.map(p => ({
      id: p.id,
      name: p.name,
      code: p.code,
      type: p.type, // 'CRYPTO_AUTO', 'CRYPTO_MANUAL', 'LOCAL', 'BANK'
      enabled: p.enabled !== false,
      apiKey: p.apiKey ? '••••' + p.apiKey.slice(-4) : null,
      apiSecret: p.apiSecret ? '••••' + p.apiSecret.slice(-4) : null,
      webhookSecret: p.webhookSecret ? '••••' + p.webhookSecret.slice(-4) : null,
      walletAddress: p.walletAddress || null,
      network: p.network || null,
      minAmount: p.minAmount || 10,
      maxAmount: p.maxAmount || 100000,
      fee: p.fee || 0,
      autoCredit: p.autoCredit || false,
      instructions: p.instructions || '',
      createdAt: p.createdAt,
    })),
    nowpayments: {
      enabled: Boolean(process.env.NOWPAYMENTS_API_KEY),
      configured: Boolean(process.env.NOWPAYMENTS_API_KEY && process.env.NOWPAYMENTS_IPN_SECRET),
    },
    // Effective state users see right now = deployment env + the administrator
    // runtime switches below (auto_deposits_enabled / demo_gateway_enabled).
    checkout: gatewayPublicConfig(settings),
    // Administrator runtime control knobs (PATCH /api/admin/settings).
    control: {
      autoDeposits: settings.auto_deposits_enabled !== false,
      demo: settings.demo_gateway_enabled !== false,
    }
  });
});

/**
 * POST: Add a new payment gateway provider
 */
export const POST = route(async (req) => {
  const { user: admin, response } = await requireAdmin(PERMISSIONS.PAYMENT_METHODS_MANAGE);
  if (response) return response;

  const body = await readJson(req);
  const { name, code, type, apiKey, apiSecret, webhookSecret, walletAddress, network, minAmount, maxAmount, fee, autoCredit, instructions } = body;

  if (!name || !code || !type) {
    return fail('Name, code, and type are required.', 400);
  }

  const settings = await getSettings();
  const providers = settings.gateway_providers || [];

  // Check for duplicate code
  if (providers.find(p => p.code === code)) {
    return fail(`A provider with code "${code}" already exists.`, 400);
  }

  const newProvider = {
    id: uuid(),
    name,
    code,
    type,
    enabled: true,
    apiKey: apiKey || '',
    apiSecret: apiSecret || '',
    webhookSecret: webhookSecret || '',
    walletAddress: walletAddress || '',
    network: network || '',
    minAmount: Number(minAmount) || 10,
    maxAmount: Number(maxAmount) || 100000,
    fee: Number(fee) || 0,
    autoCredit: Boolean(autoCredit),
    instructions: instructions || '',
    createdAt: new Date().toISOString(),
  };

  providers.push(newProvider);

  await sql(
    `UPDATE system_settings SET gateway_providers = $1::jsonb, settings_version = settings_version + 1 WHERE id = 1`,
    [JSON.stringify(providers)]
  );

  await logSecurity({
    req,
    userId: admin.id,
    email: admin.email,
    event: 'PAYMENT_GATEWAY_ADDED',
    severity: 'CRITICAL',
    meta: { providerId: newProvider.id, code, type }
  });

  await publish('settings', { changed: ['gateway_providers'] });

  return json({
    ok: true,
    message: 'Payment gateway provider added successfully.',
    provider: { ...newProvider, apiKey: newProvider.apiKey ? '••••' : null, apiSecret: newProvider.apiSecret ? '••••' : null }
  });
});

/**
 * PATCH: Update a payment gateway provider
 */
export const PATCH = route(async (req) => {
  const { user: admin, response } = await requireAdmin(PERMISSIONS.PAYMENT_METHODS_MANAGE);
  if (response) return response;

  const body = await readJson(req);
  const { providerId, ...updates } = body;

  if (!providerId) return fail('Provider ID is required.', 400);

  const settings = await getSettings();
  const providers = settings.gateway_providers || [];
  const idx = providers.findIndex(p => p.id === providerId);

  if (idx === -1) return fail('Provider not found.', 404);

  // Update fields (don't overwrite secrets with masked values)
  const allowed = ['name', 'code', 'type', 'enabled', 'walletAddress', 'network', 'minAmount', 'maxAmount', 'fee', 'autoCredit', 'instructions'];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      providers[idx][key] = updates[key];
    }
  }
  // Only update secrets if they're not masked
  if (updates.apiKey && !updates.apiKey.startsWith('••••')) providers[idx].apiKey = updates.apiKey;
  if (updates.apiSecret && !updates.apiSecret.startsWith('••••')) providers[idx].apiSecret = updates.apiSecret;
  if (updates.webhookSecret && !updates.webhookSecret.startsWith('••••')) providers[idx].webhookSecret = updates.webhookSecret;

  await sql(
    `UPDATE system_settings SET gateway_providers = $1::jsonb, settings_version = settings_version + 1 WHERE id = 1`,
    [JSON.stringify(providers)]
  );

  await logSecurity({
    req,
    userId: admin.id,
    email: admin.email,
    event: 'PAYMENT_GATEWAY_UPDATED',
    severity: 'CRITICAL',
    meta: { providerId, changes: Object.keys(updates) }
  });

  await publish('settings', { changed: ['gateway_providers'] });

  return json({ ok: true, message: 'Provider updated.' });
});

/**
 * DELETE: Remove a payment gateway provider
 */
export const DELETE = route(async (req) => {
  const { user: admin, response } = await requireAdmin(PERMISSIONS.PAYMENT_METHODS_MANAGE);
  if (response) return response;

  const url = new URL(req.url);
  const providerId = url.searchParams.get('id');
  if (!providerId) return fail('Provider ID required.', 400);

  const settings = await getSettings();
  const providers = settings.gateway_providers || [];
  const filtered = providers.filter(p => p.id !== providerId);

  if (filtered.length === providers.length) return fail('Provider not found.', 404);

  await sql(
    `UPDATE system_settings SET gateway_providers = $1::jsonb, settings_version = settings_version + 1 WHERE id = 1`,
    [JSON.stringify(filtered)]
  );

  await logSecurity({
    req,
    userId: admin.id,
    email: admin.email,
    event: 'PAYMENT_GATEWAY_DELETED',
    severity: 'CRITICAL',
    meta: { providerId }
  });

  await publish('settings', { changed: ['gateway_providers'] });

  return json({ ok: true, message: 'Provider removed.' });
});
