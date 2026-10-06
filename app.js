import { calculateBudgetSnapshot, getAmountCents, summarizeCategories } from './finance.js';
import { calculateDailyReport } from './reports.js';
import { calculateMonthlyReport } from './monthly.js';
import { calculateRecommendedReserve, normalizePlan, planStatuses } from './plans.js';
import { assessLargeExpense } from './review.js';
import { calculateTrend } from './trends.js';

const quickAddButton = document.querySelector('#quick-add');
const addDialog = document.querySelector('#add-dialog');
const addForm = document.querySelector('#add-form');
const ledgerView = document.querySelector('#ledger-view');
const ledgerList = document.querySelector('#ledger-list');
const storageKey = 'liuyu-expenses-v2';
const legacyStorageKey = 'liuyu-expenses-v1';
const storageVersion = 2;
const planStorageKey = 'liuyu-plans-v1';
const yuanToCents = (value) => Math.round(Number(value) * 100);
const centsToYuan = (value) => Number(value) / 100;
const formatMoney = (cents) => `¥${centsToYuan(cents).toLocaleString('zh-CN', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const savedBudgetCents = Number(localStorage.getItem('liuyu-budget-cents-v1'));
const legacyBudgetYuan = Number(localStorage.getItem('liuyu-budget-v1'));
let budgetCents = savedBudgetCents > 0 ? savedBudgetCents : yuanToCents(legacyBudgetYuan > 0 ? legacyBudgetYuan : 1500);
const categoryNames = { food: '餐饮', transport: '交通', study: '学习', other: '其他' };
const categoryMarks = { food: '餐', transport: '行', study: '学', other: '杂' };
const today = new Date();
const localDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const todayKey = localDateKey(today);
const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
let selectedMonth = todayKey.slice(0, 7);
const currentMonthKey = todayKey.slice(0, 7);
const initialExpenses = [];

// 选中月份的上下文：当前月锚定今天，历史月锚定该月最后一天
function monthContext(monthKeyValue = selectedMonth) {
  const [year, month] = String(monthKeyValue).split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const isCurrent = monthKeyValue === currentMonthKey;
  const dayOfMonth = isCurrent ? today.getDate() : daysInMonth;
  const anchorDate = new Date(year, month - 1, dayOfMonth);
  return {
    year,
    month,
    daysInMonth,
    isCurrent,
    dayOfMonth,
    monthKey: monthKeyValue,
    anchorKey: `${monthKeyValue}-${String(dayOfMonth).padStart(2, '0')}`,
    weekday: weekdayNames[anchorDate.getDay()],
  };
}

function availableMonths() {
  const months = new Set([currentMonthKey]);
  readExpenses({ includeDeleted: true }).forEach((item) => {
    if (/^\d{4}-\d{2}/.test(item.date || '')) months.add(item.date.slice(0, 7));
  });
  return [...months].sort().reverse();
}

function renderMonthPicker() {
  const select = document.querySelector('#month-select');
  if (!select) return;
  const months = availableMonths();
  select.innerHTML = months.map((key) => {
    const [year, month] = key.split('-');
    const label = `${year} 年 ${Number(month)} 月${key === currentMonthKey ? '（本月）' : ''}`;
    return `<option value="${key}" ${key === selectedMonth ? 'selected' : ''}>${label}</option>`;
  }).join('');
  const index = months.indexOf(selectedMonth);
  document.querySelector('#month-prev').disabled = index >= months.length - 1;
  document.querySelector('#month-next').disabled = index <= 0;
}

function normalizeExpense(item, index) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(item?.date || '') ? item.date : todayKey;
  const amountCents = Number.isFinite(getAmountCents(item)) && getAmountCents(item) >= 0 ? getAmountCents(item) : 0;
  return {
    id: String(item?.id || `migrated-${Date.now()}-${index}`),
    note: String(item?.note || '未命名消费').trim().slice(0, 30) || '未命名消费',
    category: categoryNames[item?.category] ? item.category : 'other',
    amountCents,
    time: /^\d{2}:\d{2}$/.test(item?.time || '') ? item.time : '刚刚',
    date,
    createdAt: item?.createdAt || `${date}T00:00:00.000Z`,
    updatedAt: item?.updatedAt || item?.createdAt || `${date}T00:00:00.000Z`,
    deletedAt: item?.deletedAt || null,
    planned: item?.planned === 'unplanned' ? 'unplanned' : 'planned',
    necessity: ['essential', 'useful', 'nonessential', 'unnecessary'].includes(item?.necessity) ? item.necessity : 'useful',
    utility: ['low', 'medium', 'high'].includes(item?.utility) ? item.utility : 'medium',
    impulseScore: Math.max(0, Math.min(5, Number.isInteger(Number(item?.impulseScore)) ? Number(item.impulseScore) : 0)),
  };
}

function readExpenses({ includeDeleted = false } = {}) {
  try {
    const current = JSON.parse(localStorage.getItem(storageKey));
    const legacy = current ? null : JSON.parse(localStorage.getItem(legacyStorageKey));
    const source = Array.isArray(current) ? current : Array.isArray(current?.items) ? current.items : Array.isArray(legacy) ? legacy : initialExpenses;
    const expenses = source.map(normalizeExpense);
    if (!current && legacy) localStorage.setItem(storageKey, JSON.stringify(expenses));
    return includeDeleted ? expenses : expenses.filter((item) => !item.deletedAt);
  }
  catch { return includeDeleted ? initialExpenses.map(normalizeExpense) : initialExpenses.map(normalizeExpense).filter((item) => !item.deletedAt); }
}

function saveExpenses(expenses) {
  localStorage.setItem(storageKey, JSON.stringify({ version: storageVersion, items: expenses }));
}

function render() {
  const ctx = monthContext();
  const expenses = readExpenses();
  const snapshot = getBudgetSnapshot(expenses, ctx);
  const { todayExpenses, todaySpentCents, spentCents, budgetGapCents, remainingCents, usagePercent, remainingDailyBudgetCents } = snapshot;
  document.querySelector('#today-eyebrow').textContent = `${ctx.year} 年 ${ctx.month} 月 · ${ctx.weekday}`;
  document.querySelector('#month-badge').textContent = `${ctx.month} 月预算`;
  document.querySelector('#today-date-label').textContent = `${ctx.month} 月 ${ctx.dayOfMonth} 日`;
  document.querySelector('.balance-amount').innerHTML = `<span>¥</span>${centsToYuan(remainingCents).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
  document.querySelector('.progress-meta').innerHTML = `<span>已支出 ${formatMoney(spentCents)}</span><span>预算 ${formatMoney(budgetCents)}</span>`;
  document.querySelector('.progress-track span').style.width = `${usagePercent}%`;
  document.querySelector('.progress-track').setAttribute('aria-valuenow', usagePercent.toFixed(1));
  document.querySelector('.balance-note').textContent = budgetGapCents < 0 ? `已超出预算 ${formatMoney(Math.abs(budgetGapCents))}，接下来优先暂停非必要支出。` : `已使用 ${usagePercent.toFixed(1)}%，目前没有超支压力。`;
  const monthExpenses = snapshot.monthExpenses.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.time || '').localeCompare(a.time || ''));
  const listExpenses = ctx.isCurrent ? todayExpenses : monthExpenses;
  document.querySelector('#metric-1-label').textContent = ctx.isCurrent ? '今日支出' : '当月支出';
  document.querySelector('#metric-2-label').textContent = ctx.isCurrent ? '建议今日最高' : '日均支出';
  document.querySelectorAll('.metric-value')[0].textContent = formatMoney(ctx.isCurrent ? todaySpentCents : spentCents);
  document.querySelectorAll('.metric-value')[1].textContent = formatMoney(ctx.isCurrent ? remainingDailyBudgetCents : Math.round(spentCents / Math.max(1, ctx.daysInMonth)));
  document.querySelector('#today-title').textContent = ctx.isCurrent ? '今日消费' : `${ctx.month} 月消费`;
  document.querySelector('.section-total').textContent = formatMoney(ctx.isCurrent ? todaySpentCents : spentCents);
  document.querySelector('#transaction-list-content').innerHTML = listExpenses.length ? listExpenses.map((item) => `<article class="transaction-row"><span class="category-icon category-${item.category}" aria-hidden="true">${categoryMarks[item.category] || '杂'}</span><div class="transaction-main"><strong>${escapeHtml(item.note)}</strong><small>${ctx.isCurrent ? (item.time || '刚刚') : `${item.date || ''} · ${categoryNames[item.category] || '其他'}`}</small></div><strong class="transaction-amount">−${formatMoney(getAmountCents(item))}</strong></article>`).join('') : `<p class="empty-state">${ctx.isCurrent ? '今天还没有记录，记下第一笔吧。' : `${ctx.month} 月还没有记录。`}</p>`;
  const nextPlan = readPlans().filter((item) => !['cancelled', 'purchased'].includes(item.status)).sort((a, b) => a.latestPurchaseDate.localeCompare(b.latestPurchaseDate))[0];
  document.querySelector('#coach-title').textContent = nextPlan ? `别忘了给「${nextPlan.name}」留出 ${formatMoney(nextPlan.estimatedPriceCents)}` : (usagePercent >= 80 ? '本月进入预算后半程' : '今天的消费节奏很稳');
  document.querySelector('.coach-note p:last-child').textContent = nextPlan ? `最晚购买日期是 ${nextPlan.latestPurchaseDate}。每月提前留下 ${formatMoney(nextPlan.recommendedMonthlyReserveCents)}，临近需要时就不会打乱日常现金流。` : '目前支出主要是必要餐饮和交通。留下来的钱，也是在给未来保留选择权。';
  renderMonthPicker();
  renderLedger();
  renderAnalysis();
  renderDailyReport(snapshot);
  renderMonthlyReport();
  renderLargeExpenseReview();
  renderTrends();
  renderPlans();
}

