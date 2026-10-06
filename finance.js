// Pure budget calculations. Inputs and outputs use integer cents.
export function getAmountCents(item) {
  return Number.isInteger(item?.amountCents) ? item.amountCents : Math.round(Number(item?.amount || 0) * 100);
}

export function calculateBudgetSnapshot({ budgetCents, expenses, todayKey, daysInMonth, dayOfMonth }) {
  const activeExpenses = expenses.filter((item) => !item.deletedAt);
  const monthExpenses = activeExpenses.filter((item) => item.date?.slice(0, 7) === todayKey.slice(0, 7));
  const todayExpenses = monthExpenses.filter((item) => item.date === todayKey);
  const spentCents = monthExpenses.reduce((sum, item) => sum + getAmountCents(item), 0);
  const todaySpentCents = todayExpenses.reduce((sum, item) => sum + getAmountCents(item), 0);
  const budgetGapCents = budgetCents - spentCents;
  const remainingCents = Math.max(0, budgetGapCents);
  const usagePercent = budgetCents > 0 ? Math.min(100, (spentCents / budgetCents) * 100) : 100;
  const remainingDays = Math.max(1, daysInMonth - dayOfMonth + 1);
  const remainingDailyBudgetCents = Math.max(0, Math.floor(remainingCents / remainingDays));

  return {
    monthExpenses,
    todayExpenses,
    spentCents,
    todaySpentCents,
    budgetGapCents,
    remainingCents,
    usagePercent,
    remainingDays,
    remainingDailyBudgetCents,
  };
}

export function summarizeCategories(expenses, categoryNames) {
  return Object.entries(categoryNames)
    .map(([key, name]) => [key, name, expenses.filter((item) => item.category === key).reduce((sum, item) => sum + getAmountCents(item), 0)])
    .filter(([, , amountCents]) => amountCents > 0)
    .sort((a, b) => b[2] - a[2]);
}
