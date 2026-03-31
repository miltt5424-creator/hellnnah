'use strict';
/**
 * Zone Engine — El Joven Scalp PRO
 * ==================================
 * MODULE ANTICIPATION : détecte les zones clés AVANT que le prix n'y arrive.
 *
 * Contrairement au strategyEngine qui RÉAGIT à ce qui s'est passé,
 * ce module PRÉDIT où le prix va réagir et génère des zones d'intérêt.
 *
 * Zones détectées :
 *  ① Order Blocks H1/H4    — dernière bougie avant un move fort
 *  ② Fair Value Gaps (FVG) — déséquilibres institutionnels
 *  ③ Equal Highs / Equal Lows — liquidity pools
 *  ④ Swing Highs / Lows non testés — magnets de prix
 *  ⑤ Niveaux ronds psychologiques — zones institutionnelles
 *
 * Chaque zone contient :
 *  - entry   : prix d'entrée idéal (milieu de zone)
 *  - top     : limite haute de la zone
 *  - bottom  : limite basse de la zone
 *  - sl      : stop loss suggéré (derrière la zone)
 *  - tp      : take profit (prochaine liquidité opposée)
 *  - type    : 'bullish' | 'bearish'
 *  - kind    : 'ob' | 'fvg' | 'equal_highs' | 'equal_lows' | 'swing' | 'round'
 *  - strength: 1-3 (1=faible, 3=fort)
 *  - distance: distance en % du prix actuel
 *  - status  : 'waiting' | 'approaching' | 'active' | 'invalidated'
 */

const logger = require('../utils/logger');

// ── Cache des zones par symbole ───────────────────────────────────
const zoneCache = {};
const ZONE_CACHE_TTL = 60 * 1000; // recalcul toutes les 60s (zones H1 = stables)

// ── Helpers ───────────────────────────────────────────────────────

function calcATR(candles, period = 14) {
    if (candles.length < period + 1) return candles[candles.length - 1]?.close * 0.002 || 1;
    const trs = [];
    for (let i = candles.length - period; i < candles.length; i++) {
        const c = candles[i], p = candles[i - 1];
        trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
    }
    return trs.reduce((a, b) => a + b, 0) / trs.length;
}

function swingHighs(candles, lb = 5) {
    const highs = [];
    for (let i = lb; i < candles.length - lb; i++) {
        const h = candles[i].high;
        let isHigh = true;
        for (let j = i - lb; j <= i + lb; j++) {
            if (j !== i && candles[j].high >= h) { isHigh = false; break; }
        }
        if (isHigh) highs.push({ idx: i, price: h, time: candles[i].time });
    }
    return highs;
}

function swingLows(candles, lb = 5) {
    const lows = [];
    for (let i = lb; i < candles.length - lb; i++) {
        const l = candles[i].low;
        let isLow = true;
        for (let j = i - lb; j <= i + lb; j++) {
            if (j !== i && candles[j].low <= l) { isLow = false; break; }
        }
        if (isLow) lows.push({ idx: i, price: l, time: candles[i].time });
    }
    return lows;
}

// ── 1. Order Blocks ───────────────────────────────────────────────
// Dernière bougie baissière avant un fort move haussier = OB bullish
// Dernière bougie haussière avant un fort move baissier = OB bearish

function detectOrderBlocks(candles, atrVal) {
    const obs = [];
    const minMove = atrVal * 1.5; // move significatif = 1.5x ATR

    for (let i = 2; i < candles.length - 2; i++) {
        const c  = candles[i];
        const n1 = candles[i + 1];
        const n2 = candles[i + 2];

        // OB Bullish : bougie rouge suivie d'un fort move haussier
        if (
            c.close < c.open &&                              // bougie rouge
            n1.close > n1.open &&                           // bougie verte après
            n2.close > n2.open &&                           // continuation
            (n2.close - c.low) > minMove &&                 // move fort
            n1.close > c.high                               // brise le high de l'OB
        ) {
            obs.push({
                type:    'bullish',
                kind:    'ob',
                top:     c.high,
                bottom:  c.low,
                entry:   (c.high + c.low) / 2,
                sl:      c.low - atrVal * 0.5,
                strength: n2.close - c.low > minMove * 2 ? 3 : 2,
                idx:     i,
                time:    c.time,
            });
        }

        // OB Bearish : bougie verte suivie d'un fort move baissier
        if (
            c.close > c.open &&                              // bougie verte
            n1.close < n1.open &&                           // bougie rouge après
            n2.close < n2.open &&                           // continuation
            (c.high - n2.close) > minMove &&                // move fort
            n1.close < c.low                                // brise le low de l'OB
        ) {
            obs.push({
                type:    'bearish',
                kind:    'ob',
                top:     c.high,
                bottom:  c.low,
                entry:   (c.high + c.low) / 2,
                sl:      c.high + atrVal * 0.5,
                strength: c.high - n2.close > minMove * 2 ? 3 : 2,
                idx:     i,
                time:    c.time,
            });
        }
    }

    // Garder uniquement les OB récents (non invalidés)
    return obs.slice(-8);
}

