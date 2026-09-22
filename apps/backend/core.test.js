import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtersSchema, whereFilters, csvCell, cityFromAddress, leadSchema } from './core.js';
test('input filters parameterized; CSV formula escaped; address city extracted', () => {
  const f = filtersSchema.parse({ q: "x' OR 1=1 --%", kota: 'Kota Bandung', website: 'no', phone: 'yes', rating: '4' });
  const where = whereFilters(f);
  assert.ok(!where.sql.includes('OR 1=1'));
  assert.equal(where.values[0], "%x' OR 1=1 --\\%%");
  assert.match(where.sql, /kota = \$2/);
  assert.equal(csvCell(' =SUM(A1)'), '"\' =SUM(A1)"');
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(cityFromAddress('Jl. ABC, Kota Bandung, Jawa Barat 40123'), 'Kota Bandung');
  assert.throws(() => filtersSchema.parse({ sort: 'DROP TABLE leads' }));
  assert.throws(() => filtersSchema.parse({ from: '2026-09-01', to: '2026-01-01' }));
  assert.throws(() => leadSchema.parse({ place_key: 'x', nama: 'Cafe', alamat: 'Jawa Barat', url_maps: 'javascript:alert(1)', ulasan_terbaru: 'setahun lalu', diambil_pada: new Date().toISOString() }));
});
