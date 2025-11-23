const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const methodOverride = require('method-override');
const { init, run, get, all, currentVersion } = require('./db');

const app = express();
const uploadPath = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}
const upload = multer({ dest: uploadPath });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));

app.use(
  session({
    secret: 'clown-quiz-secret',
    resave: false,
    saveUninitialized: false,
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: './data' })
  })
);

app.use(async (req, res, next) => {
  if (req.session.userId) {
    const user = await get('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    req.user = user;
  }
  res.locals.currentUser = req.user;
  next();
});

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.redirect('/auth');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'Owner')) {
    return res.redirect('/');
  }
  next();
}

function requireOwner(req, res, next) {
  if (!req.user || req.user.role !== 'Owner') {
    return res.redirect('/');
  }
  next();
}

function addSystemMessage(userId, title, body, type) {
  return run('INSERT INTO system_messages (userId, title, body, type, createdAt) VALUES (?, ?, ?, ?, ?)', [
    userId,
    title,
    body,
    type,
    Date.now()
  ]);
}

function userBadge(role) {
  if (role === 'Owner') return 'owner';
  if (role === 'Admin') return 'admin';
  return 'user';
}

app.get('/', async (req, res) => {
  res.render('home', { title: 'Clown Quiz' });
});

app.get('/auth', (req, res) => {
  res.render('auth', { title: 'Register / Login', error: null });
});

app.post('/auth/register', upload.single('avatar'), async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) {
    return res.render('auth', { title: 'Register / Login', error: 'Name and password required.' });
  }
  const existing = await get('SELECT * FROM users WHERE name = ?', [name]);
  if (existing) {
    return res.render('auth', { title: 'Register / Login', error: 'Name already taken.' });
  }
  const hashed = await bcrypt.hash(password, 10);
  const avatar = req.file ? `/uploads/${path.basename(req.file.path)}` : null;
  const result = await run('INSERT INTO users (name, password, role, status, avatar, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [
    name,
    hashed,
    'User',
    'active',
    avatar,
    Date.now()
  ]);
  const userId = result.lastID;
  await addSystemMessage(userId, 'Welcome to Clown Quiz', 'Thanks for joining! Start the quiz, chat with others, and check the leaderboard.', 'welcome');
  req.session.userId = userId;
  res.redirect('/dashboard');
});

app.post('/auth/login', async (req, res) => {
  const { name, password } = req.body;
  const user = await get('SELECT * FROM users WHERE name = ?', [name]);
  if (!user) {
    return res.render('auth', { title: 'Register / Login', error: 'User not found.' });
  }
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.render('auth', { title: 'Register / Login', error: 'Invalid password.' });
  }
  if (user.status === 'banned') {
    return res.render('auth', { title: 'Register / Login', error: 'Account is banned.' });
  }
  req.session.userId = user.id;
  res.redirect('/dashboard');
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.get('/dashboard', requireAuth, async (req, res) => {
  const messages = await all('SELECT * FROM system_messages WHERE userId = ? ORDER BY createdAt DESC LIMIT 3', [req.user.id]);
  const announcement = await get('SELECT * FROM announcements WHERE active = 1 ORDER BY createdAt DESC LIMIT 1');
  res.render('dashboard', { title: 'Dashboard', messages, announcement, dismissed: req.session.dismissedAnnouncement });
});

app.post('/dashboard/profile', requireAuth, upload.single('avatar'), async (req, res) => {
  const { password } = req.body;
  let avatarPath = req.user.avatar;
  if (req.file) {
    avatarPath = `/uploads/${path.basename(req.file.path)}`;
  }
  if (password) {
    const hashed = await bcrypt.hash(password, 10);
    await run('UPDATE users SET password = ?, avatar = ? WHERE id = ?', [hashed, avatarPath, req.user.id]);
  } else {
    await run('UPDATE users SET avatar = ? WHERE id = ?', [avatarPath, req.user.id]);
  }
  res.redirect('/dashboard');
});

app.post('/announcement/dismiss', requireAuth, (req, res) => {
  req.session.dismissedAnnouncement = true;
  res.redirect('/dashboard');
});

app.get('/quiz', requireAuth, async (req, res) => {
  const version = await currentVersion();
  const questions = await all('SELECT * FROM quiz_questions WHERE version = ?', [version]);
  const index = parseInt(req.query.step || '0', 10);
  if (!req.session.quiz || req.session.quiz.version !== version) {
    req.session.quiz = { version, answers: {} };
  }
  const question = questions[index];
  const total = questions.length;
  res.render('quiz', {
    title: 'Quiz',
    questions,
    question,
    index,
    total,
    answers: req.session.quiz.answers
  });
});

app.post('/quiz/answer', requireAuth, async (req, res) => {
  const { index, answer } = req.body;
  const version = await currentVersion();
  if (!req.session.quiz || req.session.quiz.version !== version) {
    req.session.quiz = { version, answers: {} };
  }
  req.session.quiz.answers[index] = answer || '';
  const next = parseInt(index, 10) + 1;
  const questions = await all('SELECT COUNT(*) as count FROM quiz_questions WHERE version = ?', [version]);
  if (next >= questions[0].count) {
    res.redirect('/quiz/result');
  } else {
    res.redirect(`/quiz?step=${next}`);
  }
});

app.get('/quiz/result', requireAuth, async (req, res) => {
  const version = await currentVersion();
  const questions = await all('SELECT * FROM quiz_questions WHERE version = ?', [version]);
  const answers = req.session.quiz?.answers || {};
  let correct = 0;
  questions.forEach((q, idx) => {
    const expected = q.answer.trim().toLowerCase();
    const given = (answers[idx] || '').trim().toLowerCase();
    if (expected === given) correct += 1;
  });
  const percentage = Math.round((correct / questions.length) * 100);
  req.session.quizResult = { score: correct, total: questions.length, percentage, version };
  res.render('quizResult', { title: 'Quiz Result', summary: req.session.quizResult });
});

app.post('/quiz/leaderboard', requireAuth, async (req, res) => {
  const summary = req.session.quizResult;
  if (!summary) return res.redirect('/quiz');
  await run('INSERT INTO attempts (userId, score, total, percentage, version, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [
    req.user.id,
    summary.score,
    summary.total,
    summary.percentage,
    summary.version,
    Date.now()
  ]);
  res.redirect('/leaderboard');
});

