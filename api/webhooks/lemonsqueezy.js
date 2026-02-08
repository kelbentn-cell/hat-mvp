const { client } = require('../../lib/turso');
const {
  extractWebhookFields,
  formatCertificateNumber,
  formatToken,
  generateUserIdentifier,
  getNextTokenNumberForTier,
  readRawBody,
  resolveTierFromPayload,
  verifyWebhookSignature
} = require('../../lib/hat');

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const WEBHOOK_SIGNATURE_HEADER = (process.env.WEBHOOK_SIGNATURE_HEADER || 'x-signature').toLowerCase();

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = await readRawBody(req);
  const signature = (req.headers[WEBHOOK_SIGNATURE_HEADER] || '').toString();

  if (!verifyWebhookSignature(rawBody, signature, WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload = {};
  try {
    payload = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {};
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { orderId, orderNumber, email, name } = extractWebhookFields(payload);
  const tier = resolveTierFromPayload(payload);

  if (!orderId) {
    return res.status(400).json({ error: 'Missing order id' });
  }

  let existing;
  try {
    const lookup = await client.execute({
      sql: 'SELECT id, token, name, created_at, order_number FROM tokens WHERE order_id = ? OR order_number = ? LIMIT 1',
      args: [orderId, orderNumber]
    });
    existing = lookup.rows && lookup.rows.length ? lookup.rows[0] : null;
  } catch (err) {
    return res.status(500).json({ error: 'Database error' });
  }

  if (existing) {
    if (orderNumber && !existing.order_number) {
      try {
        await client.execute({
          sql: 'UPDATE tokens SET order_number = ? WHERE id = ?',
          args: [orderNumber, existing.id]
        });
      } catch (err) {
        return res.status(500).json({ error: 'Database error' });
      }
    }
    return res.json({
      ok: true,
      duplicate: true,
      token: existing.token,
      name: existing.name,
      created_at: existing.created_at,
      tier
    });
  }

  const createdAt = new Date().toISOString();
  let inserted;
  let insertError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const userIdentifier = generateUserIdentifier();
    try {
      const insertResult = await client.execute({
        sql: 'INSERT INTO tokens (token, name, order_id, order_number, email, created_at, user_identifier, certificate_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, name, created_at, user_identifier',
        args: [null, name, orderId, orderNumber, email, createdAt, userIdentifier, null]
      });
      inserted = insertResult.rows && insertResult.rows.length ? insertResult.rows[0] : null;
      insertError = null;
      break;
    } catch (err) {
      insertError = err;
      const message = String(err.message || '');
      if (!message.includes('SQLITE_CONSTRAINT')) {
        break;
      }
      if (
        message.includes('tokens.order_id') ||
        message.includes('idx_tokens_order') ||
        message.includes('tokens.order_number') ||
        message.includes('idx_tokens_order_number')
      ) {
        try {
          const dup = await client.execute({
            sql: 'SELECT id, token, name, created_at, order_number FROM tokens WHERE order_id = ? OR order_number = ? LIMIT 1',
            args: [orderId, orderNumber]
          });
          const dupRow = dup.rows && dup.rows.length ? dup.rows[0] : null;
          if (dupRow) {
            if (orderNumber && !dupRow.order_number) {
              try {
                await client.execute({
                  sql: 'UPDATE tokens SET order_number = ? WHERE id = ?',
                  args: [orderNumber, dupRow.id]
                });
              } catch (updateErr) {
                return res.status(500).json({ error: 'Database error' });
              }
            }
            return res.json({
              ok: true,
              duplicate: true,
              token: dupRow.token,
              name: dupRow.name,
              created_at: dupRow.created_at,
              tier
            });
          }
        } catch (dupErr) {
          return res.status(500).json({ error: 'Database error' });
        }
        return res.status(409).json({ error: 'Duplicate order' });
      }
      if (!message.includes('tokens.user_identifier') && !message.includes('idx_tokens_user_identifier')) {
        break;
      }
    }
  }

  if (insertError) {
    return res.status(500).json({ error: 'Database error' });
  }

  if (!inserted || inserted.id === undefined || inserted.id === null) {
    return res.status(500).json({ error: 'Database error' });
  }

  const certificateNumber = formatCertificateNumber(inserted.id);
  let token = null;
  let issuedTokenNumber = null;
  let assigned = false;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      issuedTokenNumber = await getNextTokenNumberForTier(client, tier);
      token = formatToken(issuedTokenNumber);
      await client.execute({
        sql: 'UPDATE tokens SET token = ?, certificate_number = ? WHERE id = ?',
        args: [token, certificateNumber, inserted.id]
      });
      assigned = true;
      break;
    } catch (err) {
      if (err && err.code === 'TIER_SOLD_OUT') {
        return res.status(409).json({ error: `Tier ${tier} is sold out` });
      }
      const message = String(err.message || '');
      if (message.includes('tokens.token') || message.includes('idx_tokens_token')) {
        continue;
      }
      return res.status(500).json({ error: 'Database error' });
    }
  }

  if (!assigned || !token) {
    return res.status(500).json({ error: 'Could not allocate token number' });
  }

  return res.json({
    ok: true,
    token,
    token_number: issuedTokenNumber,
    tier,
    name: inserted.name,
    created_at: inserted.created_at,
    certificate_number: certificateNumber,
    user_identifier: inserted.user_identifier
  });
};
