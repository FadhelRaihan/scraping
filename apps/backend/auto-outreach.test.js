import test from 'node:test';
import assert from 'node:assert/strict';
import { getDailyQuota, runDailyOutreach } from './auto-outreach.js';

test('Auto Outreach: getDailyQuota calculates remaining quota accurately', async () => {
  const fakePool = {
    async query(sql) {
      if (sql.includes('sent_today')) {
        return { rows: [{ sent_today: 5 }] };
      }
      if (sql.includes('qualified_uncontacted')) {
        return { rows: [{ qualified_uncontacted: 20 }] };
      }
      return { rows: [] };
    },
  };

  const quota = await getDailyQuota(fakePool, 25);
  assert.equal(quota.sentToday, 5);
  assert.equal(quota.dailyLimit, 25);
  assert.equal(quota.remainingQuota, 20);
  assert.equal(quota.qualifiedUncontacted, 20);
});

test('Auto Outreach: runDailyOutreach stops if quota is exhausted', async () => {
  const fakePool = {
    async query(sql) {
      if (sql.includes('sent_today')) {
        return { rows: [{ sent_today: 25 }] };
      }
      if (sql.includes('qualified_uncontacted')) {
        return { rows: [{ qualified_uncontacted: 10 }] };
      }
      return { rows: [] };
    },
  };

  const result = await runDailyOutreach(fakePool, { dailyLimit: 25 });
  assert.equal(result.ok, true);
  assert.equal(result.sentCount, 0);
  assert.equal(result.reason, 'quota_exhausted');
});