app.post('/quiz/skip-leaderboard', requireAuth, (req, res) => {
  req.session.quizResult = null;
  res.redirect('/dashboard');
});

app.get('/leaderboard', requireAuth, async (req, res) => {
  const version = await currentVersion();
  const archivedVersions = await all('SELECT DISTINCT version FROM archived_leaderboards ORDER BY version DESC');
  const viewVersion = req.query.version ? parseInt(req.query.version, 10) : version;
  let entries;
  let archived = false;
  if (viewVersion === version) {
    entries = await all(
      `SELECT attempts.*, users.name, users.avatar FROM attempts
       JOIN users ON users.id = attempts.userId
       WHERE attempts.version = ?
       ORDER BY attempts.score DESC, attempts.createdAt ASC`,
      [version]
    );
  } else {
    archived = true;
    entries = await all(
      'SELECT * FROM archived_leaderboards WHERE version = ? ORDER BY score DESC, createdAt ASC',
      [viewVersion]
    );
  }
  res.render('leaderboard', { title: 'Leaderboard', entries, version, archivedVersions, viewVersion, archived });
});

app.get('/chat', requireAuth, async (req, res) => {
  const messages = await all(
    `SELECT chat_messages.*, users.name, users.role, users.avatar FROM chat_messages
     JOIN users ON users.id = chat_messages.userId
     ORDER BY chat_messages.createdAt DESC LIMIT 30`
  );
  res.render('chat', { title: 'Chat', messages });
});

app.post('/chat', requireAuth, async (req, res) => {
  if (req.user.status === 'muted') {
    return res.redirect('/chat');
  }
  const content = (req.body.content || '').trim();
  if (content) {
    await run('INSERT INTO chat_messages (userId, content, createdAt) VALUES (?, ?, ?)', [
      req.user.id,
      content,
      Date.now()
    ]);
  }
  res.redirect('/chat');
});

app.post('/chat/delete/:id', requireAdmin, async (req, res) => {
  await run('DELETE FROM chat_messages WHERE id = ?', [req.params.id]);
  res.redirect('/chat');
});

app.post('/chat/mute/:userId', requireAdmin, async (req, res) => {
  const target = await get('SELECT * FROM users WHERE id = ?', [req.params.userId]);
  if (!target) return res.redirect('/chat');
  if (target.role === 'Owner') return res.redirect('/chat');
  if (target.role === 'Admin' && req.user.role !== 'Owner') return res.redirect('/chat');
  await run('UPDATE users SET status = ? WHERE id = ?', ['muted', target.id]);
  await addSystemMessage(target.id, 'Chat moderation', `${req.user.name} (${req.user.role}) muted you in chat.`, 'moderation');
  res.redirect('/chat');
});

app.post('/chat/unmute/:userId', requireAdmin, async (req, res) => {
  await run('UPDATE users SET status = ? WHERE id = ?', ['active', req.params.userId]);
  res.redirect('/chat');
});

