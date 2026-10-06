// Single shared planner document stored in Netlify Blobs.
// GET  /api/data  -> latest saved state (or null)
// PUT  /api/data  -> { data, baseSavedAt } ; rejects with 409 if someone else saved in between
// Optional: set an EDIT_PIN environment variable in Netlify to require a PIN for saving.
import { getStore } from '@netlify/blobs';

export default async (req) => {
  const store = getStore('kk-planner');
  const current = await store.get('state', { type: 'json' });

  if (req.method === 'GET') {
    return Response.json(current ?? null, { headers: { 'cache-control': 'no-store' } });
  }

  if (req.method === 'PUT') {
    const pin = Netlify.env.get('EDIT_PIN');
    if (pin && req.headers.get('x-edit-pin') !== pin) {
      return new Response('PIN required', { status: 401 });
    }
    const { data, baseSavedAt } = await req.json();
    if (current?.savedAt && baseSavedAt !== current.savedAt) {
      return Response.json(current, { status: 409 });
    }
    const savedAt = new Date().toISOString();
    await store.setJSON('state', { ...data, savedAt });
    return Response.json({ savedAt });
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config = { path: '/api/data' };
