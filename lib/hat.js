const crypto = require('crypto');

function timingSafeEqual(a, b) {
  const aBuf = Buffer.from(a || '', 'utf8');
  const bBuf = Buffer.from(b || '', 'utf8');
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyWebhookSignature(rawBody, signature, secret) {
  if (!secret) return true;
  if (!signature) return false;
  const hmacHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const hmacBase64 = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const normalized = signature.replace(/^sha256=/i, '');
  return (
    timingSafeEqual(signature, hmacHex) ||
    timingSafeEqual(signature, hmacBase64) ||
    timingSafeEqual(normalized, hmacHex) ||
    timingSafeEqual(normalized, hmacBase64)
  );
}

function get(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function cleanString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function extractWebhookFields(payload) {
  const orderId = (
    get(payload, 'data.id') ||
    get(payload, 'data.attributes.order_id') ||
    get(payload, 'data.attributes.order_number') ||
    get(payload, 'meta.order_id') ||
    get(payload, 'meta.orderId') ||
    get(payload, 'order_id') ||
    get(payload, 'orderId')
  );

  const email = cleanString(
    get(payload, 'data.attributes.email') ||
    get(payload, 'data.attributes.user_email') ||
    get(payload, 'data.attributes.customer_email') ||
    get(payload, 'meta.email') ||
    get(payload, 'email')
  );

  const name = cleanString(
    get(payload, 'meta.custom_data.display_name') ||
    get(payload, 'meta.custom_data.name') ||
    get(payload, 'data.attributes.custom_fields.display_name') ||
    get(payload, 'data.attributes.custom_fields.name') ||
    get(payload, 'custom_data.display_name') ||
    get(payload, 'custom_fields.display_name')
  );

  return {
    orderId: orderId ? String(orderId) : null,
    email,
    name
  };
}

function formatToken(id) {
  return `HAT-${String(id).padStart(6, '0')}`;
}

function formatCertificateNumber(id) {
  return `HAT-CERT-${String(id).padStart(6, '0')}`;
}

function generateUserIdentifier() {
  return `HAT-UID-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length) {
    return Buffer.concat(chunks);
  }

  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === 'string') {
    return Buffer.from(req.body, 'utf8');
  }

  if (req.body && typeof req.body === 'object') {
    return Buffer.from(JSON.stringify(req.body));
  }

  return Buffer.from('');
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const rawBody = await readRawBody(req);
  if (!rawBody.length) {
    return {};
  }

  return JSON.parse(rawBody.toString('utf8'));
}

module.exports = {
  extractWebhookFields,
  formatCertificateNumber,
  formatToken,
  generateUserIdentifier,
  readJsonBody,
  readRawBody,
  verifyWebhookSignature
};
