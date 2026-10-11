/**
 * Original Windows input integration smoke. Loads the production WPF input
 * handlers and async C# transport into a hidden test runspace. Real localhost
 * bridge judges D/F chords and holds; the relay delays one response to expose
 * any overtaking press/release. No user keyboard, model or files are touched.
 * Run: node tests/native-input-smoke.mjs
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBridge } from '../src/bridge.mjs';
import { analyzeCode } from '../src/core.mjs';

if (process.platform !== 'win32') throw new Error('This smoke requires Windows PowerShell/WPF.');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const bridge = await createBridge({ disconnectMs: 15000 });
const game = bridge.createChallenge(analyzeCode('const identity = x => x;'), { id: 'native-input-real' });
const actions = [];
let inFlight = 0, peakConcurrent = 0;
const relay = createServer(async (request, response) => {
  const isAction = request.method === 'POST';
  if (isAction) peakConcurrent = Math.max(peakConcurrent, ++inFlight);
  try {
    let body = '';
    for await (const chunk of request) body += chunk;
    if (isAction) actions.push(JSON.parse(body));
    const target = new URL(game.url);
    const result = await fetch(`${target.origin}${request.url}`, {
      method: request.method,
      ...(isAction ? { headers: { 'Content-Type': 'application/json' }, body } : {}),
    });
    const text = await result.text();
    if (isAction && actions.length === 1) await sleep(30);
    response.writeHead(result.status, { 'Content-Type': 'application/json' });
    if (isAction) inFlight--;
    response.end(text);
  } catch (error) {
    if (isAction) inFlight--;
    response.writeHead(500); response.end(JSON.stringify({ error: String(error) }));
  }
});
await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve));
const localUrl = `http://127.0.0.1:${relay.address().port}/?token=${game.token}`;
const directory = await mkdtemp(join(tmpdir(), 'arcade-native-input-'));
const fixturePath = join(directory, 'input.ps1');
const desktop = fileURLToPath(new URL('../desktop/', import.meta.url));
const fixture = String.raw`
param([string]$Desktop)
$taskDesktop=$Desktop
$bootstrap=[IO.File]::ReadAllText((Join-Path $taskDesktop 'overlay.ps1'))
$bootstrap=$bootstrap.Substring(0,$bootstrap.IndexOf('. (Join-Path $PSScriptRoot ''controller.ps1'')'))
Invoke-Expression $bootstrap
$source=[IO.File]::ReadAllText((Join-Path $taskDesktop 'controller.ps1'))
$source=$source.Substring(0,$source.IndexOf('if ($Validate) {'))
$source=$source.Replace('(Join-Path $PSScriptRoot $Name)','(Join-Path $taskDesktop $Name)')
Invoke-Expression $source
# Exercise real controls and handlers without presenting a window or stealing focus.
function Show-Challenge {$script:DialogRequestedVisible=$true}
function Start-Audio($State) {}
function Check([bool]$Ok,[string]$Label) {if (-not $Ok) {throw "Native input failed: $Label"}}
function Wait-Note([double]$At) {while ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-$script:State.startAt -lt $At) {Start-Sleep -Milliseconds 1}}
function Down([string]$Key) {& $script:KeyHandler $null ([pscustomobject]@{Key=$Key;IsRepeat=$false;Handled=$false})}
function Up([string]$Key) {& $script:KeyUpHandler $null ([pscustomobject]@{Key=$Key;Handled=$false})}
function Flush-Actions {
    foreach ($request in $script:Requests.ToArray()) {
        $next=ConvertFrom-Json ($request.Work.GetAwaiter().GetResult())
        Accept-State $next $request.StartedAt
        [void]$script:Requests.Remove($request)
    }
}
function Refresh-State {
    $request=[ArcadeNative]::Get((Get-Endpoint '/api/state'))
    Accept-State (ConvertFrom-Json ($request.Work.GetAwaiter().GetResult())) $request.StartedAt
}
[Console]::Out.WriteLine('INPUT_READY')
$config=ConvertFrom-Json ([Console]::In.ReadLine())
Set-Endpoint $config.url
$script:Enabled=$true
Refresh-State
Wait-Note 1000
Down 'D';Down 'F'
Check ($script:Requests.Count -eq 2) 'DF enqueues both lane presses'
& $script:KeyHandler $null ([pscustomobject]@{Key='D';IsRepeat=$true;Handled=$false})
Check ($script:Requests.Count -eq 2) 'repeat creates no extra press'
Flush-Actions
Check ($script:State.hits -eq 2 -and $script:State.combo -eq 2) 'chord grades both lanes'
Up 'D';Up 'F';Flush-Actions
Wait-Note 1800
Down 'D';Down 'J';Flush-Actions
Check ($script:State.hits -eq 2 -and $script:State.activeHolds.h -and $script:State.feedback[-1].source -eq 'hold-start' -and -not $script:State.feedback[-1].counted) 'hold head emits feedback without scoring'
Up 'D'
Check ($script:Requests.Count -eq 0 -and $script:LaneSources[0].Count -eq 1) 'alias release preserves hold'
Wait-Note 2440
Refresh-State
Check ($script:State.hits -eq 3 -and $script:State.feedback[-1].source -eq 'hold-complete' -and $script:State.feedback[-1].counted) 'sustained hold completes once'
Up 'J';Flush-Actions
Wait-Note 2900
Down 'K';Flush-Actions
Check ($null -ne $script:State.activeHolds.e) 'lower-lane hold starts'
Wait-Note 3100
Up 'K';Flush-Actions
Check ($script:State.misses -eq 1 -and $script:State.feedback[-1].source -eq 'hold-release' -and $script:State.feedback[-1].grade -eq 'miss') 'early release causes one MISS'
Wait-Note 4200
Down 'J';Flush-Actions
Check ($script:State.status -eq 'passed' -and $script:State.hits -eq 4 -and $script:State.misses -eq 1) 'exact 20 percent remains pass'
Hide-Challenge
Check ($script:LaneSources[0].Count -eq 0 -and $script:LaneSources[1].Count -eq 0) 'terminal hiding clears local held sources'
[pscustomobject]@{result='PASS';hits=$script:State.hits;misses=$script:State.misses;feedback=$script:State.feedback.Count;native='WPF';realKeyboardHandlers=$true} | ConvertTo-Json -Compress
$script:Token=$null;$script:ControllerToken=$null;$script:Closing=$true
$script:Player.Close();$script:Dialog.Close();$script:Window.Close()
`;
await writeFile(fixturePath, '\uFEFF' + fixture, 'utf8');
let child, output = '', exitCode;
try {
  const executable = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  child = spawn(executable, ['-NoProfile', '-STA', '-File', fixturePath, '-Desktop', desktop], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdout.on('data', bytes => { output += bytes.toString(); });
  child.stderr.on('data', bytes => { output += bytes.toString(); });
  const completion = new Promise(resolve => child.once('exit', code => { exitCode = code; resolve(code); }));
  const until = Date.now() + 20000;
  while (!output.includes('INPUT_READY') && exitCode === undefined && Date.now() < until) await sleep(20);
  assert.ok(output.includes('INPUT_READY'), output);
  game.action({ action: 'start-rhythm' });
  game.chart = { ...game.chart, introMs: 1000, perfectWindowMs: 50, hitWindowMs: 158, durationMs: 4700,
    notes: [
      { id: 'c0', lane: 0, timeMs: 1000, type: 'tap', durationMs: 0, endTimeMs: 1000, chordId: 0 },
      { id: 'c1', lane: 1, timeMs: 1000, type: 'tap', durationMs: 0, endTimeMs: 1000, chordId: 0 },
      { id: 'h', lane: 0, timeMs: 1800, type: 'hold', durationMs: 600, endTimeMs: 2400 },
      { id: 'e', lane: 1, timeMs: 2900, type: 'hold', durationMs: 600, endTimeMs: 3500 },
      { id: 'last', lane: 0, timeMs: 4200, type: 'tap', durationMs: 0, endTimeMs: 4200 },
    ] };
  child.stdin.end(JSON.stringify({ url: localUrl }) + '\n');
  let timeout;
  const result = await Promise.race([completion, new Promise(resolve => { timeout = setTimeout(() => resolve('timeout'), 20000); })]);
  clearTimeout(timeout);
  assert.equal(result, 0, output);
  assert.equal(peakConcurrent, 1, 'Production HTTP FIFO never overlaps lane actions, even with a delayed response');
  assert.deepEqual(actions.map(({ action, lane }) => [action, lane]), [
    ['press', 0], ['press', 1], ['release', 0], ['release', 1],
    ['press', 0], ['release', 0], ['press', 1], ['release', 1], ['press', 0],
  ]);
  assert.equal(game.hits, 4);
  assert.equal(game.misses, 1);
  assert.equal(game.feedback.filter(event => event.source === 'hold-start').length, 2);
  assert.equal(game.feedback.filter(event => event.source === 'hold-complete').length, 1);
  assert.equal(game.feedback.filter(event => event.source === 'hold-release').length, 1);
  console.log(JSON.stringify({ result: 'PASS', nativeInputActions: actions.length, peakConcurrent,
    actualDfChord: true, holdHeadDoesNotScore: true, heldTailCompletesOnce: true,
    earlyReleaseMissesOnce: true, repeatIgnored: true, sameLaneAliasMerged: true }));
  console.log(output.trim());
} finally {
  child?.kill();
  game.finish('cancelled');
  relay.closeAllConnections();
  await new Promise(resolve => relay.close(resolve));
  await bridge.close();
  await rm(directory, { recursive: true, force: true });
}
