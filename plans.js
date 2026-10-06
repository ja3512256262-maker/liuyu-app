export const planStatuses = ['planned', 'approved', 'delayed', 'cancelled', 'purchased'];

export function calculateRecommendedReserve({ estimatedPriceCents, currentPreparedFundsCents, earliestPurchaseDate, latestPurchaseDate, todayKey }) {
  const remainingCents = Math.max(0, estimatedPriceCents - currentPreparedFundsCents);
  const start = new Date(`${todayKey}T00:00:00`);
  const end = new Date(`${latestPurchaseDate}T00:00:00`);
  const months = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24 * 30)));
  return { remainingCents, months, recommendedMonthlyReserveCents: Math.ceil(remainingCents / months) };
}

export function normalizePlan(item, todayKey) {
  const estimatedPriceCents = Number.isInteger(item?.estimatedPriceCents) ? item.estimatedPriceCents : Math.round(Number(item?.amount || 0) * 100);
  const latestPurchaseDate = item?.latestPurchaseDate || item?.dueDate || todayKey;
  const earliestPurchaseDate = item?.earliestPurchaseDate || item?.dueDate || todayKey;
  const currentPreparedFundsCents = Number.isInteger(item?.currentPreparedFundsCents) ? item.currentPreparedFundsCents : Math.round(Number(item?.currentPreparedFunds || 0) * 100);
  const reserve = calculateRecommendedReserve({ estimatedPriceCents, currentPreparedFundsCents, earliestPurchaseDate, latestPurchaseDate, todayKey });
  return { id: String(item?.id || Date.now()), name: String(item?.name || item?.title || '未命名计划').trim(), estimatedPriceCents, earliestPurchaseDate, latestPurchaseDate, necessity: item?.necessity || 'useful', reason: String(item?.reason || ''), currentPreparedFundsCents, recommendedMonthlyReserveCents: reserve.recommendedMonthlyReserveCents, status: planStatuses.includes(item?.status) ? item.status : item?.done ? 'purchased' : 'planned' };
}
