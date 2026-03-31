'use strict';
const { Router } = require('express');
const logger     = require('../utils/logger');
const router     = Router();

const AI_PRIORITY = ['gemini','grok','mistral','openrouter'];

function getService(name) {
  try { return require(`../services/${name}`); } catch { return null; }
}

router.post('/', async (req, res) => {
  const { messages = [], context = {}, ai = 'auto' } = req.body || {};
  if (!messages.length) return res.status(400).json({ success:false, error:'messages required' });

  const systemPrompt = `Tu es un assistant de trading expert pour El Joven Scalp PRO.
Symbole actuel: ${context.symbol || 'XAU/USD'}. Prix: ${context.price || 'N/A'}.
Réponds en français, de façon concise et pratique. Max 3 paragraphes.`;

  const engines = ai === 'auto' ? AI_PRIORITY : [ai];

  for (const engine of engines) {
    const svc = getService(engine);
    if (!svc) continue;
    try {
      let reply = null;
      if (engine === 'gemini' && svc.askGemini) {
        const lastMsg = messages[messages.length-1].content;
        reply = await svc.askGemini(lastMsg, { systemPrompt, history: messages.slice(0,-1) });
      } else if (engine === 'grok' && svc.askGrok) {
        reply = await svc.askGrok(messages, systemPrompt);
      } else if (engine === 'mistral' && svc.askMistral) {
        reply = await svc.askMistral(messages, systemPrompt);
      } else if (engine === 'openrouter' && svc.askOpenRouter) {
        reply = await svc.askOpenRouter(messages, systemPrompt);
      }
      if (reply) {
        return res.json({ success:true, message:{ role:'assistant', content: reply, ai: engine } });
      }
    } catch(e) {
      logger.warn(`Chat ${engine} failed`, { err: e.message });
    }
  }

  // Fallback réponse locale
  const lastQ = messages[messages.length-1]?.content?.toLowerCase() || '';
  let fallback = `Je suis El Joven IA 🤖\n\nSur ${context.symbol || 'ce marché'} au prix ${context.price || 'actuel'}, `;
  if (lastQ.includes('tendance') || lastQ.includes('trend')) fallback += 'analysez les EMAs 9/21/50 pour identifier la tendance. Si EMA9 > EMA21 > EMA50, tendance haussière confirmée.';
  else if (lastQ.includes('support') || lastQ.includes('résistance')) fallback += 'les niveaux clés sont calculés depuis les pivots daily et les zones de volume élevé visibles sur le chart.';
  else if (lastQ.includes('setup') || lastQ.includes('signal')) fallback += 'attendez un signal IA avec confiance > 70% et composite score > +30 pour valider une entrée.';
  else fallback += 'utilisez le panel Signal IA pour obtenir une analyse complète avec entrée, SL et TP calculés depuis l\'ATR.';
  fallback += '\n\n⚠️ Configure une clé API (Gemini/Grok/Mistral) dans `.env` pour des réponses IA complètes.';

  return res.json({ success:true, message:{ role:'assistant', content: fallback, ai:'local' } });
});

module.exports = router;
