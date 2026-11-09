import { randomUUID } from 'node:crypto';
import { sendFonnteMessage, sanitizeTargetPhone } from './fonnte.js';
import { renderTemplate, DEFAULT_OUTREACH_TEMPLATE } from './contacting.js';
import { normalizePhone } from '../scraper/quality.js';

/**
 * Mendapatkan informasi kuota pengiriman hari ini dan stok lead yang siap dikontak.
 */
export async function getDailyQuota(pool, dailyLimit = 30) {
  const [sentRes, stockRes] = await Promise.all([
    pool.query(`SELECT count(*)::int AS sent_today FROM lead_contacts WHERE contacted_at >= CURRENT_DATE`),
    pool.query(`
      SELECT count(*)::int AS qualified_uncontacted
      FROM leads l
      WHERE l.status IN ('new', 'qualified')
        AND l.opted_out_at IS NULL
        AND l.telepon != ''
        AND NOT EXISTS (SELECT 1 FROM lead_contacts lc WHERE lc.lead_id = l.id)
    `)
  ]);

  const sentToday = sentRes.rows[0]?.sent_today ?? 0;
  const remainingQuota = Math.max(0, dailyLimit - sentToday);
  const qualifiedUncontacted = stockRes.rows[0]?.qualified_uncontacted ?? 0;

  return {
    sentToday,
    dailyLimit,
    remainingQuota,
    qualifiedUncontacted,
  };
}

/**
 * Menjalankan auto-outreach pesan WhatsApp sesuai sisa kuota harian.
 */
