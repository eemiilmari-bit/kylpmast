const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');
const { hashPassword, loadData, saveData, defaultQuestions } = require('./dataStore');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

let data = loadData();
const sessions = {};

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain' });
  res.end(text);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        const parsed = JSON.parse(body);
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function getUserFromToken(req) {
  const token = req.headers['x-session-token'];
  if (!token) return null;
  const userId = sessions[token];
  if (!userId) return null;
  return data.users.find((u) => u.id === userId) || null;
}

function requireAuth(req, res) {
  const user = getUserFromToken(req);
  if (!user) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  if (user.status === 'suspended') {
    sendJson(res, 403, { error: 'Account suspended' });
    return null;
  }
  return user;
}

function addSystemMessage(toUserId, subject, body, meta = {}) {
  data.messages.push({
    id: crypto.randomUUID(),
    toUserId,
    subject,
    body,
    createdAt: Date.now(),
    system: true,
    ...meta
  });
}

function saveAndRespond(res, payload) {
  saveData(data);
  sendJson(res, 200, payload);
}

function isAdmin(user) {
  return user && (user.role === 'admin' || user.role === 'owner');
}

function canModerate(actor, target) {
  if (!actor || !target) return false;
  if (actor.role === 'owner') {
    return target.role !== 'owner';
  }
  if (actor.role === 'admin') {
    return target.role === 'user';
  }
  return false;
}

