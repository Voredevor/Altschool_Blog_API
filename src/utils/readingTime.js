// simple reading time estimator: ~200 wpm
function computeReadingTime(text) {
  if (!text) return 1;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return minutes;
}

module.exports = { computeReadingTime };