// ── 2. Fair Value Gaps (FVG) ──────────────────────────────────────
// Gap entre la bougie N-1 et N+1 = déséquilibre institutionnel

function detectFVG(candles, atrVal) {
    const fvgs = [];
    const minGap = atrVal * 0.3;

    for (let i = 1; i < candles.length - 1; i++) {
        const prev = candles[i - 1];
        const next = candles[i + 1];

        // FVG Bullish : gap entre high[i-1] et low[i+1]
        if (next.low > prev.high && (next.low - prev.high) >= minGap) {
            fvgs.push({
                type:    'bullish',
                kind:    'fvg',
                top:     next.low,
                bottom:  prev.high,
                entry:   (next.low + prev.high) / 2,
                sl:      prev.high - atrVal * 0.3,
                strength: (next.low - prev.high) > atrVal ? 3 : 2,
                idx:     i,
                time:    candles[i].time,
            });
        }

        // FVG Bearish : gap entre low[i-1] et high[i+1]
        if (next.high < prev.low && (prev.low - next.high) >= minGap) {
            fvgs.push({
                type:    'bearish',
                kind:    'fvg',
                top:     prev.low,
                bottom:  next.high,
                entry:   (prev.low + next.high) / 2,
                sl:      prev.low + atrVal * 0.3,
                strength: (prev.low - next.high) > atrVal ? 3 : 2,
                idx:     i,
                time:    candles[i].time,
            });
        }
    }

    return fvgs.slice(-6);
}

// ── 3. Equal Highs / Equal Lows (Liquidity Pools) ────────────────
// 2+ highs ou lows au même niveau = pool de liquidité = magnet

function detectLiquidityPools(candles, atrVal) {
    const pools = [];
    const highs = swingHighs(candles, 3);
    const lows  = swingLows(candles, 3);
    const tolerance = atrVal * 0.4;

    // Equal Highs
    for (let i = 0; i < highs.length - 1; i++) {
        for (let j = i + 1; j < highs.length; j++) {
            if (Math.abs(highs[i].price - highs[j].price) < tolerance) {
                const level = (highs[i].price + highs[j].price) / 2;
                pools.push({
                    type:     'bearish',  // les equal highs sont un piège → retournement baissier après sweep
                    kind:     'equal_highs',
                    top:      level + tolerance,
                    bottom:   level - tolerance * 0.3,
                    entry:    level + tolerance * 0.5, // légèrement au-dessus pour attraper le sweep
                    sl:       level + tolerance * 2,
                    strength: 2,
                    desc:     `Equal Highs @ ${level.toFixed(2)} — sell limit après sweep`,
                    time:     Math.max(highs[i].time, highs[j].time),
                });
                break;
            }
        }
    }

    // Equal Lows
    for (let i = 0; i < lows.length - 1; i++) {
        for (let j = i + 1; j < lows.length; j++) {
            if (Math.abs(lows[i].price - lows[j].price) < tolerance) {
                const level = (lows[i].price + lows[j].price) / 2;
                pools.push({
                    type:     'bullish',  // equal lows = pool de liquidité → rebond après sweep
                    kind:     'equal_lows',
                    top:      level + tolerance * 0.3,
                    bottom:   level - tolerance,
                    entry:    level - tolerance * 0.5,
                    sl:       level - tolerance * 2,
                    strength: 2,
                    desc:     `Equal Lows @ ${level.toFixed(2)} — buy limit après sweep`,
                    time:     Math.max(lows[i].time, lows[j].time),
                });
                break;
            }
        }
    }

    return pools;
}

// ── 4. Swing non testés (magnets de prix) ────────────────────────

function detectUntestedSwings(candles, atrVal, currentPrice) {
    const swings = [];
    const highs  = swingHighs(candles, 5);
    const lows   = swingLows(candles, 5);

    // Derniers swing highs non testés au-dessus du prix = résistance
    for (const h of highs.slice(-4)) {
        if (h.price > currentPrice + atrVal) {
            swings.push({
                type:     'bearish',
                kind:     'swing',
                top:      h.price + atrVal * 0.2,
                bottom:   h.price - atrVal * 0.2,
                entry:    h.price,
                sl:       h.price + atrVal,
                strength: 2,
                desc:     `Swing High non testé @ ${h.price.toFixed(2)}`,
                time:     h.time,
            });
        }
    }

    // Derniers swing lows non testés en dessous = support
    for (const l of lows.slice(-4)) {
        if (l.price < currentPrice - atrVal) {
            swings.push({
                type:     'bullish',
                kind:     'swing',
                top:      l.price + atrVal * 0.2,
                bottom:   l.price - atrVal * 0.2,
                entry:    l.price,
                sl:       l.price - atrVal,
                strength: 2,
                desc:     `Swing Low non testé @ ${l.price.toFixed(2)}`,
                time:     l.time,
            });
        }
    }

    return swings;
}

