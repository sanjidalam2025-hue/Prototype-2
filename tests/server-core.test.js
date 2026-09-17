import test from 'node:test';
import assert from 'node:assert/strict';
import { app, stopServer, startServer } from '../server.js';

test('register/login flow creates a user and returns goals for the authenticated user only', async () => {
  const server = await startServer(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    const emailA = `a-${Date.now()}@example.com`;
    const emailB = `b-${Date.now()}@example.com`;

    const regA = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailA, password: 'securepass123' })
    });
    assert.equal(regA.status, 201);
    const userA = await regA.json();

    const regB = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailB, password: 'securepass123' })
    });
    assert.equal(regB.status, 201);
    const userB = await regB.json();

    const goalA = await fetch(`${base}/api/goals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA.token}`
      },
      body: JSON.stringify({ title: 'Write a primer', action: 'Draft 150 words', milestones: ['Outline', 'Draft'] })
    });
    assert.equal(goalA.status, 201);

    const goalB = await fetch(`${base}/api/goals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userB.token}`
      },
      body: JSON.stringify({ title: 'Learn CSS', action: 'Read 10 pages', milestones: ['Summarize'] })
    });
    assert.equal(goalB.status, 201);

    const listA = await fetch(`${base}/api/goals`, {
      headers: { Authorization: `Bearer ${userA.token}` }
    });
    const listAJson = await listA.json();
    const listB = await fetch(`${base}/api/goals`, {
      headers: { Authorization: `Bearer ${userB.token}` }
    });
    const listBJson = await listB.json();

    assert.equal(listA.status, 200);
    assert.equal(listB.status, 200);
    assert.equal(listAJson.goals.length, 1);
    assert.equal(listBJson.goals.length, 1);
    assert.equal(listAJson.goals[0].title, 'Write a primer');
    assert.equal(listBJson.goals[0].title, 'Learn CSS');
  } finally {
    await stopServer(server);
  }
});

test('duplicate completion requests are idempotent for the same day', async () => {
  const server = await startServer(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    const email = `dupe-${Date.now()}@example.com`;
    const reg = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'securepass123' })
    });
    const auth = await reg.json();

    const createGoal = await fetch(`${base}/api/goals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`
      },
      body: JSON.stringify({ title: 'Finish read-through', action: 'Read for 15 minutes' })
    });
    const goal = await createGoal.json();

    const first = await fetch(`${base}/api/goals/${goal.goal.id}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}` }
    });
    const firstJson = await first.json();
    assert.equal(first.status, 200);
    assert.equal(firstJson.duplicate, false);

    const second = await fetch(`${base}/api/goals/${goal.goal.id}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}` }
    });
    const secondJson = await second.json();
    assert.equal(second.status, 200);
    assert.equal(secondJson.duplicate, true);
  } finally {
    await stopServer(server);
  }
});

test('unauthorized access is rejected for missing or invalid token', async () => {
  const server = await startServer(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    const missing = await fetch(`${base}/api/goals`);
    assert.equal(missing.status, 401);

    const invalid = await fetch(`${base}/api/goals`, {
      headers: { Authorization: 'Bearer invalid.token.here' }
    });
    assert.equal(invalid.status, 401);
  } finally {
    await stopServer(server);
  }
});
