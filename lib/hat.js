const crypto = require('crypto');

const TIERS = {
  FOUNDERS: 'founders',
  ELITE: 'elite',
  EARLY: 'early',
  MID: 'mid',
  STANDARD: 'standard'
};

const TIER_RANGES = {
  [TIERS.FOUNDERS]: { start: 1, end: 10 },
  [TIERS.ELITE]: { start: 11, end: 20 },
  [TIERS.EARLY]: { start: 21, end: 50 },
  [TIERS.MID]: { start: 51, end: 100 },
  [TIERS.STANDARD]: { start: 101, end: null }
};

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

function normalizeOrderReference(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return raw.replace(/^order\s*#?\s*/i, '').replace(/^#\s*/, '').trim() || null;
}

function normalizeTier(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;

  if (raw === TIERS.FOUNDERS || raw === 'founder') return TIERS.FOUNDERS;
  if (raw === TIERS.ELITE) return TIERS.ELITE;
  if (raw === TIERS.EARLY) return TIERS.EARLY;
  if (raw === TIERS.MID || raw === 'middle') return TIERS.MID;
  if (raw === TIERS.STANDARD || raw === 'base') return TIERS.STANDARD;
  return null;
}

function parseIdList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function asStringSet(values) {
  return new Set(
    values
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  );
}

function parseMoneyCents(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const cents = Number(raw);
  if (!Number.isFinite(cents)) return null;
  return Math.round(cents);
}

function parseBoolean(value) {
  if (value === true || value === false) return value;
  if (typeof value === 'number') return value !== 0;
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (['true', '1', 'yes', 'y', 'on', 'paid'].includes(raw)) return true;
  if (['false', '0', 'no', 'n', 'off', 'unpaid'].includes(raw)) return false;
  return null;
}

function collectOrderItemIds(payload) {
  const items = get(payload, 'data.attributes.order_items');
  if (!Array.isArray(items)) return [];
  const ids = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    if (item.variant_id !== undefined && item.variant_id !== null) ids.push(item.variant_id);
    if (item.product_id !== undefined && item.product_id !== null) ids.push(item.product_id);
  }
  return ids;
}

function resolveTierFromPayload(payload) {
  const explicitTier = normalizeTier(
    get(payload, 'meta.custom_data.tier') ||
    get(payload, 'data.attributes.custom_fields.tier') ||
    get(payload, 'data.attributes.first_order_item.custom_data.tier')
  );
  if (explicitTier) {
    return explicitTier;
  }

  const idCandidates = asStringSet([
    get(payload, 'data.attributes.variant_id'),
    get(payload, 'data.attributes.product_id'),
    get(payload, 'data.attributes.first_order_item.variant_id'),
    get(payload, 'data.attributes.first_order_item.product_id'),
    get(payload, 'meta.custom_data.variant_id'),
    get(payload, 'meta.custom_data.product_id'),
    ...collectOrderItemIds(payload)
  ]);

  const envTierMatches = {
    [TIERS.FOUNDERS]: asStringSet([
      ...parseIdList(process.env.LEMON_VARIANT_ID_FOUNDERS),
      ...parseIdList(process.env.LEMON_PRODUCT_ID_FOUNDERS)
    ]),
    [TIERS.ELITE]: asStringSet([
      ...parseIdList(process.env.LEMON_VARIANT_ID_ELITE),
      ...parseIdList(process.env.LEMON_PRODUCT_ID_ELITE)
    ]),
    [TIERS.EARLY]: asStringSet([
      ...parseIdList(process.env.LEMON_VARIANT_ID_EARLY),
      ...parseIdList(process.env.LEMON_PRODUCT_ID_EARLY)
    ]),
    [TIERS.MID]: asStringSet([
      ...parseIdList(process.env.LEMON_VARIANT_ID_MID),
      ...parseIdList(process.env.LEMON_PRODUCT_ID_MID)
    ]),
    [TIERS.STANDARD]: asStringSet([
      ...parseIdList(process.env.LEMON_VARIANT_ID_STANDARD),
      ...parseIdList(process.env.LEMON_PRODUCT_ID_STANDARD)
    ])
  };

  const addonIds = asStringSet([
    ...parseIdList(process.env.LEMON_VARIANT_ID_NAME_ADDON),
    ...parseIdList(process.env.LEMON_PRODUCT_ID_NAME_ADDON)
  ]);

  const hasTierMappings = Object.values(envTierMatches).some((set) => set.size > 0);

  const tierOrder = [TIERS.FOUNDERS, TIERS.ELITE, TIERS.EARLY, TIERS.MID, TIERS.STANDARD];
  for (const tier of tierOrder) {
    const knownIds = envTierMatches[tier];
    if (!knownIds.size) continue;
    for (const id of idCandidates) {
      if (knownIds.has(id)) {
        return tier;
      }
    }
  }

  if (addonIds.size > 0) {
    for (const id of idCandidates) {
      if (addonIds.has(id)) {
        return TIERS.STANDARD;
      }
    }
  }

  const strictTierMapping = parseBoolean(process.env.TIER_MAPPING_STRICT);
  if (strictTierMapping && hasTierMappings) {
    return null;
  }

  const amountCents = parseMoneyCents(
    get(payload, 'data.attributes.subtotal') ||
    get(payload, 'data.attributes.total') ||
    get(payload, 'meta.subtotal') ||
    get(payload, 'meta.total')
  );

  if (amountCents !== null) {
    const foundersMin = Number(process.env.TIER_MIN_CENTS_FOUNDERS || 1000000);
    const eliteMin = Number(process.env.TIER_MIN_CENTS_ELITE || 300000);
    const earlyMin = Number(process.env.TIER_MIN_CENTS_EARLY || 75000);
    const midMin = Number(process.env.TIER_MIN_CENTS_MID || 20000);

    if (Number.isFinite(foundersMin) && amountCents >= foundersMin) return TIERS.FOUNDERS;
    if (Number.isFinite(eliteMin) && amountCents >= eliteMin) return TIERS.ELITE;
    if (Number.isFinite(earlyMin) && amountCents >= earlyMin) return TIERS.EARLY;
    if (Number.isFinite(midMin) && amountCents >= midMin) return TIERS.MID;
  }

  return TIERS.STANDARD;
}