function getBudgetSnapshot(expenses, ctx = monthContext()) {
  return calculateBudgetSnapshot({ budgetCents, expenses, todayKey: ctx.anchorKey, daysInMonth: ctx.daysInMonth, dayOfMonth: ctx.dayOfMonth });
}

function readPlans() {
  try { return (JSON.parse(localStorage.getItem(planStorageKey)) || []).map((item) => normalizePlan(item, todayKey)); }
  catch { return []; }
}

function savePlans(plans) { localStorage.setItem(planStorageKey, JSON.stringify(plans)); }

function renderAnalysis() {
  const ctx = monthContext();
  const snapshot = getBudgetSnapshot(readExpenses(), ctx);
  const { monthExpenses, spentCents, remainingDailyBudgetCents } = snapshot;
  document.querySelector('#analysis-month').textContent = `${ctx.year} 年 ${ctx.month} 月`;
  document.querySelector('#analysis-spent').textContent = formatMoney(spentCents);
  document.querySelector('#analysis-daily').textContent = formatMoney(Math.round(spentCents / Math.max(1, ctx.isCurrent ? ctx.dayOfMonth : ctx.daysInMonth)));
  document.querySelector('#analysis-daily-budget').textContent = ctx.isCurrent ? formatMoney(remainingDailyBudgetCents) : '已结束';
  const totals = summarizeCategories(monthExpenses, categoryNames);
  const max = totals[0]?.[2] || 1;
  document.querySelector('#category-breakdown').innerHTML = totals.length ? totals.map(([key, name, amount]) => `<div class="category-stat"><span>${name}</span><div class="category-stat-bar"><span style="width:${amount / max * 100}%"></span></div><strong>${formatMoney(amount)}</strong></div>`).join('') : '<p class="empty-state">本月还没有足够的消费数据。</p>';
}

