const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const Anthropic = require('@anthropic-ai/sdk');

admin.initializeApp({
  databaseURL: 'https://finance-hub-27fb1-default-rtdb.asia-southeast1.firebasedatabase.app',
});

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

// Mirrors AUTHORISED_USERS in index.html — keep in sync.
const AUTHORISED_USERS = {
  'ellyhizon1@gmail.com':  { key: 'elly', budgetPath: 'finance-hub/budget' },
  'ericdefelix@gmail.com': { key: 'eric', budgetPath: 'finance-hub/eric-budget' },
};

const DAILY_MESSAGE_LIMIT = 30;
const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 2000;
// Claude accepts only these four; the client re-encodes anything else (e.g. iPhone
// HEIC) to JPEG before upload.
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
// A callable request is capped at ~10MB total, so the base64 payload has to stay
// comfortably under that once JSON overhead is counted.
const MAX_IMAGE_BASE64_LEN = 5_000_000; // ~3.7MB decoded

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const CUSTOM_TOOL_NAMES = new Set(['propose_payable', 'propose_bill', 'propose_savings_goal']);

const TOOLS = [
  // max_uses caps what a single question can spend on search.
  { type: 'web_search_20260209', name: 'web_search', max_uses: 5 },
  {
    name: 'propose_payable',
    description: 'Propose adding a shared household expense (a "payable") between Elly and Eric. This does not write anything by itself — the app shows the user a confirmation card and only saves it if they approve. Call this whenever the user asks to add, log, or split an expense between them, including from a receipt photo.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short expense name, e.g. "Energy bill"' },
        amount: { type: 'number', description: 'Full amount in AUD, before any split' },
        split: { type: 'string', enum: ['shared', 'mine', 'eric'], description: '"shared" = 50/50 between Elly and Eric, "mine" = solo for Elly, "eric" = solo for Eric. These are always relative to Elly/Eric by name, not to whoever is asking.' },
        payTo: { type: 'string', description: 'Account or payee it was/will be paid to, if known' },
        date: { type: 'string', description: 'Date incurred, formatted like "25 Mar 2026". Omit to default to today.' },
      },
      required: ['name', 'amount', 'split'],
    },
  },
  {
    name: 'propose_bill',
    description: "Propose adding a bill/expense line to the asking user's own monthly budget (not shared with the other person) — e.g. a recurring subscription or an invoice that should appear going forward. This does not write anything by itself — the user must confirm.",
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Bill name, e.g. "Netflix" or the invoice description' },
        amount: { type: 'number', description: 'Amount per occurrence, in AUD' },
        recurring: { type: 'boolean', description: 'True if this should keep appearing in future months automatically' },
        payTo: { type: 'string', description: 'Account or payee, if known' },
        targetMonth: { type: 'string', description: 'Month to start from, as YYYY-MM. Use currentMonthKey or nextMonthKey from context unless the user names a specific month — do not guess the arithmetic yourself.' },
        period: { type: 'integer', description: 'Which pay period within the month, 0-based. Eric only has period 0. Elly has 0 (first fortnight) and 1 (second fortnight) — default to 0 unless the user specifies otherwise.' },
      },
      required: ['name', 'amount', 'recurring', 'targetMonth'],
    },
  },
  {
    name: 'propose_savings_goal',
    description: "Propose adding a savings goal line to the asking user's own monthly budget. This does not write anything by itself — the user must confirm.",
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Savings goal name' },
        amount: { type: 'number', description: 'Amount to set aside per period, in AUD' },
        recurring: { type: 'boolean', description: 'True if this should keep appearing in future months automatically' },
        payTo: { type: 'string', description: 'Destination account, if known' },
        targetMonth: { type: 'string', description: 'Month to start from, as YYYY-MM.' },
        period: { type: 'integer', description: '0-based pay period within the month. Eric only has period 0.' },
      },
      required: ['name', 'amount', 'recurring', 'targetMonth'],
    },
  },
];

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonthKeyFrom(date) {
  return monthKey(new Date(date.getFullYear(), date.getMonth() + 1, 1));
}

