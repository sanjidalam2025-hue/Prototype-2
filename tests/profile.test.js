import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, stopServer } from '../server.js';

test('user profile can be saved and retrieved', async () => {
  const server = await startServer(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    const email = `profile-${Date.now()}@example.com`;
    const register = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'securepass123' })
    });
    const auth = await register.json();

    const profile = await fetch(`${base}/api/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`
      },
      body: JSON.stringify({
        values: 'Growth, focus, honesty',
        strengths: 'Persistence, learning quickly',
        barriers: 'Overcommitting, perfectionism',
        dream: 'Build a balanced creative career'
      })
    });

    assert.equal(profile.status, 200);
    const data = await profile.json();
    assert.equal(data.profile.values, 'Growth, focus, honesty');

    const fetchProfile = await fetch(`${base}/api/profile`, {
      headers: { Authorization: `Bearer ${auth.token}` }
    });
    const fetched = await fetchProfile.json();
    assert.equal(fetched.profile.dream, 'Build a balanced creative career');
  } finally {
    await stopServer(server);
  }
});

test('profile API rejects unauthenticated access', async () => {
  const server = await startServer(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    const response = await fetch(`${base}/api/profile`);
    assert.equal(response.status, 401);
  } finally {
    await stopServer(server);
  }
});