function renderDailyReport(snapshotParam) {
  const ctx = monthContext();
  const snapshot = snapshotParam || getBudgetSnapshot(readExpenses(), ctx);
  const report = calculateDailyReport({ snapshot, todayExpenses: ctx.isCurrent ? snapshot.todayExpenses : snapshot.monthExpenses, categoryNames });
  document.querySelector('#daily-report-eyebrow').textContent = ctx.isCurrent ? '今日复盘' : `${ctx.month} 月复盘`;
  document.querySelector('#daily-report-title').textContent = ctx.isCurrent ? '今日财务报告' : `${ctx.month} 月财务报告`;
  document.querySelector('#report-spent-label').textContent = ctx.isCurrent ? '今日支出' : '当月支出';
  document.querySelector('#daily-rating').textContent = report.rating;
  document.querySelector('#daily-rating').dataset.rating = report.rating;
  document.querySelector('#report-today-spent').textContent = formatMoney(ctx.isCurrent ? snapshot.todaySpentCents : snapshot.spentCents);
  document.querySelector('#report-days-left').textContent = ctx.isCurrent ? `${snapshot.remainingDays} 天` : '已结束';
  document.querySelector('#report-daily-average').textContent = formatMoney(Math.round(snapshot.spentCents / Math.max(1, ctx.isCurrent ? ctx.dayOfMonth : ctx.daysInMonth)));
  document.querySelector('#report-daily-budget').textContent = formatMoney(snapshot.remainingDailyBudgetCents);
  const scopeLabel = ctx.isCurrent ? '今日' : `${ctx.month} 月`;
  const categorySummary = report.categoryTotals.length ? `${scopeLabel}结构：${report.categoryTotals.map(([name, amount]) => `${name} ${formatMoney(amount)}`).join('、')}。` : `${scopeLabel}暂无消费记录。`;
  const flags = [report.impulseExpenses.length ? `明显冲动消费 ${report.impulseExpenses.length} 笔` : '', report.largeUnplannedExpenses.length ? `计划外大额消费 ${report.largeUnplannedExpenses.length} 笔` : ''].filter(Boolean);
  document.querySelector('#report-facts').textContent = `${categorySummary}${flags.length ? ` ${flags.join('，')}。` : ''}`;
  document.querySelector('#daily-advice').textContent = report.advice;
}

