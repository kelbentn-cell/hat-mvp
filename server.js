try {
  // Keep .env support when dependency exists, but don't hard-fail local runtime.
  require('dotenv').config();
} catch (err) {
  // no-op
}
const crypto = require('crypto');
const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { buildCertificatePdf } = require('./lib/certificate-pdf');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'hat.db');
const CHECKOUT_URL = process.env.CHECKOUT_URL || '';
const CHECKOUT_URLS = {
  default: CHECKOUT_URL,
  founders: process.env.CHECKOUT_URL_FOUNDERS || '',
  elite: process.env.CHECKOUT_URL_ELITE || '',
  early: process.env.CHECKOUT_URL_EARLY || '',
  mid: process.env.CHECKOUT_URL_MID || '',
  standard: process.env.CHECKOUT_URL_STANDARD || '',
  standard_addon: process.env.CHECKOUT_URL_STANDARD_ADDON || ''
};
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const WEBHOOK_SIGNATURE_HEADER = (process.env.WEBHOOK_SIGNATURE_HEADER || 'x-signature').toLowerCase();
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const NAME_ADDON_PRICE = Number(process.env.NAME_ADDON_PRICE || 5);
const STANDARD_PRICE = Number(process.env.STANDARD_PRICE || 3);
const FOUNDERS_CONTACT_URL = process.env.FOUNDERS_CONTACT_URL || '';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '';
const ALLOWED_ORIGINS = CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE,
      user_identifier TEXT UNIQUE,
      certificate_number TEXT UNIQUE,
      name TEXT,
      order_id TEXT UNIQUE,
      order_number TEXT UNIQUE,
      email TEXT,
      created_at TEXT NOT NULL
    )
  `);
  db.run('ALTER TABLE tokens ADD COLUMN user_identifier TEXT', (err) => {
    if (err && !String(err.message || '').includes('duplicate column name')) {
      console.error('Failed to add user_identifier column:', err.message);
    }
  });
  db.run('ALTER TABLE tokens ADD COLUMN certificate_number TEXT', (err) => {
    if (err && !String(err.message || '').includes('duplicate column name')) {
      console.error('Failed to add certificate_number column:', err.message);
    }
  });
  db.run('ALTER TABLE tokens ADD COLUMN order_number TEXT', (err) => {
    if (err && !String(err.message || '').includes('duplicate column name')) {
      console.error('Failed to add order_number column:', err.message);
    }
  });
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_token ON tokens(token)');
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_user_identifier ON tokens(user_identifier)');
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_certificate_number ON tokens(certificate_number)');
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_order ON tokens(order_id)');
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_order_number ON tokens(order_number)');
});

const app = express();

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.use(express.static(path.join(__dirname)));

function timingSafeEqual(a, b) {
  const aBuf = Buffer.from(a || '', 'utf8');
  const bBuf = Buffer.from(b || '', 'utf8');
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyWebhookSignature(req) {
  if (!WEBHOOK_SECRET) return true;
  const signature = (req.headers[WEBHOOK_SIGNATURE_HEADER] || '').toString();
  if (!signature) return false;
  const rawBody = req.rawBody || Buffer.from('');
  const hmacHex = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
  const hmacBase64 = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('base64');
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/config', (req, res) => {
  applyCors(req, res);
  res.json({
    checkoutUrl: CHECKOUT_URL,
    checkoutUrls: CHECKOUT_URLS,
    foundersContactUrl: FOUNDERS_CONTACT_URL,
    nameAddonPrice: Number.isFinite(NAME_ADDON_PRICE) ? NAME_ADDON_PRICE : 5,
    standardPrice: Number.isFinite(STANDARD_PRICE) ? STANDARD_PRICE : 3
  });
});

app.options('/api/config', (req, res) => {
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

app.post('/api/webhooks/lemonsqueezy', (req, res) => {
  if (!verifyWebhookSignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const payload = req.body || {};
  const { orderId, orderNumber, email, name } = extractWebhookFields(payload);

  if (!orderId) {
    return res.status(400).json({ error: 'Missing order id' });
  }

  db.serialize(() => {
    db.get(
      'SELECT id, token, name, created_at, order_number FROM tokens WHERE order_id = ? OR order_number = ? LIMIT 1',
      [orderId, orderNumber],
      (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (row) {
        if (orderNumber && !row.order_number) {
          return db.run('UPDATE tokens SET order_number = ? WHERE id = ?', [orderNumber, row.id], (updateErr) => {
            if (updateErr) {
              return res.status(500).json({ error: 'Database error' });
            }
            return res.json({ ok: true, duplicate: true, token: row.token, name: row.name, created_at: row.created_at });
          });
        }
        return res.json({ ok: true, duplicate: true, token: row.token, name: row.name, created_at: row.created_at });
      }

      const createdAt = new Date().toISOString();
      const attemptInsert = (attempt = 0) => {
        const userIdentifier = generateUserIdentifier();
        db.run(
          'INSERT INTO tokens (token, user_identifier, certificate_number, name, order_id, order_number, email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [null, userIdentifier, null, name, orderId, orderNumber, email, createdAt],
          function insertCallback(insertErr) {
            if (insertErr) {
              if (insertErr.code === 'SQLITE_CONSTRAINT') {
                const message = String(insertErr.message || '');
                if ((message.includes('user_identifier') || message.includes('idx_tokens_user_identifier')) && attempt < 2) {
                  return attemptInsert(attempt + 1);
                }
                db.get(
                  'SELECT id, token, name, created_at, order_number FROM tokens WHERE order_id = ? OR order_number = ? LIMIT 1',
                  [orderId, orderNumber],
                  (dupErr, dupRow) => {
                  if (dupErr) {
                    return res.status(500).json({ error: 'Database error' });
                  }
                  if (dupRow) {
                    if (orderNumber && !dupRow.order_number) {
                      return db.run('UPDATE tokens SET order_number = ? WHERE id = ?', [orderNumber, dupRow.id], (updateErr) => {
                        if (updateErr) {
                          return res.status(500).json({ error: 'Database error' });
                        }
                        return res.json({ ok: true, duplicate: true, token: dupRow.token, name: dupRow.name, created_at: dupRow.created_at });
                      });
                    }
                    return res.json({ ok: true, duplicate: true, token: dupRow.token, name: dupRow.name, created_at: dupRow.created_at });
                  }
                  return res.status(409).json({ error: 'Duplicate order' });
                  }
                );
                return;
              }
              return res.status(500).json({ error: 'Database error' });
            }

            const id = this.lastID;
            const token = formatToken(id);
            const certificateNumber = formatCertificateNumber(id);

            db.run(
              'UPDATE tokens SET token = ?, certificate_number = ? WHERE id = ?',
              [token, certificateNumber, id],
              (updateErr) => {
                if (updateErr) {
                  return res.status(500).json({ error: 'Database error' });
                }

                return res.json({
                  ok: true,
                  token,
                  name,
                  created_at: createdAt,
                  certificate_number: certificateNumber,
                  user_identifier: userIdentifier
                });
              }
            );
          }
        );
      };

      attemptInsert();
      }
    );
  });
});

app.get('/api/verify', (req, res) => {
  applyCors(req, res);
  const token = String(req.query.token || '').trim().toUpperCase();
  if (!token) {
    return res.json({ valid: false, token: null, name: null, created_at: null });
  }

  db.get('SELECT token, name, created_at FROM tokens WHERE token = ?', [token], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!row) {
      return res.json({ valid: false, token, name: null, created_at: null });
    }

    return res.json({
      valid: true,
      token: row.token,
      name: row.name,
      created_at: row.created_at
    });
  });
});

app.options('/api/verify', (req, res) => {
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

app.post('/api/certificate', (req, res) => {
  applyCors(req, res);
  const orderId = normalizeOrderReference(req.body?.orderId || req.body?.order_id);
  const email = String(req.body?.email || '').trim().toLowerCase();

  if (!orderId || !email) {
    return res.status(400).json({ error: 'orderId and email are required' });
  }

  db.get(
    'SELECT id, token, name, created_at, user_identifier, certificate_number, email FROM tokens WHERE order_id = ? OR order_number = ? LIMIT 1',
    [orderId, orderId],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (!row) {
        return res.status(404).json({ error: 'Certificate not found' });
      }

      const storedEmail = String(row.email || '').trim().toLowerCase();
      if (!storedEmail || storedEmail !== email) {
        return res.status(403).json({ error: 'Certificate access denied' });
      }

      const userIdentifier = row.user_identifier || generateUserIdentifier();
      const certificateNumber = row.certificate_number || formatCertificateNumber(row.id);
      const sendResponse = () => res.json({
        valid: true,
        certificate: {
          certificate_number: certificateNumber,
          token: row.token,
          user_identifier: userIdentifier,
          name: row.name,
          created_at: row.created_at
        }
      });

      if (row.user_identifier && row.certificate_number) {
        return sendResponse();
      }

      return db.run(
        'UPDATE tokens SET user_identifier = ?, certificate_number = ? WHERE id = ?',
        [userIdentifier, certificateNumber, row.id],
        (updateErr) => {
          if (updateErr) {
            return res.status(500).json({ error: 'Database error' });
          }
          return sendResponse();
        }
      );

    }
  );
});

app.options('/api/certificate', (req, res) => {
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

app.post('/api/certificate-pdf', (req, res) => {
  applyCors(req, res);
  const orderId = normalizeOrderReference(req.body?.orderId || req.body?.order_id);
  const email = String(req.body?.email || '').trim().toLowerCase();

  if (!orderId || !email) {
    return res.status(400).json({ error: 'orderId and email are required' });
  }

  db.get(
    'SELECT id, token, name, created_at, user_identifier, certificate_number, email FROM tokens WHERE order_id = ? OR order_number = ? LIMIT 1',
    [orderId, orderId],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (!row) {
        return res.status(404).json({ error: 'Certificate not found' });
      }

      const storedEmail = String(row.email || '').trim().toLowerCase();
      if (!storedEmail || storedEmail !== email) {
        return res.status(403).json({ error: 'Certificate access denied' });
      }

      const userIdentifier = row.user_identifier || generateUserIdentifier();
      const certificateNumber = row.certificate_number || formatCertificateNumber(row.id);
      const certificate = {
        certificate_number: certificateNumber,
        token: row.token,
        user_identifier: userIdentifier,
        name: row.name,
        created_at: row.created_at
      };

      const sendPdf = async () => {
        try {
          const pdfBuffer = await buildCertificatePdf(certificate);
          const fileName = String(certificateNumber || 'hat-certificate').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename=\"${fileName}.pdf\"`);
          return res.status(200).end(pdfBuffer);
        } catch (pdfErr) {
          return res.status(500).json({ error: 'PDF generation failed' });
        }
      };

      if (row.user_identifier && row.certificate_number) {
        sendPdf();
        return;
      }

      db.run(
        'UPDATE tokens SET user_identifier = ?, certificate_number = ? WHERE id = ?',
        [userIdentifier, certificateNumber, row.id],
        (updateErr) => {
          if (updateErr) {
            return res.status(500).json({ error: 'Database error' });
          }
          sendPdf();
        }
      );
    }
  );
});

app.options('/api/certificate-pdf', (req, res) => {
  applyCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

app.get('/api/admin/tokens', (req, res) => {
  const key = req.headers['x-admin-key'];
  if (!ADMIN_KEY || key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  db.all(
    'SELECT id, token, user_identifier, certificate_number, name, order_id, order_number, email, created_at FROM tokens ORDER BY id DESC LIMIT 200',
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      return res.json({ tokens: rows || [] });
    }
  );
});

app.listen(PORT, () => {
  console.log(`HAT server running on port ${PORT}`);
});
