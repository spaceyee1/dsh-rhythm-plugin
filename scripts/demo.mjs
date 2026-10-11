// Native switch preview only. This program never generates code or calls a model.
import { createBridge } from '../src/bridge.mjs';
import { launchOverlay } from '../src/desktop.mjs';

let closing = false;
let child;
const bridge = await createBridge({ onEnabledChange: enabled => console.log(`插件开关：${enabled ? '开启' : '关闭'}。此进程只预览开关；实际挑战由 Harness 编码任务触发。`) });
async function close() {
  if (closing) return;
  closing = true;
  child?.kill();
  await bridge.close();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
console.log('已打开右下角「是否开启插件」开关预览。此预览不生成代码；安装到 Harness 后才会执行挑战。');
try { child = launchOverlay(bridge.controller.url, { onClosed: close }); }
catch (error) { await close(); throw error; }