function renderMonthlyReport() {
  const ctx = monthContext();
  const report = calculateMonthlyReport({ expenses: readExpenses({ includeDeleted: true }), budgetCents, todayKey: ctx.anchorKey, dayOfMonth: ctx.dayOfMonth, categoryNames });
  document.querySelector('#monthly-report-month').textContent = `${ctx.year} 年 ${ctx.month} 月`;
  document.querySelector('#monthly-budget').textContent = formatMoney(budgetCents);
  document.querySelector('#monthly-spent').textContent = formatMoney(report.totalCents);
  document.querySelector('#monthly-remaining').textContent = report.remainingCents >= 0 ? formatMoney(report.remainingCents) : `−${formatMoney(Math.abs(report.remainingCents))}`;
  document.querySelector('#monthly-savings-rate').textContent = `${(report.savingsRate * 100).toFixed(1)}%`;
  const highest = report.byDay[0];
  const lowest = report.byDay.at(-1);
  document.querySelector('#monthly-extremes').textContent = report.byDay.length ? `单日最高支出：${highest[0]} ${formatMoney(highest[1])}；单日最低支出：${lowest[0]} ${formatMoney(lowest[1])}。` : '当前月份暂无支出记录。';
  document.querySelector('#monthly-impulse').textContent = `冲动消费：${report.impulseExpenses.length} 笔，共 ${formatMoney(report.impulseExpenses.reduce((sum, item) => sum + getAmountCents(item), 0))}。`;
  document.querySelector('#monthly-large').textContent = `计划外大额消费（≥¥100）：${report.unplannedLargeExpenses.length} 笔。`;
  document.querySelector('#monthly-answers').innerHTML = report.answers.map(([question, answer]) => `<div class="answer-row"><strong>${question}</strong><span>${escapeHtml(answer)}</span></div>`).join('');
}

function renderLargeExpenseReview() {
  const currentMonth = readExpenses().filter((item) => item.date?.slice(0, 7) === selectedMonth);
  const candidates = currentMonth.filter((item) => item.planned === 'unplanned' && item.amountCents >= 10000);
  const necessityLabels = { essential: '必要', useful: '有用', nonessential: '非必要', unnecessary: '不必要' };
  document.querySelector('#review-count').textContent = `${candidates.length} 笔`;
  document.querySelector('#review-list').innerHTML = candidates.length ? candidates.map((item) => {
    const review = assessLargeExpense({ amountCents: item.amountCents, planned: item.planned, necessity: item.necessity, utility: item.utility, createdAt: item.createdAt });
    const cooldown = review.remainingHours > 0 ? `冷静期剩余约 ${review.remainingHours} 小时` : '冷静期已结束';
    return `<article class="review-row"><div class="transaction-main"><strong>${escapeHtml(item.note)} · ${formatMoney(item.amountCents)}</strong><small>${necessityLabels[item.necessity] || '未标注'} · 效用${item.utility === 'high' ? '高' : item.utility === 'low' ? '低' : '中'} · ${cooldown}</small><p>${review.recommendation}</p></div></article>`;
  }).join('') : '<p class="empty-state">本月没有需要审核的计划外大额消费。</p>';
}

