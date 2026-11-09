import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getGreeting,
  cleanBusinessName,
  formatRatingPraise,
  parseSpintax,
  templateSchema,
  renderTemplate,
  DEFAULT_OUTREACH_TEMPLATE,
} from './contacting.js';

test('Dynamic Template: getGreeting returns correct time of day in WIB (UTC+7)', () => {
  // 01:00 UTC = 08:00 WIB (Pagi)
  assert.equal(getGreeting(new Date('2026-11-09T01:00:00Z')), 'pagi');
  // 06:00 UTC = 13:00 WIB (Siang)
  assert.equal(getGreeting(new Date('2026-11-09T06:00:00Z')), 'siang');
  // 09:30 UTC = 16:30 WIB (Sore)
  assert.equal(getGreeting(new Date('2026-11-09T09:30:00Z')), 'sore');
  // 14:00 UTC = 21:00 WIB (Malam)
  assert.equal(getGreeting(new Date('2026-11-09T14:00:00Z')), 'malam');
});

test('Dynamic Template: cleanBusinessName removes branch and bracket suffixes', () => {
  assert.equal(cleanBusinessName('Kopi Kenangan - Cabang Dago'), 'Kopi Kenangan');
  assert.equal(cleanBusinessName('RM Padang Sederhana (Pasteur Pusat)'), 'RM Padang Sederhana');
  assert.equal(cleanBusinessName('Cafe Bintang | Bandung'), 'Cafe Bintang');
  assert.equal(cleanBusinessName('Toko Roti Mama [Official]'), 'Toko Roti Mama');
  assert.equal(cleanBusinessName('Resto Asli'), 'Resto Asli');
  assert.equal(cleanBusinessName(''), '');
});

test('Dynamic Template: formatRatingPraise generates polite praise statement', () => {
  assert.match(formatRatingPraise('4.8'), /rating sangat bagus 4\.8⭐/);
  assert.match(formatRatingPraise(4.2), /ulasan positif rating 4\.2⭐/);
  assert.equal(formatRatingPraise(3.8), '');
  assert.equal(formatRatingPraise(null), '');
});

test('Dynamic Template: parseSpintax resolves options randomly', () => {
  const template = '{Halo|Hai|Permisi} kak';
  const resolved = parseSpintax(template);
  assert.ok(['Halo kak', 'Hai kak', 'Permisi kak'].includes(resolved));
});

test('Dynamic Template: templateSchema validates variables and spintax', () => {
  // Valid with new variables and spintax
  const parsed = templateSchema.parse(DEFAULT_OUTREACH_TEMPLATE);
  assert.equal(parsed.name, DEFAULT_OUTREACH_TEMPLATE.name);

  // Invalid with unknown variable
  assert.throws(
    () => templateSchema.parse({ name: 'Test', body: 'Halo {{unknown_variable}}' }),
    /Variabel template tidak dikenal/
  );

  // Invalid with unclosed spintax brace
  assert.throws(
    () => templateSchema.parse({ name: 'Test', body: '{Halo|Hai kak' }),
    /format kurung\/spintax tidak valid/
  );
});

test('Dynamic Template: renderTemplate enriches lead data dynamically', () => {
  const lead = {
    nama: 'Kopi Kenangan - Cabang Dago',
    kota: 'Kota Bandung',
    rating: 4.8,
    telepon: '08123456789',
    website: '',
  };

  const text = 'Halo {{nama_singkat}} di {{kota}}{{pujian_rating}}. Selamat {{salam}}!';
  const rendered = renderTemplate(text, lead, new Date('2026-11-09T01:00:00Z')); // 08:00 WIB

  assert.ok(rendered.includes('Kopi Kenangan'));
  assert.ok(!rendered.includes('Cabang Dago'));
  assert.ok(rendered.includes('Kota Bandung'));
  assert.ok(rendered.includes('4.8⭐'));
  assert.ok(rendered.includes('Selamat pagi!'));
});

