const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcrypt');
const multer = require('multer');
const methodOverride = require('method-override');
const dayjs = require('dayjs');
const fs = require('fs');
const { db, initialize, getQuizVersion, setQuizVersion } = require('./database');

initialize();

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(
  session({
    secret: 'clown-quiz-secret',
    resave: false,
    saveUninitialized: false,
    store: new SQLiteStore({ db: 'sessions.db', dir: './' })
  })
);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(__dirname, 'public', 'uploads');
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`;
      cb(null, uniqueName);
    }
  })
});

app.use('/public', express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  if (req.session.userId) {
    db.get('SELECT * FROM users WHERE id = ?', [req.session.userId], (err, user) => {
      if (user && user.status !== 'banned') {
        req.user = user;
      } else if (user && user.status === 'banned') {
        req.session.destroy(() => res.redirect('/auth?error=banned'));
        return;
      }
      res.locals.currentUser = req.user;
      next();
    });
  } else {
    next();
  }
});

app.use((req, res, next) => {
  db.all('SELECT * FROM announcements WHERE active = 1 ORDER BY created_at DESC LIMIT 1', (err, rows) => {
    res.locals.activeAnnouncement = rows && rows[0];
    next();
  });
});

function ensureAuth(req, res, next) {
  if (!req.user) {
    res.redirect('/auth');
  } else {
    next();
  }
}

function ensureAdmin(req, res, next) {
  if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'Owner')) {
    res.redirect('/dashboard');
  } else {
    next();
  }
}

function addSystemMessage(userId, title, body, type) {
  db.run(
    'INSERT INTO messages(user_id, title, body, type, created_at) VALUES (?, ?, ?, ?, ?)',
    [userId, title, body, type, dayjs().toISOString()]
  );
}

app.get('/', (req, res) => {
  res.render('home');
});

app.get('/auth', (req, res) => {
  res.render('auth', { error: req.query.error });
});

app.post('/register', upload.single('avatar'), (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) {
    return res.redirect('/auth?error=missing');
  }
  const avatarPath = req.file ? `/public/uploads/${req.file.filename}` : null;
  const hash = bcrypt.hashSync(password, 10);
  db.run(
    'INSERT INTO users(name, password_hash, role, avatar, status, created_at) VALUES (?, ?, "User", ?, "active", ?)',
    [name, hash, avatarPath, dayjs().toISOString()],
    function (err) {
      if (err) {
        return res.redirect('/auth?error=exists');
      }
      req.session.userId = this.lastID;
      addSystemMessage(this.lastID, 'Welcome to Clown Quiz', 'Thanks for joining! Try the quiz, meet friends in chat, and track your scores on the leaderboard.', 'Welcome');
      res.redirect('/dashboard');
    }
  );
});

app.post('/login', (req, res) => {
  const { name, password } = req.body;
  db.get('SELECT * FROM users WHERE name = ?', [name], (err, user) => {
    if (!user) {
      return res.redirect('/auth?error=login');
    }
    const match = bcrypt.compareSync(password, user.password_hash);
    if (match && user.status !== 'banned') {
      req.session.userId = user.id;
      res.redirect('/dashboard');
    } else {
      res.redirect('/auth?error=login');
    }
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/dashboard', ensureAuth, (req, res) => {
  res.render('dashboard');
});

app.post('/dashboard/profile', ensureAuth, upload.single('avatar'), (req, res) => {
  const { password } = req.body;
  const updates = [];
  const params = [];
  if (password) {
    updates.push('password_hash = ?');
    params.push(bcrypt.hashSync(password, 10));
  }
  if (req.file) {
    updates.push('avatar = ?');
    params.push(`/public/uploads/${req.file.filename}`);
  }
  if (updates.length === 0) {
    return res.redirect('/dashboard');
  }
  params.push(req.user.id);
  db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params, () => {
    res.redirect('/dashboard');
  });
});

app.get('/quiz', ensureAuth, (req, res) => {
  const step = parseInt(req.query.step || '1', 10);
  getQuizVersion(version => {
    db.all('SELECT * FROM quiz_questions WHERE version = ? ORDER BY id', [version], (err, questions) => {
      if (!questions || questions.length === 0) {
        return res.render('quiz', { question: null, step, total: 0, answers: req.session.answers || {} });
      }
      if (!req.session.quizVersion || req.session.quizVersion !== version) {
        req.session.quizVersion = version;
        req.session.answers = {};
      }
      const question = questions[step - 1];
      if (!question) {
        return res.redirect('/quiz/summary');
      }
      res.render('quiz', {
        question,
        step,
        total: questions.length,
        answers: req.session.answers || {}
      });
    });
  });
});

app.post('/quiz', ensureAuth, (req, res) => {
  const { questionId, answer, step } = req.body;
  if (!req.session.answers) {
    req.session.answers = {};
  }
  req.session.answers[questionId] = answer;
  const nextStep = parseInt(step, 10) + 1;
  getQuizVersion(version => {
    db.get('SELECT COUNT(*) as count FROM quiz_questions WHERE version = ?', [version], (err, row) => {
      if (nextStep > row.count) {
        res.redirect('/quiz/summary');
      } else {
        res.redirect(`/quiz?step=${nextStep}`);
      }
    });
  });
});

app.get('/quiz/summary', ensureAuth, (req, res) => {
  getQuizVersion(version => {
    db.all('SELECT * FROM quiz_questions WHERE version = ? ORDER BY id', [version], (err, questions) => {
      const answers = req.session.answers || {};
      let correct = 0;
      questions.forEach(q => {
        if (answers[q.id] && answers[q.id] === q.correct_option) {
          correct += 1;
        }
      });
      res.render('quiz_summary', {
        total: questions.length,
        correct,
        percentage: questions.length ? Math.round((correct / questions.length) * 100) : 0
      });
    });
  });
});

app.post('/quiz/complete', ensureAuth, (req, res) => {
  const { submit } = req.body;
  if (submit === 'no') {
    return res.redirect('/dashboard');
  }
  getQuizVersion(version => {
    db.all('SELECT * FROM quiz_questions WHERE version = ?', [version], (err, questions) => {
      const answers = req.session.answers || {};
      let correct = 0;
      questions.forEach(q => {
        if (answers[q.id] && answers[q.id] === q.correct_option) {
          correct += 1;
        }
      });
      db.run(
        'INSERT INTO quiz_attempts(user_id, score, total, created_at, version) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, correct, questions.length, dayjs().toISOString(), version],
        () => res.redirect('/leaderboard')
      );
    });
  });
});

app.get('/leaderboard', ensureAuth, (req, res) => {
  getQuizVersion(version => {
    db.all(
      `SELECT qa.*, u.name, u.avatar, u.role FROM quiz_attempts qa
      JOIN users u ON qa.user_id = u.id
      WHERE qa.version = ?
      ORDER BY qa.score DESC, qa.created_at ASC`,
      [version],
      (err, rows) => {
        const seen = new Set();
        const latest = [];
        rows.forEach(r => {
          if (!seen.has(r.user_id)) {
            seen.add(r.user_id);
            latest.push(r);
          }
        });
        db.all(
          `SELECT a.*, u.name, u.avatar FROM archived_scores a
          JOIN users u ON a.user_id = u.id
          ORDER BY a.created_at DESC`,
          (err2, archived) => {
            res.render('leaderboard', {
              leaderboard: latest,
              archived: archived || [],
              currentVersion: version
            });
          }
        );
      }
    );
  });
});

app.get('/chat', ensureAuth, (req, res) => {
  db.all(
    `SELECT cm.*, u.name, u.avatar, u.role FROM chat_messages cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.deleted = 0
    ORDER BY cm.created_at ASC`,
    (err, messages) => {
      res.render('chat', { messages: messages || [], error: req.query.error });
    }
  );
});

app.post('/chat', ensureAuth, (req, res) => {
  if (req.user.status === 'muted') {
    return res.redirect('/chat?error=muted');
  }
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.redirect('/chat');
  }
  db.run(
    'INSERT INTO chat_messages(user_id, content, created_at) VALUES (?, ?, ?)',
    [req.user.id, content.trim(), dayjs().toISOString()],
    () => res.redirect('/chat')
  );
});

app.post('/chat/:id/delete', ensureAdmin, (req, res) => {
  const messageId = req.params.id;
  db.run('UPDATE chat_messages SET deleted = 1 WHERE id = ?', [messageId], () => res.redirect('/chat'));
});

app.get('/messages', ensureAuth, (req, res) => {
  db.all('SELECT * FROM messages WHERE user_id = ? ORDER BY created_at DESC', [req.user.id], (err, messages) => {
    res.render('messages', { messages: messages || [] });
  });
});

function archiveLeaderboardAndBumpVersion(callback) {
  getQuizVersion(oldVersion => {
    db.serialize(() => {
      db.run(
        'INSERT INTO archived_scores(user_id, score, total, version_label, created_at) SELECT user_id, score, total, ?, created_at FROM quiz_attempts WHERE version = ?',
        [`Version ${oldVersion}`, oldVersion]
      );
      db.run('DELETE FROM quiz_attempts WHERE version = ?', [oldVersion]);
      const newVersion = oldVersion + 1;
      setQuizVersion(newVersion);
      db.run('UPDATE quiz_questions SET version = ?', [newVersion]);
      if (callback) {
        callback(newVersion, oldVersion);
      }
    });
  });
}

app.get('/admin', ensureAdmin, (req, res) => {
  db.all('SELECT * FROM users ORDER BY created_at DESC', (err, users) => {
    db.all('SELECT * FROM quiz_questions ORDER BY id', (err2, questions) => {
      res.render('admin', { users: users || [], questions: questions || [] });
    });
  });
});

app.post('/admin/user/:id/action', ensureAdmin, (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const { action } = req.body;
  const isOwner = req.user.role === 'Owner';
  db.get('SELECT * FROM users WHERE id = ?', [targetId], (err, target) => {
    if (!target) return res.redirect('/admin');
    if (target.role === 'Owner' && !isOwner) return res.redirect('/admin');
    if (target.role === 'Admin' && req.user.role !== 'Owner') return res.redirect('/admin');

    if (action === 'mute') {
      db.run('UPDATE users SET status = "muted" WHERE id = ?', [targetId]);
      addSystemMessage(targetId, 'Moderation notice', `${req.user.name} (${req.user.role}) muted your chat access.`, 'Moderation');
    }
    if (action === 'unmute') {
      db.run('UPDATE users SET status = "active" WHERE id = ?', [targetId]);
    }
    if (action === 'ban') {
      db.run('UPDATE users SET status = "banned" WHERE id = ?', [targetId]);
      addSystemMessage(targetId, 'Moderation notice', `${req.user.name} (${req.user.role}) banned your account.`, 'Moderation');
    }
    if (action === 'unban') {
      db.run('UPDATE users SET status = "active" WHERE id = ?', [targetId]);
    }
    if (action === 'promote' && isOwner) {
      db.run('UPDATE users SET role = "Admin" WHERE id = ?', [targetId]);
      addSystemMessage(targetId, 'Role update', `${req.user.name} promoted you to Admin. Welcome aboard!`, 'Role');
    }
    if (action === 'demote' && isOwner) {
      db.run('UPDATE users SET role = "User" WHERE id = ?', [targetId]);
      addSystemMessage(targetId, 'Role update', `${req.user.name} removed your admin role. Thank you for helping out!`, 'Role');
    }
    res.redirect('/admin');
  });
});

app.post('/admin/quiz/add', ensureAdmin, (req, res) => {
  archiveLeaderboardAndBumpVersion(newVersion => {
    const { question_text, option_a, option_b, option_c, option_d, correct_option } = req.body;
    db.run(
      `INSERT INTO quiz_questions(question_text, option_a, option_b, option_c, option_d, correct_option, version)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [question_text, option_a, option_b, option_c, option_d, correct_option, newVersion],
      () => res.redirect('/admin')
    );
  });
});

