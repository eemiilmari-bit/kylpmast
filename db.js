const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'data');
if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath);
}
const databaseFile = path.join(dbPath, 'database.sqlite');
const db = new sqlite3.Database(databaseFile);

const defaultQuestions = [
  {
    question: 'What classic clown accessory is red and sits on the nose?',
    options: ['A rubber duck', 'A balloon', 'A foam nose', 'A magic wand'],
    answer: 'A foam nose'
  },
  {
    question: 'Which circus performer is known for oversized shoes and painted smiles?',
    options: ['Acrobat', 'Ringmaster', 'Clown', 'Tightrope walker'],
    answer: 'Clown'
  },
  {
    question: 'What vehicle are clowns famous for squeezing into?',
    options: ['A tiny car', 'A large bus', 'A motorcycle', 'A wagon'],
    answer: 'A tiny car'
  },
  {
    question: 'Which color is most associated with clown wigs?',
    options: ['Neon orange', 'Jet black', 'Pastel blue', 'Deep purple'],
    answer: 'Neon orange'
  },
  {
    question: 'In clowning, what is slapstick?',
    options: ['A musical instrument', 'A style of comedy', 'A prop used for juggling', 'A type of makeup'],
    answer: 'A style of comedy'
  },
  {
    question: 'Which material is commonly used for a clown’s flower that squirts water?',
    options: ['Plastic', 'Glass', 'Metal', 'Wood'],
    answer: 'Plastic'
  },
  {
    question: 'What term describes a clown act that involves silent comedy?',
    options: ['Mime', 'Chant', 'Narration', 'Ballad'],
    answer: 'Mime'
  },
  {
    question: 'What pattern is frequently seen on clown costumes?',
    options: ['Polka dots', 'Houndstooth', 'Pinstripes', 'Plaid'],
    answer: 'Polka dots'
  },
  {
    question: 'Which item might a clown pull from an impossibly small pocket?',
    options: ['A long string of scarves', 'A laptop', 'A violin', 'A bowling ball'],
    answer: 'A long string of scarves'
  },
  {
    question: 'What is the term for the clown leader in a circus performance?',
    options: ['Boss clown', 'Chief juggler', 'Head acrobat', 'Lead mime'],
    answer: 'Boss clown'
  }
];

function run(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function init() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'User',
    avatar TEXT,
    status TEXT DEFAULT 'active',
    createdAt INTEGER
  )`);

  await run(`CREATE TABLE IF NOT EXISTS system_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    title TEXT,
    body TEXT,
    type TEXT,
    createdAt INTEGER,
    read INTEGER DEFAULT 0
  )`);

  await run(`CREATE TABLE IF NOT EXISTS quiz_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    current_version INTEGER
  )`);

  await run(`CREATE TABLE IF NOT EXISTS quiz_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version INTEGER,
    question TEXT,
    options TEXT,
    answer TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    score INTEGER,
    total INTEGER,
    percentage REAL,
    version INTEGER,
    createdAt INTEGER
  )`);

  await run(`CREATE TABLE IF NOT EXISTS archived_leaderboards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    avatar TEXT,
    score INTEGER,
    total INTEGER,
    percentage REAL,
    version INTEGER,
    createdAt INTEGER
  )`);

  await run(`CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    type TEXT,
    active INTEGER,
    createdAt INTEGER
  )`);

  await run(`CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    content TEXT,
    createdAt INTEGER
  )`);

  const meta = await get('SELECT current_version FROM quiz_meta WHERE id = 1');
  if (!meta) {
    await run('INSERT INTO quiz_meta (id, current_version) VALUES (1, 1)');
  }

  const owner = await get('SELECT * FROM users WHERE name = ?', ['Easmox']);
  if (!owner) {
    const hashed = await bcrypt.hash('732800', 10);
    await run('INSERT INTO users (name, password, role, status, createdAt) VALUES (?, ?, ?, ?, ?)', [
      'Easmox',
      hashed,
      'Owner',
      'active',
      Date.now()
    ]);
  }

  const questionCount = await get('SELECT COUNT(*) as count FROM quiz_questions WHERE version = 1');
  if (!questionCount || questionCount.count === 0) {
    for (const q of defaultQuestions) {
      await run('INSERT INTO quiz_questions (version, question, options, answer) VALUES (?, ?, ?, ?)', [
        1,
        q.question,
        JSON.stringify(q.options),
        q.answer
      ]);
    }
  }
}

async function currentVersion() {
  const meta = await get('SELECT current_version FROM quiz_meta WHERE id = 1');
  return meta ? meta.current_version : 1;
}

module.exports = {
  db,
  run,
  get,
  all,
  init,
  currentVersion,
  defaultQuestions
};