function requireAuthorisedUser(request) {
  const authInfo = request.auth;
  if (!authInfo || !authInfo.token || !authInfo.token.email) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const user = AUTHORISED_USERS[authInfo.token.email];
  if (!user) {
    throw new HttpsError('permission-denied', 'This account is not authorised for Finance Hub.');
  }
  return { ...user, uid: authInfo.uid };
}

// ═══════════════════════════════════════════════════════════════
//  chatFinances — read-only Q&A + proposes writes (never executes them)
// ═══════════════════════════════════════════════════════════════
exports.chatFinances = onCall({ secrets: [anthropicApiKey], region: 'asia-southeast1' }, async (request) => {
  const user = requireAuthorisedUser(request);

  const messages = Array.isArray(request.data && request.data.messages) ? request.data.messages : null;
  if (!messages || messages.length === 0) {
    throw new HttpsError('invalid-argument', 'No message provided.');
  }
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || !m.content.trim() || m.content.length > MAX_MESSAGE_LENGTH) {
      throw new HttpsError('invalid-argument', 'Message too long or malformed.');
    }
  }
  const trimmedHistory = messages.slice(-MAX_HISTORY_MESSAGES);

  const rawImage = request.data && request.data.image;
  let imageBlock = null;
  if (rawImage) {
    if (!ALLOWED_IMAGE_TYPES.includes(rawImage.mediaType)) {
      throw new HttpsError('invalid-argument', "That image format isn't supported — use a JPEG, PNG, GIF or WebP.");
    }
    if (typeof rawImage.data !== 'string' || !rawImage.data) {
      throw new HttpsError('invalid-argument', 'The image attachment was empty.');
    }
    if (rawImage.data.length > MAX_IMAGE_BASE64_LEN) {
      throw new HttpsError('invalid-argument', 'That image is too large — try a smaller photo.');
    }
    imageBlock = { type: 'image', source: { type: 'base64', media_type: rawImage.mediaType, data: rawImage.data } };
  }

  const db = admin.database();
  const today = new Date();
  const dateKey = today.toISOString().slice(0, 10);

  // Per-user daily rate limit — guards against runaway cost from a single account.
  const rlRef = db.ref(`finance-hub/rate-limits/${user.uid}/${dateKey}`);
  const rlResult = await rlRef.transaction((current) => (current || 0) + 1);
  if (rlResult.committed && rlResult.snapshot.val() > DAILY_MESSAGE_LIMIT) {
    throw new HttpsError('resource-exhausted', "You've hit today's chat limit. Try again tomorrow.");
  }

  const mKey = monthKey(today);
  const nKey = nextMonthKeyFrom(today);
  const [ellySnap, ericSnap, payablesSnap] = await Promise.all([
    db.ref(`finance-hub/budget/months/${mKey}`).get(),
    db.ref(`finance-hub/eric-budget/months/${mKey}`).get(),
    db.ref('finance-hub/payables').get(),
  ]);

  const budgetContext = {
    currentMonth: mKey,
    askingUser: user.key,
    ellyBudgetThisMonth: ellySnap.val() || null,
    ericBudgetThisMonth: ericSnap.val() || null,
    payables: payablesSnap.val() || null,
  };

  const systemPrompt = `You are a household finance assistant for Elly and Eric, embedded in their private budgeting app "Finance Hub". You are currently answering ${user.key === 'elly' ? 'Elly' : 'Eric'}.

Today's date: ${dateKey}. currentMonthKey: ${mKey}. nextMonthKey: ${nKey}. Use these to resolve relative months like "this month" or "starting next month" into a concrete "YYYY-MM" value for tool calls — don't do the arithmetic yourself from guesswork.

Use the JSON budget data below to answer questions about their income, bills, savings, and spending. Amounts are in AUD. Periods are fortnightly pay cycles unless noted otherwise (Eric's budget has a single monthly period, index 0). "bills" are recurring or one-off expenses; "savingsGoals" are money set aside toward goals.

When asked about affordability (e.g. "can we afford X"), do the arithmetic explicitly using the numbers provided — income minus committed bills/savings minus existing spend — and show your reasoning briefly. For questions involving loans, interest rates, or current market conditions, use web search to find up-to-date figures and say what you found and its source; state any assumptions clearly.

You can propose changes with the propose_payable, propose_bill, and propose_savings_goal tools whenever the user asks to add, log, split, or set up an expense, bill, or savings goal — including from a receipt photo they attach. These tools never write anything directly: the app always shows the user a confirmation card and only saves it if they approve. So call the tool confidently rather than just describing what you would do — the confirmation step is the safety net, not you. If a receipt image is attached, read the merchant, amount, and date from it before proposing, and mention what you read.

Keep answers concise and conversational — this is a chat, not a report.

Budget data (JSON):
${JSON.stringify(budgetContext)}`;

  const anthropic = new Anthropic({ apiKey: anthropicApiKey.value() });

  const anthropicMessages = trimmedHistory.map((m) => ({ role: m.role, content: m.content }));
  if (imageBlock && anthropicMessages.length > 0) {
    const last = anthropicMessages[anthropicMessages.length - 1];
    if (last.role === 'user') {
      last.content = [imageBlock, { type: 'text', text: last.content }];
    }
  }

  let response;
  try {
    response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2048,
      output_config: { effort: 'medium' },
      system: systemPrompt,
      tools: TOOLS,
      messages: anthropicMessages,
    });
  } catch (err) {
    // The counter is claimed up front to close a race-based bypass, so a call
    // that never reached Claude has to hand the message back.
    await rlRef.transaction((c) => Math.max(0, (c || 0) - 1));
    logger.error('Anthropic request failed', err);
    throw new HttpsError('internal', "I couldn't reach the assistant just then — try again in a moment.");
  }

  if (response.stop_reason === 'refusal') {
    return { reply: "I wasn't able to answer that one — try rephrasing the question.", usedSearch: false, proposedAction: null };
  }

  const textParts = response.content.filter((b) => b.type === 'text').map((b) => b.text);
  // Dynamic filtering runs search from inside code execution, so its
  // server_tool_use blocks are nested rather than top-level — the usage counter
  // is the only reliable signal; the content scan just covers the unnested case.
  const searchRequests = response.usage?.server_tool_use?.web_search_requests;
  const usedSearch = (typeof searchRequests === 'number' && searchRequests > 0)
    || response.content.some((b) => b.type === 'server_tool_use' && b.name === 'web_search');
  const toolUseBlock = response.content.find((b) => b.type === 'tool_use' && CUSTOM_TOOL_NAMES.has(b.name));

  if (toolUseBlock) {
    return {
      reply: textParts.join('\n\n').trim(),
      usedSearch,
      proposedAction: { type: toolUseBlock.name, params: toolUseBlock.input },
    };
  }

  return {
    reply: textParts.join('\n\n').trim() || "I didn't get a response — try asking again.",
    usedSearch,
    proposedAction: null,
  };
});