function renderTrends() {
  const period = Number(document.querySelector('#trend-period')?.value || 3);
  const trend = calculateTrend({ expenses: readExpenses({ includeDeleted: true }), budgetCents, todayKey: monthContext().anchorKey, months: period });
  const directionText = { improving: '趋势正在变好：近期开支、冲动消费或现金留存至少有两项改善。', worsening: '趋势需要警惕：近期开支上升，同时冲动消费或月末可留下降。', mixed: '趋势表现混合，暂时不能简单归类为变好或变坏。', insufficient: '有效记录不足两个月，暂不判断长期趋势。' }[trend.direction];
  document.querySelector('#trend-summary').textContent = directionText;
  const maxSpent = Math.max(1, ...trend.rows.map((row) => row.spentCents));
  document.querySelector('#trend-bars').innerHTML = trend.rows.map((row) => `<div class="trend-bar-row"><span>${row.month.slice(5)} 月</span><div class="trend-bar-track"><span style="width:${row.spentCents / maxSpent * 100}%"></span></div><strong>${formatMoney(row.spentCents)}</strong></div>`).join('');
  document.querySelector('#trend-table').innerHTML = `<div class="trend-table-head"><span>月份</span><span>月末可留</span><span>储蓄率</span><span>冲动/大额</span></div>${trend.rows.map((row) => `<div class="trend-table-row"><span>${row.month}</span><span>${formatMoney(row.remainingCents)}</span><span>${(row.savingsRate * 100).toFixed(1)}%</span><span>${row.impulseCount} / ${row.largeCount}</span></div>`).join('')}`;
}

function renderPlans() {
  const plans = readPlans().sort((a, b) => a.latestPurchaseDate.localeCompare(b.latestPurchaseDate));
  const activeTotal = plans.filter((item) => !['cancelled', 'purchased'].includes(item.status)).reduce((sum, item) => sum + getAmountCents({ amountCents: item.estimatedPriceCents }), 0);
  document.querySelector('#plan-total').textContent = formatMoney(activeTotal);
  document.querySelector('#plan-list').innerHTML = plans.length ? plans.map((item) => `<article class="plan-row ${['cancelled', 'purchased'].includes(item.status) ? 'done' : ''}"><div class="transaction-main"><strong>${escapeHtml(item.name)}</strong><small>${item.earliestPurchaseDate} 至 ${item.latestPurchaseDate} · ${formatMoney(item.estimatedPriceCents)} · 建议每月留 ${formatMoney(item.recommendedMonthlyReserveCents)}</small><small>${escapeHtml(item.reason || '未填写购买理由')}</small></div><div class="plan-actions"><select class="plan-status" data-plan-action="status" data-id="${item.id}" aria-label="计划状态">${planStatuses.map((status) => `<option value="${status}" ${item.status === status ? 'selected' : ''}>${{ planned: '计划中', approved: '已批准', delayed: '已延后', cancelled: '已取消', purchased: '已购买' }[status]}</option>`).join('')}</select><button type="button" data-plan-action="delete" data-id="${item.id}">删除</button></div></article>`).join('') : '<p class="empty-state">还没有未来计划，先留出一笔给未来。</p>';
}

