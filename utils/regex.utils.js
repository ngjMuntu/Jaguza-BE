function escapeRegex(input) {
  return String(input || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeSearchRegex(input, maxLen = 64) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const clipped = raw.length > maxLen ? raw.slice(0, maxLen) : raw;
  return new RegExp(escapeRegex(clipped), 'i');
}

module.exports = {
  escapeRegex,
  safeSearchRegex,
};
