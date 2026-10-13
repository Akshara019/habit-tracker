const API = '/api';
let summary = null;
let habits = [];
let selectedMood = '';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDate(key) {
  return new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Something went wrong.');
  return body;
}

function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function setupDate() {
  const el = $('#dateLabel');
  if (el) el.textContent = formatDate(todayKey());
}

function setupModal() {
  const modal = $('#habitModal');
  if (!modal) return;
  $$('[data-open-modal]').forEach(btn => btn.addEventListener('click', () => {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => $('#habitName')?.focus(), 50);
  }));
  $$('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModal));
  $('#habitForm')?.addEventListener('submit', createHabit);
}

function closeModal() {
  const modal = $('#habitModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  $('#habitForm')?.reset();
}

async function createHabit(event) {
  event.preventDefault();
  const name = $('#habitName')?.value.trim();
  const category = $('#habitCategory')?.value;
  const frequency = $('#habitFrequency')?.value;
  if (!name) return;
  try {
    await api('/habits', { method: 'POST', body: JSON.stringify({ name, category, frequency }) });
    closeModal();
    showToast('Habit added. Let’s make it stick.');
    await loadApp();
  } catch (error) { showToast(error.message); }
}

async function toggleHabit(id, completed) {
  try {
    await api(`/habits/${encodeURIComponent(id)}/checkin`, {
      method: 'POST', body: JSON.stringify({ date: todayKey(), completed })
    });
    await loadApp();
  } catch (error) { showToast(error.message); }
}

async function deleteHabit(id, name) {
  if (!window.confirm(`Delete “${name}”? Its completion history will also be removed.`)) return;
  try {
    await api(`/habits/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showToast('Habit removed.');
    await loadApp();
  } catch (error) { showToast(error.message); }
}

function habitRow(habit, manage = false) {
  const safeName = escapeHTML(habit.name);
  const safeCategory = escapeHTML(habit.category);
  if (!manage) {
    return `<div class="habit-row ${habit.completedToday ? 'done' : ''}">
      <div class="habit-info"><button class="check ${habit.completedToday ? 'done' : ''}" data-toggle="${habit.id}" data-completed="${!habit.completedToday}" aria-label="${habit.completedToday ? 'Undo' : 'Complete'} ${safeName}">${habit.completedToday ? '✓' : ''}</button>
      <div class="habit-text"><b>${safeName}</b><small>${safeCategory} · ${habit.currentStreak} day streak</small></div></div>
      <div class="habit-actions"><button class="mini-action" data-toggle="${habit.id}" data-completed="${!habit.completedToday}">${habit.completedToday ? 'Undo' : 'Complete'}</button></div>
    </div>`;
  }
  return `<div class="manage-row">
    <button class="check ${habit.completedToday ? 'done' : ''}" data-toggle="${habit.id}" data-completed="${!habit.completedToday}">${habit.completedToday ? '✓' : ''}</button>
    <div class="habit-text"><b>${safeName}</b><div class="manage-meta"><span class="tag">${safeCategory}</span><span class="tag warm">${escapeHTML(habit.frequency)}</span></div></div>
    <div class="row-stat"><b>${habit.currentStreak}d</b><small>${habit.totalCompletions} check-ins</small></div>
    <div class="row-actions"><button class="mini-action delete" data-delete="${habit.id}" data-name="${safeName}">Delete</button></div>
  </div>`;
}

function bindHabitActions(root = document) {
  $$('[data-toggle]', root).forEach(btn => btn.addEventListener('click', () => toggleHabit(btn.dataset.toggle, btn.dataset.completed === 'true')));
  $$('[data-delete]', root).forEach(btn => btn.addEventListener('click', () => deleteHabit(btn.dataset.delete, btn.dataset.name)));
}

function renderDashboard() {
  if (document.body.dataset.page !== 'dashboard') return;
  const rate = summary.todayRate;
  $('#todayRate').textContent = `${rate}%`;
  $('#completedToday').textContent = `${summary.completedToday} / ${summary.totalHabits}`;
  $('#currentStreak').innerHTML = `${summary.currentStreak} <small>days</small>`;
  $('#weeklyRate').textContent = `${summary.weeklyRate}%`;
  const ring = $('#todayRing');
  if (ring) ring.style.background = `conic-gradient(#526b5b ${rate * 3.6}deg, #d9dfd7 ${rate * 3.6}deg)`;
  const list = $('#todayHabits');
  list.innerHTML = summary.habits.length ? summary.habits.map(h => habitRow(h)).join('') : `<div class="empty-state"><div><b>No habits yet</b><small>Use “New habit” to create your first routine.</small></div></div>`;
  bindHabitActions(list);
  const bars = $('#weekBars');
  bars.innerHTML = summary.days.map(day => `<div class="week-day"><div class="bar-shell"><i class="bar ${day.date === todayKey() ? 'today' : ''}" style="height:${Math.max(6, day.rate)}%" title="${day.rate}%"></i></div><b>${day.label}</b><small>${day.rate}%</small></div>`).join('');
  const best = summary.bestHabit;
  $('#bestHabitName').textContent = best ? best.name : 'Start a habit';
  $('#bestHabitText').textContent = best ? `${best.currentStreak} day current streak · ${best.totalCompletions} total check-ins` : 'Your strongest streak will appear here.';
}

function renderHabits() {
  if (document.body.dataset.page !== 'habits') return;
  $('#habitCount').textContent = `${habits.length} ${habits.length === 1 ? 'habit' : 'habits'}`;
  $('#habitPageRate').textContent = `${summary.todayRate}%`;
  $('#habitPageBar').style.width = `${summary.todayRate}%`;
  $('#totalCheckins').textContent = summary.totalCheckins;
  const best = habits.reduce((max, h) => Math.max(max, h.currentStreak), 0);
  $('#bestStreak').innerHTML = `${best} <small>days</small>`;
  const list = $('#allHabits');
  list.innerHTML = habits.length ? habits.map(h => habitRow(h, true)).join('') : `<div class="empty-state"><div><b>Your routine is empty</b><small>Create a habit from the button above.</small></div></div>`;
  bindHabitActions(list);
  $('#habitCategories').innerHTML = summary.categories.map(cat => `<div class="cat-line"><div class="cat-top"><span>${escapeHTML(cat.category)}</span><span>${cat.rate}%</span></div><div class="cat-track"><i style="width:${cat.rate}%"></i></div></div>`).join('');
}

function svgChart(days) {
  const width = 700, height = 270, left = 8, right = 8, top = 18, bottom = 18;
  const chartW = width - left - right, chartH = height - top - bottom;
  const points = days.map((d, i) => ({ x: left + i * chartW / (days.length - 1), y: top + chartH - d.rate / 100 * chartH, rate: d.rate }));
  const line = points.map(p => `${p.x},${p.y}`).join(' ');
  const area = `${left},${top + chartH} ${line} ${left + chartW},${top + chartH}`;
  let html = '';
  [0,25,50,75,100].forEach(v => { const y = top + chartH - v / 100 * chartH; html += `<line class="chart-grid" x1="${left}" y1="${y}" x2="${left + chartW}" y2="${y}"/>`; });
  html += `<polygon class="chart-area" points="${area}"/><polyline class="chart-line" points="${line}"/>`;
  points.forEach(p => { html += `<circle class="chart-point" cx="${p.x}" cy="${p.y}" r="4"/><text x="${p.x}" y="${p.y - 10}" text-anchor="middle" font-size="9" fill="#8c918b">${p.rate}%</text>`; });
  return html;
}

function renderProgress() {
  if (document.body.dataset.page !== 'progress') return;
  $('#progressRate').textContent = `${summary.weeklyRate}%`;
  $('#progressBar').style.width = `${summary.weeklyRate}%`;
  $('#progressChart').innerHTML = svgChart(summary.days);
  $('#chartLabels').innerHTML = summary.days.map(d => `<span>${d.label}</span>`).join('');
  $('#bestDay').textContent = summary.bestDay ? `${summary.bestDay.label} · ${summary.bestDay.rate}%` : '—';
  $('#categoryBreakdown').innerHTML = summary.categories.map(c => `<div class="breakdown-card"><b>${escapeHTML(c.category)}</b><strong>${c.rate}%</strong><small>${c.completed} of ${c.total} done today</small></div>`).join('');
  const sorted = [...habits].sort((a,b) => b.currentStreak - a.currentStreak || b.totalCompletions - a.totalCompletions);
  $('#habitPerformance').innerHTML = sorted.length ? sorted.map(h => `<div class="performance-row"><b>${escapeHTML(h.name)}</b><small>🔥 ${h.currentStreak} day streak · ${h.totalCompletions} check-ins</small></div>`).join('') : `<div class="empty-state"><div><b>No data yet</b><small>Create a few habits to unlock your progress view.</small></div></div>`;
}

async function loadReflections() {
  return api('/reflections');
}

async function renderReflect() {
  if (document.body.dataset.page !== 'reflect') return;
  const reflections = await loadReflections();
  const today = todayKey();
  const current = reflections[today] || {};
  selectedMood = current.mood || '';
  $('#reflectionNote').value = current.note || '';
  $$('#moods button').forEach(btn => btn.classList.toggle('selected', btn.dataset.mood === selectedMood));
  $('#savedState').textContent = current.updatedAt ? `Saved ${new Date(current.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Not saved yet';
  const best = summary.bestHabit;
  $('#reflectHeadline').textContent = summary.todayRate >= 75 ? 'You showed up today.' : summary.todayRate >= 40 ? 'A little progress is still progress.' : 'Your week is still being written.';
  $('#reflectSummary').textContent = `${summary.completedToday} of ${summary.totalHabits} habits are complete today, with a ${summary.weeklyRate}% seven-day rhythm.`;
  $('#reflectBestHabit').textContent = best ? best.name : 'Your best habit';
  $('#reflectBestHabitText').textContent = best ? `${best.currentStreak} day current streak.` : 'Your strongest streak will appear here.';
  const entries = Object.entries(reflections).sort((a,b) => (b[1].updatedAt || '').localeCompare(a[1].updatedAt || '')).slice(0, 3);
  $('#recentReflections').innerHTML = entries.length ? entries.map(([date, item]) => `<article class="recent-card"><b>${escapeHTML(date)}</b><small>${escapeHTML(item.mood || 'Reflection')}</small><p>${escapeHTML(item.note || 'No note added.')}</p></article>`).join('') : `<div class="empty-state"><div><b>No reflections yet</b><small>Your saved notes will appear here.</small></div></div>`;
  $$('#moods button').forEach(btn => btn.addEventListener('click', () => { selectedMood = btn.dataset.mood; $$('#moods button').forEach(b => b.classList.toggle('selected', b === btn)); }));
  $('#saveReflection').onclick = saveReflection;
}

async function saveReflection() {
  try {
    const note = $('#reflectionNote').value.trim();
    await api(`/reflections/${todayKey()}`, { method: 'PUT', body: JSON.stringify({ mood: selectedMood, note }) });
    $('#savedState').textContent = `Saved ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    showToast('Reflection saved.');
    await renderReflect();
  } catch (error) { showToast(error.message); }
}

async function loadApp() {
  try {
    summary = await api('/summary');
    habits = summary.habits;
    setupDate();
    renderDashboard();
    renderHabits();
    renderProgress();
    await renderReflect();
  } catch (error) {
    console.error(error);
    showToast(location.protocol === 'file:' ? 'Open the site through its web link (or http://localhost:3000), not by double-clicking the file.' : 'Could not reach the server. Please start it and refresh the page.');
  }
}

setupModal();
loadApp();
