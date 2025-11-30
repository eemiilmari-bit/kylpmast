const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, 'data.json');

const defaultQuestions = [
  {
    prompt: 'What is the traditional name for the central clown in a circus?',
    options: ['Ringmaster', 'Boss Clown', 'Lead Jester', 'Grand Joker'],
    correctIndex: 1
  },
  {
    prompt: 'Which face paint design is associated with a classic whiteface clown?',
    options: ['White base with delicate features', 'Minimal makeup with a red nose', 'Full black and white stripes', 'No makeup at all'],
    correctIndex: 0
  },
  {
    prompt: 'What prop is most commonly linked with clown slapstick?',
    options: ['Feather boa', 'Seltzer bottle', 'Top hat', 'Marbles'],
    correctIndex: 1
  },
  {
    prompt: 'Which circus founder famously featured clowns in 1768?',
    options: ['P. T. Barnum', 'Joseph Grimaldi', 'Philip Astley', 'Emmett Kelly'],
    correctIndex: 2
  },
  {
    prompt: 'What term describes a group comedy routine clowns perform together?',
    options: ['Cluster gag', 'Group jest', 'Ring run', 'Entrée'],
    correctIndex: 3
  },
  {
    prompt: 'Which clown type is known for oversized clothes and shy behavior?',
    options: ['Auguste', 'Character clown', 'Whiteface', 'Tramp/Hobo'],
    correctIndex: 3
  },
  {
    prompt: 'What item does a clown traditionally twist into balloon animals?',
    options: ['Latex 260 balloon', 'Vinyl ribbon', 'Paper streamer', 'Foam tube'],
    correctIndex: 0
  },
  {
    prompt: 'Which clown character carries a broom in many classic acts?',
    options: ['Charlie Rivel', 'Grock', 'Lou Jacobs', 'Bill Irwin'],
    correctIndex: 1
  },
  {
    prompt: 'Where are clown alley spaces typically located?',
    options: ['Near the ticket booth', 'Behind the main tent', 'Beside the concessions', 'Above the rigging'],
    correctIndex: 1
  },
  {
    prompt: 'What is a common closing flourish after a clown gag?',
    options: ['Pie toss', 'Ta-da pose', 'Flash paper burst', 'Ring of fire leap'],
    correctIndex: 1
  }
];

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function defaultData() {
  return {
    users: [],
    quiz: { title: 'Clown Craft Quiz', questions: defaultQuestions },
    leaderboard: [],
    scoreboardArchive: [],
    chat: [],
    messages: [],
    announcements: []
  };
}

function ensureOwner(data) {
  const existing = data.users.find((u) => u.name.toLowerCase() === 'easmox');
  if (!existing) {
    data.users.push({
      id: crypto.randomUUID(),
      name: 'Easmox',
      passwordHash: hashPassword('732800'),
      role: 'owner',
      status: 'active',
      avatar: null,
      badges: ['owner'],
      createdAt: Date.now()
    });
  }
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = defaultData();
    ensureOwner(initial);
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }

  try {
    const content = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(content || '{}');
    const merged = { ...defaultData(), ...parsed };
    if (!merged.quiz || !merged.quiz.questions || merged.quiz.questions.length === 0) {
      merged.quiz = { title: 'Clown Craft Quiz', questions: defaultQuestions };
    }
    ensureOwner(merged);
    fs.writeFileSync(DATA_FILE, JSON.stringify(merged, null, 2));
    return merged;
  } catch (err) {
    const fallback = defaultData();
    ensureOwner(fallback);
    fs.writeFileSync(DATA_FILE, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

module.exports = {
  DATA_FILE,
  hashPassword,
  loadData,
  saveData,
  defaultQuestions
};
