const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
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

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

exports.chatFinances = onCall({ secrets: [anthropicApiKey], region: 'asia-southeast1' }, async (request) => {
  const authInfo = request.auth;
  if (!authInfo || !authInfo.token || !authInfo.token.email) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const user = AUTHORISED_USERS[authInfo.token.email];
  if (!user) {
    throw new HttpsError('permission-denied', 'This account is not authorised for Finance Hub.');
  }

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

  const db = admin.database();
  const today = new Date();
  const dateKey = today.toISOString().slice(0, 10);

  // Per-user daily rate limit — guards against runaway cost from a single account.
  const rlRef = db.ref(`finance-hub/rate-limits/${authInfo.uid}/${dateKey}`);
  const rlResult = await rlRef.transaction((current) => (current || 0) + 1);
  if (rlResult.committed && rlResult.snapshot.val() > DAILY_MESSAGE_LIMIT) {
    throw new HttpsError('resource-exhausted', "You've hit today's chat limit. Try again tomorrow.");
  }

  const mKey = monthKey(today);
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

Use the JSON budget data below to answer questions about their income, bills, savings, and spending. Amounts are in AUD. Periods are fortnightly pay cycles unless noted otherwise. "bills" are recurring or one-off expenses; "savingsGoals" are money set aside toward goals.

When asked about affordability (e.g. "can we afford X"), do the arithmetic explicitly using the numbers provided — income minus committed bills/savings minus existing spend — and show your reasoning briefly. For questions involving loans, interest rates, or current market conditions, use web search to find up-to-date figures and say what you found and its source; state any assumptions clearly. Keep answers concise and conversational — this is a chat, not a report.

Budget data (JSON):
${JSON.stringify(budgetContext)}`;

  const anthropic = new Anthropic({ apiKey: anthropicApiKey.value() });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2048,
    output_config: { effort: 'medium' },
    system: systemPrompt,
    tools: [{ type: 'web_search_20260209', name: 'web_search' }],
    messages: trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
  });

  if (response.stop_reason === 'refusal') {
    return { reply: "I wasn't able to answer that one — try rephrasing the question.", usedSearch: false };
  }

  let usedSearch = false;
  const textParts = [];
  for (const block of response.content) {
    if (block.type === 'text') textParts.push(block.text);
    if (block.type === 'server_tool_use' && block.name === 'web_search') usedSearch = true;
  }

  return {
    reply: textParts.join('\n\n').trim() || "I didn't get a response — try asking again.",
    usedSearch,
  };
});