function resolveNameAddonPaid(payload) {
  const booleanCandidates = [
    get(payload, 'meta.custom_data.name_addon_paid'),
    get(payload, 'meta.custom_data.name_addon'),
    get(payload, 'meta.custom_data.add_name'),
    get(payload, 'meta.custom_data.nameAddon'),
    get(payload, 'data.attributes.custom_fields.name_addon_paid'),
    get(payload, 'data.attributes.custom_fields.name_addon'),
    get(payload, 'data.attributes.custom_fields.add_name')
  ];

  for (const candidate of booleanCandidates) {
    const parsed = parseBoolean(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  const idCandidates = asStringSet([
    get(payload, 'data.attributes.variant_id'),
    get(payload, 'data.attributes.product_id'),
    get(payload, 'data.attributes.first_order_item.variant_id'),
    get(payload, 'data.attributes.first_order_item.product_id'),
    get(payload, 'meta.custom_data.variant_id'),
    get(payload, 'meta.custom_data.product_id'),
    ...collectOrderItemIds(payload)
  ]);

  const addonIds = asStringSet([
    ...parseIdList(process.env.LEMON_VARIANT_ID_NAME_ADDON),
    ...parseIdList(process.env.LEMON_PRODUCT_ID_NAME_ADDON)
  ]);

  if (addonIds.size > 0) {
    for (const id of idCandidates) {
      if (addonIds.has(id)) {
        return true;
      }
    }
  }

  const amountCents = parseMoneyCents(
    get(payload, 'data.attributes.subtotal') ||
    get(payload, 'data.attributes.total') ||
    get(payload, 'meta.subtotal') ||
    get(payload, 'meta.total')
  );

  if (amountCents !== null) {
    const standardPrice = Number(process.env.STANDARD_PRICE || 3);
    const nameAddonPrice = Number(process.env.NAME_ADDON_PRICE || 5);
    const standardCents = Number.isFinite(standardPrice) ? Math.round(standardPrice * 100) : 300;
    const addonCents = Number.isFinite(nameAddonPrice) ? Math.round(nameAddonPrice * 100) : 500;
    if (amountCents >= standardCents + addonCents) {
      return true;
    }
  }

  return false;
}

function resolveDisplayNameForTier(payload, tier, requestedName) {
  const normalizedName = cleanString(requestedName);
  if (!normalizedName) {
    return { name: null, nameAddonPaid: false };
  }

  if (tier !== TIERS.STANDARD) {
    return { name: normalizedName, nameAddonPaid: true };
  }

  const nameAddonPaid = resolveNameAddonPaid(payload);
  return {
    name: nameAddonPaid ? normalizedName : null,
    nameAddonPaid
  };
}

function getTierRange(tier) {
  return TIER_RANGES[normalizeTier(tier) || TIERS.STANDARD];
}

async function getNextTokenNumberForTier(client, tier) {
  const range = getTierRange(tier);
  const args = [range.start];
  let sql = `
    SELECT MAX(CAST(SUBSTR(token, 5) AS INTEGER)) AS max_token_number
    FROM tokens
    WHERE token IS NOT NULL
      AND token LIKE 'HAT-%'
      AND CAST(SUBSTR(token, 5) AS INTEGER) >= ?
  `;

  if (range.end !== null) {
    sql += ' AND CAST(SUBSTR(token, 5) AS INTEGER) <= ?';
    args.push(range.end);
  }

  const result = await client.execute({ sql, args });
  const row = result.rows && result.rows.length ? result.rows[0] : null;
  const maxTokenNumber = row && row.max_token_number !== null && row.max_token_number !== undefined
    ? Number(row.max_token_number)
    : null;

  const nextTokenNumber = Number.isFinite(maxTokenNumber) ? maxTokenNumber + 1 : range.start;
  if (range.end !== null && nextTokenNumber > range.end) {
    const error = new Error(`Tier ${tier} is sold out`);
    error.code = 'TIER_SOLD_OUT';
    throw error;
  }

  return nextTokenNumber;
}

function extractWebhookFields(payload) {
  const orderId = (
    get(payload, 'data.id') ||
    get(payload, 'data.attributes.order_id') ||
    get(payload, 'meta.order_id') ||
    get(payload, 'meta.orderId') ||
    get(payload, 'order_id') ||
    get(payload, 'orderId')
  );

  const orderNumber = (
    get(payload, 'data.attributes.order_number') ||
    get(payload, 'meta.order_number') ||
    get(payload, 'meta.orderNumber') ||
    get(payload, 'order_number') ||
    get(payload, 'orderNumber')
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
    orderId: normalizeOrderReference(orderId),
    orderNumber: normalizeOrderReference(orderNumber),
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
  getNextTokenNumberForTier,
  getTierRange,
  normalizeOrderReference,
  normalizeTier,
  resolveDisplayNameForTier,
  resolveNameAddonPaid,
  resolveTierFromPayload,
  readJsonBody,
  readRawBody,
  TIERS,
  verifyWebhookSignature
};