app.post('/admin/quiz/:id/edit', ensureAdmin, (req, res) => {
  archiveLeaderboardAndBumpVersion(newVersion => {
    const { question_text, option_a, option_b, option_c, option_d, correct_option } = req.body;
    db.run(
      `UPDATE quiz_questions SET question_text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, correct_option = ?, version = ? WHERE id = ?`,
      [question_text, option_a, option_b, option_c, option_d, correct_option, newVersion, req.params.id],
      () => res.redirect('/admin')
    );
  });
});

app.post('/admin/quiz/:id/delete', ensureAdmin, (req, res) => {
  archiveLeaderboardAndBumpVersion(() => {
    db.run('DELETE FROM quiz_questions WHERE id = ?', [req.params.id], () => res.redirect('/admin'));
  });
});

app.post('/admin/announcement', ensureAdmin, (req, res) => {
  if (req.user.role !== 'Owner') return res.redirect('/admin');
  const { content, type } = req.body;
  db.run('INSERT INTO announcements(content, type, active, created_at) VALUES (?, ?, 1, ?)', [content, type, dayjs().toISOString()], () => {
    res.redirect('/admin');
  });
});

app.post('/announcement/:id/dismiss', ensureAuth, (req, res) => {
  db.run('UPDATE announcements SET active = 0 WHERE id = ?', [req.params.id], () => res.redirect('back'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Clown Quiz listening on port ${PORT}`);
});