// ═══════════════════════════════════════════════════════════════
//  executeProposedAction — the only place that actually writes to
//  Firebase; only ever called after the user taps "Confirm".
// ═══════════════════════════════════════════════════════════════
exports.executeProposedAction = onCall({ region: 'asia-southeast1' }, async (request) => {
  const user = requireAuthorisedUser(request);

  const type = request.data && request.data.type;
  const params = request.data && request.data.params;
  if (!type || typeof params !== 'object' || params === null) {
    throw new HttpsError('invalid-argument', 'Malformed action.');
  }

  const db = admin.database();

  if (type === 'propose_payable') {
    const clean = validatePayableParams(params);
    const entry = {
      id: genId(), name: clean.name, fullAmount: clean.amount, split: clean.split,
      payTo: clean.payTo, date: clean.date || formatDateLabel(new Date()),
      createdAt: Date.now(), createdBy: user.key,
      ellyDone: false, ellyDoneAt: null, ericDone: false, ericDoneAt: null,
      allocatedTo: null, ericAllocatedTo: null,
    };
    const entriesRef = db.ref('finance-hub/payables/entries');
    const snap = await entriesRef.get();
    const entries = Array.isArray(snap.val()) ? snap.val() : [];
    entries.unshift(entry);
    await entriesRef.set(entries);
    return { ok: true, summary: `Added payable "${entry.name}" — $${entry.fullAmount.toFixed(2)}` };
  }

  if (type === 'propose_bill' || type === 'propose_savings_goal') {
    const clean = validateLineItemParams(params, user);
    const monthRef = db.ref(`${user.budgetPath}/months/${clean.targetMonth}`);
    const monthSnap = await monthRef.get();
    let month = monthSnap.val();
    if (!month) month = buildDefaultMonth(clean.targetMonth, user.key);
    if (!Array.isArray(month.periods)) month.periods = [];
    while (month.periods.length <= clean.period) {
      month.periods.push({ date: '', savingsGoals: [], bills: [] });
    }
    const period = month.periods[clean.period];
    const listKey = type === 'propose_bill' ? 'bills' : 'savingsGoals';
    if (!Array.isArray(period[listKey])) period[listKey] = [];
    const item = { id: genId(), name: clean.name, amount: clean.amount, payTo: clean.payTo, recurring: clean.recurring, done: false };
    period[listKey].push(item);
    await monthRef.set(month);
    const label = type === 'propose_bill' ? 'bill' : 'savings goal';
    return { ok: true, summary: `Added ${clean.recurring ? 'recurring ' : ''}${label} "${item.name}" — $${item.amount.toFixed(2)} to ${clean.targetMonth}` };
  }

  throw new HttpsError('invalid-argument', 'Unknown action type.');
});

