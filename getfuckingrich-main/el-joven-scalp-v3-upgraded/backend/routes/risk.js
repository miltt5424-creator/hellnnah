'use strict';
const { Router } = require('express');
const { validate, schemas } = require('../utils/validation');
const router = Router();

const PIP_VALUES = {
    'XAU/USD': 100,  'XAG/USD': 50,   'WTI/USD': 100,
    'EUR/USD': 10,   'GBP/USD': 10,   'USD/JPY': 9.1,  'AUD/USD': 10,   'USD/CHF': 10,
    'BTC/USD': 1,    'ETH/USD': 1,    'SOL/USD': 1,
    'NAS100/USD': 20,'SPX500/USD': 50,'US30/USD': 5,
};

router.post('/calculate', validate(schemas.riskSchema), (req, res) => {
    const { accountBalance, riskPercent, entryPrice, stopLoss, takeProfit, symbol } = req.body;

    const riskAmount  = accountBalance * (riskPercent / 100);
    const slDistance  = Math.abs(entryPrice - stopLoss);
    const tpDistance  = takeProfit ? Math.abs(takeProfit - entryPrice) : null;
    const rrRatio     = tpDistance && slDistance > 0 ? parseFloat((tpDistance / slDistance).toFixed(2)) : null;

    const pipValue   = PIP_VALUES[symbol] || 10;
    const lotSize    = slDistance > 0 ? parseFloat((riskAmount / (slDistance * pipValue)).toFixed(4)) : 0;
    const lotSizeStd = Math.round(lotSize * 100) / 100;

    const estimatedWinRate = rrRatio ? Math.max(0.3, Math.min(0.7, 1 / (1 + rrRatio))) : 0.45;
    const kellyPct = rrRatio ? parseFloat(((estimatedWinRate - (1 - estimatedWinRate) / rrRatio) * 100).toFixed(2)) : null;

    const maxPositions = riskPercent <= 1 ? 5 : riskPercent <= 2 ? 3 : riskPercent <= 5 ? 2 : 1;

    return res.json({
        success: true,
        symbol, accountBalance, riskPercent,
        riskAmount:     parseFloat(riskAmount.toFixed(2)),
        entryPrice, stopLoss, takeProfit,
        slDistance:     parseFloat(slDistance.toFixed(5)),
        tpDistance:     tpDistance ? parseFloat(tpDistance.toFixed(5)) : null,
        rrRatio,
        lotSize:        lotSizeStd,
        lotSizePrecise: parseFloat(lotSize.toFixed(4)),
        pipValue,
        potentialLoss:  parseFloat((-riskAmount).toFixed(2)),
        potentialGain:  rrRatio ? parseFloat((riskAmount * rrRatio).toFixed(2)) : null,
        kellyCriterion: kellyPct,
        maxSimultaneous: maxPositions,
        advice: kellyPct !== null && riskPercent > kellyPct
            ? `⚠️ Kelly suggère max ${Math.max(0, kellyPct).toFixed(1)}% de risque`
            : '✅ Risque dans les limites Kelly',
    });
});

module.exports = router;
