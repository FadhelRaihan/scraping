// ponytail: rounded relative dates cannot prove the exact anniversary; review manually.
export function reviewStatus(text, now = new Date()) {
  const value = text.toLowerCase().replace(/\u00a0/g, ' ').replace(/\s+yang\s+lalu$/, ' lalu').trim();
  if (/^(baru saja|beberapa detik lalu)$/.test(value)) return 'recent';
  const match = value.match(/^(?:(\d+)\s*(detik|menit|jam|hari|minggu|bulan|tahun)|(se)(detik|menit|jam|hari|minggu|bulan|tahun))\s+lalu$/);
  if (match) {
    const count = match[1] ? Number(match[1]) : 1;
    const unit = match[2] || match[4];
    const days = { detik: 1 / 86400, menit: 1 / 1440, jam: 1 / 24, hari: 1, minggu: 7, bulan: 31, tahun: 366 }[unit];
    if (unit === 'tahun') return count >= 2 ? 'old' : 'unknown';
    if (unit === 'bulan') return count <= 10 ? 'recent' : count >= 13 ? 'old' : 'unknown';
    const cutoff = new Date(now);
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const windowDays = (now - cutoff) / 86400000;
    if ((count + 1) * days <= windowDays) return 'recent';
    if (count * days > windowDays) return 'old';
  }
  return 'unknown';
}
