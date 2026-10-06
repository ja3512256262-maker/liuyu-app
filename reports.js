const ratingLabels = [
  { min: 90, label: 'S' },
  { min: 80, label: 'A' },
  { min: 70, label: 'B' },
  { min: 55, label: 'C' },
  { min: 35, label: 'D' },
  { min: 0, label: 'E' },
];

export function calculateDailyReport({ snapshot, todayExpenses, categoryNames }) {
  const impulseExpenses = todayExpenses.filter((item) => Number(item.impulseScore) >= 3);
  const largeUnplannedExpenses = todayExpenses.filter((item) => item.planned === 'unplanned' && item.amountCents >= 10000);
  const categoryTotals = Object.entries(categoryNames)
    .map(([key, name]) => [name, todayExpenses.filter((item) => item.category === key).reduce((sum, item) => sum + Number(item.amountCents || 0), 0)])
    .filter(([, amountCents]) => amountCents > 0)
    .sort((a, b) => b[1] - a[1]);

  let score = 100;
  if (snapshot.budgetGapCents < 0) score -= 40;
  if (snapshot.remainingDailyBudgetCents > 0 && snapshot.todaySpentCents > snapshot.remainingDailyBudgetCents * 1.5) score -= 10;
  score -= Math.min(24, impulseExpenses.length * 8);
  score -= Math.min(20, largeUnplannedExpenses.length * 10);
  score = Math.max(0, Math.min(100, score));

  const rating = ratingLabels.find((item) => score >= item.min).label;
  const advice = snapshot.budgetGapCents < 0
    ? '本月已经超出预算，接下来优先暂停非必要支出，先保护基本生活现金流。'
    : impulseExpenses.length
      ? `今日有 ${impulseExpenses.length} 笔明显冲动消费。金额不一定大，但重复出现时会侵蚀未来选择权。`
      : largeUnplannedExpenses.length
        ? '今日出现计划外大额消费，建议为下一笔类似支出设置 24 小时冷静期。'
        : snapshot.todaySpentCents > snapshot.remainingDailyBudgetCents && snapshot.remainingDailyBudgetCents > 0
          ? '今日支出高于当前剩余日预算，明天建议回到必要消费节奏。'
          : '今日消费节奏稳定。正常生活支出不需要为了追求低数字而过度压缩。';

  return { score, rating, impulseExpenses, largeUnplannedExpenses, categoryTotals, advice };
}
