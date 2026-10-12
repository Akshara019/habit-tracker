process.env.TZ = process.env.TZ || 'Asia/Kolkata'; // keep "today" in Indian time even on a cloud server
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const CATEGORIES = ['Study', 'Health', 'Fitness', 'Personal'];
const FREQUENCIES = ['Daily', 'Weekdays', 'Weekends'];
const MOODS = ['', 'Great', 'Good', 'Okay', 'Rough'];

// Create the data file automatically if it is missing (e.g. on a fresh server)
if (!fs.existsSync(DB_PATH)) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify({ habits: [], completions: {}, reflections: {} }, null, 2));
}

function readDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

// A valid, real calendar date written as YYYY-MM-DD
function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00`);
  return !Number.isNaN(d.getTime()) && dateKey(d) === value;
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function dateKey(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDate(key, amount) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return dateKey(d);
}

function lastNDates(n) {
  const today = dateKey();
  return Array.from({ length: n }, (_, index) => shiftDate(today, index - (n - 1)));
}

function isCompleted(db, habitId, date) {
  return (db.completions[habitId] || []).includes(date);
}

function toggleCompletion(db, habitId, date, completed) {
  const list = db.completions[habitId] || [];
  const exists = list.includes(date);
  if (completed && !exists) list.push(date);
  if (!completed && exists) list.splice(list.indexOf(date), 1);
  list.sort();
  db.completions[habitId] = list;
}

function habitStats(db, habit) {
  const dates = new Set(db.completions[habit.id] || []);
  let current = 0;
  let cursor = dateKey();
  while (dates.has(cursor)) {
    current++;
    cursor = shiftDate(cursor, -1);
  }

  let best = 0;
  let run = 0;
  const sorted = [...dates].sort();
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] === shiftDate(sorted[i - 1], 1)) run++;
    else run = 1;
    best = Math.max(best, run);
  }
  return { currentStreak: current, bestStreak: best, totalCompletions: dates.size };
}

function decorateHabits(db) {
  const today = dateKey();
  return db.habits.map(habit => ({
    ...habit,
    completedToday: isCompleted(db, habit.id, today),
    ...habitStats(db, habit)
  }));
}

function buildSummary(db) {
  const today = dateKey();
  const habits = decorateHabits(db);
  const days = lastNDates(7).map(day => {
    const completed = habits.filter(h => isCompleted(db, h.id, day)).length;
    const rate = habits.length ? Math.round((completed / habits.length) * 100) : 0;
    return { date: day, label: new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' }), completed, total: habits.length, rate };
  });

  const completedToday = habits.filter(h => h.completedToday).length;
  const currentStreak = days.every(d => d.rate >= 50) ? days.length : (() => {
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].rate >= 50) streak++; else break;
    }
    return streak;
  })();

  const categoryNames = [...new Set(habits.map(h => h.category))];
  const categories = categoryNames.map(category => {
    const items = habits.filter(h => h.category === category);
    const done = items.filter(h => h.completedToday).length;
    return { category, completed: done, total: items.length, rate: items.length ? Math.round(done / items.length * 100) : 0 };
  });

  const totalCheckins = habits.reduce((sum, h) => sum + h.totalCompletions, 0);
  const bestHabit = [...habits].sort((a, b) => b.currentStreak - a.currentStreak)[0] || null;
  const bestDay = [...days].sort((a, b) => b.rate - a.rate)[0] || null;

  return {
    today,
    habits,
    days,
    completedToday,
    totalHabits: habits.length,
    todayRate: habits.length ? Math.round(completedToday / habits.length * 100) : 0,
    weeklyRate: Math.round(days.reduce((s, d) => s + d.rate, 0) / days.length),
    currentStreak,
    totalCheckins,
    bestHabit,
    bestDay,
    categories,
    reflections: db.reflections
  };
}

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'Habit Flow API' }));

app.get('/api/habits', (req, res) => {
  const db = readDb();
  res.json(decorateHabits(db));
});

app.post('/api/habits', (req, res) => {
  const { name, category = 'Personal', frequency = 'Daily' } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Habit name is required.' });
  if (String(name).trim().length > 50) return res.status(400).json({ error: 'Habit name must be 50 characters or less.' });
  const db = readDb();
  const habit = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    category: CATEGORIES.includes(category) ? category : 'Personal',
    frequency: FREQUENCIES.includes(frequency) ? frequency : 'Daily',
    createdAt: new Date().toISOString()
  };
  db.habits.push(habit);
  db.completions[habit.id] = [];
  writeDb(db);
  res.status(201).json({ ...habit, completedToday: false, currentStreak: 0, bestStreak: 0, totalCompletions: 0 });
});

app.patch('/api/habits/:id', (req, res) => {
  const db = readDb();
  const habit = db.habits.find(h => h.id === req.params.id);
  if (!habit) return res.status(404).json({ error: 'Habit not found.' });
  const body = req.body || {};
  if (body.name !== undefined) {
    const newName = String(body.name).trim();
    if (!newName || newName.length > 50) return res.status(400).json({ error: 'Habit name must be 1 to 50 characters.' });
    habit.name = newName;
  }
  if (body.category !== undefined) {
    if (!CATEGORIES.includes(body.category)) return res.status(400).json({ error: 'Invalid category.' });
    habit.category = body.category;
  }
  if (body.frequency !== undefined) {
    if (!FREQUENCIES.includes(body.frequency)) return res.status(400).json({ error: 'Invalid frequency.' });
    habit.frequency = body.frequency;
  }
  writeDb(db);
  res.json({ ...habit, completedToday: isCompleted(db, habit.id, dateKey()), ...habitStats(db, habit) });
});

app.delete('/api/habits/:id', (req, res) => {
  const db = readDb();
  const index = db.habits.findIndex(h => h.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Habit not found.' });
  db.habits.splice(index, 1);
  delete db.completions[req.params.id];
  writeDb(db);
  res.json({ success: true });
});

app.post('/api/habits/:id/checkin', (req, res) => {
  const db = readDb();
  const habit = db.habits.find(h => h.id === req.params.id);
  if (!habit) return res.status(404).json({ error: 'Habit not found.' });
  const date = req.body?.date || dateKey();
  if (!isDateKey(date)) return res.status(400).json({ error: 'Date must be a valid YYYY-MM-DD value.' });
  if (date > shiftDate(dateKey(), 1)) return res.status(400).json({ error: 'Cannot check in for a future date.' });
  const completed = req.body?.completed !== false;
  toggleCompletion(db, habit.id, date, completed);
  writeDb(db);
  res.json({ habit: { ...habit, completedToday: isCompleted(db, habit.id, dateKey()), ...habitStats(db, habit) }, date, completed });
});

app.get('/api/summary', (req, res) => res.json(buildSummary(readDb())));

app.get('/api/reflections', (req, res) => {
  const db = readDb();
  res.json(db.reflections);
});

app.put('/api/reflections/:date', (req, res) => {
  const { mood = '', note = '' } = req.body || {};
  if (!isDateKey(req.params.date)) return res.status(400).json({ error: 'Date must be a valid YYYY-MM-DD value.' });
  if (!MOODS.includes(mood)) return res.status(400).json({ error: 'Invalid mood.' });
  if (String(note).length > 500) return res.status(400).json({ error: 'Note must be 500 characters or less.' });
  const db = readDb();
  db.reflections[req.params.date] = {
    mood: String(mood),
    note: String(note).trim(),
    updatedAt: new Date().toISOString()
  };
  writeDb(db);
  res.json(db.reflections[req.params.date]);
});

app.delete('/api/reflections/:date', (req, res) => {
  const db = readDb();
  delete db.reflections[req.params.date];
  writeDb(db);
  res.json({ success: true });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API route not found.' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Always answer errors (such as broken JSON) in JSON, never as an HTML page
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: status === 400 ? 'Invalid request data.' : 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log(`Habit Flow running at http://localhost:${PORT}`);
});