function renderLedger() {
  const filter = document.querySelector('#ledger-filter')?.value || 'all';
  const source = filter === 'deleted' ? readExpenses({ includeDeleted: true }).filter((item) => item.deletedAt) : readExpenses();
  const expenses = source.filter((item) => {
    if (filter === 'today') return item.date === todayKey;
    if (filter === 'month') return item.date?.slice(0, 7) === selectedMonth;
    return true;
  });
  const monthOption = document.querySelector('#ledger-filter option[value="month"]');
  if (monthOption) monthOption.textContent = `${Number(selectedMonth.slice(5))} 月`;
  const total = expenses.reduce((sum, item) => sum + getAmountCents(item), 0);
  document.querySelector('#ledger-total').textContent = formatMoney(total);
  ledgerList.innerHTML = expenses.length ? expenses.map((item) => `<article class="ledger-row ${item.deletedAt ? 'deleted-row' : ''}"><span class="category-icon category-${item.category}" aria-hidden="true">${categoryMarks[item.category] || '杂'}</span><div class="transaction-main"><strong>${escapeHtml(item.note)}</strong><small>${item.date || '未标注日期'} · ${categoryNames[item.category] || '其他'} · ${item.time || '刚刚'}</small></div><div><strong class="transaction-amount">−${formatMoney(getAmountCents(item))}</strong><div class="ledger-row-actions">${item.deletedAt ? `<button class="ledger-restore" data-action="restore" data-id="${item.id}">恢复</button>` : `<button class="ledger-edit" data-action="edit" data-id="${item.id}">编辑</button><button class="ledger-delete" data-action="delete" data-id="${item.id}">删除</button>`}</div></div></article>`).join('') : `<p class="empty-state">${filter === 'deleted' ? '回收站是空的。' : '没有符合条件的记录。'}</p>`;
}

function openEdit(id) {
  const item = readExpenses().find((expense) => expense.id === id);
  if (!item) return;
  document.querySelector('#expense-id').value = item.id;
  document.querySelector('#expense-amount').value = centsToYuan(getAmountCents(item));
  document.querySelector('#expense-note').value = item.note;
  document.querySelector('#expense-category').value = item.category;
  addForm.elements.planned.value = item.planned;
  addForm.elements.necessity.value = item.necessity;
  addForm.elements.utility.value = item.utility;
  addForm.elements.impulseScore.value = item.impulseScore;
  document.querySelector('#dialog-title').textContent = '编辑记录';
  addDialog.showModal();
}

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

quickAddButton?.addEventListener('click', () => {
  addForm?.reset();
  document.querySelector('#expense-id').value = '';
  document.querySelector('#dialog-title').textContent = '记一笔';
  if (typeof addDialog?.showModal === 'function') {
    addDialog.showModal();
  }
});

addDialog?.addEventListener('click', (event) => {
  if (event.target === addDialog) addDialog.close();
});

const settingsDialog = document.querySelector('#settings-dialog');
document.querySelector('#settings-button')?.addEventListener('click', () => {
  document.querySelector('#budget-input').value = centsToYuan(budgetCents);
  settingsDialog.showModal();
});
document.querySelector('#settings-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const nextBudget = Number(new FormData(event.currentTarget).get('budget'));
  if (!Number.isFinite(nextBudget) || nextBudget <= 0) return;
  budgetCents = yuanToCents(nextBudget);
  localStorage.setItem('liuyu-budget-cents-v1', String(budgetCents));
  settingsDialog.close();
  render();
});

addForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(addForm);
  const amount = Number(data.get('amount'));
  if (!Number.isFinite(amount) || amount <= 0) return;
  const now = new Date();
  const expenses = readExpenses();
  const id = data.get('id');
  const original = id ? expenses.find((item) => item.id === id) : null;
  const updated = { id: id || crypto.randomUUID?.() || String(Date.now()), amountCents: yuanToCents(amount), note: data.get('note').trim(), category: data.get('category'), date: original?.date || todayKey, time: now.toTimeString().slice(0, 5), createdAt: original?.createdAt || now.toISOString(), updatedAt: now.toISOString(), deletedAt: null, planned: data.get('planned') || 'planned', necessity: data.get('necessity') || 'useful', utility: data.get('utility') || 'medium', impulseScore: Math.max(0, Math.min(5, Number(data.get('impulseScore')) || 0)) };
  const nextExpenses = id ? expenses.map((item) => item.id === id ? updated : item) : [updated, ...expenses];
  saveExpenses(nextExpenses);
  addForm.reset();
  addDialog.close();
  render();
});

document.querySelector('#plan-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const plans = readPlans();
  const estimatedPriceCents = yuanToCents(data.get('estimatedPrice'));
  const currentPreparedFundsCents = yuanToCents(data.get('currentPreparedFunds') || 0);
  const reserve = calculateRecommendedReserve({ estimatedPriceCents, currentPreparedFundsCents, earliestPurchaseDate: data.get('earliestPurchaseDate'), latestPurchaseDate: data.get('latestPurchaseDate'), todayKey });
  plans.push(normalizePlan({ id: crypto.randomUUID?.() || String(Date.now()), name: data.get('name').trim(), estimatedPriceCents, earliestPurchaseDate: data.get('earliestPurchaseDate'), latestPurchaseDate: data.get('latestPurchaseDate'), necessity: data.get('necessity'), reason: data.get('reason').trim(), currentPreparedFundsCents, recommendedMonthlyReserveCents: reserve.recommendedMonthlyReserveCents, status: 'planned' }, todayKey));
  savePlans(plans);
  event.currentTarget.reset();
  renderPlans();
});