export async function runDailyOutreach(pool, options = {}) {
  const dailyLimit = Number(options.dailyLimit ?? process.env.WA_DAILY_LIMIT ?? 30);
  const minDelaySec = Number(options.minDelaySec ?? process.env.WA_DELAY_MIN_SEC ?? 45);
  const maxDelaySec = Number(options.maxDelaySec ?? process.env.WA_DELAY_MAX_SEC ?? 90);

  const quota = await getDailyQuota(pool, dailyLimit);
  if (quota.remainingQuota <= 0) {
    return {
      ok: true,
      sentCount: 0,
      reason: 'quota_exhausted',
      quota,
      leadsSent: [],
      failedLeads: [],
    };
  }

  // Prioritaskan template baru 'Penawaran Website & Sistem Internal'
  let templateRes = await pool.query(
    `SELECT * FROM message_templates WHERE name = $1 AND is_active = true LIMIT 1`,
    [DEFAULT_OUTREACH_TEMPLATE.name]
  );
  let template = templateRes.rows[0];

  if (!template) {
    // Cek apakah template default sudah ada tetapi belum aktif
    const existingRes = await pool.query(
      `SELECT * FROM message_templates WHERE name = $1 LIMIT 1`,
      [DEFAULT_OUTREACH_TEMPLATE.name]
    );
    if (existingRes.rows[0]) {
      // Aktifkan template baru, nonaktifkan template lama
      await pool.query(`UPDATE message_templates SET is_active = false`);
      const updateRes = await pool.query(
        `UPDATE message_templates SET is_active = true WHERE id = $1 RETURNING *`,
        [existingRes.rows[0].id]
      );
      template = updateRes.rows[0];
    } else {
      // Nonaktifkan template lama (seperti draf katering sebelumnya) dan pasang template baru
      await pool.query(`UPDATE message_templates SET is_active = false`);
      const insertRes = await pool.query(
        `INSERT INTO message_templates (name, body, is_active) VALUES ($1, $2, true) RETURNING *`,
        [DEFAULT_OUTREACH_TEMPLATE.name, DEFAULT_OUTREACH_TEMPLATE.body]
      );
      template = insertRes.rows[0];
    }
  }

  // Ambil lead yang terkurasi untuk dikontak
  const candidateLeadsRes = await pool.query(
    `
    SELECT l.*
    FROM leads l
    WHERE l.status IN ('new', 'qualified')
      AND l.opted_out_at IS NULL
      AND l.telepon != ''
      AND NOT EXISTS (SELECT 1 FROM lead_contacts lc WHERE lc.lead_id = l.id)
    ORDER BY
      CASE
        WHEN (REGEXP_REPLACE(l.telepon, '[^0-9]', '', 'g') LIKE '08%'
          OR REGEXP_REPLACE(l.telepon, '[^0-9]', '', 'g') LIKE '628%') THEN 0
        ELSE 1
      END,
      CASE WHEN l.website = '' THEN 0 ELSE 1 END,
      l.rating DESC NULLS LAST,
      l.scraped_at DESC
    LIMIT $1
    `,
    [quota.remainingQuota]
  );

  const candidates = candidateLeadsRes.rows;
  const leadsSent = [];
  const failedLeads = [];

  console.log(`[Auto-Outreach] Menemukan ${candidates.length} calon lead terkurasi untuk dikontak.`);

  for (let i = 0; i < candidates.length; i++) {
    const lead = candidates[i];
    const phone = normalizePhone(lead.telepon) || lead.telepon;
    const cleanPhone = sanitizeTargetPhone(phone);

    if (!cleanPhone) {
      console.warn(`[Auto-Outreach] [${i + 1}/${candidates.length}] Melewati ${lead.nama} (Nomor telepon tidak valid: "${lead.telepon}")`);
      failedLeads.push({ id: lead.id, nama: lead.nama, reason: 'Nomor telepon tidak valid' });
      continue;
    }

    const message = renderTemplate(template.body, lead);
    console.log(`[Auto-Outreach] [${i + 1}/${candidates.length}] Mengirim WhatsApp ke ${lead.nama} (${cleanPhone})...`);
    const result = await sendFonnteMessage({ target: cleanPhone, message });

    if (result.ok) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const contactId = randomUUID();
        await client.query(
          `INSERT INTO lead_contacts (id, lead_id, template_id, template_name_snapshot, phone_snapshot, message_snapshot, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            contactId,
            lead.id,
            template.id,
            template.name,
            cleanPhone,
            message,
            'Auto-outreach via Fonnte Cron Pipeline',
          ]
        );

        if (['new', 'qualified'].includes(lead.status)) {
          await client.query(`UPDATE leads SET status='contacted', updated_at=now() WHERE id=$1`, [lead.id]);
          await client.query(
            `INSERT INTO lead_status_history (lead_id, old_status, new_status) VALUES ($1, $2, 'contacted')`,
            [lead.id, lead.status]
          );
        }
        await client.query('COMMIT');
        leadsSent.push({ id: lead.id, nama: lead.nama, kota: lead.kota, phone: cleanPhone });
        console.log(`[Auto-Outreach] [${i + 1}/${candidates.length}] Sukses terkirim ke ${lead.nama}`);
      } catch (dbErr) {
        await client.query('ROLLBACK');
        console.error(`[Auto-Outreach] [${i + 1}/${candidates.length}] Gagal menyimpan riwayat status ke DB: ${dbErr.message}`);
        failedLeads.push({ id: lead.id, nama: lead.nama, reason: `Gagal simpan status DB: ${dbErr.message}` });
      } finally {
        client.release();
      }
    } else {
      console.warn(`[Auto-Outreach] [${i + 1}/${candidates.length}] Gagal kirim ke ${lead.nama}: ${result.error}`);
      failedLeads.push({ id: lead.id, nama: lead.nama, reason: result.error });
    }

    // Berikan jeda acak antar pengiriman jika masih ada lead berikutnya
    if (i < candidates.length - 1) {
      const waitTime = result.ok
        ? Math.floor(Math.random() * (maxDelaySec - minDelaySec + 1) + minDelaySec)
        : 3;
      if (result.ok) {
        console.log(`[Auto-Outreach] Menunggu jeda aman ${waitTime} detik sebelum nomor berikutnya...`);
      }
      await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
    }
  }

  const updatedQuota = await getDailyQuota(pool, dailyLimit);

  return {
    ok: true,
    sentCount: leadsSent.length,
    quota: updatedQuota,
    leadsSent,
    failedLeads,
  };
}

/**
 * Mengirimkan laporan ringkasan rekap harian ke nomor WhatsApp pribadi Admin via Fonnte.
 */
export async function sendDailyDigest(pool, { newScrapedCount = 0, outreachResult = null, customNotes = '' } = {}) {
  const adminPhone = process.env.ADMIN_WA_NUMBER;
  if (!adminPhone) {
    return { ok: false, reason: 'ADMIN_WA_NUMBER belum diisi di .env' };
  }

  const dailyLimit = Number(process.env.WA_DAILY_LIMIT ?? 30);
  const quota = await getDailyQuota(pool, dailyLimit);

  const now = new Date();
  const dateFormatted = now.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeFormatted = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const sentThisSession = outreachResult?.sentCount ?? 0;
  const sampleList = (outreachResult?.leadsSent || [])
    .slice(0, 5)
    .map((l, idx) => `  ${idx + 1}. *${l.nama}* (${l.kota || 'Jabar'}) - ${l.phone}`)
    .join('\n');

  const reportMessage = [
    `📊 *LAPORAN HARIAN PROJECTADMIN*`,
    `📅 ${dateFormatted} - ${timeFormatted} WIB`,
    `----------------------------------------`,
    `🔍 *Scraping & Database:*`,
    `• Lead baru di-scrape sesi ini: *${newScrapedCount}*`,
    `• Stok lead terkurasi siap kontak: *${quota.qualifiedUncontacted}*`,
    ``,
    `💬 *Outreach WhatsApp (Fonnte):*`,
    `• Terkirim sesi ini: *${sentThisSession} pesan*`,
    `• Total terkirim hari ini: *${quota.sentToday}/${quota.dailyLimit}*`,
    `• Sisa kuota hari ini: *${quota.remainingQuota} pesan*`,
    ``,
    sampleList ? `⭐ *Sample Prospek Dihubungi:*\n${sampleList}\n` : '',
    customNotes ? `ℹ️ *Catatan:* ${customNotes}\n` : '',
    `----------------------------------------`,
    `_Pesan otomatis dikirim oleh Cron Pipeline ProjectAdmin._`,
  ]
    .filter(Boolean)
    .join('\n');

  return await sendFonnteMessage({ target: adminPhone, message: reportMessage });
}

