const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
// firebase-admin 14 only ships the modular API — there is no admin.database().
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const Anthropic = require('@anthropic-ai/sdk');

initializeApp({
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
const MAX_RESPONSE_TOKENS = 2048;
// Settled history stays out of the default prompt; open rows + owing totals stay in.
const MAX_RECENT_PAYABLES_IN_CONTEXT = 40;
const MAX_OPEN_PAYABLES_IN_CONTEXT = 150;
const MAX_SEARCH_RESULTS = 50;
const MAX_LOOKUP_ROUNDS = 3;
// Claude accepts only these four; the client re-encodes anything else (e.g. iPhone
// HEIC) to JPEG before upload.
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
// A callable request is capped at ~10MB total, so the base64 payload has to stay
// comfortably under that once JSON overhead is counted.
const MAX_IMAGE_BASE64_LEN = 5_000_000; // ~3.7MB decoded

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const PERIOD_LABELS = ['first', 'second', 'third'];

// Functions run on a UTC clock, so anything derived from the server date lands
// a month or a day early for the first several hours of a Sydney day — which
// would point "this month" at the wrong budget.
const HOUSEHOLD_TIME_ZONE = 'Australia/Sydney';

const PROPOSE_TOOL_NAMES = new Set(['propose_payable', 'propose_bill', 'propose_savings_goal']);
const LOOKUP_TOOL_NAMES = new Set(['search_payables', 'get_budget_month']);

const TOOLS = [
  // Direct search only — the default dynamic-filtering path spins up code
  // execution and can push a cold start past the function timeout.
  { type: 'web_search_20260209', name: 'web_search', max_uses: 3, allowed_callers: ['direct'] },
  {
    name: 'search_payables',
    description: 'Search ALL payables (including settled and older than the recent list) by name substring. Use for questions like "how much did we pay for Limey Counselling" or any named expense that may not appear in openPayables/recentEntries.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Case-insensitive name substring, e.g. "Limey"' },
        limit: { type: 'integer', description: 'Max matches to return (default 20, max 50)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_budget_month',
    description: 'Load one month of budget detail for Elly and/or Eric. Use when the user asks about a month other than currentMonthKey. Month must already exist (see availableMonths).',
    input_schema: {
      type: 'object',
      properties: {
        month: { type: 'string', description: 'YYYY-MM' },
        whose: { type: 'string', enum: ['elly', 'eric', 'both'], description: 'Whose budget to load. Default both.' },
      },
      required: ['month'],
    },
  },
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

function householdCalendar(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HOUSEHOLD_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const partValue = (type) => Number(parts.find((p) => p.type === type).value);
  const year = partValue('year');
  const month = partValue('month');
  const day = partValue('day');
  const pad = (n) => String(n).padStart(2, '0');
  return {
    dateKey: `${year}-${pad(month)}-${pad(day)}`,
    monthKey: `${year}-${pad(month)}`,
    nextMonthKey: month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`,
    dateLabel: `${day} ${MONTHS[month - 1].slice(0, 3)} ${year}`,
  };
}

function requireAuthorisedUser(request) {
  const authInfo = request.auth;
  if (!authInfo || !authInfo.token || !authInfo.token.email) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  // Google always verifies. Without this, anyone who could sign up with
  // email/password could claim one of the addresses below and be let through.
  if (authInfo.token.email_verified !== true) {
    throw new HttpsError('permission-denied', 'This account is not authorised for Finance Hub.');
  }
  const email = authInfo.token.email;
  const user = Object.prototype.hasOwnProperty.call(AUTHORISED_USERS, email) ? AUTHORISED_USERS[email] : null;
  if (!user) {
    throw new HttpsError('permission-denied', 'This account is not authorised for Finance Hub.');
  }
  return { ...user, uid: authInfo.uid };
}

async function refundMessage(rlRef) {
  try {
    await rlRef.transaction((current) => Math.max(0, (current || 0) - 1));
  } catch (err) {
    // A failed refund must not replace the error the caller is already reporting.
    logger.error('Failed to refund a chat message', err);
  }
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Mirrors pMyShare / pEricShare / pIsEllyDone / pIsEricDone in index.html.
function ellyShare(e) {
  const full = Number(e && e.fullAmount) || 0;
  if (!e || e.split === 'eric') return 0;
  return e.split === 'shared' ? full / 2 : full;
}
function ericShare(e) {
  const full = Number(e && e.fullAmount) || 0;
  if (!e || e.split === 'mine') return 0;
  return e.split === 'shared' ? full / 2 : full;
}
function ellyOpen(e) {
  return !!(e && e.split !== 'eric' && !e.ellyDone);
}
function ericOpen(e) {
  return !!(e && e.split !== 'mine' && !e.ericDone);
}

function compactPayable(e) {
  return {
    name: (e && e.name) || '',
    date: (e && e.date) || '',
    split: (e && e.split) || '',
    fullAmount: roundMoney(e && e.fullAmount),
    ellyShare: roundMoney(ellyShare(e)),
    ericShare: roundMoney(ericShare(e)),
    ellyStatus: !e || e.split === 'eric' ? 'n/a' : (e.ellyDone ? 'settled' : 'open'),
    ericStatus: !e || e.split === 'mine' ? 'n/a' : (e.ericDone ? 'settled' : 'open'),
    payTo: (e && e.payTo) || '',
  };
}

function owingFor(entries, whose) {
  let pendingCount = 0;
  let amountOwed = 0;
  for (const e of entries) {
    if (!e) continue;
    if (whose === 'elly') {
      if (!ellyOpen(e)) continue;
      pendingCount += 1;
      amountOwed += ellyShare(e);
    } else {
      if (!ericOpen(e)) continue;
      pendingCount += 1;
      amountOwed += ericShare(e);
    }
  }
  return { pendingCount, amountOwed: roundMoney(amountOwed) };
}

function bucketFullAmounts(entries) {
  const out = { count: 0, sumFullAmount: 0 };
  for (const e of entries) {
    if (!e) continue;
    out.count += 1;
    out.sumFullAmount += Number(e.fullAmount) || 0;
  }
  out.sumFullAmount = roundMoney(out.sumFullAmount);
  return out;
}

// Owing totals match the Payables tab "I owe" cards (share-based, not fullAmount).
function summarisePayables(entries) {
  const bySplit = { shared: [], mine: [], eric: [], other: [] };
  for (const e of entries) {
    if (!e) continue;
    const key = Object.prototype.hasOwnProperty.call(bySplit, e.split) ? e.split : 'other';
    bySplit[key].push(e);
  }
  return {
    totalCount: entries.length,
    all: bucketFullAmounts(entries),
    bySplit: {
      shared: bucketFullAmounts(bySplit.shared),
      mine: bucketFullAmounts(bySplit.mine),
      eric: bucketFullAmounts(bySplit.eric),
      ...(bySplit.other.length ? { other: bucketFullAmounts(bySplit.other) } : {}),
    },
    owing: {
      elly: owingFor(entries, 'elly'),
      eric: owingFor(entries, 'eric'),
      note: 'amountOwed is each person\'s share of open items — same as the Payables tab. Shared items count half; solo items count in full for that person only.',
    },
  };
}

function buildPayablesContext(payables) {
  if (!payables) return null;
  const entries = toList(payables.entries);
  const summary = summarisePayables(entries);
  const openAll = entries
    .filter((e) => ellyOpen(e) || ericOpen(e))
    .sort((a, b) => ((b && b.createdAt) || 0) - ((a && a.createdAt) || 0));
  const openPayables = openAll.slice(0, MAX_OPEN_PAYABLES_IN_CONTEXT).map(compactPayable);
  const recentEntries = entries
    .slice()
    .sort((a, b) => ((b && b.createdAt) || 0) - ((a && a.createdAt) || 0))
    .slice(0, MAX_RECENT_PAYABLES_IN_CONTEXT)
    .map(compactPayable);
  return {
    summary,
    openPayables,
    openPayablesOmitted: Math.max(0, openAll.length - openPayables.length),
    recentEntries,
    recentEntriesOmitted: Math.max(0, entries.length - recentEntries.length),
    note: 'Use summary.owing for "how much do I/we owe" — it matches the Payables tab. openPayables lists open rows with each person\'s share. For a named older/settled expense, call search_payables.',
  };
}

function searchPayablesEntries(entries, query, limit) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { matches: [], totalMatches: 0 };
  const capped = Math.min(Math.max(parseInt(limit, 10) || 20, 1), MAX_SEARCH_RESULTS);
  const hits = entries.filter((e) => e && String(e.name || '').toLowerCase().includes(q));
  return {
    query: q,
    totalMatches: hits.length,
    matches: hits
      .slice()
      .sort((a, b) => ((b && b.createdAt) || 0) - ((a && a.createdAt) || 0))
      .slice(0, capped)
      .map(compactPayable),
    omitted: Math.max(0, hits.length - capped),
  };
}

// ═══════════════════════════════════════════════════════════════
//  chatFinances — read-only Q&A + proposes writes (never executes them)
// ═══════════════════════════════════════════════════════════════
exports.chatFinances = onCall({
  secrets: [anthropicApiKey],
  region: 'asia-southeast1',
  timeoutSeconds: 120,
  memory: '512MiB',
}, async (request) => {
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

  const db = getDatabase();
  const { dateKey, monthKey: mKey, nextMonthKey: nKey } = householdCalendar(new Date());

  // Per-user daily rate limit — guards against runaway cost from a single
  // account. The message is claimed up front to close a race-based bypass, so
  // every path out of here that didn't actually spend it has to hand it back.
  const rlRef = db.ref(`finance-hub/rate-limits/${user.uid}/${dateKey}`);
  const rlResult = await rlRef.transaction((current) => (current || 0) + 1);
  if (!rlResult.committed) {
    throw new HttpsError('unavailable', "Couldn't start that message — try again in a moment.");
  }
  if (rlResult.snapshot.val() > DAILY_MESSAGE_LIMIT) {
    await refundMessage(rlRef);
    throw new HttpsError('resource-exhausted', "You've hit today's chat limit. Try again tomorrow.");
  }

  let response;
  let usedSearch = false;
  try {
    logger.info('chatFinances: loading budget context', { user: user.key, month: mKey });
    const [ellySnap, ericSnap, payablesSnap, ellyMonthsSnap, ericMonthsSnap, ellySettingsSnap, ericSettingsSnap] = await Promise.all([
      db.ref(`finance-hub/budget/months/${mKey}`).get(),
      db.ref(`finance-hub/eric-budget/months/${mKey}`).get(),
      db.ref('finance-hub/payables').get(),
      db.ref('finance-hub/budget/months').get(),
      db.ref('finance-hub/eric-budget/months').get(),
      db.ref('finance-hub/budget/settings').get(),
      db.ref('finance-hub/eric-budget/settings').get(),
    ]);

    const allPayableEntries = toList(payablesSnap.val() && payablesSnap.val().entries);
    const ellyMonths = ellyMonthsSnap.val() || {};
    const ericMonths = ericMonthsSnap.val() || {};
    const ellyMonth = ellySnap.val();
    const ericMonth = ericSnap.val();
    const ellySettings = ellySettingsSnap.val() || {};
    const ericSettings = ericSettingsSnap.val() || {};
    const ellyPeriodCount = Math.max(toList(ellyMonth && ellyMonth.periods).length, 1);
    const ellyFortnightlySalary = Number(ellySettings.salary) || 0;
    const ericMonthlySalary = Number(ericSettings.salary) || 0;
    const periodExtraIncome = (month) => toList(month && month.periods).reduce((sum, p) => {
      const extras = toList(p && p.income).reduce((s, i) => s + (Number(i && i.amount) || 0), 0);
      return sum + extras;
    }, 0);

    const budgetContext = {
      currentMonth: mKey,
      askingUser: user.key,
      availableMonths: {
        elly: Object.keys(ellyMonths).sort(),
        eric: Object.keys(ericMonths).sort(),
      },
      // Salaries live under budget/settings — not inside each month document.
      income: {
        elly: {
          fortnightlySalary: roundMoney(ellyFortnightlySalary),
          payPeriodsThisMonth: ellyPeriodCount,
          salaryThisMonth: roundMoney(ellyFortnightlySalary * ellyPeriodCount),
          extraIncomeThisMonth: roundMoney(periodExtraIncome(ellyMonth)),
          note: 'settings.salary is Elly\'s fortnightly take-home. salaryThisMonth = fortnightly × pay periods in this calendar month.',
        },
        eric: {
          monthlySalary: roundMoney(ericMonthlySalary),
          extraIncomeThisMonth: roundMoney(periodExtraIncome(ericMonth)),
          note: 'settings.salary is Eric\'s monthly take-home.',
        },
        householdSalaryThisMonth: roundMoney(
          (ellyFortnightlySalary * ellyPeriodCount) + ericMonthlySalary
        ),
      },
      ellyBudgetThisMonth: ellyMonth || null,
      ericBudgetThisMonth: ericMonth || null,
      payables: buildPayablesContext(payablesSnap.val()),
    };

    const runLookupTool = (name, input) => {
      if (name === 'search_payables') {
        return searchPayablesEntries(allPayableEntries, input && input.query, input && input.limit);
      }
      if (name === 'get_budget_month') {
        const month = String((input && input.month) || '').trim();
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
          return { error: 'month must be YYYY-MM' };
        }
        const whose = (input && input.whose) || 'both';
        const out = { month };
        if (whose === 'elly' || whose === 'both') {
          out.elly = Object.prototype.hasOwnProperty.call(ellyMonths, month) ? ellyMonths[month] : null;
          if (out.elly === null) out.ellyMissing = true;
        }
        if (whose === 'eric' || whose === 'both') {
          out.eric = Object.prototype.hasOwnProperty.call(ericMonths, month) ? ericMonths[month] : null;
          if (out.eric === null) out.ericMissing = true;
        }
        return out;
      }
      return { error: 'Unknown lookup tool' };
    };

    const instructions = `You are a household finance assistant for Elly and Eric, embedded in their private budgeting app "Finance Hub". You are currently answering ${user.key === 'elly' ? 'Elly' : 'Eric'}.

Today's date: ${dateKey}. currentMonthKey: ${mKey}. nextMonthKey: ${nKey}. Use these to resolve relative months like "this month" or "starting next month" into a concrete "YYYY-MM" value for tool calls — don't do the arithmetic yourself from guesswork.

Use the JSON budget data below to answer questions about their income, bills, savings, and spending. Amounts are in AUD. Periods are fortnightly pay cycles unless noted otherwise (Eric's budget has a single monthly period, index 0). "bills" are recurring or one-off expenses; "savingsGoals" are money set aside toward goals.

Income (critical for affordability): use income.elly / income.eric / income.householdSalaryThisMonth from the JSON. Do not say salaries are missing when those fields are present. Elly's settings salary is fortnightly; Eric's is monthly. Add extraIncomeThisMonth when relevant. Headroom ≈ household (or personal) income minus committed bills/savings for the month.

Payables (critical):
- payables.summary.owing.elly / .eric match the Payables tab "I owe" totals (each person's share of open items). Always use those for "how much do I/we owe" — never invent an amount from a partial list.
- Shared = half each; Elly solo (split mine) counts only for Elly; Eric solo counts only for Eric.
- openPayables has open rows with ellyShare/ericShare. recentEntries is a recent sample. Settled/older named items: call search_payables.
- Other months: call get_budget_month with YYYY-MM from availableMonths.

When asked about affordability (e.g. "can we afford X"), do the arithmetic explicitly using the numbers provided — income minus committed bills/savings minus existing spend — and show your reasoning briefly. For questions involving loans, interest rates, or current market conditions, use web search to find up-to-date figures and say what you found and its source; state any assumptions clearly.

You can propose changes with the propose_payable, propose_bill, and propose_savings_goal tools whenever the user asks to add, log, split, or set up an expense, bill, or savings goal — including from a receipt photo they attach. These tools never write anything directly: the app always shows the user a confirmation card and only saves it if they approve. So call the tool confidently rather than just describing what you would do — the confirmation step is the safety net, not you. If a receipt image is attached, read the merchant, amount, and date from it before proposing, and mention what you read.

Keep answers concise and conversational; this is a chat, not a report. Do not use em dashes (—) in your replies; use commas, periods, or hyphens instead.

Formatting (the app renders Markdown bullets and tables — use them):
- For 2+ items that have amounts, shares, halves, or status, you MUST use a Markdown pipe table, not a dashed list. Example:
| Item | Amount | Status |
| --- | --- | --- |
| Monster Truck tickets | $167 | Open |
- Separate each person or section with a short **bold** heading, then its own table.
- Use "- " bullet lists only for simple single-column points (no amounts/columns).
- Keep tables compact; money as $X or $X.XX. Say "open" / "settled" — never dump raw fields like ericDone or ellyDone.`;

    const systemBlocks = [
      { type: 'text', text: instructions },
      {
        type: 'text',
        text: `Budget data (JSON):\n${JSON.stringify(budgetContext)}`,
        // Cache multi-turn chat within ~5 minutes so repeat questions don't re-bill the full context.
        cache_control: { type: 'ephemeral' },
      },
    ];

    const anthropic = new Anthropic({ apiKey: anthropicApiKey.value() });

    let anthropicMessages = trimmedHistory.map((m) => ({ role: m.role, content: m.content }));
    if (imageBlock && anthropicMessages.length > 0) {
      const last = anthropicMessages[anthropicMessages.length - 1];
      if (last.role === 'user') {
        last.content = [imageBlock, { type: 'text', text: last.content }];
      }
    }

    for (let round = 0; round < MAX_LOOKUP_ROUNDS; round++) {
      logger.info('chatFinances: calling Anthropic', {
        history: anthropicMessages.length, hasImage: !!imageBlock, round,
      });
      response = await anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: MAX_RESPONSE_TOKENS,
        output_config: { effort: 'low' },
        system: systemBlocks,
        tools: TOOLS,
        messages: anthropicMessages,
      });
      const searchRequests = response.usage?.server_tool_use?.web_search_requests;
      if ((typeof searchRequests === 'number' && searchRequests > 0)
        || response.content.some((b) => b.type === 'server_tool_use' && b.name === 'web_search')) {
        usedSearch = true;
      }
      logger.info('chatFinances: Anthropic returned', {
        stopReason: response.stop_reason,
        round,
        searchRequests: searchRequests || 0,
      });

      const lookupUses = response.content.filter((b) => b.type === 'tool_use' && LOOKUP_TOOL_NAMES.has(b.name));
      const proposeUses = response.content.filter((b) => b.type === 'tool_use' && PROPOSE_TOOL_NAMES.has(b.name));
      // Never continue the loop if a propose tool is present — the API requires a
      // tool_result for every tool_use, and proposes are handled by the client confirm card.
      if (proposeUses.length || !lookupUses.length) break;
      if (round === MAX_LOOKUP_ROUNDS - 1) break;

      anthropicMessages = [
        ...anthropicMessages,
        { role: 'assistant', content: response.content },
        {
          role: 'user',
          content: lookupUses.map((tu) => ({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: JSON.stringify(runLookupTool(tu.name, tu.input || {})),
          })),
        },
      ];
    }
  } catch (err) {
    await refundMessage(rlRef);
    if (err instanceof HttpsError) throw err;
    logger.error('Chat request failed', err);
    throw new HttpsError('internal', "I couldn't reach the assistant just then — try again in a moment.");
  }

  if (response.stop_reason === 'refusal') {
    return { reply: "I wasn't able to answer that one — try rephrasing the question.", usedSearch: false, proposedAction: null };
  }

  const textParts = response.content.filter((b) => b.type === 'text').map((b) => b.text);
  const proposeBlock = response.content.find((b) => b.type === 'tool_use' && PROPOSE_TOOL_NAMES.has(b.name));

  // Running out of tokens can stop a turn mid tool_use, leaving the proposal's
  // params half-written. Asking again beats asking someone to approve an amount
  // Claude never finished, so the card is withheld.
  if (response.stop_reason === 'max_tokens') {
    const partial = textParts.join('\n\n').trim();
    return {
      reply: partial
        ? `${partial}\n\n(I ran out of room mid-answer — ask me to carry on, or narrow the question.)`
        : 'That answer got too long for one reply — try narrowing the question.',
      usedSearch,
      proposedAction: null,
    };
  }

  if (proposeBlock) {
    return {
      reply: textParts.join('\n\n').trim(),
      usedSearch,
      proposedAction: { type: proposeBlock.name, params: proposeBlock.input },
    };
  }

  // Stray lookup tool_use with no final text (hit round cap) — don't surface a blank card.
  if (response.content.some((b) => b.type === 'tool_use' && LOOKUP_TOOL_NAMES.has(b.name))) {
    return {
      reply: textParts.join('\n\n').trim()
        || "I looked that up but ran out of steps — try asking again with a slightly narrower question.",
      usedSearch,
      proposedAction: null,
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

  const db = getDatabase();

  if (type === 'propose_payable') {
    const clean = validatePayableParams(params);
    const entry = {
      id: genId(), name: clean.name, fullAmount: clean.amount, split: clean.split,
      payTo: clean.payTo, date: clean.date || householdCalendar(new Date()).dateLabel,
      createdAt: Date.now(), createdBy: user.key,
      ellyDone: false, ellyDoneAt: null, ericDone: false, ericDoneAt: null,
      allocatedTo: null, ericAllocatedTo: null,
    };
    // Both people edit payables live and the app writes the whole list from
    // client state, so a read-modify-write here can drop an entry.
    const entriesRef = db.ref('finance-hub/payables/entries');
    const result = await entriesRef.transaction((current) => {
      const entries = toList(current);
      entries.unshift(entry);
      return entries;
    });
    if (!result.committed) {
      throw new HttpsError('aborted', "Couldn't save that payable — the list was being edited at the same time. Try again.");
    }
    return { ok: true, summary: `Added payable "${entry.name}" — $${entry.fullAmount.toFixed(2)}` };
  }

  if (type === 'propose_bill' || type === 'propose_savings_goal') {
    const clean = validateLineItemParams(params, user);
    const monthRef = db.ref(`${user.budgetPath}/months/${clean.targetMonth}`);
    const listKey = type === 'propose_bill' ? 'bills' : 'savingsGoals';
    const item = { id: genId(), name: clean.name, amount: clean.amount, payTo: clean.payTo, recurring: clean.recurring, done: false };

    // Never create the month here. The app's own month creation seeds the
    // default savings goal and carries over recurring bills and extra income,
    // and it early-returns if the month already exists — so a bare month
    // fabricated here would silently cost the user that whole carry-over.
    const monthSnap = await monthRef.get();
    if (!monthSnap.exists()) {
      throw new HttpsError('failed-precondition', monthMissingMessage(clean.targetMonth));
    }

    // Don't create the pay period either. Firebase stores an empty array as
    // nothing, so a padded period arrives with no bills or savingsGoals key and
    // every unguarded period.bills read in the Monthly, Summary and Insights
    // tabs throws — which reads to the user as the chat having eaten the month.
    if (!hasPeriod(monthSnap.val(), clean.period)) {
      throw new HttpsError('failed-precondition', periodMissingMessage(clean.targetMonth, clean.period));
    }

    // Append to the list itself rather than rewriting the whole month, so a
    // concurrent edit elsewhere in the month can't be clobbered.
    const listRef = monthRef.child(`periods/${clean.period}/${listKey}`);
    const result = await listRef.transaction((current) => {
      const list = toList(current);
      list.push(item);
      return list;
    });
    if (!result.committed) {
      throw new HttpsError('aborted', `Couldn't save that to ${monthLabel(clean.targetMonth)} — your budget was being edited at the same time. Try again.`);
    }
    const label = type === 'propose_bill' ? 'bill' : 'savings goal';
    return { ok: true, summary: `Added ${clean.recurring ? 'recurring ' : ''}${label} "${item.name}" — $${item.amount.toFixed(2)} to ${clean.targetMonth}` };
  }

  throw new HttpsError('invalid-argument', 'Unknown action type.');
});

// ── Validation & write helpers (never trust client-supplied params) ──

function genId() {
  return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function monthLabel(targetMonth) {
  const [y, m] = targetMonth.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function monthMissingMessage(targetMonth) {
  return `${monthLabel(targetMonth)} hasn't been created yet — open the Monthly tab and create it first so your recurring bills carry over, then ask me again.`;
}

function periodMissingMessage(targetMonth, period) {
  const which = PERIOD_LABELS[period] || `number ${period + 1}`;
  return `Your ${monthLabel(targetMonth)} budget doesn't have a ${which} pay period yet — add it in the Monthly tab first, then ask me again.`;
}

// Firebase hands back an array for a dense list and an object once it isn't, so
// every read of a stored list has to cope with both shapes.
function hasPeriod(month, index) {
  const periods = month && month.periods;
  if (!periods) return false;
  return Array.isArray(periods) ? !!periods[index] : !!periods[String(index)];
}

// Coercing an object-shaped list to [] would atomically destroy every entry in
// it, so preserve the contents the way the client does when it reads them.
function toList(current) {
  if (Array.isArray(current)) return current.slice();
  if (current && typeof current === 'object') return Object.values(current);
  return [];
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