document.querySelector('#plan-list')?.addEventListener('change', (event) => {
  const input = event.target.closest('[data-plan-action="status"]');
  if (!input) return;
  savePlans(readPlans().map((item) => item.id === input.dataset.id ? { ...item, status: input.value } : item));
  renderPlans();
});

document.querySelector('#plan-list')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-plan-action="delete"]');
  if (!button) return;
  savePlans(readPlans().filter((item) => item.id !== button.dataset.id));
  renderPlans();
});

ledgerList?.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === 'edit') openEdit(id);
  if (button.dataset.action === 'delete' && confirm('确定删除这笔记录吗？')) {
    const deletedAt = new Date().toISOString();
    saveExpenses(readExpenses({ includeDeleted: true }).map((item) => item.id === id ? { ...item, deletedAt, updatedAt: deletedAt } : item));
    render();
  }
  if (button.dataset.action === 'restore') {
    const restoredAt = new Date().toISOString();
    saveExpenses(readExpenses({ includeDeleted: true }).map((item) => item.id === id ? { ...item, deletedAt: null, updatedAt: restoredAt } : item));
    render();
  }
});

document.querySelector('#ledger-filter')?.addEventListener('change', renderLedger);
document.querySelector('#trend-period')?.addEventListener('change', renderTrends);

document.querySelector('#month-select')?.addEventListener('change', (event) => {
  selectedMonth = event.target.value;
  render();
});
document.querySelector('#month-prev')?.addEventListener('click', () => {
  const months = availableMonths();
  const index = months.indexOf(selectedMonth);
  if (index < months.length - 1) { selectedMonth = months[index + 1]; render(); }
});
document.querySelector('#month-next')?.addEventListener('click', () => {
  const months = availableMonths();
  const index = months.indexOf(selectedMonth);
  if (index > 0) { selectedMonth = months[index - 1]; render(); }
});

const views = { home: null, ledger: ledgerView, analysis: document.querySelector('#analysis-view'), plan: document.querySelector('#plan-view') };
document.querySelectorAll('.nav-item[data-view]').forEach((item) => item.addEventListener('click', () => {
  Object.entries(views).forEach(([name, view]) => { if (view) view.hidden = item.dataset.view !== name; });
  document.querySelectorAll('.nav-item[data-view]').forEach((nav) => nav.classList.toggle('active', nav === item));
}));

function downloadFile(content, filename, type) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

