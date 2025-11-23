const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const dayjs = require('dayjs');

const db = new sqlite3.Database('./data.db');

function initialize() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'User',
      avatar TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS quiz_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_text TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_option TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      version INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS archived_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      version_label TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);

    db.get("SELECT value FROM settings WHERE key='quiz_version'", (err, row) => {
      if (!row) {
        db.run("INSERT INTO settings(key, value) VALUES('quiz_version', '1')");
      }
    });

    seedOwner();
    seedQuestions();
  });
}

function seedOwner() {
  db.get('SELECT id FROM users WHERE name = ?', ['Easmox'], (err, row) => {
    if (!row) {
      const hash = bcrypt.hashSync('732800', 10);
      db.run(
        `INSERT INTO users(name, password_hash, role, status, created_at) VALUES(?, ?, 'Owner', 'active', ?)`,
        ['Easmox', hash, dayjs().toISOString()]
      );
    }
  });
}

function seedQuestions() {
  db.get('SELECT COUNT(*) as count FROM quiz_questions', (err, row) => {
    if (row && row.count === 0) {
      const version = 1;
      const questions = [
        ['What color is a classic clown nose?', 'Red', 'Blue', 'Yellow', 'Green', 'A'],
        ['Which circus role does a clown usually perform?', 'Juggling', 'Lion taming', 'Tightrope walking', 'Fire breathing', 'A'],
        ['What is a common shoe style for clowns?', 'Oversized shoes', 'Hiking boots', 'Flip flops', 'Heels', 'A'],
        ['Clowns often travel in what humorous vehicle trope?', 'Oversized bus', 'Tiny car', 'Helicopter', 'Boat', 'B'],
        ['Which face makeup is typical for clowns?', 'Monochrome black', 'Natural tones', 'Bold white with accents', 'No makeup', 'C'],
        ['What is a popular clown prop?', 'Banana phone', 'Squirting flower', 'Feather pen', 'Laptop', 'B'],
        ['Who is a famous sad clown character?', 'Pagliacci', 'Batman', 'Sherlock Holmes', 'Spiderman', 'A'],
        ['Clown performances are usually intended to be?', 'Terrifying', 'Serious drama', 'Comedic', 'Silent meditation', 'C'],
        ['A group of clowns emerging from a small car is known as?', 'Clown spill', 'Clown storm', 'Clown car gag', 'Clown parade', 'C'],
        ['Which accessory is associated with honking noises?', 'Rubber chicken', 'Hand buzzer', 'Bowling ball', 'Big red nose', 'D']
      ];
      const stmt = db.prepare(`INSERT INTO quiz_questions(question_text, option_a, option_b, option_c, option_d, correct_option, version) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      questions.forEach(q => stmt.run([...q, version]));
      stmt.finalize();
    }
  });
}

function getQuizVersion(callback) {
  db.get("SELECT value FROM settings WHERE key='quiz_version'", (err, row) => {
    callback(parseInt(row?.value || '1', 10));
  });
}

function setQuizVersion(newVersion) {
  db.run("INSERT OR REPLACE INTO settings(key, value) VALUES('quiz_version', ?)", [String(newVersion)]);
}

module.exports = { db, initialize, getQuizVersion, setQuizVersion };
