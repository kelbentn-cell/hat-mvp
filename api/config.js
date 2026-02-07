const { applyCors } = require('../lib/cors');

const CHECKOUT_URL = process.env.CHECKOUT_URL || '';
const CHECKOUT_URLS = {
  default: CHECKOUT_URL,
  founders: process.env.CHECKOUT_URL_FOUNDERS || '',
  elite: process.env.CHECKOUT_URL_ELITE || '',
  early: process.env.CHECKOUT_URL_EARLY || '',
  mid: process.env.CHECKOUT_URL_MID || '',
  standard: process.env.CHECKOUT_URL_STANDARD || ''
};

const NAME_ADDON_PRICE = Number(process.env.NAME_ADDON_PRICE || 5);
const STANDARD_PRICE = Number(process.env.STANDARD_PRICE || 3);

module.exports = (req, res) => {
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
  return res.json({
    checkoutUrl: CHECKOUT_URL,
    checkoutUrls: CHECKOUT_URLS,
    nameAddonPrice: Number.isFinite(NAME_ADDON_PRICE) ? NAME_ADDON_PRICE : 5,
    standardPrice: Number.isFinite(STANDARD_PRICE) ? STANDARD_PRICE : 3
  });
};
