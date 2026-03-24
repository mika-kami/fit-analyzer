/**
 * Vercel serverless function — Strava OAuth token exchange & refresh.
 * Keeps client_secret server-side. POST { code } or { refresh_token, grant_type }.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Vercel may pass body as string or object depending on content-type
  const input = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
  const { code, refresh_token, grant_type } = input;

  const params = new URLSearchParams({
    client_id:     process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
    grant_type:    grant_type || 'authorization_code',
  });

  if (grant_type === 'refresh_token') {
    params.set('refresh_token', refresh_token);
  } else {
    params.set('code', code);
  }

  try {
    const r = await fetch('https://www.strava.com/oauth/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
    });
    const data = await r.json();
    return res.status(r.ok ? 200 : r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
