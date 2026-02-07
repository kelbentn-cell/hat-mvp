const { client } = require('../../lib/turso');
const {
  extractWebhookFields,
  formatCertificateNumber,
  formatToken,
  generateUserIdentifier,
  readRawBody,
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

  const { orderId, email, name } = extractWebhookFields(payload);

  if (!orderId) {
    return res.status(400).json({ error: 'Missing order id' });
  }

  let existing;
  try {
    const lookup = await client.execute({
      sql: 'SELECT token, name, created_at FROM tokens WHERE order_id = ? LIMIT 1',
      args: [orderId]
    });
    existing = lookup.rows && lookup.rows.length ? lookup.rows[0] : null;
  } catch (err) {
    return res.status(500).json({ error: 'Database error' });
  }

  if (existing) {
    return res.json({ ok: true, duplicate: true, token: existing.token, name: existing.name, created_at: existing.created_at });
  }

  const createdAt = new Date().toISOString();
  let inserted;
  let insertError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const userIdentifier = generateUserIdentifier();
    try {
      const insertResult = await client.execute({
        sql: 'INSERT INTO tokens (token, name, order_id, email, created_at, user_identifier, certificate_number) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id, name, created_at, user_identifier',
        args: [null, name, orderId, email, createdAt, userIdentifier, null]
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
      if (message.includes('tokens.order_id') || message.includes('idx_tokens_order')) {
        try {
          const dup = await client.execute({
            sql: 'SELECT token, name, created_at FROM tokens WHERE order_id = ? LIMIT 1',
            args: [orderId]
          });
          const dupRow = dup.rows && dup.rows.length ? dup.rows[0] : null;
          if (dupRow) {
            return res.json({ ok: true, duplicate: true, token: dupRow.token, name: dupRow.name, created_at: dupRow.created_at });
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

  const token = formatToken(inserted.id);
  const certificateNumber = formatCertificateNumber(inserted.id);
  try {
    await client.execute({
      sql: 'UPDATE tokens SET token = ?, certificate_number = ? WHERE id = ?',
      args: [token, certificateNumber, inserted.id]
    });
  } catch (err) {
    return res.status(500).json({ error: 'Database error' });
  }

  return res.json({
    ok: true,
    token,
    name: inserted.name,
    created_at: inserted.created_at,
    certificate_number: certificateNumber,
    user_identifier: inserted.user_identifier
  });
};
