const authCard = document.getElementById('auth-card');
const app = document.getElementById('app');
const sessionInfo = document.getElementById('session-info');
const authStatus = document.getElementById('auth-status');
const profileStatus = document.getElementById('profile-status');
const adminStatus = document.getElementById('admin-status');
const roleBadge = document.getElementById('role-badge');
const quizArea = document.getElementById('quiz-area');
const quizControls = document.getElementById('quiz-controls');
const leaderboardBox = document.getElementById('leaderboard');
const archiveBox = document.getElementById('archive');
const messagesBox = document.getElementById('messages');
const chatLog = document.getElementById('chat-log');
const announcementBox = document.getElementById('announcement');
const adminPanel = document.getElementById('admin-panel');
const ownerTools = document.getElementById('owner-tools');
const quizJson = document.getElementById('quiz-json');

let sessionToken = localStorage.getItem('sessionToken');
let currentUser = null;
let quiz = null;
let answers = [];
let currentQuestion = 0;
let chatTimer = null;
let announcementTimer = null;

function setStatus(el, message, isError = false) {
  if (!el) return;
  el.textContent = message || '';
  el.style.color = isError ? '#ff6b6b' : '#9bb0ff';
}

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function api(path, options = {}) {
  const opts = { ...options, headers: options.headers || {} };
  if (!(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
  }
  if (sessionToken) {
    opts.headers['x-session-token'] = sessionToken;
  }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function renderUser() {
  if (!currentUser) return;
  sessionInfo.textContent = `${currentUser.name} (${currentUser.role})`;
  roleBadge.textContent = `You are ${currentUser.role}${currentUser.role === 'owner' ? ' (Owner badge active)' : ''}`;
  adminPanel.hidden = !(currentUser.role === 'admin' || currentUser.role === 'owner');
  ownerTools.hidden = currentUser.role !== 'owner';
}

async function handleLogin(isRegister) {
  try {
    const name = document.getElementById('name').value.trim();
    const password = document.getElementById('password').value;
    let profileImage = null;
    if (isRegister) {
      const file = document.getElementById('avatar').files[0];
      profileImage = file ? await readFileAsDataUrl(file) : null;
    }
    const payload = isRegister ? { name, password, profileImage } : { name, password };
    const data = await api(isRegister ? '/api/register' : '/api/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    sessionToken = data.token;
    localStorage.setItem('sessionToken', sessionToken);
    currentUser = data.user;
    authCard.hidden = true;
    app.hidden = false;
    renderUser();
    setStatus(authStatus, 'Ready!');
    await refreshQuiz();
    await refreshLeaderboard();
    await loadMessages();
    startChat();
    pollAnnouncements();
  } catch (err) {
    setStatus(authStatus, err.message, true);
  }
}

async function checkSession() {
  if (!sessionToken) return;
  try {
    const data = await api('/api/session');
    currentUser = data.user;
    authCard.hidden = true;
    app.hidden = false;
    renderUser();
    await refreshQuiz();
    await refreshLeaderboard();
    await loadMessages();
    startChat();
    pollAnnouncements();
  } catch (err) {
    console.warn('session check failed', err);
    localStorage.removeItem('sessionToken');
  }
}

async function refreshQuiz() {
  const data = await api('/api/quiz');
  quiz = data.quiz;
  quizJson.value = JSON.stringify(quiz.questions, null, 2);
  quizArea.innerHTML = '<p class="muted">Press "Start quiz" to begin the current set.</p>';
  quizControls.innerHTML = '';
  answers = [];
  currentQuestion = 0;
}

function renderQuestion() {
  if (!quiz) return;
  const q = quiz.questions[currentQuestion];
  quizArea.innerHTML = `<h3>Question ${currentQuestion + 1}/${quiz.questions.length}</h3><p>${q.prompt}</p>`;
  const options = document.createElement('div');
  q.options.forEach((opt, idx) => {
    const label = document.createElement('label');
    label.className = 'quiz-option';
    label.innerHTML = `<input type="radio" name="answer" value="${idx}"> ${opt}`;
    options.appendChild(label);
  });
  quizArea.appendChild(options);
  quizControls.innerHTML = '';
  const btn = document.createElement('button');
  btn.textContent = currentQuestion === quiz.questions.length - 1 ? 'Finish' : 'Next';
  btn.onclick = submitAnswer;
  quizControls.appendChild(btn);
}

async function submitAnswer() {
  const selected = document.querySelector('input[name="answer"]:checked');
  if (!selected) {
    setStatus(authStatus, 'Pick an answer', true);
    return;
  }
  answers[currentQuestion] = Number(selected.value);
  currentQuestion += 1;
  if (currentQuestion >= quiz.questions.length) {
    finishQuiz();
  } else {
    renderQuestion();
  }
}

async function finishQuiz() {
  try {
    const data = await api('/api/quiz/submit', {
      method: 'POST',
      body: JSON.stringify({ answers })
    });
    quizArea.innerHTML = `<h3>Score: ${data.score}/${data.total}</h3><p class="muted">Want to add it to the leaderboard?</p>`;
    quizControls.innerHTML = '';
    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add score';
    addBtn.onclick = async () => {
      await api('/api/leaderboard', { method: 'POST', body: JSON.stringify({ score: data.score }) });
      setStatus(authStatus, 'Score added');
      await refreshLeaderboard();
    };
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Back to menu';
    cancelBtn.className = 'secondary';
    cancelBtn.onclick = () => {
      quizArea.innerHTML = '<p class="muted">Press "Start quiz" to begin the current set.</p>';
      quizControls.innerHTML = '';
    };
    quizControls.append(addBtn, cancelBtn);
  } catch (err) {
    setStatus(authStatus, err.message, true);
  }
}

async function refreshLeaderboard() {
  const data = await api('/api/leaderboard');
  leaderboardBox.innerHTML = data.leaderboard
    .slice()
    .reverse()
    .map((entry) => `<div class="message"><strong>${entry.name}</strong> · ${entry.score} pts <span class="muted">${new Date(entry.createdAt).toLocaleString()}</span></div>`)
    .join('') || '<p class="muted">No scores yet.</p>';
  archiveBox.innerHTML = data.archive
    .slice()
    .reverse()
    .map((set) => {
      const list = set.leaderboard || [];
      return `<div class="message"><strong>Archived ${new Date(set.archivedAt).toLocaleString()}</strong><br>${list
        .map((e) => `${e.name}: ${e.score}`)
        .join(', ') || 'Empty board'}</div>`;
    })
    .join('') || '<p class="muted">No archives yet.</p>';
}

async function loadMessages() {
  try {
    const data = await api('/api/messages');
    messagesBox.innerHTML = data.messages
      .slice()
      .reverse()
      .map((m) => `<div class="message"><strong>${m.system ? 'System' : m.from || 'User'}:</strong> ${m.subject}<br><span class="muted">${m.body}</span></div>`)
      .join('') || '<p class="muted">No messages.</p>';
  } catch (err) {
    setStatus(authStatus, err.message, true);
  }
}

function renderChat(messages) {
  chatLog.innerHTML = messages
    .map((m) => {
      const badges = [];
      if (m.role === 'owner') badges.push('<span class="badge owner">owner</span>');
      else if (m.role === 'admin') badges.push('<span class="badge admin">admin</span>');
      return `<div class="message"><strong>${m.name}</strong> ${badges.join(' ')}<br>${m.text}</div>`;
    })
    .join('');
}

async function refreshChat() {
  const data = await api('/api/chat');
  renderChat(data.messages);
}

function startChat() {
  refreshChat();
  if (chatTimer) clearInterval(chatTimer);
  chatTimer = setInterval(refreshChat, 5000);
}

async function sendChat() {
  const text = document.getElementById('chat-input').value.trim();
  if (!text) return;
  document.getElementById('chat-input').value = '';
  try {
    await api('/api/chat', { method: 'POST', body: JSON.stringify({ text }) });
    refreshChat();
  } catch (err) {
    setStatus(authStatus, err.message, true);
  }
}

async function uploadAvatar(fileInput) {
  const file = fileInput.files[0];
  if (!file) return;
  const profileImage = await readFileAsDataUrl(file);
  await api('/api/profile-picture', { method: 'POST', body: JSON.stringify({ profileImage }) });
  setStatus(profileStatus, 'Avatar updated');
}

async function moderate(action) {
  const target = document.getElementById('mod-target').value.trim();
  if (!target) return setStatus(adminStatus, 'Enter a user');
  try {
    await api('/api/moderate', { method: 'POST', body: JSON.stringify({ target, action }) });
    setStatus(adminStatus, 'Updated moderation');
  } catch (err) {
    setStatus(adminStatus, err.message, true);
  }
}

async function changeAdmin(promote) {
  const target = document.getElementById('admin-target').value.trim();
  if (!target) return setStatus(adminStatus, 'Enter a user');
  try {
    await api(promote ? '/api/admin/promote' : '/api/admin/demote', {
      method: 'POST',
      body: JSON.stringify({ target })
    });
    setStatus(adminStatus, promote ? 'Promoted' : 'Demoted');
  } catch (err) {
    setStatus(adminStatus, err.message, true);
  }
}

async function updateQuiz() {
  try {
    const parsed = JSON.parse(quizJson.value);
    await api('/api/quiz', { method: 'PUT', body: JSON.stringify({ questions: parsed, title: 'Clown Craft Quiz' }) });
    setStatus(adminStatus, 'Quiz updated and leaderboard archived');
    await refreshQuiz();
    await refreshLeaderboard();
  } catch (err) {
    setStatus(adminStatus, err.message, true);
  }
}

async function postAnnouncement() {
  try {
    const text = document.getElementById('announce-text').value.trim();
    const audience = document.getElementById('announce-audience').value;
    await api('/api/announce', { method: 'POST', body: JSON.stringify({ text, audience }) });
    document.getElementById('announce-text').value = '';
    setStatus(adminStatus, 'Announcement sent');
  } catch (err) {
    setStatus(adminStatus, err.message, true);
  }
}

async function pollAnnouncements() {
  try {
    const data = await api('/api/announcements');
    if (data.announcements && data.announcements.length) {
      const note = data.announcements[data.announcements.length - 1];
      announcementBox.textContent = note.text;
      announcementBox.hidden = false;
      clearTimeout(announcementTimer);
      const timeout = Math.max(1500, note.expiresAt - Date.now());
      announcementTimer = setTimeout(() => {
        announcementBox.hidden = true;
      }, timeout);
    }
  } catch (err) {
    console.warn('Announcement check failed', err);
  }
  setTimeout(pollAnnouncements, 8000);
}

// Wire UI

document.getElementById('login-btn').addEventListener('click', () => handleLogin(false));
document.getElementById('register-btn').addEventListener('click', () => handleLogin(true));
document.getElementById('start-quiz').addEventListener('click', () => {
  answers = [];
  currentQuestion = 0;
  renderQuestion();
});
document.getElementById('chat-send').addEventListener('click', sendChat);
document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});
document.getElementById('profile-upload').addEventListener('change', (e) => uploadAvatar(e.target));
document.getElementById('load-messages').addEventListener('click', loadMessages);
Array.from(document.getElementsByClassName('mod-btn')).forEach((btn) => {
  btn.addEventListener('click', () => moderate(btn.dataset.action));
});
document.getElementById('promote').addEventListener('click', () => changeAdmin(true));
document.getElementById('demote').addEventListener('click', () => changeAdmin(false));
document.getElementById('save-quiz').addEventListener('click', updateQuiz);
document.getElementById('announce').addEventListener('click', postAnnouncement);

checkSession();