app.post('/chat/ban/:userId', requireAdmin, async (req, res) => {
  const target = await get('SELECT * FROM users WHERE id = ?', [req.params.userId]);
  if (!target) return res.redirect('/chat');
  if (target.role === 'Owner') return res.redirect('/chat');
  if (target.role === 'Admin' && req.user.role !== 'Owner') return res.redirect('/chat');
  await run('UPDATE users SET status = ? WHERE id = ?', ['banned', target.id]);
  await addSystemMessage(target.id, 'Account banned', `${req.user.name} (${req.user.role}) banned your account.`, 'moderation');
  res.redirect('/chat');
});

app.get('/messages', requireAuth, async (req, res) => {
  const messages = await all('SELECT * FROM system_messages WHERE userId = ? ORDER BY createdAt DESC', [req.user.id]);
  const activeMessageId = req.query.id || (messages[0]?.id || null);
  const activeMessage = messages.find((m) => `${m.id}` === `${activeMessageId}`);
  res.render('messages', { title: 'Inbox', messages, activeMessage });
});

app.get('/admin', requireAdmin, async (req, res) => {
  const users = await all('SELECT * FROM users ORDER BY createdAt DESC');
  const version = await currentVersion();
  const questions = await all('SELECT * FROM quiz_questions WHERE version = ?', [version]);
  const announcements = await all('SELECT * FROM announcements ORDER BY createdAt DESC LIMIT 5');
  res.render('admin', { title: 'Admin Panel', users, questions, announcements, version });
});

app.post('/admin/user/:id/status', requireAdmin, async (req, res) => {
  const { action } = req.body;
  const user = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.redirect('/admin');
  const allowed = ['muted', 'active', 'banned'];
  if (action === 'promote' && req.user.role === 'Owner') {
    await run('UPDATE users SET role = ? WHERE id = ?', ['Admin', user.id]);
    await addSystemMessage(user.id, 'Role change', `${req.user.name} promoted you to Admin. Welcome aboard!`, 'role');
  } else if (action === 'demote' && req.user.role === 'Owner') {
    await run('UPDATE users SET role = ? WHERE id = ?', ['User', user.id]);
    await addSystemMessage(user.id, 'Role change', `${req.user.name} removed your admin status. Thank you for your help.`, 'role');
  } else if (allowed.includes(action)) {
    await run('UPDATE users SET status = ? WHERE id = ?', [action, user.id]);
    await addSystemMessage(user.id, 'Status update', `${req.user.name} (${req.user.role}) set your status to ${action}.`, 'moderation');
  }
  res.redirect('/admin');
});

app.post('/admin/quiz', requireAdmin, async (req, res) => {
  const version = await currentVersion();
  const existingScores = await all('SELECT attempts.*, users.name, users.avatar FROM attempts JOIN users ON users.id = attempts.userId WHERE version = ?', [version]);
  for (const s of existingScores) {
    await run(
      'INSERT INTO archived_leaderboards (username, avatar, score, total, percentage, version, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [s.name, s.avatar, s.score, s.total, s.percentage, version, s.createdAt]
    );
  }
  await run('DELETE FROM attempts WHERE version = ?', [version]);
  const newVersion = version + 1;
  await run('UPDATE quiz_meta SET current_version = ? WHERE id = 1', [newVersion]);
  await run('DELETE FROM quiz_questions WHERE version = ?', [newVersion]);

  const questions = Array.isArray(req.body.question) ? req.body.question : [req.body.question];
  const answers = Array.isArray(req.body.answer) ? req.body.answer : [req.body.answer];
  const options = Array.isArray(req.body.options) ? req.body.options : [req.body.options];
  for (let i = 0; i < questions.length; i += 1) {
    const qText = (questions[i] || '').trim();
    const ans = (answers[i] || '').trim();
    if (!qText || !ans) continue;
    const opts = (options[i] || '').split(',').map((o) => o.trim()).filter(Boolean);
    await run('INSERT INTO quiz_questions (version, question, options, answer) VALUES (?, ?, ?, ?)', [
      newVersion,
      qText,
      JSON.stringify(opts),
      ans
    ]);
  }
  res.redirect('/admin');
});

app.post('/admin/announcement', requireOwner, async (req, res) => {
  const { content, type } = req.body;
  if (content) {
    await run('INSERT INTO announcements (content, type, active, createdAt) VALUES (?, ?, ?, ?)', [
      content,
      type || 'general',
      1,
      Date.now()
    ]);
  }
  res.redirect('/admin');
});

app.listen(3000, async () => {
  await init();
  console.log('Clown Quiz listening on port 3000');
});
