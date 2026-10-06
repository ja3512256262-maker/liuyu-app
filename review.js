export const LARGE_EXPENSE_THRESHOLD_CENTS = 10000;

export function getCooldownDays(amountCents) {
  if (amountCents >= 100000) return 7;
  if (amountCents >= 50000) return 3;
  return 1;
}

export function assessLargeExpense({ amountCents, planned, necessity, utility, createdAt, now = new Date() }) {
  const isLargeUnplanned = planned === 'unplanned' && amountCents >= LARGE_EXPENSE_THRESHOLD_CENTS;
  if (!isLargeUnplanned) return { required: false, recommendation: '无需进入大额消费审核。', cooldownDays: 0, cooldownUntil: null, remainingHours: 0 };
  const cooldownDays = getCooldownDays(amountCents);
  const createdTime = new Date(createdAt || now).getTime();
  const cooldownUntil = new Date(createdTime + cooldownDays * 24 * 60 * 60 * 1000);
  const remainingHours = Math.max(0, Math.ceil((cooldownUntil.getTime() - now.getTime()) / (60 * 60 * 1000)));
  const recommendation = necessity === 'essential'
    ? '必要支出可以认可，但仍建议确认价格和现金流不影响基本生活。'
    : necessity === 'unnecessary' || utility === 'low'
      ? '必要性或长期效用偏低，不建议重复；优先寻找替代品或延后。'
      : remainingHours > 0
        ? `建议先等待 ${cooldownDays} 天冷静期，再重新确认是否值得。`
        : '冷静期已结束，可以重新检查价格、替代品和未来计划后再决定。';
  return { required: true, recommendation, cooldownDays, cooldownUntil: cooldownUntil.toISOString(), remainingHours };
}
