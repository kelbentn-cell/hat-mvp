const { createClient } = require('@libsql/client');

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL || '';
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || '';

if (!TURSO_DATABASE_URL) {
  console.warn('Turso database URL is missing.');
}

const client = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN || undefined
});

module.exports = {
  client
};