document.querySelector('#export-json')?.addEventListener('click', () => downloadFile(JSON.stringify(readExpenses(), null, 2), 'liuyu-expenses.json', 'application/json'));
document.querySelector('#export-backup')?.addEventListener('click', () => downloadFile(JSON.stringify({ app: 'liuyu', version: storageVersion, exportedAt: new Date().toISOString(), budgetCents, expenses: readExpenses({ includeDeleted: true }), plans: readPlans() }, null, 2), `liuyu-backup-${todayKey}.json`, 'application/json'));
document.querySelector('#export-csv')?.addEventListener('click', () => {
  const rows = [['日期', '时间', '用途', '分类', '金额'], ...readExpenses().map((item) => [item.date || '', item.time || '', item.note, categoryNames[item.category] || '其他', centsToYuan(getAmountCents(item))])];
  downloadFile(rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n'), 'liuyu-expenses.csv', 'text/csv;charset=utf-8');
});

/* ---------- Phase 10：JSON 导入（校验 + 预览 + 合并/替换） ---------- */
const importDialog = document.querySelector('#import-dialog');
const importForm = document.querySelector('#import-form');
const importFileInput = document.querySelector('#import-file');
const importPreview = document.querySelector('#import-preview');
const importOptions = document.querySelector('#import-options');
const importConfirm = document.querySelector('#import-confirm');
let pendingImport = null;

function parseImportPayload(rawText) {
  let data;
  try { data = JSON.parse(rawText); }
  catch { throw new Error('文件不是有效的 JSON，请确认导出的是留余的 JSON 文件。'); }
  let expenseItems = [];
  let planItems = [];
  let importedBudgetCents = null;
  if (Array.isArray(data)) expenseItems = data;
  else if (data && typeof data === 'object') {
    if (Array.isArray(data.expenses)) expenseItems = data.expenses;
    else if (Array.isArray(data.items)) expenseItems = data.items;
    if (Array.isArray(data.plans)) planItems = data.plans;
    if (Number.isFinite(Number(data.budgetCents)) && Number(data.budgetCents) > 0) importedBudgetCents = Math.round(Number(data.budgetCents));
  }
  if (!expenseItems.length && !planItems.length) throw new Error('文件里没有找到任何记录。');
  const expenses = expenseItems.map(normalizeExpense);
  const plans = planItems.map((item) => normalizePlan(item, todayKey));
  return { expenses, plans, importedBudgetCents };
}

document.querySelector('#import-json')?.addEventListener('click', () => {
  importForm?.reset();
  pendingImport = null;
  importPreview.style.display = 'none';
  importPreview.innerHTML = '';
  importOptions.style.display = 'none';
  importConfirm.disabled = true;
  if (typeof importDialog?.showModal === 'function') importDialog.showModal();
});

importFileInput?.addEventListener('change', async () => {
  const file = importFileInput.files?.[0];
  if (!file) return;
  pendingImport = null;
  importConfirm.disabled = true;
  importPreview.style.display = 'none';
  importOptions.style.display = 'none';
  try {
    const payload = parseImportPayload(await file.text());
    const active = payload.expenses.filter((item) => !item.deletedAt);
    const totalCents = active.reduce((sum, item) => sum + item.amountCents, 0);
    const dates = active.map((item) => item.date).filter(Boolean).sort();
    pendingImport = payload;
    const lines = [
      `支出记录：${payload.expenses.length} 笔（有效 ${active.length} 笔，回收站 ${payload.expenses.length - active.length} 笔）`,
      `合计金额：${formatMoney(totalCents)}`,
      dates.length ? `日期范围：${dates[0]} 至 ${dates.at(-1)}` : '日期范围：无有效日期',
      `未来计划：${payload.plans.length} 条`,
    ];
    if (payload.importedBudgetCents) lines.push(`文件内预算：${formatMoney(payload.importedBudgetCents)}（导入后生效）`);
    importPreview.innerHTML = lines.map((line) => escapeHtml(line)).join('<br>');
    importPreview.style.display = 'block';
    importOptions.style.display = 'grid';
    importConfirm.disabled = false;
  } catch (error) {
    importPreview.innerHTML = `<strong>无法导入：</strong>${escapeHtml(error.message || String(error))}`;
    importPreview.style.display = 'block';
  }
});

importForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!pendingImport) return;
  const mode = document.querySelector('#import-mode').value;
  if (mode === 'replace' && !confirm('替换模式会清空当前所有记录和计划，确定继续吗？')) return;
  const current = mode === 'replace' ? [] : readExpenses({ includeDeleted: true });
  const currentIds = new Set(current.map((item) => item.id));
  const mergedExpenses = [...current, ...pendingImport.expenses.filter((item) => !currentIds.has(item.id))];
  saveExpenses(mergedExpenses);
  if (pendingImport.plans.length) {
    const currentPlans = mode === 'replace' ? [] : readPlans();
    const planIds = new Set(currentPlans.map((item) => item.id));
    savePlans([...currentPlans, ...pendingImport.plans.filter((item) => !planIds.has(item.id))]);
  }
  if (pendingImport.importedBudgetCents) {
    budgetCents = pendingImport.importedBudgetCents;
    localStorage.setItem('liuyu-budget-cents-v1', String(budgetCents));
  }
  const added = mergedExpenses.length - current.length;
  importDialog.close();
  render();
  alert(`导入完成：新增 ${added} 笔支出记录${pendingImport.plans.length ? `、${pendingImport.plans.length} 条计划` : ''}。`);
});

importDialog?.addEventListener('click', (event) => {
  if (event.target === importDialog) importDialog.close();
});
/* ---------- 导入结束 ---------- */

render();
