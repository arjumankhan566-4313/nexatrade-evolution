/** Direct port: src/lib/binancePay.js. */
import crypto from 'node:crypto';

const API_BASE = process.env.BINANCE_PAY_API_BASE || 'https://bpay.binanceapi.com';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Binance Pay is not configured: missing ${name}`);
  return value;
}

export function binanceConfigured() {
  return Boolean(process.env.BINANCE_PAY_API_KEY && process.env.BINANCE_PAY_PRIVATE_KEY && process.env.BINANCE_PAY_CERTIFICATE_SN);
}

export function verifyBinanceWebhook({ timestamp, nonce, body, signature, certificate }) {
  if (!timestamp || !nonce || !signature || !certificate) return false;
  const payload = `${timestamp}\n${nonce}\n${body}\n`;
  return crypto.createVerify('RSA-SHA256').update(payload).verify(certificate, Buffer.from(signature, 'base64'));
}

export async function binanceRequest(path, payload) {
  const apiKey = required('BINANCE_PAY_API_KEY');
  const privateKey = required('BINANCE_PAY_PRIVATE_KEY');
  const timestamp = String(Date.now());
  const nonce = crypto.randomBytes(16).toString('hex');
  const body = JSON.stringify(payload);
  const signaturePayload = `${timestamp}\n${nonce}\n${body}\n`;
  const signature = crypto.createSign('RSA-SHA256').update(signaturePayload).sign(privateKey, 'base64');
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'BinancePay-Timestamp': timestamp,
      'BinancePay-Nonce': nonce,
      'BinancePay-Certificate-SN': required('BINANCE_PAY_CERTIFICATE_SN'),
      'BinancePay-Signature': signature,
      'BinancePay-Merchant-Code': process.env.BINANCE_PAY_MERCHANT_CODE || '',
      'BinancePay-API-Key': apiKey,
    },
    body,
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status === 'FAIL') throw new Error(result?.errorMessage || 'Binance Pay request failed.');
  return result;
}

export async function createBinanceOrder({ merchantTradeNo, amount, currency, returnUrl, cancelUrl }) {
  return binanceRequest('/binancepay/openapi/v2/order', {
    env: { terminalType: 'WEB' },
    merchantTradeNo,
    orderAmount: Number(amount).toFixed(2),
    currency,
    goods: { goodsType: '01', goodsCategory: 'Z000', referenceGoodsId: merchantTradeNo, goodsName: 'TRADEON account deposit' },
    returnUrl,
    cancelUrl,
  });
}

export async function createBinancePayout({ merchantTradeNo, amount, currency, address }) {
  return binanceRequest('/binancepay/openapi/withdraw/order', { merchantTradeNo, amount: Number(amount).toFixed(2), currency, address });
}

export function getBinanceCertificate() {
  return process.env.BINANCE_PAY_PUBLIC_KEY || '';
}
