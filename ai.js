// DeepSeek 接入：Key 只保存在本机 localStorage，代码里不出现任何密钥。
const KEY_STORAGE = 'liuyu-ai-key-v1';
const MODEL_STORAGE = 'liuyu-ai-model-v1';
const REPORT_STORAGE = 'liuyu-ai-reports-v1';
const API_URL = 'https://api.deepseek.com/chat/completions';

export const aiModels = [
  { value: 'deepseek-chat', label: 'deepseek-chat（快，便宜）' },
  { value: 'deepseek-reasoner', label: 'deepseek-reasoner（慢，会推理）' },
];

export function getAiKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; }
}

export function setAiKey(key) {
  if (key) localStorage.setItem(KEY_STORAGE, key.trim());
  else localStorage.removeItem(KEY_STORAGE);
}

export function getAiModel() {
  const saved = localStorage.getItem(MODEL_STORAGE);
  return aiModels.some((item) => item.value === saved) ? saved : 'deepseek-chat';
}

export function setAiModel(model) {
  if (aiModels.some((item) => item.value === model)) localStorage.setItem(MODEL_STORAGE, model);
}

export function readAiReports() {
  try {
    const data = JSON.parse(localStorage.getItem(REPORT_STORAGE));
    return data && typeof data === 'object' ? data : {};
  } catch { return {}; }
}

export function saveAiReport(monthKey, report) {
  const reports = readAiReports();
  reports[monthKey] = report;
  const keys = Object.keys(reports).sort().reverse().slice(0, 12);
  const trimmed = {};
  keys.forEach((key) => { trimmed[key] = reports[key]; });
  localStorage.setItem(REPORT_STORAGE, JSON.stringify(trimmed));
}

export function removeAiReport(monthKey) {
  const reports = readAiReports();
  delete reports[monthKey];
  localStorage.setItem(REPORT_STORAGE, JSON.stringify(reports));
}

const yuan = (cents) => (Number(cents || 0) / 100).toFixed(2);

// 只组装必要字段，避免把无关数据发出去
export function buildAiPayload({ ctx, budgetCents, snapshot, expenses, categoryNames, includeItems }) {
  const items = expenses
    .filter((item) => !item.deletedAt)
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const categoryTotals = Object.entries(categoryNames).map(([key, name]) => {
    const cents = items.filter((item) => item.category === key).reduce((sum, item) => sum + item.amountCents, 0);
    return { 分类: name, 金额: Number(yuan(cents)), 笔数: items.filter((item) => item.category === key).length };
  }).filter((row) => row.金额 > 0);

  const payload = {
    月份: `${ctx.year} 年 ${ctx.month} 月`,
    月预算元: Number(yuan(budgetCents)),
    已支出元: Number(yuan(snapshot.spentCents)),
    剩余元: Number(yuan(snapshot.budgetGapCents)),
    当月天数: ctx.daysInMonth,
    已过天数: ctx.isCurrent ? ctx.dayOfMonth : ctx.daysInMonth,
    日均支出元: Number((snapshot.spentCents / 100 / Math.max(1, ctx.isCurrent ? ctx.dayOfMonth : ctx.daysInMonth)).toFixed(2)),
    记录笔数: items.length,
    分类合计: categoryTotals,
    冲动消费笔数: items.filter((item) => Number(item.impulseScore) >= 3).length,
    计划外大额笔数: items.filter((item) => item.planned === 'unplanned' && item.amountCents >= 10000).length,
  };

  if (includeItems) {
    payload.逐笔明细 = items.slice(-80).map((item) => ({
      日期: item.date,
      用途: item.note,
      分类: categoryNames[item.category] || '其他',
      金额: Number(yuan(item.amountCents)),
      计划性: item.planned === 'unplanned' ? '计划外' : '计划内',
      必要性: { essential: '必要', useful: '有用', nonessential: '非必要', unnecessary: '不必要' }[item.necessity] || '未标注',
      冲动分: Number(item.impulseScore) || 0,
    }));
  }

  return payload;
}

const SYSTEM_PROMPT = [
  '你是一个务实、克制的个人财务教练，服务对象是中国的大学生。',
  '他的月预算是 1500 元，这是硬上限，不是要花完的目标。',
  '必须遵守以下规则：',
  '1. 只依据给定数据分析，不编造任何数据或金额；没有的信息就说没有。',
  '2. 评价消费行为，不评价他的人格，不要道德说教，不要鸡汤。',
  '3. 必要消费（吃饭、交通、学习刚需）不能因为金额大就判定为浪费。',
  '4. 必须把事实和建议分开写。',
  '5. 不要建议提高预算来解决超支，除非他自己明确说要提高。',
  '6. 小额高频消费和大额低频消费要一起看，找出真正的结构问题。',
  '7. 用中文，直接、具体、可执行，总字数控制在 450 字以内。',
  '输出格式：',
  '【事实】3-5 条，只陈述数据；',
  '【问题】1-3 条，指出结构性问题；',
  '【建议】3 条，每条都必须具体到能立刻执行。',
].join('\n');

export function buildMessages(payload) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `这是我的月度财务数据（JSON）：\n${JSON.stringify(payload, null, 2)}\n\n请按格式分析。` },
  ];
}

export async function requestDeepSeek({ key, model, messages, timeoutMs = 90000 }) {  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages,
        temperature: 0.6,
        max_tokens: 1600,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json();
        detail = body?.error?.message || '';
      } catch { /* 忽略解析失败 */ }
      const messagesByStatus = {
        400: '请求格式有问题',
        401: 'API Key 无效或已失效，请到设置里检查',
        402: 'DeepSeek 账户余额不足，请先充值',
        422: '请求参数不被接受',
        429: '请求太频繁，等一会儿再试',
        500: 'DeepSeek 服务异常，稍后再试',
        503: 'DeepSeek 服务繁忙，稍后再试',
      };
      const hint = messagesByStatus[response.status] || `请求失败（HTTP ${response.status}）`;
      throw new Error(detail ? `${hint}：${detail}` : hint);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error('DeepSeek 返回了空内容，请重试');
    return {
      text: String(text).trim(),
      usage: data?.usage || null,
    };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('请求超时（90 秒），可能是网络问题，请重试');
    if (error instanceof TypeError) throw new Error('网络请求失败：检查网络连接，或确认手机能否访问 api.deepseek.com');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// 校验 Key：只拉模型列表，不产生对话费用
export async function testDeepSeekKey(key, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('https://api.deepseek.com/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (response.status === 401) throw new Error('Key 无效，请检查是否复制完整');
    if (!response.ok) throw new Error(`连接失败（HTTP ${response.status}）`);
    const data = await response.json();
    const models = Array.isArray(data?.data) ? data.data.map((item) => item.id).filter(Boolean) : [];
    return models;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('连接超时，检查手机网络');
    if (error instanceof TypeError) throw new Error('网络请求失败，可能是网络或 CORS 限制');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
