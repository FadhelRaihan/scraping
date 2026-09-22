export function classify(error) {
  const message = String(error.message ?? error);
  if (error.status === 401 || error.status === 403) return { code: 'api_auth_invalid', fatal: true };
  if (/CAPTCHA/i.test(message)) return { code: 'captcha', fatal: true };
  if (/LIMITED_VIEW/i.test(message)) return { code: 'limited_view', fatal: true };
  if (/checkpoint|ENOSPC|EACCES/i.test(message)) return { code: 'checkpoint_error', fatal: true };
  if ([408,425,429,500,502,503,504].includes(error.status)) return { code: `http_${error.status}`, retryable: true };
  if (error.status) return { code: 'invalid_payload', retryable: false };
  if (/timeout|timed out|fetch failed|net::|ECONN|ENOTFOUND/i.test(message)) return { code: 'network_timeout', retryable: true };
  return { code: 'selector_missing', retryable: false };
}
export function retryDelay(attempt, header, now = Date.now(), random = Math.random) {
  const seconds = header == null ? NaN : Number(header);
  const server = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  return Math.max(0, Number.isFinite(server) ? server : 0, [2000,5000,15000,60000][Math.min(attempt,3)] + Math.floor(random()*250));
}
export function batchDue(count, elapsed, force = false) { return count > 0 && (force || count >= 25 || elapsed >= 30000); }