// ── 5. Niveaux ronds psychologiques ──────────────────────────────

function detectRoundLevels(currentPrice, atrVal) {
    const rounds = [];
    const step = currentPrice >= 1000 ? 100
               : currentPrice >= 100  ? 10
               : currentPrice >= 10   ? 1
               : currentPrice >= 1    ? 0.1
               : 0.001;

    // Chercher les 4 niveaux ronds les plus proches
    const base = Math.round(currentPrice / step) * step;
    for (let mult = -3; mult <= 3; mult++) {
        const level = +(base + mult * step).toFixed(8);
        if (Math.abs(level - currentPrice) < atrVal * 0.5) continue; // trop proche
        if (Math.abs(level - currentPrice) > atrVal * 6) continue;   // trop loin

        rounds.push({
            type:     level > currentPrice ? 'bearish' : 'bullish',
            kind:     'round',
            top:      level + atrVal * 0.15,
            bottom:   level - atrVal * 0.15,
            entry:    level,
            sl:       level > currentPrice ? level + atrVal : level - atrVal,
            strength: 1,
            desc:     `Niveau rond psychologique @ ${level}`,
            time:     Date.now() / 1000,
        });
    }

    return rounds;
}

// ── 6. Calcul du take profit (prochaine liquidité opposée) ────────

function computeTP(zone, allZones, currentPrice, atrVal) {
    const direction = zone.type;

    if (direction === 'bullish') {
        // TP = prochain niveau bearish au-dessus
        const targets = allZones
            .filter(z => z.type === 'bearish' && z.entry > zone.entry + atrVal)
            .sort((a, b) => a.entry - b.entry);
        return targets[0]?.entry || zone.entry + atrVal * 3;
    } else {
        // TP = prochain niveau bullish en dessous
        const targets = allZones
            .filter(z => z.type === 'bullish' && z.entry < zone.entry - atrVal)
            .sort((a, b) => b.entry - a.entry);
        return targets[0]?.entry || zone.entry - atrVal * 3;
    }
}

// ── 7. Filtrage et enrichissement des zones ───────────────────────

function enrichZones(zones, currentPrice, atrVal) {
    // Filtrer les zones invalidées (prix a déjà traversé la zone)
    const valid = zones.filter(z => {
        if (z.type === 'bullish') {
            // Zone bullish invalidée si le prix est passé SOUS la zone sans rebond
            return currentPrice >= z.bottom - atrVal * 0.5;
        } else {
            // Zone bearish invalidée si le prix est passé AU-DESSUS de la zone
            return currentPrice <= z.top + atrVal * 0.5;
        }
    });

    // Calculer distance et status pour chaque zone
    return valid.map(z => {
        const dist = Math.abs(z.entry - currentPrice);
        const distPct = (dist / currentPrice) * 100;
        const distATR = dist / atrVal;

        let status = 'waiting';
        if (distATR < 0.5) status = 'active';
        else if (distATR < 2)  status = 'approaching';

        return {
            ...z,
            distPct:  +distPct.toFixed(3),
            distATR:  +distATR.toFixed(2),
            distPips: +dist.toFixed(5),
            status,
        };
    })
    // Trier par proximité
    .sort((a, b) => a.distATR - b.distATR);
}

// ── EXPORT PRINCIPAL ──────────────────────────────────────────────

/**
 * analyzeZones(h1Candles, m15Candles, currentPrice, symbol)
 * Retourne toutes les zones actives triées par proximité.
 */
