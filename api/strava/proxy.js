/**
 * Vercel serverless function — Strava API proxy.
 * Forwards authenticated requests to https://www.strava.com/api/v3/...
 * Needed because Strava API does not set CORS headers.
 *
 * Usage: GET /api/strava/proxy?path=athlete/activities&page=1&per_page=20
 * Header: Authorization: Bearer <access_token>
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = req.headers.authorization;
  const { path, ...params } = req.query ?? {};

  if (!auth || !path) {
    return res.status(400).json({ error: 'Missing Authorization header or path param' });
  }

  const qs = new URLSearchParams(params).toString();
  const url = `https://www.strava.com/api/v3/${path}${qs ? '?' + qs : ''}`;

  try {
    const r = await fetch(url, { headers: { Authorization: auth } });
    const data = await r.json();
    return res.status(r.ok ? 200 : r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
