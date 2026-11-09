import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTargetPhone, sendFonnteMessage } from './fonnte.js';

test('Fonnte: phone sanitization converts 08 to 628 and cleans symbols', () => {
  assert.equal(sanitizeTargetPhone('0812-3456-7890'), '6281234567890');
  assert.equal(sanitizeTargetPhone('+62 812 3456 7890'), '6281234567890');
  assert.equal(sanitizeTargetPhone('6281234567890'), '6281234567890');
  assert.equal(sanitizeTargetPhone(''), '');
  assert.equal(sanitizeTargetPhone(null), '');
});

test('Fonnte: sends request with correct headers and handles response', async () => {
  // Test error validation when token is missing
  await assert.rejects(
    sendFonnteMessage({ target: '081234567890', message: 'Halo', token: '' }),
    /FONNTE_TOKEN belum dikonfigurasi/
  );

  // Test error validation when target is invalid
  await assert.rejects(
    sendFonnteMessage({ target: '', message: 'Halo', token: 'dummy_token' }),
    /Nomor target WhatsApp tidak valid/
  );

  // Test error validation when message is empty
  await assert.rejects(
    sendFonnteMessage({ target: '081234567890', message: '   ', token: 'dummy_token' }),
    /Pesan WhatsApp tidak boleh kosong/
  );

  // Mock global fetch to verify API payload
  const originalFetch = globalThis.fetch;
  try {
    let capturedUrl = '';
    let capturedHeaders = {};
    let capturedBody = null;

    globalThis.fetch = async (url, options) => {
      capturedUrl = url;
      capturedHeaders = options.headers;
      capturedBody = options.body;
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: true, id: ['msg_123'], target: ['6281234567890'] }),
      };
    };

    const res = await sendFonnteMessage({
      target: '081234567890',
      message: 'Halo Cafe Bahagia!',
      token: 'test_token_abc',
    });

    assert.equal(capturedUrl, 'https://api.fonnte.com/send');
    assert.equal(capturedHeaders.Authorization, 'test_token_abc');
    assert.equal(capturedBody.get('target'), '6281234567890');
    assert.equal(capturedBody.get('message'), 'Halo Cafe Bahagia!');
    assert.equal(res.ok, true);
    assert.deepEqual(res.data.id, ['msg_123']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

