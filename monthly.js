export function calculateMonthlyReport({ expenses, budgetCents, todayKey, dayOfMonth, categoryNames }) {
  const month = todayKey.slice(0, 7);
  const monthExpenses = expenses.filter((item) => !item.deletedAt && item.date?.slice(0, 7) === month);
  const totalCents = monthExpenses.reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
  const remainingCents = budgetCents - totalCents;
  const savingsRate = budgetCents > 0 ? Math.max(0, remainingCents) / budgetCents : 0;
  const byDay = Object.entries(monthExpenses.reduce((groups, item) => {
    groups[item.date] = (groups[item.date] || 0) + Number(item.amountCents || 0);
    return groups;
  }, {})).sort((a, b) => b[1] - a[1]);
  const categories = Object.entries(categoryNames)
    .map(([key, name]) => [key, name, monthExpenses.filter((item) => item.category === key).reduce((sum, item) => sum + Number(item.amountCents || 0), 0)])
    .filter(([, , amountCents]) => amountCents > 0)
    .sort((a, b) => b[2] - a[2]);
  const impulseExpenses = monthExpenses.filter((item) => Number(item.impulseScore) >= 3);
  const unplannedLargeExpenses = monthExpenses.filter((item) => item.planned === 'unplanned' && Number(item.amountCents) >= 10000);
  const utilityTotals = monthExpenses.reduce((groups, item) => {
    if (item.utility === 'high') groups[item.category] = (groups[item.category] || 0) + Number(item.amountCents || 0);
    return groups;
  }, {});
  const highUtilityCategory = Object.entries(utilityTotals).sort((a, b) => b[1] - a[1])[0]?.[0];
  const lowEfficiency = monthExpenses.filter((item) => item.utility === 'low' || item.impulseScore >= 3);
  const topCategory = categories[0]?.[1] || '暂无分类数据';

  const answers = [
    ['最大的财务优点', remainingCents >= 0 && impulseExpenses.length === 0 ? '目前没有超出总预算，也没有记录明显冲动消费。' : remainingCents >= 0 ? '目前仍在总预算内，现金流保持可控。' : '虽然本月有超支，但已经留下了可定位的问题记录。'],
    ['最大的问题', remainingCents < 0 ? `本月已超出预算 ${Math.abs(remainingCents) / 100} 元。` : impulseExpenses.length ? `出现 ${impulseExpenses.length} 笔明显冲动消费，值得观察重复频率。` : '当前记录中暂未发现明显的结构性问题。'],
    ['性价比最高的消费', highUtilityCategory ? `${categoryNames[highUtilityCategory]}中记录了较多高效用支出。` : '当前没有足够的效用数据，暂不下结论。'],
    ['效率最低的消费', lowEfficiency.length ? `有 ${lowEfficiency.length} 笔消费被标记为低效用或明显冲动。` : '当前没有被标记为低效用或明显冲动的消费。'],
    ['冲动消费模式', impulseExpenses.length ? `本月共有 ${impulseExpenses.length} 笔明显冲动消费。` : '本月暂未记录明显冲动消费。'],
    ['预算结构问题', categories.length ? `目前支出最多的类别是${topCategory}，分类预算仍需更多月份数据后再调整。` : '当前没有足够数据判断预算结构。'],
    ['下个月最该改变什么', impulseExpenses.length ? '先降低重复出现的冲动消费频率，而不是压缩必要生活支出。' : '继续记录计划性和效用，保持对现金流的可见性。'],
    ['下个月是否调整预算', remainingCents < 0 ? '暂不建议直接上调总预算，先区分必要超支和低效消费。' : '暂不建议仅凭一个月数据自动调整预算，继续观察趋势。'],
  ];

  return { monthExpenses, totalCents, remainingCents, savingsRate, byDay, categories, impulseExpenses, unplannedLargeExpenses, answers, highUtilityCategory };
}
