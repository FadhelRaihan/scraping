/**
 * Fonnte WhatsApp Gateway Client
 * Documentation: https://fonnte.com/api
 */

export function sanitizeTargetPhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('0')) return '62' + digits.slice(1);
  return digits;
}

export async function sendFonnteMessage({ target, message, token = process.env.FONNTE_TOKEN, countryCode = '62' }) {
  if (!token) {
    throw new Error('FONNTE_TOKEN belum dikonfigurasi di environment variable (.env)');
  }
  const cleanTarget = sanitizeTargetPhone(target);
  if (!cleanTarget) {
    throw new Error('Nomor target WhatsApp tidak valid');
  }
  if (!message || !message.trim()) {
    throw new Error('Pesan WhatsApp tidak boleh kosong');
  }

  const formData = new FormData();
  formData.append('target', cleanTarget);
  formData.append('message', message.trim());
  formData.append('countryCode', countryCode);

  try {
    const response = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        Authorization: token.trim(),
      },
      body: formData,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status === false) {
      const errorMessage = data.reason || data.message || `HTTP ${response.status} dari Fonnte`;
      return { ok: false, error: errorMessage, data };
    }

    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error.message || 'Koneksi ke API Fonnte gagal' };
  }
}

