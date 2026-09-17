(() => {
  'use strict';
  const STORAGE_KEY = 'ascent.mvp.v1';
  const MAX_GOALS = 50;
  const seed = { version: 1, goals: [], events: [] };
  let state = loadState();

  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const todayKey = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; };
  const dateLabel = () => new Intl.DateTimeFormat(undefined, { weekday:'long', month:'long', day:'numeric' }).format(new Date());

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(seed);
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.goals) || !Array.isArray(parsed.events)) throw new Error('Invalid backup');
      return parsed;
    } catch (error) {
      showNotice('Saved data could not be read. A new local workspace was opened.', true);
      return structuredClone(seed);
    }
  }
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); render(); }
  function showNotice(message, error = false) { const node = $('#notice'); node.textContent = message; node.className = `notice${error ? ' error' : ''}`; node.hidden = false; window.clearTimeout(showNotice.timer); showNotice.timer = window.setTimeout(() => { node.hidden = true; }, 5000); }
  function activeGoals() { return state.goals.filter((goal) => goal.status === 'active'); }
  function goalProgress(goal) { if (!goal.milestones.length) return goal.completedActions > 0 ? 100 : 0; return Math.round(goal.milestones.filter((item) => item.done).length / goal.milestones.length * 100); }
  function completedToday(goal) { return state.events.some((event) => event.type === 'action_completed' && event.goalId === goal.id && event.date === todayKey()); }
  function totalStats() { const milestones = state.goals.flatMap((goal) => goal.milestones); const complete = milestones.filter((item) => item.done).length; const total = milestones.length; const totalProgress = state.goals.length ? Math.round(state.goals.reduce((sum, goal) => sum + goalProgress(goal), 0) / state.goals.length) : 0; return { complete, total, totalProgress }; }

  function renderToday() {
    $('#today-date').textContent = dateLabel();
    const goal = activeGoals().find((item) => !completedToday(item));
    const box = $('#today-content');
    if (!goal) { box.innerHTML = activeGoals().length ? '<div class="empty">You have completed today’s recorded actions. Rest, or add another goal when it is genuinely useful.</div>' : '<div class="empty">No active goal yet. Start with a goal that matters and one action small enough to finish.</div>'; return; }
    box.innerHTML = `<div class="today-card"><div><p class="eyebrow">NEXT ACTION</p><h3>${esc(goal.action)}</h3><p>For <strong>${esc(goal.title)}</strong></p></div><button class="button primary" data-complete="${goal.id}">Mark complete</button></div>`;
  }
  function renderGoals() {
    const list = $('#goal-list');
    if (!state.goals.length) { list.innerHTML = '<div class="empty">Your goals will appear here. Keep the first one concrete and kind to your future self.</div>'; return; }
    list.innerHTML = state.goals.map((goal) => { const progress = goalProgress(goal); const badge = goal.status === 'active' ? `<span class="badge">Active</span>` : goal.status === 'paused' ? `<span class="badge paused">Paused</span>` : `<span class="badge done">Abandoned</span>`; const milestones = goal.milestones.length ? `<ul>${goal.milestones.map((item) => `<li><label><input type="checkbox" data-milestone="${goal.id}" data-milestone-id="${item.id}" ${item.done ? 'checked' : ''} ${goal.status !== 'active' ? 'disabled' : ''}> ${esc(item.title)}</label></li>`).join('')}</ul>` : '<p class="muted small">No milestones; action completion is recorded as progress.</p>'; return `<article class="goal-card ${goal.status !== 'active' ? 'is-paused' : ''}"><div class="goal-top"><h3>${esc(goal.title)}</h3>${badge}</div>${goal.why ? `<p class="goal-why">${esc(goal.why)}</p>` : ''}<div class="progress-bar" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(goal.title)} progress"><span style="width:${progress}%"></span></div><div class="goal-meta"><span>${progress}% complete</span><span>${goal.milestones.filter((item) => item.done).length}/${goal.milestones.length || 1} milestones</span></div><details><summary>Plan and milestones</summary><p><strong>Next action:</strong> ${esc(goal.action)}</p>${milestones}</details><div class="card-actions">${goal.status === 'active' ? `<button class="button secondary" data-pause="${goal.id}">Pause</button>` : goal.status === 'paused' ? `<button class="button secondary" data-resume="${goal.id}">Resume</button>` : ''}${goal.status !== 'abandoned' ? `<button class="button ghost" data-recovery="${goal.id}">Make it smaller</button>` : ''}<button class="button danger" data-abandon="${goal.id}">Abandon</button></div></article>`; }).join('');
  }
  function render() { const stats = totalStats(); $('#hero-progress').textContent = `${stats.totalProgress}%`; $('#completed-count').textContent = state.events.filter((event) => event.type === 'action_completed').length; $('#active-count').textContent = activeGoals().length; $('#milestone-count').textContent = `${stats.complete}/${stats.total}`; renderToday(); renderGoals(); }
  function findGoal(id) { return state.goals.find((goal) => goal.id === id); }

  $('#goal-form').addEventListener('submit', (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const title = String(form.get('title') || '').trim(); const action = String(form.get('action') || '').trim(); const why = String(form.get('why') || '').trim(); const milestones = String(form.get('milestones') || '').split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 20); if (!title || !action) { showNotice('Add a goal title and a smallest next action.', true); return; } if (state.goals.length >= MAX_GOALS) { showNotice('This local workspace has reached its goal limit. Export a backup and remove old data first.', true); return; } state.goals.unshift({ id:uid(), title, why, action, status:'active', createdAt:new Date().toISOString(), completedActions:0, milestones:milestones.map((item) => ({ id:uid(), title:item, done:false })) }); event.currentTarget.reset(); save(); showNotice('Goal created. Your next action is ready.'); $('#today').scrollIntoView({ behavior:'smooth', block:'start' }); });
  document.addEventListener('click', (event) => { const button = event.target.closest('button'); if (!button) return; const id = button.dataset.complete || button.dataset.pause || button.dataset.resume || button.dataset.recovery || button.dataset.abandon; if (!id) return; const goal = findGoal(id); if (!goal) { showNotice('That goal no longer exists. Refreshing your view.', true); render(); return; } if (button.dataset.complete && goal.status === 'active' && !completedToday(goal)) { goal.completedActions += 1; state.events.push({ id:uid(), type:'action_completed', goalId:id, date:todayKey(), at:new Date().toISOString() }); save(); showNotice('Action recorded. That is meaningful progress.'); } else if (button.dataset.pause && goal.status === 'active') { goal.status = 'paused'; save(); showNotice('Goal paused. Its history is preserved.'); } else if (button.dataset.resume && goal.status === 'paused') { goal.status = 'active'; save(); showNotice('Goal resumed. Choose a manageable next step.'); } else if (button.dataset.recovery && goal.status !== 'abandoned') { goal.action = `Minimum version: ${goal.action.replace(/^Minimum version:\s*/i, '')}`; save(); showNotice('The next action was reframed as a smaller minimum action.'); } else if (button.dataset.abandon && goal.status !== 'abandoned' && window.confirm('Abandon this goal? Its history will be preserved, but it will stop appearing as an active action.')) { goal.status = 'abandoned'; goal.closedAt = new Date().toISOString(); save(); showNotice('Goal closed without deleting its history.'); } });
  document.addEventListener('change', (event) => { const input = event.target.closest('[data-milestone]'); if (!input) return; const goal = findGoal(input.dataset.milestone); const milestone = goal && goal.milestones.find((item) => item.id === input.dataset.milestoneId); if (!goal || !milestone || goal.status !== 'active') return; milestone.done = input.checked; save(); showNotice(input.checked ? 'Milestone completed.' : 'Milestone reopened.'); });
  $('#export-data').addEventListener('click', () => { const blob = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `ascent-backup-${todayKey()}.json`; link.click(); URL.revokeObjectURL(link.href); showNotice('Backup downloaded.'); });
  $('#import-data').addEventListener('change', async (event) => { const file = event.target.files[0]; if (!file) return; try { const imported = JSON.parse(await file.text()); if (imported.version !== 1 || !Array.isArray(imported.goals) || !Array.isArray(imported.events) || imported.goals.length > MAX_GOALS) throw new Error('Unsupported backup'); state = imported; save(); showNotice('Backup imported.'); } catch { showNotice('That backup is invalid or unsupported. No data was changed.', true); } event.target.value = ''; });
  $('#reset-data').addEventListener('click', () => { if (!window.confirm('Reset all local Ascent data? Export a backup first if you need it.')) return; state = structuredClone(seed); save(); showNotice('Local workspace reset.'); });
  render();
})();
