'use strict';
const requests = new Map();

function rateLimit(options = {}) {
  const limit  = options.max      || options.limit  || 60;
  const window = options.windowMs || options.window || 60000;
  const key    = options.key || 'default';

  return (req, res, next) => {
    const id  = `${req.ip}_${key}`;
    const now = Date.now();
    if (!requests.has(id)) requests.set(id, []);
    const timestamps = requests.get(id).filter(t => now - t < window);
    timestamps.push(now);
    requests.set(id, timestamps);
    if (timestamps.length > limit) {
      return res.status(429).json({ error: 'Too many requests — attends quelques secondes' });
    }
    next();
  };
}

module.exports = { rateLimit };
