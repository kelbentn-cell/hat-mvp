const { client } = require('../../lib/turso');

const ADMIN_KEY = process.env.ADMIN_KEY || '';

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = req.headers['x-admin-key'];
  if (!ADMIN_KEY || key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let result;
  try {
    result = await client.execute({
      sql: 'SELECT id, token, user_identifier, certificate_number, name, order_id, order_number, email, created_at FROM tokens ORDER BY id DESC LIMIT 200',
      args: []
    });
  } catch (err) {
    return res.status(500).json({ error: 'Database error' });
  }

  return res.json({ tokens: result.rows || [] });
};
