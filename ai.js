// AI helpers: Ollama (local, free) or Claude API. Runs in the main process.
const SYSTEM = `You turn a person's request into scheduling actions for their weekly planner.
Reply with ONLY a JSON object, no prose, in this shape:
{"reply":"one short friendly sentence confirming what you did",
 "actions":[
  {"type":"add_goal","title":"...","category":"school|code|life","hoursPerWeek":2,"sessionMin":60,"priority":2,"note":"one-line tip for getting started","links":[{"title":"...","url":"https://..."}]},
  {"type":"update_goal","goalTitle":"existing goal title","hoursPerWeek":3,"sessionMin":60},
  {"type":"add_deadline","title":"...","date":"YYYY-MM-DD","goalTitle":"existing goal title or empty"},
  {"type":"add_event","title":"...","date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM"}
 ]}
Rules: hoursPerWeek should be realistic for someone working full time and in school (usually 1-4).
sessionMin is 30-120. priority 1=urgent school work, 2=important, 3=nice to have.
For new hobbies/skills include 2-3 well-known beginner resources (official sites, docs, reputable guides) as links.
Use 24h times. Resolve relative dates ("next Thursday") from TODAY. Only include actions the request asks for.`;

const LINKS_SYSTEM = `Suggest 3 well-known, reputable beginner resources for the goal given.
Reply with ONLY JSON: {"links":[{"title":"...","url":"https://..."}],"note":"one-line tip for the first session"}`;

function extractJson(text) {
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e < 0) throw new Error('AI did not return JSON');
  return JSON.parse(text.slice(s, e + 1));
}

async function chat(settings, system, user) {
  if (settings.provider === 'claude') {
    if (!settings.claudeKey) throw new Error('Add your Claude API key in Settings first.');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': settings.claudeKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: settings.claudeModel, max_tokens: 1200, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!r.ok) throw new Error(`Claude API error ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return extractJson(j.content.map((c) => c.text || '').join(''));
  }
  const base = (settings.ollamaUrl || 'http://localhost:11434').replace(/\/$/, '');
  let r;
  try {
    r = await fetch(`${base}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: settings.ollamaModel, stream: false, format: 'json',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
  } catch {
    throw new Error('Could not reach Ollama. Start it (ollama serve) or switch to Claude in Settings.');
  }
  if (!r.ok) throw new Error(`Ollama error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return extractJson(j.message.content);
}

async function tell(settings, text, context) {
  const user = `TODAY: ${context.today} (${context.weekday})
EXISTING GOALS: ${context.goals.join(', ') || 'none'}
REQUEST: ${text}`;
  return chat(settings, SYSTEM, user);
}

async function suggestLinks(settings, goal) {
  return chat(settings, LINKS_SYSTEM, `Goal: ${goal.title}. ${goal.note || ''}`);
}

module.exports = { tell, suggestLinks };
