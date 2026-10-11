/**
 * Original hidden Windows/WPF regression for song ownership, async audio timing
 * and a visible dialog growing from choice to a long quiz. Uses production
 * handlers with fully transparent, non-activating windows; no user profile,
 * model, keyboard input or external network. Run: node tests/native-lifecycle-smoke.mjs
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') throw new Error('This smoke requires Windows PowerShell/WPF.');
const directory = await mkdtemp(join(tmpdir(), 'arcade-native-lifecycle-'));
const fixturePath = join(directory, 'lifecycle.ps1');
const desktop = fileURLToPath(new URL('../desktop/', import.meta.url));
const fixture = String.raw`
param([string]$Desktop)
$ErrorActionPreference='Stop'
$taskDesktop=$Desktop
$bootstrap=[IO.File]::ReadAllText((Join-Path $taskDesktop 'overlay.ps1'))
$bootstrap=$bootstrap.Substring(0,$bootstrap.IndexOf('. (Join-Path $PSScriptRoot ''controller.ps1'')'))
Invoke-Expression $bootstrap
$source=[IO.File]::ReadAllText((Join-Path $taskDesktop 'controller.ps1'))
$source=$source.Substring(0,$source.IndexOf('if ($Validate) {'))
$source=$source.Replace('(Join-Path $PSScriptRoot $Name)','(Join-Path $taskDesktop $Name)')
Invoke-Expression $source
$checks=[Collections.Generic.List[string]]::new()
function Check([bool]$Ok,[string]$Label) {if (-not $Ok) {throw "Native lifecycle failed: $Label"};$checks.Add($Label)}
function Pump([int]$Milliseconds=40) {
    $script:ReviewFrame=[Windows.Threading.DispatcherFrame]::new()
    $stop=[Windows.Threading.DispatcherTimer]::new()
    $stop.Interval=[TimeSpan]::FromMilliseconds($Milliseconds)
    $stop.Add_Tick({$script:ReviewFrame.Continue=$false})
    try {$stop.Start();[Windows.Threading.Dispatcher]::PushFrame($script:ReviewFrame)} finally {$stop.Stop()}
}
function Until($Condition,[int]$TimeoutMs=4000) {
    $deadline=(Get-Now)+$TimeoutMs
    while (-not (& $Condition) -and (Get-Now) -lt $deadline) {Pump 25}
    Check ([bool](& $Condition)) 'asynchronous-operation-completes'
}
function New-AudioState([string]$Id,[int]$Duration=5000) {
    [pscustomobject]@{id=$Id;status='rhythm';startAt=(Get-Now)-900;metrics=[pscustomobject]@{lines=100;complexity=30};chart=[pscustomobject]@{durationMs=$Duration;bpm=199.5;introMs=1600;notes=@([pscustomobject]@{timeMs=1600;lane=0},[pscustomobject]@{timeMs=2000;lane=1})}}
}
$script:Player.IsMuted=$true
$script:Enabled=$true
$script:Token=$null;$script:ControllerToken=$null
$script:Dialog.Opacity=0;$script:Dialog.ShowActivated=$false;$script:Dialog.ShowInTaskbar=$false
$script:Timer.Start()
try {
    $script:AudioOpened=$false;$script:OpenedPosition=0.0;$script:OpenedElapsed=0.0
    $script:Player.Add_MediaOpened({
        $script:OpenedPosition=$script:Player.Position.TotalMilliseconds
        $script:OpenedElapsed=(Get-Now)+$script:ServerOffset-[double]$script:State.startAt
        $script:AudioOpened=$true
    })
    $script:State=New-AudioState 'first-song' 120000
    $clock=[Diagnostics.Stopwatch]::StartNew()
    Start-Audio $script:State
    $song=$script:AudioTask.GetAwaiter().GetResult()
    $renderMs=$clock.ElapsedMilliseconds
    Until {$script:AudioOpened}
    Check ($script:CurrentAudioPath -eq $song -and $script:CurrentAudioId -eq 'first-song') 'completed-song-belongs-to-current-challenge'
    Check ([Math]::Abs($script:OpenedPosition-$script:OpenedElapsed) -lt 100 -and $script:OpenedPosition -ge 850) 'async-media-open-seeks-to-server-clock'
    $pcm=[IO.File]::ReadAllBytes($song)
    $firstSample=[int](1600*22050/1000)
    $silent=$true
    for($i=44;$i -lt 44+$firstSample*2;$i++){if($pcm[$i] -ne 0){$silent=$false;break}}
    $audible=$false
    for($i=44+$firstSample*2;$i -lt 44+($firstSample+500)*2;$i++){if($pcm[$i] -ne 0){$audible=$true;break}}
    Check ($silent -and $audible) 'wave-first-note-aligned-to-dynamic-1600ms-intro'
    $latePath=[IO.Path]::GetTempFileName()
    $late=[Threading.Tasks.TaskCompletionSource[string]]::new()
    $script:AudioTask=$late.Task;$script:AudioTaskId='late-retired-song'
    Hide-Challenge
    Until {-not [IO.File]::Exists($song)}
    Check (-not $script:Player.Source -and -not $script:CurrentAudioPath -and -not $script:CurrentAudioId -and $script:AudioPaths.Count -eq 0) 'hide-releases-player-and-completed-wave'
    $script:State=New-AudioState 'successor-song'
    Start-Audio $script:State
    $successor=$script:AudioTask.GetAwaiter().GetResult()
    Until {$script:CurrentAudioPath -eq $successor}
    $late.SetResult($latePath)
    Until {-not [IO.File]::Exists($latePath)}
    Remove-UnusedAudio
    Check ([IO.File]::Exists($successor) -and $script:CurrentAudioId -eq 'successor-song' -and $script:AudioPaths.Count -eq 1 -and $script:AudioCleanupTasks.Count -eq 0) 'retired-result-deleted-without-touching-successor'
    Hide-Challenge
    Until {-not [IO.File]::Exists($successor)}
    for($cycle=0;$cycle -lt 8;$cycle++) {
        $script:State=New-AudioState "repeated-$cycle"
        Start-Audio $script:State
        $path=$script:AudioTask.GetAwaiter().GetResult()
        Until {$script:CurrentAudioPath -eq $path}
        Hide-Challenge
        Until {-not [IO.File]::Exists($path)}
    }
    Check ($script:AudioPaths.Count -eq 0 -and $script:AudioCleanupTasks.Count -eq 0) 'repeated-challenges-do-not-accumulate-audio-files-or-tasks'
    $script:State=[pscustomobject]@{id='layout';status='choose'}
    Set-View 'Choose'
    $script:Dialog.Show();$script:Dialog.UpdateLayout()
    $area=[Windows.SystemParameters]::WorkArea
    $chooseHeight=$script:Dialog.ActualHeight
    $script:Dialog.Left=$area.Left+($area.Width-$script:Dialog.ActualWidth)/2
    $script:Dialog.Top=$area.Top+($area.Height-$chooseHeight)/2
    $oldTop=$script:Dialog.Top
    Set-View 'Quiz'
    $script:ui.QuestionPrompt.Text=('A long question whose assumptions and answer choices must remain readable. '*100)
    $script:Dialog.UpdateLayout();Pump 30
    $quizHeight=$script:Dialog.ActualHeight
    Check ($quizHeight -gt $chooseHeight+100 -and $oldTop+$quizHeight -gt $area.Bottom) 'long-quiz-reproduces-growth-past-old-choice-position'
    Check ($script:Dialog.Top -ge $area.Top-0.5 -and $script:Dialog.Top+$quizHeight -le $area.Bottom+0.5) 'size-change-keeps-quiz-and-exit-within-work-area'
    Set-View 'Choose';$script:Dialog.UpdateLayout();Pump 30
    $script:Dialog.Left=$area.Left+15;$script:Dialog.Top=$area.Top+10
    $script:ui.ChoicePrompt.FontSize=22;$script:Dialog.UpdateLayout();Pump 30
    Check ([Math]::Abs($script:Dialog.Left-($area.Left+15)) -lt 0.5 -and [Math]::Abs($script:Dialog.Top-($area.Top+10)) -lt 0.5) 'resize-preserves-position-that-already-fits'
    $nativeBounds=[ArcadeNative]::WindowWorkArea([Windows.Interop.WindowInteropHelper]::new($script:Dialog).Handle)
    Check ($nativeBounds.Count -eq 4 -and $nativeBounds[2] -gt $nativeBounds[0] -and $nativeBounds[3] -gt $nativeBounds[1]) 'work-area-read-from-actual-window-monitor'
    # Exercise a negative-origin secondary work area without requiring two monitors.
    function Get-ChallengeWorkArea {[Windows.Rect]::new(-1280,0,1280,720)}
    $script:Dialog.Left=-1100;$script:Dialog.Top=12
    Keep-ChallengeOnScreen
    Check ([Math]::Abs($script:Dialog.Left+1100) -lt 0.5 -and [Math]::Abs($script:Dialog.Top-12) -lt 0.5) 'secondary-monitor-position-is-not-pulled-to-primary'
    [pscustomobject]@{result='PASS';native='WPF';passed=$checks.Count;checks=$checks;render120SecondsMs=$renderMs;mediaSeekMs=$script:OpenedPosition;mediaServerElapsedMs=$script:OpenedElapsed;chooseHeight=$chooseHeight;quizHeight=$quizHeight;workAreaHeight=$area.Height} | ConvertTo-Json -Compress
} finally {
    $script:Timer.Stop();$script:Token=$null;$script:ControllerToken=$null;$script:State=$null
    Stop-Audio
    if($late -and $latePath){[void]$late.TrySetResult($latePath)}
    if($script:AudioCleanupTasks.Count){[void][Threading.Tasks.Task]::WhenAll($script:AudioCleanupTasks.ToArray()).Wait(4000)}
    Remove-UnusedAudio
    $script:Closing=$true;$script:Dialog.Close();$script:Window.Close()
}
`;
let child;
try {
  await writeFile(fixturePath, '\uFEFF' + fixture, 'utf8');
  const executable = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  child = spawn(executable, ['-NoProfile', '-STA', '-File', fixturePath, '-Desktop', desktop], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', bytes => { output += bytes.toString(); });
  child.stderr.on('data', bytes => { output += bytes.toString(); });
  const deadline = setTimeout(() => child.kill(), 25000);
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject); child.once('exit', code => resolve(code));
  }).finally(() => clearTimeout(deadline));
  assert.equal(exitCode, 0, output);
  const result = output.split(/\r?\n/).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).find(item => item?.result === 'PASS');
  assert.ok(result, output);
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (child?.exitCode === null) child.kill();
  await rm(directory, { recursive: true, force: true });
}
