# Original native Code Arcade client. Uses only Windows PowerShell, WPF and .NET.
[CmdletBinding()]
param(
    [string] $Url,
    [string] $InboxPath,
    [Alias('ValidateOnly')][switch] $Validate,
    [switch] $SelfTest,
    [switch] $TraceStartup,
    [switch] $InspectWindow,
    [switch] $Preview,
    [switch] $PreviewChallenge,
    [switch] $PreviewRhythm,
    [string] $PreviewQuiz,
    [Alias('SnapshotPath')][string] $RenderPreview
)

$ErrorActionPreference = 'Stop'
function Write-Startup([string]$Stage) { if ($TraceStartup) { [Console]::Out.WriteLine("NATIVE_STARTUP " + $Stage) } }
Write-Startup 'script-entered'
if ([Threading.Thread]::CurrentThread.ApartmentState -ne 'STA') {
    throw 'Run overlay.ps1 with powershell.exe -STA.'
}
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Net.Http
Write-Startup 'wpf-assemblies-loaded'

# HTTP and audio jobs execute on .NET tasks. The WPF dispatcher never waits for network I/O.
Add-Type -ReferencedAssemblies System.Net.Http,System -TypeDefinition @'
using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Media;
using System.Runtime.InteropServices;

public sealed class ArcadeRequest {
    public Task<string> Work;
    public long StartedAt;
    public bool IsAction;
    public bool IsController;
    public string RequestToken;
    public ArcadeRequest(Task<string> work, bool action) {
        Work = work; IsAction = action;
        StartedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }
}
public static class ArcadeNative {
    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)]
    private struct MonitorInfo {
        public int Size;
        public NativeRect Monitor, Work;
        public uint Flags;
    }
    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetMonitorInfoW")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
    public static int[] WindowWorkArea(IntPtr window) {
        if (window == IntPtr.Zero) return null;
        var info = new MonitorInfo { Size = Marshal.SizeOf(typeof(MonitorInfo)) };
        if (!GetMonitorInfo(MonitorFromWindow(window, 2), ref info)) return null;
        return new[] { info.Work.Left, info.Work.Top, info.Work.Right, info.Work.Bottom };
    }
    public const int RequestTimeoutMilliseconds = 4000;
    private static readonly HttpClient Client = new HttpClient { Timeout = TimeSpan.FromMilliseconds(RequestTimeoutMilliseconds) };
    private static readonly object OrderedGate = new object();
    private static readonly Dictionary<string, Task> OrderedTails = new Dictionary<string, Task>();
    private static readonly Dictionary<string, SoundPlayer> ImpactSounds = new Dictionary<string, SoundPlayer> {
        { "perfect", CreateImpact(880, 1320, 0.075) },
        { "good", CreateImpact(620, 930, 0.065) },
        { "miss", CreateImpact(145, 97, 0.085) }
    };
    private static SoundPlayer CreateImpact(double first, double second, double duration) {
        const int rate = 22050;
        int count = (int)(duration * rate);
        var stream = new MemoryStream();
        var writer = new BinaryWriter(stream);
        writer.Write(Encoding.ASCII.GetBytes("RIFF")); writer.Write(36 + count * 2);
        writer.Write(Encoding.ASCII.GetBytes("WAVEfmt ")); writer.Write(16);
        writer.Write((short)1); writer.Write((short)1); writer.Write(rate); writer.Write(rate * 2);
        writer.Write((short)2); writer.Write((short)16);
        writer.Write(Encoding.ASCII.GetBytes("data")); writer.Write(count * 2);
        for (int i = 0; i < count; i++) {
            double t = (double)i / rate;
            double envelope = Math.Sin(Math.PI * t / duration) * Math.Exp(-t * 30);
            double sample = (Math.Sin(2 * Math.PI * first * t) + 0.42 * Math.Sin(2 * Math.PI * second * t)) * envelope * 0.31;
            writer.Write((short)(sample * 32767));
        }
        writer.Flush(); stream.Position = 0;
        var player = new SoundPlayer(stream); player.Load(); return player;
    }
    public static void PlayImpact(string grade, bool muted) {
        if (muted) return;
        SoundPlayer player;
        if (ImpactSounds.TryGetValue(grade, out player)) player.Play();
    }
    public static ArcadeRequest Get(string url) {
        return new ArcadeRequest(Client.GetStringAsync(url), false);
    }
    private static async Task<string> Send(string url, string json) {
        using (var content = new StringContent(json, Encoding.UTF8, "application/json"))
        using (var response = await Client.PostAsync(url, content).ConfigureAwait(false)) {
            string body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            if (!response.IsSuccessStatusCode) throw new Exception(body);
            return body;
        }
    }
    public static ArcadeRequest Post(string url, string json) {
        return new ArcadeRequest(Send(url, json), true);
    }
    // All lane inputs for one challenge share one async FIFO, including fast chords.
    public static ArcadeRequest PostOrdered(string url, string json) {
        var request = new ArcadeRequest(null, true);
        lock (OrderedGate) {
            Task previous;
            if (!OrderedTails.TryGetValue(url, out previous)) previous = Task.FromResult(0);
            request.Work = SendAfter(previous, url, json, request);
            OrderedTails[url] = request.Work;
            if (OrderedTails.Count > 64) {
                var expired = new List<string>();
                foreach (var entry in OrderedTails) if (entry.Value.IsCompleted) expired.Add(entry.Key);
                foreach (string key in expired) OrderedTails.Remove(key);
            }
        }
        return request;
    }
    private static async Task<string> SendAfter(Task previous, string url, string json, ArcadeRequest request) {
        try { await previous.ConfigureAwait(false); } catch { }
        request.StartedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        return await Send(url, json).ConfigureAwait(false);
    }
    // Retired render jobs still own their eventual temporary result.
    public static Task DiscardAudio(Task<string> audio) {
        return audio.ContinueWith(completed => {
            if (completed.Status == TaskStatus.RanToCompletion) {
                try { File.Delete(completed.Result); } catch { }
            } else {
                var observed = completed.Exception;
            }
        }, TaskScheduler.Default);
    }
    // A code-seeded, original PCM composition. It contains no external audio samples.
    public static Task<string> RenderAudio(int durationMs, double bpm, int[] times, int[] lanes, int seed, int introMs) {
        return Task.Run(() => {
            const int rate = 22050;
            int length = (int)((long)Math.Min(120000, durationMs + 800) * rate / 1000);
            var samples = new float[length];
            double beat = 60000.0 / Math.Max(60, bpm);
            for (double at = introMs; at < durationMs; at += beat) {
                int step = (int)Math.Round((at - introMs) / beat);
                AddTone(samples, rate, at, 0.15, step % 4 == 0 ? 75 : 140, 0.23, true);
                AddTone(samples, rate, at + beat / 2, 0.045, 4300, 0.035, false);
            }
            double[] scale = { 261.6256, 293.6648, 329.6276, 391.9954, 440, 523.2511, 587.3295 };
            for (int i = 0; i < times.Length; i++) {
                int tone = Math.Abs(seed + i * 3 + lanes[i] * 2) % scale.Length;
                AddTone(samples, rate, times[i], 0.14, scale[tone] * (lanes[i] == 0 ? 1 : 0.5), 0.16, false);
            }
            string path = Path.Combine(Path.GetTempPath(), "code-arcade-" + Guid.NewGuid().ToString("N") + ".wav");
            using (var stream = File.Create(path)) using (var writer = new BinaryWriter(stream)) {
                writer.Write(Encoding.ASCII.GetBytes("RIFF")); writer.Write(36 + length * 2);
                writer.Write(Encoding.ASCII.GetBytes("WAVEfmt ")); writer.Write(16);
                writer.Write((short)1); writer.Write((short)1); writer.Write(rate);
                writer.Write(rate * 2); writer.Write((short)2); writer.Write((short)16);
                writer.Write(Encoding.ASCII.GetBytes("data")); writer.Write(length * 2);
                foreach (float sample in samples) writer.Write((short)(Math.Max(-0.9, Math.Min(0.9, sample)) * 32767));
            }
            return path;
        });
    }
    private static void AddTone(float[] data, int rate, double milliseconds, double seconds, double frequency, double gain, bool kick) {
        int start = (int)(milliseconds * rate / 1000);
        int count = (int)(seconds * rate);
        for (int i = 0; i < count && start + i < data.Length; i++) {
            if (start + i < 0) continue;
            double t = (double)i / rate;
            double envelope = Math.Min(1, t / 0.004) * Math.Exp(-t * (kick ? 26 : 21));
            double phase = kick ? 2 * Math.PI * (frequency * t + 6 * (1 - Math.Exp(-t * 24))) : 2 * Math.PI * frequency * t;
            double sound = Math.Sin(phase) + (kick ? 0 : 0.18 * Math.Sin(phase * 2));
            data[start + i] += (float)(sound * envelope * gain);
        }
    }
}
'@
[Net.ServicePointManager]::DefaultConnectionLimit = 20
Write-Startup 'async-helper-compiled'

. (Join-Path $PSScriptRoot 'controller.ps1')
