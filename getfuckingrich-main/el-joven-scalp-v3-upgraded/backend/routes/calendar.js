'use strict';

const { Router } = require('express');
const router = Router();

function upcomingEvent(hoursFromNow, title, currency, impact, forecast, previous) {
    return {
        id: Math.random().toString(36).slice(2, 9),
        title,
        currency,
        impact,
        forecast: forecast || null,
        previous: previous || null,
        actual: null,
        ts: Date.now() + hoursFromNow * 3600000,
    };
}

// GET /api/calendar?days=3
router.get('/', (req, res) => {
    const events = [
        upcomingEvent(1.5,  'US Initial Jobless Claims',    'USD', 'medium', '215K',   '220K'),
        upcomingEvent(3,    'ECB Interest Rate Decision',    'EUR', 'high',   '4.25%',  '4.50%'),
        upcomingEvent(5,    'US Non-Farm Payrolls',          'USD', 'high',   '185K',   '272K'),
        upcomingEvent(8,    'Fed Chair Speech',              'USD', 'high',   null,     null),
        upcomingEvent(12,   'UK GDP m/m',                   'GBP', 'medium', '0.2%',   '0.1%'),
        upcomingEvent(18,   'CPI y/y (US)',                  'USD', 'high',   '3.1%',   '3.4%'),
        upcomingEvent(24,   'Bank of Japan Rate Decision',   'JPY', 'high',   '-0.1%',  '-0.1%'),
        upcomingEvent(30,   'US Retail Sales m/m',           'USD', 'medium', '0.4%',   '-0.8%'),
        upcomingEvent(36,   'Gold Commitment of Traders',    'XAU', 'medium', null,     null),
        upcomingEvent(48,   'FOMC Meeting Minutes',          'USD', 'high',   null,     null),
    ];
    return res.json({ success: true, events });
});

module.exports = router;
