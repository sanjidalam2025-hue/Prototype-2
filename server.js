import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const dbDir = path.join(__dirname, 'data');
fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.join(dbDir, 'ascent.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    "values" TEXT,
    strengths TEXT,
    barriers TEXT,
    dream TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    why TEXT,
    action TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS action_events (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    day_key TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(goal_id, day_key),
    FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
  CREATE INDEX IF NOT EXISTS idx_milestones_goal_id ON milestones(goal_id);
  CREATE INDEX IF NOT EXISTS idx_action_events_user ON action_events(user_id);
`);

const authCookieName = 'ascent_token';

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function parseAuthRequest(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies?.[authCookieName] || null;
}

function requireAuth(req, res, next) {
  const token = parseAuthRequest(req);
  if (!token) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(payload.sub);
    if (!user) return res.status(401).json({ error: 'Session user no longer exists.' });
    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function serializeGoal(goal, milestones = []) {
  const completedMilestones = milestones.filter((item) => item.done).length;
  const totalMilestones = milestones.length;
  const progress = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

  return {
    id: goal.id,
    title: goal.title,
    why: goal.why || '',
    action: goal.action,
    status: goal.status,
    progress,
    completedMilestones,
    totalMilestones,
    createdAt: goal.created_at,
    updatedAt: goal.updated_at,
    milestones: milestones.map((item) => ({
      id: item.id,
      title: item.title,
      done: Boolean(item.done),
      sortOrder: item.sort_order,
    })),
  };
}

function listGoalsForUser(userId) {
  const goals = db.prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  const rows = db.prepare('SELECT * FROM milestones WHERE goal_id IN (SELECT id FROM goals WHERE user_id = ?) ORDER BY goal_id, sort_order, created_at').all(userId);
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.goal_id)) grouped.set(row.goal_id, []);
    grouped.get(row.goal_id).push(row);
  }

  return goals.map((goal) => serializeGoal(goal, grouped.get(goal.id) || []));
}

function findGoalForUser(userId, goalId) {
  const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(goalId, userId);
  if (!goal) return null;
  const milestones = db.prepare('SELECT * FROM milestones WHERE goal_id = ? ORDER BY sort_order, created_at').all(goalId);
  return serializeGoal(goal, milestones);
}

function getProfileForUser(userId) {
  return db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId) || null;
}

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.post('/api/auth/register', (req, res) => {
  const emailRaw = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const passwordRaw = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!emailRaw || !passwordRaw || passwordRaw.length < 8) {
    return res.status(400).json({ error: 'Provide an email and a password with at least 8 characters.' });
  }

  if (db.prepare('SELECT id FROM users WHERE email = ?').get(emailRaw)) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const id = randomUUID();
  db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').run(id, emailRaw, bcrypt.hashSync(passwordRaw, 12));
  const user = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(id);
  const token = signToken(user);

  res.cookie(authCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });

  return res.status(201).json({ token, user: { id: user.id, email: user.email, createdAt: user.created_at } });
});

app.post('/api/auth/login', (req, res) => {
  const emailRaw = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const passwordRaw = typeof req.body?.password === 'string' ? req.body.password : '';

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(emailRaw);
  if (!user || !bcrypt.compareSync(passwordRaw, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const token = signToken(user);
  res.cookie(authCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });

  return res.json({ token, user: { id: user.id, email: user.email, createdAt: user.created_at } });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(authCookieName, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  return res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/profile', requireAuth, (req, res) => {
  const profile = getProfileForUser(req.user.id);
  return res.json({ profile });
});

app.post('/api/profile', requireAuth, (req, res) => {
  const values = typeof req.body?.values === 'string' ? req.body.values.trim() : '';
  const strengths = typeof req.body?.strengths === 'string' ? req.body.strengths.trim() : '';
  const barriers = typeof req.body?.barriers === 'string' ? req.body.barriers.trim() : '';
  const dream = typeof req.body?.dream === 'string' ? req.body.dream.trim() : '';

  if (!values && !strengths && !barriers && !dream) {
    return res.status(400).json({ error: 'Add at least one profile detail.' });
  }

  const existing = getProfileForUser(req.user.id);
  const now = new Date().toISOString();

  if (existing) {
    db.prepare('UPDATE profiles SET "values" = ?, strengths = ?, barriers = ?, dream = ?, updated_at = ? WHERE user_id = ?')
      .run(values || existing.values || '', strengths || existing.strengths || '', barriers || existing.barriers || '', dream || existing.dream || '', now, req.user.id);
  } else {
    db.prepare('INSERT INTO profiles (id, user_id, "values", strengths, barriers, dream, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), req.user.id, values, strengths, barriers, dream, now, now);
  }

  return res.json({ profile: getProfileForUser(req.user.id) });
});

app.get('/api/goals', requireAuth, (req, res) => {
  return res.json({ goals: listGoalsForUser(req.user.id) });
});

app.post('/api/goals', requireAuth, (req, res) => {
  const title = String(req.body?.title || '').trim();
  const why = String(req.body?.why || '').trim();
  const action = String(req.body?.action || '').trim();
  const milestonesInput = Array.isArray(req.body?.milestones) ? req.body.milestones : [];

  if (!title || !action) {
    return res.status(400).json({ error: 'Goals require a title and a next action.' });
  }

  const goalId = randomUUID();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO goals (id, user_id, title, why, action, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(goalId, req.user.id, title, why || null, action, 'active', now, now);

  const milestoneRows = milestonesInput
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((text, index) => ({ id: randomUUID(), title: text, order: index }));

  if (milestoneRows.length) {
    const insert = db.prepare('INSERT INTO milestones (id, goal_id, title, sort_order) VALUES (?, ?, ?, ?)');
    for (const item of milestoneRows) {
      insert.run(item.id, goalId, item.title, item.order);
    }
  }

  return res.status(201).json({ goal: findGoalForUser(req.user.id, goalId) });
});

app.patch('/api/goals/:goalId', requireAuth, (req, res) => {
  const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(req.params.goalId, req.user.id);
  if (!goal) return res.status(404).json({ error: 'Goal not found.' });

  const updateFields = [];
  const values = [];

  if (typeof req.body?.title === 'string') {
    updateFields.push('title = ?');
    values.push(String(req.body.title).trim());
  }
  if (typeof req.body?.why === 'string') {
    updateFields.push('why = ?');
    values.push(String(req.body.why).trim());
  }
  if (typeof req.body?.action === 'string') {
    updateFields.push('action = ?');
    values.push(String(req.body.action).trim());
  }
  if (typeof req.body?.status === 'string') {
    const status = req.body.status;
    if (!['active', 'paused', 'abandoned'].includes(status)) {
      return res.status(400).json({ error: 'Unsupported goal status.' });
    }
    updateFields.push('status = ?');
    values.push(status);
  }

  if (!updateFields.length) {
    return res.status(400).json({ error: 'No valid goal changes provided.' });
  }

  values.push(new Date().toISOString(), req.params.goalId, req.user.id);
  db.prepare(`UPDATE goals SET ${updateFields.join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`).run(...values);
  return res.json({ goal: findGoalForUser(req.user.id, req.params.goalId) });
});

app.post('/api/goals/:goalId/complete', requireAuth, (req, res) => {
  const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(req.params.goalId, req.user.id);
  if (!goal) return res.status(404).json({ error: 'Goal not found.' });

  const dayKey = todayKey();
  const existing = db.prepare('SELECT * FROM action_events WHERE goal_id = ? AND user_id = ? AND day_key = ?').get(req.params.goalId, req.user.id, dayKey);
  if (existing) {
    return res.json({ goal: findGoalForUser(req.user.id, req.params.goalId), completed: true, duplicate: true });
  }

  db.prepare('INSERT INTO action_events (id, goal_id, user_id, day_key) VALUES (?, ?, ?, ?)')
    .run(randomUUID(), req.params.goalId, req.user.id, dayKey);

  return res.json({ goal: findGoalForUser(req.user.id, req.params.goalId), completed: true, duplicate: false });
});

app.patch('/api/goals/:goalId/milestones/:milestoneId', requireAuth, (req, res) => {
  const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(req.params.goalId, req.user.id);
  if (!goal) return res.status(404).json({ error: 'Goal not found.' });

  const milestone = db.prepare('SELECT * FROM milestones WHERE id = ? AND goal_id = ?').get(req.params.milestoneId, req.params.goalId);
  if (!milestone) return res.status(404).json({ error: 'Milestone not found.' });

  const done = Boolean(req.body?.done);
  db.prepare('UPDATE milestones SET done = ? WHERE id = ? AND goal_id = ?').run(done ? 1 : 0, req.params.milestoneId, req.params.goalId);
  return res.json({ goal: findGoalForUser(req.user.id, req.params.goalId) });
});

app.post('/api/goals/:goalId/recover', requireAuth, (req, res) => {
  const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(req.params.goalId, req.user.id);
  if (!goal) return res.status(404).json({ error: 'Goal not found.' });

  const nextAction = typeof req.body?.nextAction === 'string' ? req.body.nextAction.trim() : '';
  if (!nextAction) {
    return res.status(400).json({ error: 'A replacement minimum action is required.' });
  }

  db.prepare('UPDATE goals SET action = ?, status = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(`Minimum version: ${nextAction}`, 'active', new Date().toISOString(), req.params.goalId, req.user.id);

  return res.json({ goal: findGoalForUser(req.user.id, req.params.goalId) });
});

app.use(express.static(__dirname));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'index.html'));
});

export function startServer(port = PORT) {
  return new Promise((resolve) => {
    const server = app.listen(port, () => resolve(server));
  });
}

export function stopServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

export { app, db };

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  startServer(PORT).then((server) => {
    console.log(`Ascent API listening on http://localhost:${server.address().port}`);
  });
}
