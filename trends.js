function monthKeyFromOffset(todayKey, offset) {
  const [year, month] = todayKey.split('-').map(Number);
  const date = new Date(year, month - 1 - offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function calculateTrend({ expenses, budgetCents, todayKey, months = 3 }) {
  const monthKeys = Array.from({ length: months }, (_, index) => monthKeyFromOffset(todayKey, months - index - 1));
  const rows = monthKeys.map((month) => {
    const monthExpenses = expenses.filter((item) => !item.deletedAt && item.date?.slice(0, 7) === month);
    const spentCents = monthExpenses.reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
    const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    return { month, spentCents, remainingCents: budgetCents - spentCents, savingsRate: budgetCents > 0 ? Math.max(0, budgetCents - spentCents) / budgetCents : 0, averageDailyCents: Math.round(spentCents / daysInMonth), impulseCount: monthExpenses.filter((item) => Number(item.impulseScore) >= 3).length, largeCount: monthExpenses.filter((item) => item.planned === 'unplanned' && Number(item.amountCents) >= 10000).length, recordCount: monthExpenses.length };
  });
  const populated = rows.filter((row) => row.recordCount > 0);
  let direction = 'insufficient';
  if (populated.length >= 2) {
    const first = populated[0];
    const last = populated[populated.length - 1];
    const improving = last.spentCents <= first.spentCents && last.impulseCount <= first.impulseCount && last.remainingCents >= first.remainingCents;
    const worsening = last.spentCents > first.spentCents && last.impulseCount >= first.impulseCount && last.remainingCents < first.remainingCents;
    direction = improving ? 'improving' : worsening ? 'worsening' : 'mixed';
  }
  return { rows, populated, direction };
}
