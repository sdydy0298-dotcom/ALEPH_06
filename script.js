const state = {
  plans: [],
  currentPlanId: null,
  planDetail: null,
  tasks: [],
  tags: [],
  review: null,
  evidence: [],
  calendarTasks: [],
  calendarExecutions: [],
  calendarMonth: null,
  selectedCalendarDate: null,
  reviewPeriod: { type: 'all', startDate: null, endDate: null }
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const planSelect = $('#planSelect');

function textNode(tag, text, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function formatMinutes(value) {
  const minutes = Number(value || 0);
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(minutes);
  if (abs < 60) return `${sign}${abs}분`;
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}시간${m ? ` ${m}분` : ''}`;
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00+09:00`);
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function priorityLabel(value) {
  return ({ high: '높음', medium: '보통', low: '낮음' })[value] || value;
}

function showToast(message, isError = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast show${isError ? ' error' : ''}`;
  try {
    if (typeof toast.showPopover === 'function') {
      if (toast.matches(':popover-open')) toast.hidePopover();
      toast.showPopover();
    }
  } catch {}
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    try { if (toast.matches(':popover-open')) toast.hidePopover(); } catch {}
    toast.className = 'toast';
  }, isError ? 5200 : 2800);
}

function friendlyError(error) {
  const status = Number(error?.status || 0);
  const raw = String(error?.message || '');
  if (isLocalMode()) return '\ub85c\uceec \ubbf8\ub9ac\ubcf4\uae30\uc5d0\uc11c\ub294 DB \uc800\uc7a5\uc744 \uc0ac\uc6a9\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4. Supabase\uc640 Vercel DB \uD658\uACBD \uBCC0\uC218\uc744 \uc5f0\uacb0\ud55c \ubc30\ud3ec \uc8fc\uc18c\uc5d0\uc11c \uc800\uc7a5\ud574 \uc8fc\uc138\uc694.';
  if (status >= 500 || /Failed to fetch|NetworkError|Load failed|\uc11c\ubc84 \ucc98\ub9ac \uc911 \uc624\ub958/.test(raw)) return '\uc800\uc7a5\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4. \uc544\uc9c1 DB\ub97c \uc5f0\uacb0\ud558\uc9c0 \uc54a\uc558\ub2e4\uba74 Supabase \uc5f0\uacb0\uacfc Vercel\uc758 DB \uD658\uACBD \uBCC0\uC218 \uc124\uc815\uc744 \ud655\uc778\ud574 \uc8fc\uc138\uc694.';
  return raw || '\uc694\uccad\uc744 \ucc98\ub9ac\ud558\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4. \uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud574 \uc8fc\uc138\uc694.';
}

function clearFormFeedback(id) {
  const box = document.getElementById(id);
  if (!box) return;
  box.textContent = '';
  box.classList.add('hidden');
}

function showFormFeedback(id, message) {
  const box = document.getElementById(id);
  if (!box) return;
  box.textContent = message;
  box.classList.remove('hidden');
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function setFormBusy(form, busy, busyText) {
  const submit = form?.querySelector('[type="submit"]');
  if (!submit) return;
  if (busy) {
    submit.dataset.originalText = submit.textContent;
    submit.textContent = busyText;
    submit.disabled = true;
  } else {
    submit.textContent = submit.dataset.originalText || submit.textContent;
    submit.disabled = false;
    delete submit.dataset.originalText;
  }
}

async function api(path, options = {}) {
  const init = { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } };
  let response;
  try { response = await fetch(path, init); }
  catch (error) {
    const wrapped = new Error(error?.message || 'Failed to fetch');
    wrapped.status = 0;
    throw wrapped;
  }
  if (!response.ok) {
    let body = {};
    try { body = await response.json(); } catch {}
    const error = new Error(body.message || `\uc694\uccad \uc2e4\ud328 (${response.status})`);
    error.status = response.status;
    error.code = body.error || '';
    throw error;
  }
  return response.json();
}

function switchSection(id, updateHash = true) {
  const titles = { dashboard: '오늘', plan: '계획', calendar: '캘린더', see: '돌아보기', data: '데이터' };
  $$('.page-section').forEach(section => section.classList.toggle('active-section', section.id === id));
  $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.target === id));
  const pageTitle = $('#workspacePageTitle');
  if (pageTitle) pageTitle.textContent = titles[id] || 'PlanDoSee';
  const quickAdd = $('#workspaceQuickAdd');
  if (quickAdd) quickAdd.classList.toggle('hidden', id === 'plan');
  if (updateHash && window.location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function currentPlan() {
  return state.plans.find(plan => plan.id === state.currentPlanId) || null;
}

async function loadPlans(preferId = null) {
  const data = await api('/api/plans');
  state.plans = data.plans || [];
  const keep = preferId || state.currentPlanId;
  state.currentPlanId = state.plans.some(plan => plan.id === keep) ? keep : state.plans[0]?.id || null;
  renderPlanSelect();
  await loadCurrentPlanData();
}

function renderPlanSelect() {
  if (planSelect) planSelect.replaceChildren();
  const list = $('#planList');
  const count = $('#planListCount');
  if (count) count.textContent = `${state.plans.length}개`;
  if (list) list.replaceChildren();

  if (!state.plans.length) {
    if (planSelect) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '계획 없음';
      planSelect.append(option);
    }
    return;
  }

  state.plans.forEach(plan => {
    if (planSelect) {
      const option = document.createElement('option');
      option.value = plan.id;
      option.textContent = plan.title;
      option.selected = plan.id === state.currentPlanId;
      planSelect.append(option);
    }

    if (!list) return;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `plan-list-card${plan.id === state.currentPlanId ? ' active' : ''}`;
    card.setAttribute('aria-pressed', plan.id === state.currentPlanId ? 'true' : 'false');

    const top = document.createElement('div');
    top.className = 'plan-list-card-top';
    top.append(textNode('strong', plan.title), textNode('span', priorityLabel(plan.priority), `priority-badge ${plan.priority || 'medium'}`));

    const meta = document.createElement('div');
    meta.className = 'plan-list-card-meta';
    meta.append(textNode('span', `${formatDate(plan.start_date)} ~ ${formatDate(plan.end_date)}`), textNode('span', `예상 ${formatMinutes(plan.estimated_minutes)}`));

    const foot = document.createElement('div');
    foot.className = 'plan-list-card-foot';
    foot.append(textNode('span', `v${plan.current_version_no || 1}`), textNode('span', plan.id === state.currentPlanId ? '현재 보고 있음' : '열기 →'));

    card.append(top, meta, foot);
    card.addEventListener('click', () => selectPlan(plan.id));
    list.append(card);
  });
}

function resetTaskControls() {
  const defaults = {
    taskSearch: '', statusFilter: '', priorityFilter: '', tagFilter: '', sortSelect: 'default'
  };
  Object.entries(defaults).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value;
  });
  const overdue = $('#overdueFilter');
  if (overdue) overdue.checked = false;
}

async function selectPlan(planId) {
  if (!planId || planId === state.currentPlanId) {
    renderPlanSelect();
    return;
  }
  state.currentPlanId = planId;
  state.reviewPeriod = { type:'all', startDate:null, endDate:null };
  state.calendarMonth = monthKeyFromDate(todaySeoul());
  state.selectedCalendarDate = todaySeoul();
  resetTaskControls();
  renderPlanSelect();
  try {
    await loadCurrentPlanData();
  } catch (error) {
    showToast(friendlyError(error), true);
  }
}

async function loadCurrentPlanData() {
  if (!state.currentPlanId) {
    state.planDetail = null;
    state.tasks = [];
    state.review = null;
    state.evidence = [];
    renderAll();
    return;
  }
  await Promise.all([loadPlanDetail(), loadTasks(), loadReview(), loadCalendar()]);
  renderAll();
}

async function loadPlanDetail() {
  const data = await api(`/api/plans?id=${encodeURIComponent(state.currentPlanId)}`);
  state.planDetail = data;
}

function taskQuery() {
  const params = new URLSearchParams({ planId: state.currentPlanId || '' });
  const q = $('#taskSearch').value.trim();
  const status = $('#statusFilter').value;
  const priority = $('#priorityFilter').value;
  const tag = $('#tagFilter').value;
  const sort = $('#sortSelect').value;
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  if (priority) params.set('priority', priority);
  if (tag) params.set('tag', tag);
  if ($('#overdueFilter').checked) params.set('overdue', '1');
  if (sort) params.set('sort', sort);
  return params.toString();
}

async function loadTasks() {
  if (!state.currentPlanId) { state.tasks = []; state.tags = []; return; }
  const data = await api(`/api/tasks?${taskQuery()}`);
  state.tasks = data.tasks || [];
  state.tags = data.tags || [];
}

function renderTagFilter() {
  const select = $('#tagFilter');
  if (!select) return;
  const current = select.value;
  select.replaceChildren();
  const all = document.createElement('option');
  all.value = '';
  all.textContent = '모든 태그';
  select.append(all);
  state.tags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag;
    option.selected = tag === current;
    select.append(option);
  });
  if (current && !state.tags.includes(current)) select.value = '';
}


async function loadReview() {
  if (!state.currentPlanId) { state.review = null; state.evidence = []; return; }
  const params = new URLSearchParams({ planId: state.currentPlanId });
  if (state.reviewPeriod.startDate && state.reviewPeriod.endDate) {
    params.set('startDate', state.reviewPeriod.startDate);
    params.set('endDate', state.reviewPeriod.endDate);
  }
  const data = await api(`/api/review?${params.toString()}`);
  state.review = data.review;
  state.evidence = data.evidence || [];
}

async function loadCalendar() {
  if (!state.currentPlanId) {
    state.calendarTasks = [];
    state.calendarExecutions = [];
    return;
  }
  const [taskData, executionData] = await Promise.all([
    api(`/api/tasks?planId=${encodeURIComponent(state.currentPlanId)}&sort=due`),
    api(`/api/executions?planId=${encodeURIComponent(state.currentPlanId)}`)
  ]);
  state.calendarTasks = taskData.tasks || [];
  state.calendarExecutions = executionData.executions || [];
}

function renderAll() {
  renderDashboard();
  renderPlan();
  renderTasks();
  renderCalendar();
  renderReview();
  $('#lastUpdated').textContent = `서울 기준 ${new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }).format(new Date())}`;
}

function renderDashboard() {
  const plan = currentPlan();
  const empty = $('#homeEmptyState');
  const content = $('#homeContent');
  const hasPlan = Boolean(plan);
  empty.classList.toggle('hidden', hasPlan);
  content.classList.toggle('hidden', !hasPlan);

  const hero = $('#planHero');
  hero.replaceChildren();
  if (!plan) {
    hero.append(textNode('div', '아직 계획이 없습니다.', 'empty-box'));
  } else {
    const copy = document.createElement('div');
    copy.append(
      textNode('span', `v${plan.current_version_no} · 우선순위 ${priorityLabel(plan.priority)}`, 'status-badge'),
      textNode('h2', plan.title),
      textNode('p', `${formatDate(plan.start_date)} ~ ${formatDate(plan.end_date)} · ${plan.success_criteria}`)
    );
    const metric = document.createElement('div');
    metric.className = 'focus-time';
    metric.append(textNode('span', '계획 예상 시간'), textNode('strong', formatMinutes(plan.estimated_minutes || 0)));
    hero.append(copy, metric);
  }

  const r = state.review || {};
  const total = Number(r.task_count || 0);
  const done = Number(r.completed_count || 0);
  const completion = total ? Math.round((done / total) * 100) : 0;
  $('#metricTask').textContent = total;
  $('#metricDone').textContent = done;
  $('#metricDelayed').textContent = r.delayed_count || 0;
  $('#metricBlocked').textContent = r.blocked_count || 0;
  $('#metricEstimated').textContent = formatMinutes(r.estimated_minutes || 0);
  $('#metricActual').textContent = formatMinutes(r.actual_minutes || 0);
  $('#metricDelta').textContent = formatMinutes(r.delta_minutes || 0);
  $('#metricCompletion').textContent = `${completion}%`;
  $('#metricProgressBar').style.width = `${completion}%`;
  const ring = $('#completionRing');
  if (ring) ring.style.setProperty('--progress', `${Math.min(Math.max(completion, 0), 100) * 3.6}deg`);
  $('#progressDoneText').textContent = done;
  $('#progressRemainText').textContent = Math.max(total - done, 0);

  const recent = $('#recentTasks');
  recent.replaceChildren();
  const nextTasks = state.tasks.filter(task => task.status !== 'done').slice(0, 6);
  if (!nextTasks.length) {
    recent.className = 'today-task-list empty-box';
    recent.textContent = total && done === total ? '현재 계획의 할 일을 모두 완료했습니다.' : '아직 진행 중인 할 일이 없습니다. 할 일을 하나 추가해 보세요.';
    return;
  }

  recent.className = 'today-task-list';
  nextTasks.forEach(task => {
    const row = document.createElement('article');
    row.className = 'today-task-item';

    const complete = document.createElement('button');
    complete.type = 'button';
    complete.className = 'today-task-check';
    complete.textContent = '✓';
    complete.title = '완료로 표시';
    complete.addEventListener('click', () => changeTaskStatus(task));

    const copy = document.createElement('div');
    copy.className = 'today-task-copy';
    const meta = [formatDate(task.due_date), `우선순위 ${priorityLabel(task.priority)}`, task.tag || null, `예상 ${formatMinutes(task.estimated_minutes)}`].filter(Boolean).join(' · ');
    copy.append(textNode('strong', task.title), textNode('span', meta));

    const actions = document.createElement('div');
    actions.className = 'today-task-actions';
    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'start-button';
    start.textContent = '실행 기록';
    start.addEventListener('click', () => openExecutionDialog(task));
    actions.append(start);
    row.append(complete, copy, actions);
    recent.append(row);
  });
}

function renderPlanHistory() {
  const history = $('#planHistory');
  if (!history) return;
  history.replaceChildren();
  const versions = state.planDetail?.versions || [];
  if (!versions.length) {
    history.className = 'timeline empty-box';
    history.textContent = '아직 저장된 수정 이력이 없습니다.';
    return;
  }
  history.className = 'timeline';
  versions.forEach((v, index) => {
    const item = document.createElement('div');
    item.className = 'timeline-item';
    const label = index === 0 ? `v${v.version_no} · 현재 버전` : `v${v.version_no}`;
    item.append(
      textNode('strong', label),
      textNode('p', v.title),
      textNode('p', `${formatDate(v.start_date)} ~ ${formatDate(v.end_date)} · ${priorityLabel(v.priority)} · ${formatMinutes(v.estimated_minutes)} · ${formatDateTime(v.created_at)}`)
    );
    history.append(item);
  });
}

function openPlanHistory() {
  if (!state.currentPlanId || !state.planDetail?.plan) return showToast('먼저 계획을 선택해 주세요.', true);
  const plan = state.planDetail.plan;
  const title = $('#planHistoryTitle');
  if (title) title.textContent = `${plan.title} · 수정 이력`;
  renderPlanHistory();
  $('#planHistoryDialog').showModal();
}

function renderPlan() {
  const emptyState = $('#planEmptyState');
  const content = $('#planContent');
  const detail = $('#planDetail');
  const quickAdd = $('#workspaceQuickAdd');
  const hasPlan = Boolean(state.currentPlanId && state.planDetail?.plan);

  if (emptyState) emptyState.classList.toggle('hidden', hasPlan);
  if (content) content.classList.toggle('hidden', !hasPlan);
  if (quickAdd) quickAdd.textContent = hasPlan ? '+ 할 일' : '+ 새 계획';
  if (!detail) return;
  detail.replaceChildren();

  if (!hasPlan) return;

  const p = state.planDetail.plan;
  const versions = state.planDetail.versions || [];
  const allTasks = state.calendarTasks || [];
  const doneTasks = allTasks.filter(task => task.status === 'done').length;
  const remainTasks = Math.max(allTasks.length - doneTasks, 0);
  const progress = allTasks.length ? Math.round((doneTasks / allTasks.length) * 100) : 0;

  const hero = document.createElement('div');
  hero.className = 'plan-detail-hero';

  const titleArea = document.createElement('div');
  titleArea.className = 'plan-detail-title';
  const badges = document.createElement('div');
  badges.className = 'plan-detail-badges';
  badges.append(textNode('span', `v${p.current_version_no || 1}`, 'plan-version-badge'), textNode('span', `우선순위 ${priorityLabel(p.priority)}`, `priority-badge ${p.priority || 'medium'}`));
  titleArea.append(badges, textNode('h2', p.title), textNode('p', `${formatDate(p.start_date)} ~ ${formatDate(p.end_date)} · 예상 ${formatMinutes(p.estimated_minutes)}`));

  const actions = document.createElement('div');
  actions.className = 'plan-detail-actions';
  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'subtle-action';
  editButton.textContent = '계획 수정';
  editButton.addEventListener('click', () => openPlanDialog('edit'));
  const historyButton = document.createElement('button');
  historyButton.type = 'button';
  historyButton.className = 'subtle-action';
  historyButton.textContent = '수정 이력';
  historyButton.addEventListener('click', openPlanHistory);
  actions.append(editButton, historyButton);
  hero.append(titleArea, actions);
  detail.append(hero);

  const success = document.createElement('div');
  success.className = 'plan-success-card';
  success.append(textNode('span', '성공 기준'), textNode('strong', p.success_criteria));
  detail.append(success);

  const flow = document.createElement('div');
  flow.className = 'plan-flow-summary';
  [['전체 할 일', `${allTasks.length}개`], ['완료', `${doneTasks}개`], ['남은 일', `${remainTasks}개`]].forEach(([label, value]) => {
    const item = document.createElement('div');
    item.append(textNode('span', label), textNode('strong', value));
    flow.append(item);
  });
  const progressBox = document.createElement('div');
  progressBox.className = 'plan-flow-progress';
  const progressCopy = document.createElement('div');
  progressCopy.append(textNode('span', '진행률'), textNode('strong', `${progress}%`));
  const track = document.createElement('div');
  track.className = 'plan-flow-track';
  const fill = document.createElement('span');
  fill.style.width = `${progress}%`;
  track.append(fill);
  progressBox.append(progressCopy, track);
  flow.append(progressBox);
  detail.append(flow);

  if (p.carried_improvement) {
    const carried = document.createElement('div');
    carried.className = 'carried-box';
    carried.append(textNode('span', '이전 돌아보기에서 가져온 개선점'), textNode('strong', p.carried_improvement));
    detail.append(carried);
  }

  const footer = document.createElement('div');
  footer.className = 'plan-detail-footer';
  footer.append(textNode('span', '계획 ID'), textNode('code', p.id));
  detail.append(footer);
  renderPlanHistory();
}

function renderTasks() {
  renderTagFilter();
  const scope = $('#planTaskScope');
  const selectedPlan = currentPlan();
  if (scope) scope.textContent = selectedPlan ? `${selectedPlan.title}에 연결된 할 일을 관리합니다.` : '계획을 선택하면 연결된 할 일이 여기에 표시됩니다.';
  const list = $('#taskList'); list.replaceChildren();
  const labels = {
    default: '정렬 기준: 진행 중 먼저 → 우선순위 높은 순 → 마감일 빠른 순 → 생성순',
    due: '정렬 기준: 마감일 빠른 순 → 생성순',
    priority: '정렬 기준: 우선순위 높은 순 → 마감일 빠른 순',
    created: '정렬 기준: 최근 생성 순',
    title: '정렬 기준: 제목 가나다순 → 생성순'
  };
  $('#sortNote').textContent = labels[$('#sortSelect').value] || labels.default;
  const resultCount = $('#taskResultCount');
  if (resultCount) resultCount.textContent = `${state.tasks.length}개`;
  if (!state.tasks.length) {
    const empty = document.createElement('div');
    empty.className = 'task-empty-state';
    const hasActiveFilter = Boolean($('#taskSearch').value.trim() || $('#statusFilter').value || $('#priorityFilter').value || $('#tagFilter').value || $('#overdueFilter').checked);
    empty.append(
      textNode('strong', hasActiveFilter ? '조건에 맞는 할 일이 없습니다.' : '아직 할 일이 없습니다.'),
      textNode('span', hasActiveFilter ? '검색어나 필터 조건을 바꿔보세요.' : '이 계획에서 실제로 해야 할 일을 하나씩 추가해보세요.')
    );
    if (!hasActiveFilter) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'subtle-action';
      button.textContent = '+ 첫 할 일 추가';
      button.addEventListener('click', () => openTaskDialog());
      empty.append(button);
    }
    list.append(empty);
    return;
  }
  state.tasks.forEach(task => {
    const card = document.createElement('article');
    card.className = `task-card${task.status === 'done' ? ' done' : ''}`;

    const main = document.createElement('div');
    main.className = 'task-card-main';
    const titleRow = document.createElement('div'); titleRow.className = 'task-title-row';
    titleRow.append(textNode('h3', task.title));
    if (task.tag) titleRow.append(textNode('span', task.tag, 'tag'));
    if (task.delayed) titleRow.append(textNode('span', '지연', 'tag alert'));
    if (task.blocked) titleRow.append(textNode('span', '막힘', 'tag alert'));
    if (task.status === 'done') titleRow.append(textNode('span', '완료', 'tag'));
    main.append(titleRow);
    if (task.description) main.append(textNode('p', task.description));

    const meta = document.createElement('div'); meta.className = 'task-meta-primary';
    meta.append(textNode('strong', formatDate(task.due_date)), textNode('span', `우선순위 ${priorityLabel(task.priority)}`));

    const time = document.createElement('div'); time.className = 'task-time-meta';
    time.append(textNode('strong', `예상 ${formatMinutes(task.estimated_minutes)}`), textNode('span', `실제 ${formatMinutes(task.actual_minutes)} · 기록 ${task.execution_count || 0}건`));

    const actions = document.createElement('div'); actions.className = 'task-actions';
    actions.append(actionButton(task.status === 'done' ? '진행 중' : '완료', task.status === 'done' ? '' : 'dark', () => changeTaskStatus(task)));
    actions.append(actionButton('기록 추가', '', () => openExecutionDialog(task)));
    if (Number(task.execution_count || 0) > 0) actions.append(actionButton('기록 보기', '', () => openExecutionHistory(task)));
    actions.append(actionButton('수정', '', () => openTaskDialog(task)));
    actions.append(actionButton('삭제', 'danger', () => deleteTask(task)));
    card.append(main, meta, time, actions); list.append(card);
  });
}

function actionButton(label, extraClass, handler) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = `mini-button ${extraClass}`.trim(); button.textContent = label; button.addEventListener('click', handler); return button;
}

function dateOnlySeoul(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(value));
}

function monthKeyFromDate(dateText) {
  return `${String(dateText).slice(0, 7)}-01`;
}

function ensureCalendarMonth() {
  if (!state.calendarMonth) state.calendarMonth = monthKeyFromDate(todaySeoul());
  if (!state.selectedCalendarDate) state.selectedCalendarDate = todaySeoul();
}

function addMonths(monthKey, delta) {
  const [year, month] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function formatCalendarTitle(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return `${year}년 ${month}월`;
}

function calendarMonthDates(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const daysThisMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const previous = addMonths(monthKey, -1);
  const [py, pm] = previous.split('-').map(Number);
  const daysPrevious = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    let y = year;
    let m = month;
    let day;
    let outside = false;
    if (i < firstWeekday) {
      day = daysPrevious - firstWeekday + i + 1;
      y = py; m = pm; outside = true;
    } else if (i >= firstWeekday + daysThisMonth) {
      const next = addMonths(monthKey, 1);
      [y, m] = next.split('-').map(Number);
      day = i - firstWeekday - daysThisMonth + 1;
      outside = true;
    } else {
      day = i - firstWeekday + 1;
    }
    cells.push({ date: `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`, day, outside });
  }
  return cells;
}

function renderCalendar() {
  const grid = $('#calendarGrid');
  if (!grid) return;
  ensureCalendarMonth();
  $('#calendarMonthTitle').textContent = formatCalendarTitle(state.calendarMonth);
  grid.replaceChildren();

  const plan = currentPlan();
  const today = todaySeoul();
  const planStart = plan?.start_date ? String(plan.start_date).slice(0,10) : null;
  const planEnd = plan?.end_date ? String(plan.end_date).slice(0,10) : null;
  const dates = calendarMonthDates(state.calendarMonth);

  dates.forEach(cellData => {
    const dayButton = document.createElement('button');
    dayButton.type = 'button';
    dayButton.className = 'calendar-day';
    if (cellData.outside) dayButton.classList.add('outside');
    if (planStart && planEnd && cellData.date >= planStart && cellData.date <= planEnd) dayButton.classList.add('in-plan');
    if (cellData.date === today) dayButton.classList.add('today');
    if (cellData.date === state.selectedCalendarDate) dayButton.classList.add('selected');
    dayButton.setAttribute('aria-label', `${cellData.date} 기록 보기`);
    dayButton.append(textNode('span', String(cellData.day), 'calendar-day-number'));

    if (planStart && planEnd && cellData.date >= planStart && cellData.date <= planEnd) {
      const bar = document.createElement('div');
      bar.className = 'calendar-plan-bar';
      bar.title = '현재 계획 기간';
      dayButton.append(bar);
    }

    const events = document.createElement('div');
    events.className = 'calendar-events';
    const dayTasks = state.calendarTasks.filter(task => String(task.due_date).slice(0,10) === cellData.date);
    const dayExecutions = state.calendarExecutions.filter(item => dateOnlySeoul(item.started_at) === cellData.date);
    const visibleTasks = dayTasks.slice(0, 2);

    visibleTasks.forEach(task => {
      const event = document.createElement('span');
      event.className = `calendar-event${task.status === 'done' ? ' done' : task.delayed ? ' delayed' : ''}`;
      event.append(textNode('strong', task.title));
      events.append(event);
    });

    const remaining = Math.max(dayTasks.length - visibleTasks.length, 0);
    if (dayExecutions.length) {
      const minutes = dayExecutions.reduce((sum, item) => sum + Number(item.actual_minutes || 0), 0);
      const event = document.createElement('span');
      event.className = 'calendar-event execution';
      event.append(textNode('strong', `실행 ${dayExecutions.length}건 · ${formatMinutes(minutes)}`));
      events.append(event);
    }
    if (remaining) events.append(textNode('span', `+${remaining}개 더보기`, 'calendar-more'));

    dayButton.append(events);
    dayButton.addEventListener('click', () => {
      state.selectedCalendarDate = cellData.date;
      if (cellData.outside) state.calendarMonth = monthKeyFromDate(cellData.date);
      renderCalendar();
    });
    grid.append(dayButton);
  });
  renderCalendarDetail();
}

function renderCalendarDetail() {
  const container = $('#calendarDetail');
  if (!container) return;
  const date = state.selectedCalendarDate || todaySeoul();
  const display = new Intl.DateTimeFormat('ko-KR', { timeZone:'Asia/Seoul', year:'numeric', month:'long', day:'numeric', weekday:'short' }).format(new Date(`${date}T00:00:00+09:00`));
  $('#calendarDetailTitle').textContent = display;
  const tasks = state.calendarTasks.filter(task => String(task.due_date).slice(0,10) === date);
  const executions = state.calendarExecutions.filter(item => dateOnlySeoul(item.started_at) === date);
  $('#calendarDetailMeta').textContent = `마감 ${tasks.length}개 · 실행 ${executions.length}건`;
  container.replaceChildren();
  if (!tasks.length && !executions.length) {
    container.className = 'calendar-detail empty-box';
    container.textContent = '이 날짜에는 마감 또는 실행 기록이 없습니다.';
    return;
  }
  container.className = 'calendar-detail calendar-detail-list';
  const taskGroup = document.createElement('div'); taskGroup.className = 'calendar-detail-group';
  taskGroup.append(textNode('h3', `마감 할 일 · ${tasks.length}개`));
  if (!tasks.length) taskGroup.append(textNode('div', '마감 할 일이 없습니다.', 'muted'));
  tasks.forEach(task => {
    const row = document.createElement('div'); row.className = 'calendar-detail-item';
    const copy = document.createElement('div'); copy.className = 'calendar-detail-copy';
    const states = [task.status === 'done' ? '완료' : task.delayed ? '지연' : '진행 중', priorityLabel(task.priority), task.tag || null, `예상 ${formatMinutes(task.estimated_minutes)}`].filter(Boolean).join(' · ');
    copy.append(textNode('strong', task.title), textNode('span', states));
    const actions = document.createElement('div'); actions.className = 'calendar-detail-actions';
    actions.append(actionButton('수정', '', () => openTaskDialog(task)));
    actions.append(actionButton('실행 기록', 'dark', () => openExecutionDialog(task)));
    row.append(copy, actions); taskGroup.append(row);
  });
  const executionGroup = document.createElement('div'); executionGroup.className = 'calendar-detail-group';
  executionGroup.append(textNode('h3', `실행 기록 · ${executions.length}건`));
  if (!executions.length) executionGroup.append(textNode('div', '실행 기록이 없습니다.', 'muted'));
  executions.forEach(item => {
    const row = document.createElement('div'); row.className = 'calendar-detail-item';
    const copy = document.createElement('div'); copy.className = 'calendar-detail-copy';
    copy.append(textNode('strong', item.task_title || '할 일'), textNode('span', `${formatDateTime(item.started_at)} → ${formatDateTime(item.ended_at)} · ${formatMinutes(item.actual_minutes)}`));
    if (item.blocker_reason) copy.append(textNode('span', `막힌 이유 · ${item.blocker_reason}`));
    row.append(copy); executionGroup.append(row);
  });
  container.append(taskGroup, executionGroup);
}

function shiftDate(dateText, days) {
  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
}

function mondayOfWeek(dateText) {
  const [year, month, day] = dateText.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const delta = (weekday + 6) % 7;
  return shiftDate(dateText, -delta);
}

function periodRange(type) {
  const today = todaySeoul();
  if (type === 'this-week') {
    const start = mondayOfWeek(today); return { startDate:start, endDate:shiftDate(start,6), label:`이번 주 · ${formatDate(start)} ~ ${formatDate(shiftDate(start,6))}` };
  }
  if (type === 'last-week') {
    const thisStart = mondayOfWeek(today); const start = shiftDate(thisStart,-7); return { startDate:start, endDate:shiftDate(start,6), label:`지난 주 · ${formatDate(start)} ~ ${formatDate(shiftDate(start,6))}` };
  }
  if (type === 'this-month') {
    const start = `${today.slice(0,7)}-01`;
    const [y,m] = start.split('-').map(Number);
    const last = new Date(Date.UTC(y,m,0)).getUTCDate();
    const end = `${start.slice(0,7)}-${String(last).padStart(2,'0')}`;
    return { startDate:start, endDate:end, label:`이번 달 · ${formatDate(start)} ~ ${formatDate(end)}` };
  }
  return { startDate:null, endDate:null, label:'전체 계획' };
}

function renderReviewPeriod() {
  const period = state.reviewPeriod;
  $$('.period-button').forEach(button => button.classList.toggle('active', button.dataset.reviewPeriod === period.type));
  const custom = $('#customReviewPeriod');
  custom.classList.toggle('hidden', period.type !== 'custom');
  let label = '전체 계획';
  if (period.startDate && period.endDate) label = `${formatDate(period.startDate)} ~ ${formatDate(period.endDate)}`;
  if (period.type !== 'custom') label = periodRange(period.type).label;
  $('#reviewPeriodLabel').textContent = label;
}

async function setReviewPeriod(type) {
  if (type === 'custom') {
    state.reviewPeriod.type = 'custom';
    renderReviewPeriod();
    return;
  }
  const range = periodRange(type);
  state.reviewPeriod = { type, startDate:range.startDate, endDate:range.endDate };
  await loadReview();
  renderReview();
  showToast(`${range.label} 기준으로 다시 계산했습니다.`);
}

function renderReview() {
  renderReviewPeriod();
  const r = state.review || {};
  $('#seeTask').textContent = r.task_count || 0;
  $('#seeDone').textContent = r.completed_count || 0;
  $('#seeDelayed').textContent = r.delayed_count || 0;
  $('#seeBlocked').textContent = r.blocked_count || 0;
  $('#seeEstimated').textContent = formatMinutes(r.estimated_minutes || 0);
  $('#seeActual').textContent = formatMinutes(r.actual_minutes || 0);
  $('#seeDelta').textContent = formatMinutes(r.delta_minutes || 0);
  $('#improvementText').value = r.improvement_text || '';
}

function showEvidence(type) {
  if (!state.currentPlanId) return;
  const titles = { all: '계획 수 근거 · 활성 할 일', completed: '완료 수 근거', delayed: '지연 수 근거', blocked: '막힘 수 근거', time: '시간 집계 근거' };
  $('#evidenceTitle').textContent = titles[type] || '집계 근거';
  let items = state.evidence;
  if (type === 'completed') items = items.filter(item => item.status === 'done');
  if (type === 'delayed') items = items.filter(item => item.delayed);
  if (type === 'blocked') items = items.filter(item => item.blocked);
  const list = $('#evidenceList'); list.replaceChildren(); list.className = 'evidence-list';
  if (!items.length) { list.append(textNode('div', '해당 집계의 근거 기록이 없습니다.', 'empty-box')); }
  else items.forEach(item => {
    const row = document.createElement('div'); row.className = 'evidence-row';
    row.append(textNode('strong', item.title), textNode('span', item.status === 'done' ? '완료' : '진행 중', 'muted'), textNode('span', `예상 ${formatMinutes(item.estimated_minutes)}`, 'muted'), textNode('span', `실제 ${formatMinutes(item.actual_minutes)}`, 'muted'));
    list.append(row);
  });
  switchSection('see');
  setTimeout(() => $('#evidencePanel').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

function isLocalMode() {
  return window.location.protocol === 'file:';
}

function renderExecutionHistory(task, executions) {
  $('#executionHistoryTitle').textContent = task.title;
  const list = $('#executionHistoryList');
  list.replaceChildren();
  if (!executions.length) {
    list.className = 'execution-history-list empty-box';
    list.textContent = '아직 저장된 실행 기록이 없습니다.';
    return;
  }
  list.className = 'execution-history-list';
  executions.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'execution-history-item';
    const top = document.createElement('div'); top.className = 'execution-history-top';
    top.append(textNode('strong', `실행 ${executions.length - index}`), textNode('span', formatMinutes(item.actual_minutes)));
    row.append(top, textNode('div', `${formatDateTime(item.started_at)} → ${formatDateTime(item.ended_at)}`, 'execution-history-meta'));
    if (item.blocker_reason) row.append(textNode('div', `막힌 이유 · ${item.blocker_reason}`, 'execution-history-blocker'));
    list.append(row);
  });
}

async function openExecutionHistory(task) {
  const dialog = $('#executionHistoryDialog');
  dialog.showModal();
  $('#executionHistoryTitle').textContent = task.title;
  const list = $('#executionHistoryList');
  list.className = 'execution-history-list empty-box';
  list.textContent = '실행 기록을 불러오는 중입니다.';
  try {
    const executions = isLocalMode()
      ? []
      : ((await api(`/api/executions?taskId=${encodeURIComponent(task.id)}`)).executions || []);
    renderExecutionHistory(task, executions);
  } catch (error) {
    list.textContent = '실행 기록을 불러오지 못했습니다.';
    showToast(error.message, true);
  }
}

function openPlanDialog(mode = 'new', sourceReviewId = '') {
  const dialog = $('#planDialog');
  const plan = currentPlan();
  const edit = mode === 'edit' && plan;
  $('#planDialogTitle').textContent = edit ? '현재 계획 수정' : sourceReviewId ? '다음 계획 만들기' : '새 계획';
  $('#planId').value = edit ? plan.id : '';
  $('#sourceReviewId').value = sourceReviewId || '';
  $('#planTitle').value = edit ? plan.title : '';
  $('#planStart').value = edit ? String(plan.start_date).slice(0, 10) : todaySeoul();
  $('#planEnd').value = edit ? String(plan.end_date).slice(0, 10) : todaySeoul();
  $('#planPriority').value = edit ? plan.priority : 'medium';
  $('#planEstimated').value = edit ? plan.estimated_minutes : 0;
  $('#planSuccess').value = edit ? plan.success_criteria : '';
  const hint = $('#carriedHint');
  if (sourceReviewId && state.review?.improvement_text) {
    hint.classList.remove('hidden'); hint.textContent = `다음 계획으로 넘어갈 개선점: ${state.review.improvement_text}`;
  } else { hint.classList.add('hidden'); hint.textContent = ''; }
  dialog.showModal();
}

function openTaskDialog(task = null) {
  clearFormFeedback('taskFormFeedback');
  if (!state.currentPlanId) return showToast('먼저 계획을 만들어 주세요.', true);
  $('#taskDialogTitle').textContent = task ? '할 일 수정' : '할 일 추가';
  $('#taskId').value = task?.id || '';
  $('#taskTitle').value = task?.title || '';
  $('#taskDescription').value = task?.description || '';
  $('#taskDue').value = task ? String(task.due_date).slice(0,10) : todaySeoul();
  $('#taskPriority').value = task?.priority || 'medium';
  $('#taskTag').value = task?.tag || '';
  $('#taskEstimated').value = task?.estimated_minutes ?? 0;
  $('#taskDialog').showModal();
}

function localDateTimeInput(date = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(date);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

function openExecutionDialog(task) {
  clearFormFeedback('executionFormFeedback');
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60000);
  $('#executionTaskId').value = task.id;
  $('#executionTaskTitle').textContent = task.title;
  $('#executionStart').value = localDateTimeInput(oneHourAgo);
  $('#executionEnd').value = localDateTimeInput(now);
  $('#executionBlocker').value = '';
  $('#executionDialog').showModal();
}

function todaySeoul() {
  return new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
}

function seoulLocalToIso(value) {
  return new Date(`${value}:00+09:00`).toISOString();
}

async function savePlan(event) {
  event.preventDefault();
  const id = $('#planId').value;
  const payload = {
    title: $('#planTitle').value,
    startDate: $('#planStart').value,
    endDate: $('#planEnd').value,
    priority: $('#planPriority').value,
    successCriteria: $('#planSuccess').value,
    estimatedMinutes: Number($('#planEstimated').value),
    sourceReviewId: $('#sourceReviewId').value || null
  };
  const form = event.currentTarget;
  clearFormFeedback('planFormFeedback');
  if (isLocalMode()) {
    const message = friendlyError(new Error('local'));
    showFormFeedback('planFormFeedback', message);
    showToast(message, true);
    return;
  }
  setFormBusy(form, true, '\uc800\uc7a5 \uc911...');
  try {
    const data = await api(id ? `/api/plans?id=${encodeURIComponent(id)}` : '/api/plans', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    $('#planDialog').close();
    await loadPlans(id || data.planId || data.plan?.id);
    showToast(id ? '계획 수정 이력을 새 버전으로 저장했습니다.' : '새 계획을 저장했습니다.');
  } catch (error) {
    const message = friendlyError(error);
    showFormFeedback('planFormFeedback', message);
    showToast(message, true);
  } finally { setFormBusy(form, false, ''); }
}

async function saveTask(event) {
  event.preventDefault();
  const id = $('#taskId').value;
  const payload = {
    planId: state.currentPlanId,
    title: $('#taskTitle').value,
    description: $('#taskDescription').value,
    dueDate: $('#taskDue').value,
    priority: $('#taskPriority').value,
    tag: $('#taskTag').value,
    estimatedMinutes: Number($('#taskEstimated').value)
  };
  const form = event.currentTarget;
  clearFormFeedback('taskFormFeedback');
  if (isLocalMode()) {
    const message = friendlyError(new Error('local'));
    showFormFeedback('taskFormFeedback', message);
    showToast(message, true);
    return;
  }
  setFormBusy(form, true, '\uc800\uc7a5 \uc911...');
  try {
    await api(id ? `/api/tasks?id=${encodeURIComponent(id)}` : '/api/tasks', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    $('#taskDialog').close();
    await Promise.all([loadTasks(), loadReview(), loadCalendar()]); renderAll();
    showToast(id ? '할 일을 수정했습니다.' : '할 일을 추가했습니다.');
  } catch (error) {
    const message = friendlyError(error);
    showFormFeedback('taskFormFeedback', message);
    showToast(message, true);
  } finally { setFormBusy(form, false, ''); }
}

async function changeTaskStatus(task) {
  try {
    const toStatus = task.status === 'done' ? 'in_progress' : 'done';
    const request = { method: 'POST', body: JSON.stringify({ taskId: task.id, toStatus }) };
    await api('/api/task-status', request);
    await Promise.all([loadTasks(), loadReview(), loadCalendar()]); renderAll();
    showToast(toStatus === 'done' ? '완료로 기록했습니다.' : '진행 중으로 되돌렸습니다.');
  } catch (error) { showToast(error.message, true); }
}

async function deleteTask(task) {
  if (!confirm(`"${task.title}" 할 일을 삭제할까요?`)) return;
  try {
    await api(`/api/tasks?id=${encodeURIComponent(task.id)}`, { method: 'DELETE' });
    await Promise.all([loadTasks(), loadReview(), loadCalendar()]); renderAll(); showToast('할 일을 삭제했습니다.');
  } catch (error) { showToast(error.message, true); }
}

async function saveExecution(event) {
  event.preventDefault();
  const start = $('#executionStart').value;
  const end = $('#executionEnd').value;
  if (!start || !end) return;
  const form = event.currentTarget;
  clearFormFeedback('executionFormFeedback');
  if (isLocalMode()) {
    const message = friendlyError(new Error('local'));
    showFormFeedback('executionFormFeedback', message);
    showToast(message, true);
    return;
  }
  setFormBusy(form, true, '\uc800\uc7a5 \uc911...');
  try {
    await api('/api/executions', { method: 'POST', body: JSON.stringify({ taskId: $('#executionTaskId').value, startedAt: seoulLocalToIso(start), endedAt: seoulLocalToIso(end), blockerReason: $('#executionBlocker').value }) });
    $('#executionDialog').close();
    await Promise.all([loadTasks(), loadReview(), loadCalendar()]); renderAll(); showToast('실제 실행 기록을 저장했습니다.');
  } catch (error) {
    const message = friendlyError(error);
    showFormFeedback('executionFormFeedback', message);
    showToast(message, true);
  } finally { setFormBusy(form, false, ''); }
}

async function saveImprovement(event) {
  event.preventDefault();
  if (!state.currentPlanId) return showToast('먼저 계획을 선택하세요.', true);
  try {
    await api('/api/review', { method: 'POST', body: JSON.stringify({ planId: state.currentPlanId, improvementText: $('#improvementText').value }) });
    await loadReview(); renderReview(); showToast('고칠 점을 저장했습니다.');
  } catch (error) { showToast(error.message, true); }
}

function startNextPlan() {
  if (!state.review?.improvement_text) return showToast('먼저 다음에 고칠 점을 저장하세요.', true);
  openPlanDialog('new', state.review.id);
}

function exportData() {
  if (isLocalMode()) {
    showToast('로컬 파일에서는 서버 데이터가 없습니다. 배포된 사이트에서 내보내기를 사용하세요.', true);
    return;
  }
  window.location.href = '/api/export';
}

function bindEvents() {
  $$('.nav-item').forEach(button => button.addEventListener('click', () => switchSection(button.dataset.target)));
  $$('[data-jump]').forEach(button => button.addEventListener('click', () => switchSection(button.dataset.jump)));
  $$('[data-close]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.close).close()));
  $$('[data-evidence]').forEach(button => button.addEventListener('click', () => showEvidence(button.dataset.evidence)));
  $$('.period-button').forEach(button => button.addEventListener('click', async () => {
    if (!state.currentPlanId) return showToast('먼저 계획을 만들어 주세요.', true);
    try { await setReviewPeriod(button.dataset.reviewPeriod); } catch (e) { showToast(e.message, true); }
  }));
  $('#applyReviewPeriodButton').addEventListener('click', async () => {
    const startDate = $('#reviewStartDate').value;
    const endDate = $('#reviewEndDate').value;
    if (!startDate || !endDate) return showToast('시작일과 종료일을 모두 선택하세요.', true);
    if (endDate < startDate) return showToast('종료일은 시작일보다 빠를 수 없습니다.', true);
    state.reviewPeriod = { type:'custom', startDate, endDate };
    try { await loadReview(); renderReview(); showToast('선택한 기간 기준으로 다시 계산했습니다.'); } catch (e) { showToast(e.message, true); }
  });
  $('#calendarPrevButton').addEventListener('click', () => { ensureCalendarMonth(); state.calendarMonth = addMonths(state.calendarMonth, -1); state.selectedCalendarDate = state.calendarMonth; renderCalendar(); });
  $('#calendarNextButton').addEventListener('click', () => { ensureCalendarMonth(); state.calendarMonth = addMonths(state.calendarMonth, 1); state.selectedCalendarDate = state.calendarMonth; renderCalendar(); });
  $('#calendarTodayButton').addEventListener('click', () => { state.calendarMonth = monthKeyFromDate(todaySeoul()); state.selectedCalendarDate = todaySeoul(); renderCalendar(); });
  if (planSelect) planSelect.addEventListener('change', async () => {
    await selectPlan(planSelect.value || null);
  });
  $('#planEmptyCreateButton').addEventListener('click', () => openPlanDialog('new'));
  $('#planRailNewButton').addEventListener('click', () => openPlanDialog('new'));
  $('#workspaceQuickAdd').addEventListener('click', () => state.currentPlanId ? openTaskDialog() : openPlanDialog('new'));
  document.querySelector('.brand')?.addEventListener('click', event => { event.preventDefault(); switchSection('dashboard'); });
  $('#homeNewPlanButton').addEventListener('click', () => openPlanDialog('new'));
  $('#homeAddTaskButton').addEventListener('click', () => openTaskDialog());
  $('#newTaskButton').addEventListener('click', () => openTaskDialog());
  $('#planForm').addEventListener('submit', savePlan);
  $('#taskForm').addEventListener('submit', saveTask);
  $('#executionForm').addEventListener('submit', saveExecution);
  $('#improvementForm').addEventListener('submit', saveImprovement);
  $('#nextPlanButton').addEventListener('click', startNextPlan);
  $('#refreshReviewButton').addEventListener('click', async () => { try { await loadReview(); renderReview(); showToast('돌아보기 집계를 다시 계산했습니다.'); } catch (e) { showToast(e.message, true); } });
  $('#exportButton').addEventListener('click', exportData);
  $('#exportButtonSecondary').addEventListener('click', exportData);

  let searchTimer;
  $('#taskSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(async () => { if (!state.currentPlanId) return; try { await loadTasks(); renderTasks(); } catch (e) { showToast(e.message, true); } }, 250); });
  ['statusFilter','priorityFilter','tagFilter','overdueFilter','sortSelect'].forEach(id => document.getElementById(id).addEventListener('change', async () => { if (!state.currentPlanId) return; try { await loadTasks(); renderTasks(); } catch (e) { showToast(e.message, true); } }));
}


function renderTodayChrome() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone:'Asia/Seoul', day:'2-digit', month:'short', year:'numeric', weekday:'short' }).formatToParts(now);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const day = document.querySelector('.js-day-number');
  const monthYear = document.querySelector('.js-month-year');
  const weekday = document.querySelector('.js-weekday');
  if (day) day.textContent = map.day;
  if (monthYear) monthYear.textContent = `${String(map.month).toUpperCase()} ${map.year}`;
  if (weekday) weekday.textContent = String(map.weekday).toUpperCase();
}

async function init() {
  bindEvents();
  renderTodayChrome();
  ensureCalendarMonth();
  const initialSection = String(window.location.hash || '').replace('#', '');
  const allowedSections = ['dashboard', 'plan', 'calendar', 'see', 'data'];
  if (initialSection === 'do') switchSection('plan', true);
  else if (allowedSections.includes(initialSection)) switchSection(initialSection, false);

  if (isLocalMode()) {
    const mode = $('#connectionMode');
    if (mode) mode.textContent = '로컬 화면 · DB 미연결';
    renderPlanSelect();
    renderAll();
    return;
  }

  try {
    await loadPlans();
    const mode = $('#connectionMode');
    if (mode) mode.textContent = 'Supabase DB 연결됨';
  } catch (error) {
    const mode = $('#connectionMode');
    if (mode) mode.textContent = 'DB 연결 확인 필요';
    showToast(`DB 연결 확인 필요: ${error.message}`, true);
    renderAll();
  }
}

document.addEventListener('DOMContentLoaded', init);
