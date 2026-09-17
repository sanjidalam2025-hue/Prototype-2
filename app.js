(() => {
  'use strict';

  const state = {
    authMode: 'login',
    user: null,
    goals: [],
    profile: null,
    loading: false,
    noticeTimeout: null,
  };

  const authShell = document.getElementById('auth-shell');
  const appShell = document.getElementById('app-shell');
  const authForm = document.getElementById('auth-form');
  const authStatus = document.getElementById('auth-status');
  const authSubmit = document.getElementById('auth-submit');
  const logoutButton = document.getElementById('logout-button');
  const notice = document.getElementById('notice');
  const goalForm = document.getElementById('goal-form');

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));

  function setNotice(message, isError = false) {
    notice.textContent = message;
    notice.classList.toggle('error', isError);
    notice.classList.remove('hidden');
    clearTimeout(state.noticeTimeout);
    state.noticeTimeout = setTimeout(() => {
      notice.classList.add('hidden');
    }, 4000);
  }

  function setAuthStatus(message, isError = false) {
    authStatus.textContent = message;
    authStatus.classList.toggle('error', isError);
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    document.querySelectorAll('.mode-button').forEach((button) => {
      const active = button.dataset.authMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    authSubmit.textContent = mode === 'register' ? 'Create account' : 'Log in';
  }

  function renderAuthView() {
    const signedIn = Boolean(state.user);
    authShell.classList.toggle('hidden', signedIn);
    appShell.classList.toggle('hidden', !signedIn);
    logoutButton.classList.toggle('hidden', !signedIn);
  }

  function formatDateLabel() {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    }).format(new Date());
  }

  function updateSummary() {
    const completedActions = state.goals.reduce((count, goal) => count + (goal.completedActions || 0), 0);
    const activeGoals = state.goals.filter((goal) => goal.status === 'active').length;
    const milestoneDone = state.goals.reduce((count, goal) => count + (goal.completedMilestones || 0), 0);
    const totalMilestones = state.goals.reduce((count, goal) => count + (goal.totalMilestones || 0), 0);
    const averageProgress = state.goals.length ? Math.round(state.goals.reduce((total, goal) => total + (goal.progress || 0), 0) / state.goals.length) : 0;

    document.getElementById('today-date').textContent = formatDateLabel();
    document.getElementById('hero-progress').textContent = `${averageProgress}%`;
    document.getElementById('completed-count').textContent = String(completedActions);
    document.getElementById('active-count').textContent = String(activeGoals);
    document.getElementById('milestone-count').textContent = `${milestoneDone}/${totalMilestones || 0}`;
  }

  function renderProfile() {
    const container = document.getElementById('profile-content');
    if (!state.profile) {
      container.innerHTML = `
        <form id="profile-form" class="profile-form" novalidate>
          <label for="values">Values</label>
          <textarea id="values" name="values" rows="2" maxlength="350" placeholder="What matters most to you?"></textarea>

          <label for="strengths">Strengths</label>
          <textarea id="strengths" name="strengths" rows="2" maxlength="350" placeholder="What helps you move forward?"></textarea>

          <label for="barriers">Barriers</label>
          <textarea id="barriers" name="barriers" rows="2" maxlength="350" placeholder="What usually gets in the way?"></textarea>

          <label for="dream">Dream</label>
          <textarea id="dream" name="dream" rows="2" maxlength="350" placeholder="What future do you want to build?"></textarea>

          <button class="button primary" type="submit">Save growth profile</button>
        </form>
      `;
      const form = document.getElementById('profile-form');
      if (form) {
        form.addEventListener('submit', saveProfile);
      }
      return;
    }

    container.innerHTML = `
      <div class="profile-summary">
        <div class="summary-row"><strong>Values:</strong> <span>${esc(state.profile.values || 'Not set')}</span></div>
        <div class="summary-row"><strong>Strengths:</strong> <span>${esc(state.profile.strengths || 'Not set')}</span></div>
        <div class="summary-row"><strong>Barriers:</strong> <span>${esc(state.profile.barriers || 'Not set')}</span></div>
        <div class="summary-row"><strong>Dream:</strong> <span>${esc(state.profile.dream || 'Not set')}</span></div>
        <button class="button secondary" type="button" id="edit-profile-button">Update profile</button>
      </div>
    `;
    const editButton = document.getElementById('edit-profile-button');
    if (editButton) {
      editButton.addEventListener('click', () => {
        state.profile = null;
        renderProfile();
      });
    }
  }

  function renderToday() {
    const box = document.getElementById('today-content');
    const activeGoals = state.goals.filter((goal) => goal.status === 'active');
    if (!activeGoals.length) {
      box.innerHTML = '<div class="empty">No active goal yet. Create a goal with a clear next action.</div>';
      return;
    }

    const firstGoal = activeGoals[0];
    box.innerHTML = `
      <div class="today-card">
        <div>
          <p class="eyebrow">NEXT ACTION</p>
          <h4>${esc(firstGoal.action)}</h4>
          <p>For <strong>${esc(firstGoal.title)}</strong></p>
        </div>
        <button class="button primary" data-action="complete-goal" data-goal-id="${firstGoal.id}" type="button">Mark complete</button>
      </div>
    `;
  }

  function renderGoals() {
    const list = document.getElementById('goal-list');
    if (!state.goals.length) {
      list.innerHTML = '<div class="empty">Your goals will appear here once you create one.</div>';
      return;
    }

    list.innerHTML = state.goals.map((goal) => {
      const badgeClass = goal.status === 'paused' ? 'badge paused' : goal.status === 'abandoned' ? 'badge done' : 'badge';
      const badgeText = goal.status === 'paused' ? 'Paused' : goal.status === 'abandoned' ? 'Closed' : 'Active';
      const milestonesHtml = goal.milestones.length
        ? goal.milestones.map((milestone) => `
            <li>
              <label>
                <input type="checkbox" data-action="toggle-milestone" data-goal-id="${goal.id}" data-milestone-id="${milestone.id}" ${milestone.done ? 'checked' : ''} ${goal.status !== 'active' ? 'disabled' : ''} />
                <span>${esc(milestone.title)}</span>
              </label>
            </li>
          `).join('')
        : '<li class="muted">No milestones yet.</li>';

      const actionButtons = [];
      if (goal.status === 'active') {
        actionButtons.push(`<button class="button secondary" type="button" data-action="pause-goal" data-goal-id="${goal.id}">Pause</button>`);
      } else if (goal.status === 'paused') {
        actionButtons.push(`<button class="button secondary" type="button" data-action="resume-goal" data-goal-id="${goal.id}">Resume</button>`);
      }

      actionButtons.push(`<button class="button ghost" type="button" data-action="recover-goal" data-goal-id="${goal.id}">Make smaller</button>`);
      actionButtons.push(`<button class="button danger" type="button" data-action="abandon-goal" data-goal-id="${goal.id}">Abandon</button>`);

      return `
        <article class="goal-card ${goal.status !== 'active' ? 'is-paused' : ''}">
          <div class="goal-top">
            <h4>${esc(goal.title)}</h4>
            <span class="${badgeClass}">${badgeText}</span>
          </div>
          ${goal.why ? `<p class="goal-why">${esc(goal.why)}</p>` : ''}
          <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${goal.progress || 0}"><span style="width:${goal.progress || 0}%"></span></div>
          <div class="goal-meta">
            <span>${goal.progress || 0}% complete</span>
            <span>${goal.completedMilestones || 0}/${goal.totalMilestones || 0} milestones</span>
          </div>
          <p class="goal-action"><strong>Next action:</strong> ${esc(goal.action)}</p>
          <ul class="milestone-list">${milestonesHtml}</ul>
          <div class="card-actions">${actionButtons.join('')}</div>
        </article>
      `;
    }).join('');
  }

  function render() {
    renderAuthView();
    if (!state.user) {
      return;
    }
    renderProfile();
    updateSummary();
    renderToday();
    renderGoals();
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });

    let data = null;
    const isJson = response.headers.get('content-type')?.includes('application/json');
    if (isJson) {
      data = await response.json();
    }

    if (!response.ok) {
      throw new Error(data?.error || 'Request failed.');
    }

    return data;
  }

  async function loadGoals() {
    const data = await fetchJson('/api/goals');
    state.goals = (data.goals || []).map((goal) => ({
      ...goal,
      milestones: goal.milestones || [],
      completedMilestones: goal.completedMilestones || 0,
      totalMilestones: goal.totalMilestones || 0,
      progress: goal.progress || 0,
      status: goal.status || 'active'
    }));
    render();
  }

  async function loadProfile() {
    try {
      const data = await fetchJson('/api/profile');
      state.profile = data.profile || null;
    } catch (error) {
      state.profile = null;
    }
    render();
  }

  async function loadCurrentUser() {
    try {
      const data = await fetchJson('/api/auth/me');
      state.user = data.user;
      await loadGoals();
      await loadProfile();
    } catch (error) {
      state.user = null;
      render();
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    if (state.loading) return;

    const formData = new FormData(authForm);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '').trim();

    if (!email || !password) {
      setAuthStatus('Please provide both email and password.', true);
      return;
    }

    state.loading = true;
    authSubmit.disabled = true;
    setAuthStatus('Working...');

    try {
      const endpoint = state.authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const data = await fetchJson(endpoint, {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      state.user = data.user;
      await loadGoals();
      await loadProfile();
      authForm.reset();
      setAuthStatus('');
    } catch (error) {
      setAuthStatus(error.message, true);
    } finally {
      state.loading = false;
      authSubmit.disabled = false;
    }
  }

  async function handleLogout() {
    try {
      await fetchJson('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      // best-effort logout even if the server returns a failure
    }
    state.user = null;
    state.goals = [];
    state.profile = null;
    render();
  }

  async function createGoal(event) {
    event.preventDefault();
    const formData = new FormData(goalForm);
    const title = String(formData.get('title') || '').trim();
    const why = String(formData.get('why') || '').trim();
    const action = String(formData.get('action') || '').trim();
    const milestones = String(formData.get('milestones') || '')
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20);

    if (!title || !action) {
      setNotice('Use both a goal title and a smallest next action.', true);
      return;
    }

    try {
      const response = await fetchJson('/api/goals', {
        method: 'POST',
        body: JSON.stringify({ title, why, action, milestones })
      });
      goalForm.reset();
      state.goals = [...state.goals, response.goal];
      render();
      setNotice('Goal created.');
    } catch (error) {
      setNotice(error.message, true);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const values = String(formData.get('values') || '').trim();
    const strengths = String(formData.get('strengths') || '').trim();
    const barriers = String(formData.get('barriers') || '').trim();
    const dream = String(formData.get('dream') || '').trim();

    if (!values && !strengths && !barriers && !dream) {
      setNotice('Add at least one detail to save your profile.', true);
      return;
    }

    try {
      const data = await fetchJson('/api/profile', {
        method: 'POST',
        body: JSON.stringify({ values, strengths, barriers, dream })
      });
      state.profile = data.profile;
      render();
      setNotice('Growth profile saved.');
    } catch (error) {
      setNotice(error.message, true);
    }
  }

  async function completeGoal(goalId) {
    try {
      const response = await fetchJson(`/api/goals/${goalId}/complete`, { method: 'POST' });
      const index = state.goals.findIndex((goal) => goal.id === goalId);
      if (index >= 0) {
        state.goals[index] = response.goal;
      }
      render();
      setNotice(response.duplicate ? 'That action was already recorded today.' : 'Action completed successfully.');
    } catch (error) {
      setNotice(error.message, true);
    }
  }

  async function toggleMilestone(goalId, milestoneId, done) {
    try {
      const response = await fetchJson(`/api/goals/${goalId}/milestones/${milestoneId}`, {
        method: 'PATCH',
        body: JSON.stringify({ done })
      });
      const index = state.goals.findIndex((goal) => goal.id === goalId);
      if (index >= 0) {
        state.goals[index] = response.goal;
      }
      render();
    } catch (error) {
      setNotice(error.message, true);
    }
  }

  async function pauseGoal(goalId) {
    try {
      const response = await fetchJson(`/api/goals/${goalId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'paused' })
      });
      const index = state.goals.findIndex((goal) => goal.id === goalId);
      if (index >= 0) {
        state.goals[index] = response.goal;
      }
      render();
      setNotice('Goal paused.');
    } catch (error) {
      setNotice(error.message, true);
    }
  }

  async function resumeGoal(goalId) {
    try {
      const response = await fetchJson(`/api/goals/${goalId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' })
      });
      const index = state.goals.findIndex((goal) => goal.id === goalId);
      if (index >= 0) {
        state.goals[index] = response.goal;
      }
      render();
      setNotice('Goal resumed.');
    } catch (error) {
      setNotice(error.message, true);
    }
  }

  async function abandonGoal(goalId) {
    if (!window.confirm('Abandon this goal? Its history stays intact, but it will stop appearing as active.')) {
      return;
    }

    try {
      const response = await fetchJson(`/api/goals/${goalId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'abandoned' })
      });
      const index = state.goals.findIndex((goal) => goal.id === goalId);
      if (index >= 0) {
        state.goals[index] = response.goal;
      }
      render();
      setNotice('Goal closed without losing its history.');
    } catch (error) {
      setNotice(error.message, true);
    }
  }

  async function recoverGoal(goalId) {
    const nextAction = window.prompt('What is the smaller minimum action for this goal?');
    if (!nextAction || !nextAction.trim()) {
      return;
    }

    try {
      const response = await fetchJson(`/api/goals/${goalId}/recover`, {
        method: 'POST',
        body: JSON.stringify({ nextAction: nextAction.trim() })
      });
      const index = state.goals.findIndex((goal) => goal.id === goalId);
      if (index >= 0) {
        state.goals[index] = response.goal;
      }
      render();
      setNotice('Recovery action saved.');
    } catch (error) {
      setNotice(error.message, true);
    }
  }

  document.querySelectorAll('.mode-button').forEach((button) => {
    button.addEventListener('click', () => setAuthMode(button.dataset.authMode));
  });

  authForm.addEventListener('submit', handleAuthSubmit);
  logoutButton.addEventListener('click', handleLogout);
  goalForm.addEventListener('submit', createGoal);

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const { action, goalId, milestoneId } = target.dataset;
    if (action === 'complete-goal') return completeGoal(goalId);
    if (action === 'pause-goal') return pauseGoal(goalId);
    if (action === 'resume-goal') return resumeGoal(goalId);
    if (action === 'abandon-goal') return abandonGoal(goalId);
    if (action === 'recover-goal') return recoverGoal(goalId);
  });

  document.addEventListener('change', (event) => {
    const target = event.target.closest('[data-action="toggle-milestone"]');
    if (!target) return;
    toggleMilestone(target.dataset.goalId, target.dataset.milestoneId, target.checked);
  });

  setAuthMode('login');
  render();
  loadCurrentUser();
})();
