import { createPool } from './db.js';
import { buildApp } from './app.js';
const pool = createPool();
const app = await buildApp(pool);
app.addHook('onClose', () => pool.end());
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void app.close());
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3001) });
