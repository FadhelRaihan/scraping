import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewStatus } from './review.js';

test('filter konservatif tanggal ulasan Indonesia', () => {
  const now = new Date('2026-09-10T00:00:00Z');
  for (const text of ['baru saja', 'semenit lalu', 'sehari lalu', '2 minggu lalu', '7 minggu yang lalu', 'sebulan lalu', '10 bulan lalu']) {
    assert.equal(reviewStatus(text, now), 'recent', text);
  }
  for (const text of ['2 tahun lalu', '13 bulan lalu', '400 hari lalu']) {
    assert.equal(reviewStatus(text, now), 'old', text);
  }
  for (const text of ['setahun lalu', '1 tahun lalu', '11 bulan lalu', '12 bulan lalu', '', 'tanggal tidak dikenal']) {
    assert.equal(reviewStatus(text, now), 'unknown', text);
  }
});
