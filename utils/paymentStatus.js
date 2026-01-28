const subscribers = new Map();

function normalizeStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'successful' || value === 'success' || value === 'paid' || value === 'completed') {
    return 'successful';
  }
  if (value === 'failed' || value === 'error' || value === 'cancelled' || value === 'canceled' || value === 'declined' || value === 'expired') {
    return 'failed';
  }
  if (value === 'refunded' || value === 'refund') {
    return 'refunded';
  }
  if (value === 'pending' || value === 'processing' || value === 'created') {
    return 'pending';
  }
  return 'pending';
}

function serializeEvent(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function publish(orderId, status, extra) {
  const key = String(orderId);
  const normalizedStatus = normalizeStatus(status);
  const payload = {
    orderId: key,
    status: normalizedStatus,
    timestamp: new Date().toISOString(),
    ...(extra || {})
  };

  const sinks = subscribers.get(key);
  if (!sinks || sinks.size === 0) {
    return payload;
  }

  const message = serializeEvent(payload);
  sinks.forEach((res) => {
    try {
      res.write(message);
    } catch (err) {
      try {
        res.end();
      } catch (_) {
        // ignore end errors
      }
    }
  });

  return payload;
}

function subscribe(orderId, res) {
  const key = String(orderId);
  if (!subscribers.has(key)) {
    subscribers.set(key, new Set());
  }
  const sinks = subscribers.get(key);
  sinks.add(res);

  return () => {
    const current = subscribers.get(key);
    if (!current) return;
    current.delete(res);
    if (current.size === 0) {
      subscribers.delete(key);
    }
  };
}

module.exports = {
  normalizeStatus,
  publish,
  subscribe
};