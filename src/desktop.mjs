import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export function launchOverlay(url, { logger = console, onClosed = () => {} } = {}) {
  if (process.platform !== 'win32') throw new Error('透明悬浮版目前需要 Windows 与内置的 Windows PowerShell/WPF。');
  const target = new URL(url);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1') throw new Error('悬浮窗只能连接本机挑战服务');
  const executable = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = fileURLToPath(new URL('../desktop/overlay.ps1', import.meta.url));
  const child = spawn(executable, ['-NoProfile', '-STA', '-File', script, '-Url', url], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let errorText = '';
  let reported = false;
  const closed = () => { if (!reported) { reported = true; onClosed(); } };
  child.stderr.on('data', data => { errorText = (errorText + data.toString()).slice(-4000); });
  child.on('error', error => { logger.warn(`[Code Arcade] 悬浮窗启动失败：${error.message}`); closed(); });
  child.on('exit', code => {
    if (code && errorText) logger.warn(`[Code Arcade] 悬浮窗退出：${errorText}`);
    closed();
  });
  return child;
}