function analyzeZones(h1Candles, m15Candles, currentPrice, symbol) {
    if (!h1Candles || h1Candles.length < 20) {
        return { zones: [], bullishZones: [], bearishZones: [], nearestBull: null, nearestBear: null };
    }

    const atrVal = calcATR(h1Candles, 14);

    // Détecter sur H1 (zones structurelles) + M15 (zones plus fines)
    const h1OB    = detectOrderBlocks(h1Candles, atrVal);
    const h1FVG   = detectFVG(h1Candles, atrVal);
    const h1Pools = detectLiquidityPools(h1Candles, atrVal);
    const h1Swing = detectUntestedSwings(h1Candles, atrVal, currentPrice);
    const rounds  = detectRoundLevels(currentPrice, atrVal);

    let m15Zones = [];
    if (m15Candles && m15Candles.length >= 20) {
        const atr15 = calcATR(m15Candles, 14);
        const m15OB  = detectOrderBlocks(m15Candles, atr15).map(z => ({ ...z, strength: Math.max(1, z.strength - 1) }));
        const m15FVG = detectFVG(m15Candles, atr15).map(z => ({ ...z, strength: 1 }));
        m15Zones = [...m15OB, ...m15FVG];
    }

    const allRaw = [...h1OB, ...h1FVG, ...h1Pools, ...h1Swing, ...rounds, ...m15Zones];

    // Enrichir avec TP dynamique
    const enriched = enrichZones(allRaw, currentPrice, atrVal).map(z => ({
        ...z,
        tp: computeTP(z, allRaw, currentPrice, atrVal),
        rr: z.sl && z.entry ? Math.abs(
            (computeTP(z, allRaw, currentPrice, atrVal) - z.entry) /
            (z.entry - z.sl)
        ).toFixed(2) : '0',
        atrVal,
        symbol,
        computedAt: Date.now(),
    }));

    const bullishZones = enriched.filter(z => z.type === 'bullish');
    const bearishZones = enriched.filter(z => z.type === 'bearish');

    logger.info(`ZoneEngine ${symbol}: ${enriched.length} zones (${bullishZones.length} bull, ${bearishZones.length} bear) | ATR=${atrVal.toFixed(2)}`);

    return {
        zones:        enriched,
        bullishZones,
        bearishZones,
        nearestBull:  bullishZones[0] || null,
        nearestBear:  bearishZones[0] || null,
        atrVal,
        approaching:  enriched.filter(z => z.status === 'approaching' || z.status === 'active'),
    };
}

/**
 * getCachedZones(h1Candles, m15Candles, currentPrice, symbol)
 * Version avec cache TTL=60s pour ne pas recalculer à chaque tick.
 */
function getCachedZones(h1Candles, m15Candles, currentPrice, symbol) {
    const key    = symbol;
    const cached = zoneCache[key];
    if (cached && Date.now() - cached.ts < ZONE_CACHE_TTL) {
        // Mettre à jour juste les distances (prix change, zones non)
        const { atrVal } = cached.data;
        if (atrVal) {
            cached.data.zones = cached.data.zones.map(z => {
                const dist    = Math.abs(z.entry - currentPrice);
                const distATR = dist / atrVal;
                let status = 'waiting';
                if (distATR < 0.5) status = 'active';
                else if (distATR < 2)  status = 'approaching';
                return { ...z, distATR: +distATR.toFixed(2), distPct: +((dist / currentPrice) * 100).toFixed(3), status };
            }).sort((a, b) => a.distATR - b.distATR);
            cached.data.approaching  = cached.data.zones.filter(z => z.status === 'approaching' || z.status === 'active');
            cached.data.bullishZones = cached.data.zones.filter(z => z.type === 'bullish');
            cached.data.bearishZones = cached.data.zones.filter(z => z.type === 'bearish');
            cached.data.nearestBull  = cached.data.bullishZones[0] || null;
            cached.data.nearestBear  = cached.data.bearishZones[0] || null;
        }
        return cached.data;
    }

    const result = analyzeZones(h1Candles, m15Candles, currentPrice, symbol);
    zoneCache[key] = { data: result, ts: Date.now() };
    return result;
}

/**
 * isPriceInZone(price, zone, tolerance = 0.5)
 * Vérifie si le prix est à l'intérieur ou très proche d'une zone.
 * tolerance = multiplicateur de ATR
 */
function isPriceInZone(price, zone, tolerance = 0.5) {
    const margin = (zone.atrVal || (zone.top - zone.bottom)) * tolerance;
    return price >= zone.bottom - margin && price <= zone.top + margin;
}

/**
 * getZoneSignal(price, zones, atrVal)
 * Retourne le signal limit à émettre si le prix est sur/proche d'une zone.
 * Retourne null si aucune zone n'est approchée.
 */
function getZoneSignal(price, zones) {
    const active = zones.filter(z => z.status === 'active' || z.status === 'approaching');

    for (const zone of active) {
        if (isPriceInZone(price, zone, 1.0)) {
            return {
                zoneType:  zone.type,
                zoneKind:  zone.kind,
                direction: zone.type === 'bullish' ? 'BUY' : 'SELL',
                orderType: 'LIMIT',
                entry:     zone.entry,
                sl:        zone.sl,
                tp:        zone.tp,
                rr:        zone.rr,
                strength:  zone.strength,
                distATR:   zone.distATR,
                desc:      zone.desc || `${zone.kind} zone @ ${zone.entry}`,
                status:    zone.status,
            };
        }
    }
    return null;
}

module.exports = {
    analyzeZones,
    getCachedZones,
    isPriceInZone,
    getZoneSignal,
    detectOrderBlocks,
    detectFVG,
    detectLiquidityPools,
};