// ── Validation & write helpers (never trust client-supplied params) ──

function genId() {
  return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatDateLabel(date) {
  return `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`;
}

function validateAmount(a) {
  const n = parseFloat(a);
  if (!Number.isFinite(n) || n <= 0 || n > 1000000) {
    throw new HttpsError('invalid-argument', 'Amount must be a positive number.');
  }
  return Math.round(n * 100) / 100;
}

function validateShortString(s, maxLen, fieldName, required) {
  if (s === undefined || s === null || s === '') {
    if (required) throw new HttpsError('invalid-argument', `${fieldName} is required.`);
    return '';
  }
  if (typeof s !== 'string' || s.length > maxLen) {
    throw new HttpsError('invalid-argument', `${fieldName} is invalid.`);
  }
  return s.trim();
}

function validatePayableParams(p) {
  const name = validateShortString(p.name, 200, 'name', true);
  const amount = validateAmount(p.amount);
  if (!['shared', 'mine', 'eric'].includes(p.split)) {
    throw new HttpsError('invalid-argument', 'split must be shared, mine, or eric.');
  }
  const payTo = validateShortString(p.payTo, 100, 'payTo', false);
  const date = validateShortString(p.date, 50, 'date', false);
  return { name, amount, split: p.split, payTo, date };
}

function validateLineItemParams(p, user) {
  const name = validateShortString(p.name, 200, 'name', true);
  const amount = validateAmount(p.amount);
  const recurring = !!p.recurring;
  const payTo = validateShortString(p.payTo, 100, 'payTo', false);
  const targetMonth = validateShortString(p.targetMonth, 7, 'targetMonth', true);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) {
    throw new HttpsError('invalid-argument', 'targetMonth must be formatted YYYY-MM.');
  }
  const maxPeriod = user.key === 'eric' ? 0 : 1;
  let period = parseInt(p.period, 10);
  if (!Number.isInteger(period) || period < 0) period = 0;
  if (period > maxPeriod) period = maxPeriod;
  return { name, amount, recurring, payTo, targetMonth, period };
}

function defaultDates(y, monthIdx) {
  const daysInMonth = new Date(y, monthIdx + 1, 0).getDate();
  const mo = MONTHS[monthIdx].slice(0, 3);
  return [`${Math.min(11, daysInMonth)} ${mo} ${y}`, `${Math.min(25, daysInMonth)} ${mo} ${y}`];
}

function buildDefaultMonth(targetMonth, userKey) {
  const [y, m] = targetMonth.split('-').map(Number);
  const monthIdx = m - 1;
  if (userKey === 'eric') {
    return { periods: [{ date: `16 ${MONTHS[monthIdx].slice(0, 3)} ${y}`, savingsGoals: [], bills: [] }] };
  }
  const [d1, d2] = defaultDates(y, monthIdx);
  return {
    periods: [
      { date: d1, savingsGoals: [], bills: [] },
      { date: d2, savingsGoals: [], bills: [] },
    ],
  };
}
