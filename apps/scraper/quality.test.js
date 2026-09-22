import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absoluteDate, reviewMetadata, normalizePhone, normalizeWebsite, identity } from './quality.js';
test('quality preserves date uncertainty, Indonesian phones, URL paths and identity types',()=>{
 assert.equal(absoluteDate('31 Februari 2026'),null);
 assert.equal(absoluteDate('12 Mei 2026'),'2026-05-12');
 assert.equal(reviewMetadata('setahun lalu',null,new Date('2026-09-12')).review_filter_status,'unknown');
 assert.equal(reviewMetadata('3 bulan lalu',null).latest_review_at,null);
 assert.equal(reviewMetadata('setahun lalu','2026-05-12',new Date('2026-09-12')).review_filter_status,'recent');
 assert.equal(normalizePhone('(022) 4262815'),'+62224262815');
 assert.equal(normalizePhone('0812 3456 789'),'+628123456789');
 assert.equal(normalizePhone('08123456789 ext 1'),null);
 assert.equal(normalizeWebsite('https://EXAMPLE.com/menu/?a=1#x').website_normalized,'https://example.com/menu/?a=1');
 assert.equal(normalizeWebsite('javascript:alert(1)').website_status,'invalid');
 assert.equal(identity('https://google.com/maps/place/a/!1s0xabc:0xdef').google_maps_place_id,null);
});
