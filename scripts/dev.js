import { spawn } from 'node:child_process';
const children = [
  spawn(process.execPath, ['--watch', 'apps/backend/server.js'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--config', 'apps/frontend/vite.config.js'], { stdio: 'inherit' })
];
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  children.forEach(child => child.kill());
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
children.forEach(child => { child.on('exit', code => stop(code ?? 0)); child.on('error', error => { console.error(error); stop(1); }); });
