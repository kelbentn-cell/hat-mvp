const { applyCors } = require('../lib/cors');
const { formatCertificateNumber, generateUserIdentifier, readJsonBody } = require('../lib/hat');
const { client } = require('../lib/turso');

function normalize(value) {
  return String(value || '').trim();
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    applyCors(req, res);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  applyCors(req, res);

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const orderId = normalize(body.orderId || body.order_id);
  const email = normalize(body.email).toLowerCase();

  if (!orderId || !email) {
    return res.status(400).json({ error: 'orderId and email are required' });
  }

  let result;
  try {
    result = await client.execute({
      sql: 'SELECT id, token, name, created_at, user_identifier, certificate_number, email FROM tokens WHERE order_id = ? LIMIT 1',
      args: [orderId]
    });
  } catch (err) {
    return res.status(500).json({ error: 'Database error' });
  }

  if (!result.rows || result.rows.length === 0) {
    return res.status(404).json({ error: 'Certificate not found' });
  }

  const row = result.rows[0];
  const storedEmail = normalize(row.email).toLowerCase();
  if (!storedEmail || storedEmail !== email) {
    return res.status(403).json({ error: 'Certificate access denied' });
  }

  let userIdentifier = row.user_identifier;
  let certificateNumber = row.certificate_number;
  if (!userIdentifier || !certificateNumber) {
    userIdentifier = userIdentifier || generateUserIdentifier();
    certificateNumber = certificateNumber || formatCertificateNumber(row.id);
    try {
      await client.execute({
        sql: 'UPDATE tokens SET user_identifier = ?, certificate_number = ? WHERE id = ?',
        args: [userIdentifier, certificateNumber, row.id]
      });
    } catch (err) {
      return res.status(500).json({ error: 'Database error' });
    }
  }

  return res.json({
    valid: true,
    certificate: {
      certificate_number: certificateNumber,
      token: row.token,
      user_identifier: userIdentifier,
      name: row.name,
      created_at: row.created_at
    }
  });
};
