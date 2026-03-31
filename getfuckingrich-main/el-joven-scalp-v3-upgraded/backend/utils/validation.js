'use strict';
const { z } = require('zod');

const SYMBOLS = ['XAU/USD','XAG/USD','BTC/USD','ETH/USD','SOL/USD','BNB/USD',
    'EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CHF',
    'NAS100/USD','SPX500/USD','US30/USD','WTI/USD','AAPL/USD','TSLA/USD','NVDA/USD'];

const TIMEFRAMES = ['1min','5min','15min','30min','1h','4h','1d'];

const signalSchema = z.object({
    symbol:    z.string().refine(s => SYMBOLS.includes(s), { message: 'Symbole non supporté' }).default('XAU/USD'),
    timeframe: z.string().refine(t => TIMEFRAMES.includes(t), { message: 'Timeframe invalide' }).default('1min'),
    ai:        z.enum(['auto','gemini','grok','mistral','openrouter']).default('auto'),
});

const riskSchema = z.object({
    accountBalance: z.number().positive().max(100_000_000).default(10000),
    riskPercent:    z.number().min(0.01).max(20).default(1),
    entryPrice:     z.number().positive(),
    stopLoss:       z.number().positive(),
    takeProfit:     z.number().positive().optional(),
    symbol:         z.string().default('XAU/USD'),
    pipValue:       z.number().positive().default(1),
});

const journalPostSchema = z.object({
    symbol:     z.string().min(1).max(20),
    direction:  z.enum(['BUY','SELL','buy','sell']),
    entryPrice: z.number().positive(),
    exitPrice:  z.number().positive().optional(),
    lotSize:    z.number().positive().max(1000).default(1),
    openedAt:   z.string().optional(),
    closedAt:   z.string().optional(),
    notes:      z.string().max(2000).default(''),
    setup:      z.string().max(100).default(''),
});

const backtestSchema = z.object({
    symbol:      z.string().refine(s => SYMBOLS.includes(s)).default('XAU/USD'),
    strategy:    z.enum(['rsi_crossover','ema_cross','macd_cross','smc_basic','composite']).default('composite'),
    timeframe:   z.string().refine(t => TIMEFRAMES.includes(t)).default('1h'),
    bars:        z.number().int().min(50).max(500).default(300),
    riskPercent: z.number().min(0.1).max(10).default(1),
    accountSize: z.number().positive().max(100_000_000).default(10000),
    rr:          z.number().min(0.5).max(10).default(2.0),
});

const mt5CommandSchema = z.object({
    side:       z.enum(['BUY','SELL','CLOSE','buy','sell','close']),
    symbol:     z.string().min(1).max(20),
    entry:      z.number().positive().optional(),
    stopLoss:   z.number().positive().optional(),
    takeProfit: z.number().positive().optional(),
    lots:       z.number().positive().max(100).optional(),
    confidence: z.number().min(0).max(100).optional(),
    comment:    z.string().max(100).optional(),
});

function validate(schema, source = 'body') {
    return (req, res, next) => {
        try {
            const data = source === 'body' ? req.body : req.query;
            const parsed = schema.parse(data || {});
            if (source === 'body') req.body = parsed;
            else req.query = parsed;
            next();
        } catch (err) {
            if (err instanceof z.ZodError) {
                const errors = err.errors.map(e => `${e.path.join('.')}: ${e.message}`);
                return res.status(400).json({ success: false, error: 'Validation échouée', details: errors });
            }
            next(err);
        }
    };
}

module.exports = {
    validate,
    schemas: { signalSchema, riskSchema, journalPostSchema, backtestSchema, mt5CommandSchema },
};
