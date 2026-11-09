import { spawn } from 'node:child_process';
import { createPool } from '../apps/backend/db.js';
import { getDailyQuota, runDailyOutreach, sendDailyDigest } from '../apps/backend/auto-outreach.js';

/**
 * Menjalankan satu putaran penuh pipeline:
 * Cek Kuota -> Auto-Scrape (jika stok kurang) -> Auto-Outreach via Fonnte -> Kirim Laporan ke WA Pribadi
 */
export async function executePipeline() {
  const pool = createPool();
  console.log('\n======================================================');
  console.log(`[Cron Pipeline] Memulai eksekusi: ${new Date().toLocaleString('id-ID')}`);
  console.log('======================================================');

  try {
    const dailyLimit = Number(process.env.WA_DAILY_LIMIT ?? 30);
    const quotaBefore = await getDailyQuota(pool, dailyLimit);

    console.log(`[Cron Pipeline] Status Kuota Hari Ini:`);
    console.log(`  • Pesan terkirim hari ini : ${quotaBefore.sentToday} / ${quotaBefore.dailyLimit}`);
    console.log(`  • Sisa kuota hari ini     : ${quotaBefore.remainingQuota}`);
    console.log(`  • Stok lead siap kontak   : ${quotaBefore.qualifiedUncontacted}`);

    if (quotaBefore.remainingQuota <= 0) {
      console.log(`[Cron Pipeline] Kuota harian (${dailyLimit} pesan) sudah penuh hari ini.`);
      await sendDailyDigest(pool, {
        newScrapedCount: 0,
        customNotes: `Kuota maksimal harian (${dailyLimit} pesan) sudah tercapai sebelumnya hari ini. Tidak ada pesan baru dikirim.`,
      });
      return;
    }

    // Hitung berapa lead baru yang perlu di-scrape
    const neededNewLeads = Math.max(0, quotaBefore.remainingQuota - quotaBefore.qualifiedUncontacted);
    let newScrapedCount = 0;

    if (neededNewLeads > 0) {
      console.log(`\n[Cron Pipeline] Stok lead kurang ${neededNewLeads} untuk memenuhi kuota ${quotaBefore.remainingQuota}.`);
      console.log(`[Cron Pipeline] Menjalankan Playwright Scraper dengan TARGET_LEADS = ${neededNewLeads}...`);

      const startTime = Date.now();
      await new Promise((resolve) => {
        const child = spawn(process.execPath, ['apps/scraper/worker.js'], {
          cwd: process.cwd(),
          stdio: 'inherit',
          env: {
            ...process.env,
            HOURS: '1.5', // Safety timeout max 1.5 jam
            TARGET_LEADS: String(neededNewLeads),
            HEADLESS: process.env.HEADLESS || '1',
          },
        });

        child.on('close', (code) => {
          console.log(`[Cron Pipeline] Scraper selesai dengan exit code: ${code} (durasi: ${Math.round((Date.now() - startTime) / 1000)}s).`);
          resolve();
        });

        child.on('error', (err) => {
          console.error(`[Cron Pipeline] Error saat menjalankan scraper worker:`, err);
          resolve();
        });
      });

      // Hitung pertambahan stok setelah scraping
      const quotaAfterScrape = await getDailyQuota(pool, dailyLimit);
      newScrapedCount = Math.max(0, quotaAfterScrape.qualifiedUncontacted - quotaBefore.qualifiedUncontacted);
      console.log(`[Cron Pipeline] Lead baru terkurasi yang didapat: ${newScrapedCount}`);
    } else {
      console.log(`[Cron Pipeline] Stok lead di database (${quotaBefore.qualifiedUncontacted}) sudah mencukupi sisa kuota hari ini (${quotaBefore.remainingQuota}). Lewati scraping.`);
    }

    // Jalankan Auto-Outreach via Fonnte
    console.log(`\n[Cron Pipeline] Memulai pengiriman WhatsApp otomatis via Fonnte...`);
    let outreachResult = null;
    try {
      outreachResult = await runDailyOutreach(pool, { dailyLimit });
      console.log(`[Cron Pipeline] Berhasil mengirim ${outreachResult.sentCount} pesan penawaran.`);
      if (outreachResult.failedLeads?.length) {
        console.warn(`[Cron Pipeline] Terdapat ${outreachResult.failedLeads.length} nomor gagal dikirimi pesan.`);
      }
    } catch (outreachErr) {
      console.error(`[Cron Pipeline] Pengiriman pesan otomatis gagal: ${outreachErr.message}`);
    }

    // Kirim Laporan Harian ke WA Pribadi Admin
    console.log(`\n[Cron Pipeline] Mengirim ringkasan laporan ke WhatsApp pribadi admin...`);
    const digestRes = await sendDailyDigest(pool, {
      newScrapedCount,
      outreachResult,
      customNotes: outreachResult?.sentCount === 0 && quotaBefore.remainingQuota > 0
        ? 'Periksa apakah template pesan aktif tersedia di /templates atau periksa ketersediaan saldo Fonnte.'
        : '',
    });

    if (digestRes.ok) {
      console.log(`[Cron Pipeline] Laporan berhasil terkirim ke WhatsApp pribadi admin.`);
    } else {
      console.error(`[Cron Pipeline] Gagal mengirim laporan ke admin: ${digestRes.error || digestRes.reason}`);
    }

    console.log('\n[Cron Pipeline] Seluruh rangkaian otomatisasi selesai dijalankan.');
  } catch (error) {
    console.error(`[Cron Pipeline] Terjadi kesalahan kritis dalam pipeline:`, error);
  } finally {
    await pool.end();
  }
}

// Support mode daemon / scheduler
const isDaemon = process.argv.includes('--daemon');
const targetHour = Number(process.env.CRON_SCHEDULE_HOUR ?? 9); // default jam 09:00 WIB
const targetMinute = Number(process.env.CRON_SCHEDULE_MINUTE ?? 0);

if (isDaemon) {
  console.log(`[Cron Daemon] Berjalan di background. Jadwal eksekusi setiap hari pukul ${String(targetHour).padStart(2, '0')}:${String(targetMinute).padStart(2, '0')} WIB.`);

  function scheduleNextRun() {
    const now = new Date();
    const next = new Date();
    next.setHours(targetHour, targetMinute, 0, 0);

    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    const msUntilNext = next.getTime() - now.getTime();
    console.log(`[Cron Daemon] Eksekusi berikutnya dijadwalkan pada ${next.toLocaleString('id-ID')} (dalam ${(msUntilNext / 3600000).toFixed(1)} jam).`);

    setTimeout(async () => {
      try {
        await executePipeline();
      } catch (err) {
        console.error('[Cron Daemon] Pipeline error:', err);
      } finally {
        scheduleNextRun();
      }
    }, msUntilNext);
  }

  scheduleNextRun();
} else {
  // Jalankan satu kali langsung
  executePipeline().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

