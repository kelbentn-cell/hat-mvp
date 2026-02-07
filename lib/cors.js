const CORS_ORIGIN = process.env.CORS_ORIGIN || '';
const ALLOWED_ORIGINS = CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

function applyCors(req, res) {
  const origin = req.headers.origin;

  if (!origin) {
    if (ALLOWED_ORIGINS.length === 0) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    return;
  }

  if (ALLOWED_ORIGINS.length === 0) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return;
  }

  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
}

module.exports = {
  applyCors
};