function serveStatic(res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 404, 'Not found');
    return;
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      sendText(res, 404, 'Not found');
      return;
    }
    const ext = path.extname(filePath);
    const typeMap = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css'
    };
    const contentType = typeMap[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

function sanitizeQuestions(questions) {
  return questions
    .filter((q) => q && q.prompt && Array.isArray(q.options) && q.options.length >= 2)
    .map((q) => ({
      prompt: String(q.prompt).trim(),
      options: q.options.slice(0, 6).map((o) => String(o)),
      correctIndex: Number.isInteger(q.correctIndex) ? q.correctIndex : 0
    }))
    .slice(0, 20);
}

function activeAnnouncements(user) {
  const now = Date.now();
  return data.announcements.filter((a) => {
    if (a.expiresAt < now) return false;
    if (a.audience === 'staff' && !(user && isAdmin(user))) return false;
    return true;
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname, searchParams } = url;

  if (!pathname.startsWith('/api')) {
    serveStatic(res, pathname);
    return;
  }

  try {
    // Registration
    if (req.method === 'POST' && pathname === '/api/register') {
      const body = await parseBody(req);
      const { name, password, profileImage } = body;
      if (!name || !password) {
        sendJson(res, 400, { error: 'Name and password required' });
        return;
      }
      const exists = data.users.find((u) => u.name.toLowerCase() === String(name).toLowerCase());
      if (exists) {
        sendJson(res, 400, { error: 'User already exists' });
        return;
      }
      const user = {
        id: crypto.randomUUID(),
        name: String(name),
        passwordHash: hashPassword(String(password)),
        role: 'user',
        status: 'active',
        avatar: profileImage || null,
        badges: [],
        createdAt: Date.now()
      };
      data.users.push(user);
      addSystemMessage(user.id, 'Welcome to the clown quiz!', 'Thanks for joining the big top. Start a quiz, chat with others, and keep it friendly.');
      const token = crypto.randomUUID();
      sessions[token] = user.id;
      saveAndRespond(res, { token, user: { ...user, passwordHash: undefined } });
      return;
    }

    // Login
    if (req.method === 'POST' && pathname === '/api/login') {
      const body = await parseBody(req);
      const { name, password } = body;
      const user = data.users.find((u) => u.name.toLowerCase() === String(name || '').toLowerCase());
      if (!user || user.passwordHash !== hashPassword(String(password || ''))) {
        sendJson(res, 401, { error: 'Invalid credentials' });
        return;
      }
      if (user.status === 'suspended') {
        sendJson(res, 403, { error: 'Account suspended' });
        return;
      }
      const token = crypto.randomUUID();
      sessions[token] = user.id;
      saveData(data);
      sendJson(res, 200, { token, user: { ...user, passwordHash: undefined } });
      return;
    }

    // Session check
    if (req.method === 'GET' && pathname === '/api/session') {
      const user = getUserFromToken(req);
      if (!user) {
        sendJson(res, 401, { error: 'No session' });
        return;
      }
      sendJson(res, 200, { user: { ...user, passwordHash: undefined } });
      return;
    }

    // Profile picture update
    if (req.method === 'POST' && pathname === '/api/profile-picture') {
      const user = requireAuth(req, res);
      if (!user) return;
      const body = await parseBody(req);
      user.avatar = body.profileImage || null;
      saveAndRespond(res, { success: true, avatar: user.avatar });
      return;
    }

    // Quiz fetch
    if (req.method === 'GET' && pathname === '/api/quiz') {
      sendJson(res, 200, { quiz: data.quiz });
      return;
    }

    // Quiz submit
    if (req.method === 'POST' && pathname === '/api/quiz/submit') {
      const user = requireAuth(req, res);
      if (!user) return;
      const body = await parseBody(req);
      const answers = Array.isArray(body.answers) ? body.answers : [];
      const questions = data.quiz.questions;
      let score = 0;
      questions.forEach((q, idx) => {
        if (answers[idx] === q.correctIndex) score += 1;
      });
      saveData(data);
      sendJson(res, 200, { score, total: questions.length });
      return;
    }

    // Leaderboard
    if (req.method === 'GET' && pathname === '/api/leaderboard') {
      sendJson(res, 200, { leaderboard: data.leaderboard, archive: data.scoreboardArchive });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/leaderboard') {
      const user = requireAuth(req, res);
      if (!user) return;
      const body = await parseBody(req);
      const score = Number(body.score || 0);
      data.leaderboard.push({
        id: crypto.randomUUID(),
        userId: user.id,
        name: user.name,
        score,
        createdAt: Date.now()
      });
      saveAndRespond(res, { success: true });
      return;
    }

    // Messages
    if (req.method === 'GET' && pathname === '/api/messages') {
      const user = requireAuth(req, res);
      if (!user) return;
      const list = data.messages.filter((m) => !m.toUserId || m.toUserId === user.id);
      sendJson(res, 200, { messages: list });
      return;
    }

    // Chat fetch
    if (req.method === 'GET' && pathname === '/api/chat') {
      const recent = data.chat.slice(-80);
      sendJson(res, 200, { messages: recent });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/chat') {
      const user = requireAuth(req, res);
      if (!user) return;
      const body = await parseBody(req);
      const text = String(body.text || '').trim();
      if (!text) {
        sendJson(res, 400, { error: 'Message required' });
        return;
      }
      data.chat.push({
        id: crypto.randomUUID(),
        userId: user.id,
        name: user.name,
        role: user.role,
        text,
        createdAt: Date.now()
      });
      data.chat = data.chat.slice(-400);
      saveAndRespond(res, { success: true });
      return;
    }

    // Moderation
    if (req.method === 'POST' && pathname === '/api/moderate') {
      const actor = requireAuth(req, res);
      if (!actor) return;
      const body = await parseBody(req);
      const targetName = String(body.target || '').toLowerCase();
      const action = body.action === 'restore' ? 'restore' : 'suspend';
      const target = data.users.find((u) => u.name.toLowerCase() === targetName);
      if (!target) {
        sendJson(res, 404, { error: 'User not found' });
        return;
      }
      if (!canModerate(actor, target)) {
        sendJson(res, 403, { error: 'Insufficient rights' });
        return;
      }
      target.status = action === 'restore' ? 'active' : 'suspended';
      addSystemMessage(
        target.id,
        'Moderation notice',
        `${actor.name} set your status to ${target.status}. Stay respectful under the big top!`
      );
      saveAndRespond(res, { success: true, target: { name: target.name, status: target.status } });
      return;
    }

    // Admin promotions
    if (req.method === 'POST' && pathname === '/api/admin/promote') {
      const actor = requireAuth(req, res);
      if (!actor) return;
      if (actor.role !== 'owner') {
        sendJson(res, 403, { error: 'Owner required' });
        return;
      }
      const body = await parseBody(req);
      const target = data.users.find((u) => u.name.toLowerCase() === String(body.target || '').toLowerCase());
      if (!target) {
        sendJson(res, 404, { error: 'User not found' });
        return;
      }
      if (target.role === 'owner') {
        sendJson(res, 400, { error: 'Cannot change owner' });
        return;
      }
      target.role = 'admin';
      addSystemMessage(target.id, 'Admin appointment', `${actor.name} appointed you as an admin. Lead the circus well!`, {
        from: actor.name
      });
      saveAndRespond(res, { success: true });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/admin/demote') {
      const actor = requireAuth(req, res);
      if (!actor) return;
      if (actor.role !== 'owner') {
        sendJson(res, 403, { error: 'Owner required' });
        return;
      }
      const body = await parseBody(req);
      const target = data.users.find((u) => u.name.toLowerCase() === String(body.target || '').toLowerCase());
      if (!target) {
        sendJson(res, 404, { error: 'User not found' });
        return;
      }
      if (target.role === 'owner') {
        sendJson(res, 400, { error: 'Cannot change owner' });
        return;
      }
      target.role = 'user';
      addSystemMessage(target.id, 'Admin role removed', `${actor.name} removed your admin role. Thank you for helping the midway.`, {
        from: actor.name
      });
      saveAndRespond(res, { success: true });
      return;
    }

    // Announcements
    if (req.method === 'POST' && pathname === '/api/announce') {
      const actor = requireAuth(req, res);
      if (!actor) return;
      if (actor.role !== 'owner') {
        sendJson(res, 403, { error: 'Owner required' });
        return;
      }
      const body = await parseBody(req);
      const text = String(body.text || '').trim();
      const audience = body.audience === 'staff' ? 'staff' : 'all';
      if (!text) {
        sendJson(res, 400, { error: 'Announcement text required' });
        return;
      }
      const durationMs = Math.min(20000, Math.max(5000, (body.durationSeconds || 0) * 1000 || text.length * 250));
      data.announcements.push({
        id: crypto.randomUUID(),
        text,
        audience,
        createdAt: Date.now(),
        expiresAt: Date.now() + durationMs
      });
      saveAndRespond(res, { success: true });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/announcements') {
      const user = getUserFromToken(req);
      const current = activeAnnouncements(user);
      sendJson(res, 200, { announcements: current });
      return;
    }

    // Quiz editing
    if (req.method === 'PUT' && pathname === '/api/quiz') {
      const actor = requireAuth(req, res);
      if (!actor) return;
      if (!isAdmin(actor)) {
        sendJson(res, 403, { error: 'Admin rights required' });
        return;
      }
      const body = await parseBody(req);
      const nextQuestions = sanitizeQuestions(body.questions || []);
      if (nextQuestions.length === 0) {
        sendJson(res, 400, { error: 'Provide at least one question' });
        return;
      }
      data.scoreboardArchive.push({
        archivedAt: Date.now(),
        leaderboard: data.leaderboard,
        quiz: data.quiz
      });
      data.leaderboard = [];
      data.quiz = { title: body.title || 'Clown Craft Quiz', questions: nextQuestions };
      saveAndRespond(res, { success: true, quiz: data.quiz });
      return;
    }

    // Fallback
    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: 'Server error', detail: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Clown quiz app running on http://localhost:${PORT}`);
});
