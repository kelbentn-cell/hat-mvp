const { applyCors } = require('../lib/cors');
const { client } = require('../lib/turso');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    applyCors(req, res);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  applyCors(req, res);

  const token = String(req.query.token || '').trim().toUpperCase();
  if (!token) {
    return res.json({ valid: false, token: null, name: null, created_at: null });
  }

  let result;
  try {
    result = await client.execute({
      sql: 'SELECT token, name, created_at FROM tokens WHERE token = ? LIMIT 1',
      args: [token]
    });
  } catch (err) {
    return res.status(500).json({ error: 'Database error' });
  }

  if (!result.rows || result.rows.length === 0) {
    return res.json({ valid: false, token, name: null, created_at: null });
  }

  const row = result.rows[0];
  return res.json({
    valid: true,
    token: row.token,
    name: row.name,
    created_at: row.created_at
  });
};
