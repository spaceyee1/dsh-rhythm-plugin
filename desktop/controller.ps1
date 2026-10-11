# Original native controller and compact challenge dialog. Dot-sourced by overlay.ps1.
function Read-NativeWindow([string]$Name) {
    $reader = [Xml.XmlReader]::Create((Join-Path $PSScriptRoot $Name))
    try { [Windows.Markup.XamlReader]::Load($reader) } finally { $reader.Close() }
}
$script:Window = Read-NativeWindow 'overlay.xaml'
$script:Dialog = Read-NativeWindow 'challenge.xaml'
$script:ui = @{
    PluginSwitch=$script:Window.FindName('PluginSwitch')
    PluginToggle=$script:Window.FindName('PluginToggle')
}
@('DialogSurface','DialogHeader','DialogTitle','CloseButton','ChoicePrompt','ChoosePanel','RhythmButton','QuizButton','SubjectPanel','RhythmPanel','RhythmStats','SoundButton','ArenaFrame','Arena','NoteLayer','ImpactLayer','ImpactBadge','ImpactGrade','ImpactCombo','UpperPressFlash','LowerPressFlash','Countdown','UpperButton','LowerButton','SongProgress','QuizPanel','QuestionLabel','QuestionPrompt','QuestionSources','AnswerPanel','AnswerFeedback','AnswerSources','ConnectionHint','CancelButton') | ForEach-Object { $script:ui[$_]=$script:Dialog.FindName($_) }
# Wait for endpoint discovery before a user can send a controller action.
$script:ui.PluginToggle.IsEnabled=$false
Write-Startup 'native-windows-created'

$script:State=$null
$script:Base=$null
$script:Token=$null
$script:ControllerBase=$null
$script:ControllerToken=$null
$script:ControllerRequest=$null
$script:ControllerCurrentUrl=$null
$script:LastControllerPoll=0L
$script:LastControllerServerNow=0L
$script:LastControllerRevision=$null
$script:LastControllerIdentity=$null
$script:ControllerChanging=$false
$script:Enabled=$false
$script:UpdatingToggle=$false
$script:Closing=$false
$script:Requests=[Collections.Generic.List[ArcadeRequest]]::new()
$script:PollRequest=$null
$script:LastPoll=0L
$script:ServerOffset=0.0
$script:ChartId=$null
$script:QuestionId=$null
$script:SubjectsForId=$null
$script:NoteViews=@{}
$script:LaneSources=@([Collections.Generic.HashSet[string]]::new(),[Collections.Generic.HashSet[string]]::new())
$script:PendingAnswer=$false
$script:DialogRequestedVisible=$false
$script:TerminalIds=[Collections.Generic.HashSet[string]]::new()
$script:Player=[Windows.Media.MediaPlayer]::new()
$script:Player.Volume=0.7
$script:Muted=$false
$script:AudioTask=$null
$script:AudioTaskId=$null
$script:AudioCleanupTasks=[Collections.Generic.List[Threading.Tasks.Task]]::new()
$script:AudioPaths=[Collections.Generic.List[string]]::new()
$script:CurrentAudioPath=$null
$script:CurrentAudioId=$null
$script:StartedAudioId=$null
$script:LastFeedbackId=0L
$script:FeedbackChallengeId=$null
$script:FeedbackDispatchCount=0
$script:ImpactEffects=[Collections.Generic.List[object]]::new()
$script:TerminalHideAt=0L
$script:PendingEndpointUrl=$null
$script:PendingEndpointDeadline=0L
$script:LastInboxText=''
$script:LastInboxCheck=0L
$script:TestActions=[Collections.Generic.List[object]]::new()
$script:Clock=[Diagnostics.Stopwatch]::StartNew()
$script:ClockEpoch=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

function Get-Now { $script:ClockEpoch+$script:Clock.ElapsedMilliseconds }
function Get-Property($Object,[string]$Name,$Fallback=$null) {
    if ($Object -is [Collections.IDictionary] -and $Object.Contains($Name)) { return $Object[$Name] }
    if ($null -ne $Object -and $Object.PSObject.Properties[$Name]) { return $Object.$Name }
    return $Fallback
}
function Set-Toggle([bool]$Value) {
    $script:UpdatingToggle=$true
    try { $script:ui.PluginToggle.IsChecked=$Value } finally { $script:UpdatingToggle=$false }
}
function Hide-Challenge {
    Release-AllInputs
    $script:TerminalHideAt=0L
    $script:DialogRequestedVisible=$false
    Stop-Audio
    if ($script:Dialog.IsVisible) { $script:Dialog.Hide() }
}
function Convert-WorkArea([int[]]$Bounds,[Windows.Media.Matrix]$FromDevice) {
    $topLeft=$FromDevice.Transform([Windows.Point]::new($Bounds[0],$Bounds[1]))
    $bottomRight=$FromDevice.Transform([Windows.Point]::new($Bounds[2],$Bounds[3]))
    [Windows.Rect]::new($topLeft,$bottomRight)
}
function Get-ChallengeWorkArea {
    try {
        $handle=[Windows.Interop.WindowInteropHelper]::new($script:Dialog).Handle
        $bounds=[ArcadeNative]::WindowWorkArea($handle)
        $source=[Windows.PresentationSource]::FromVisual($script:Dialog)
        if ($bounds -and $source -and $source.CompositionTarget) {
            return Convert-WorkArea $bounds $source.CompositionTarget.TransformFromDevice
        }
    } catch {}
    # Before the hidden window receives an HWND, use WPF's primary-screen DIP area.
    [Windows.SystemParameters]::WorkArea
}
function Keep-ChallengeOnScreen {
    if (-not $script:Dialog.IsVisible) {return}
    $area=Get-ChallengeWorkArea
    # A visible choice dialog can grow when its quiz and answer text is laid out.
    # Keep the exit control reachable without moving a dialog that still fits.
    if (-not [double]::IsNaN($script:Dialog.Left)) {
        $script:Dialog.Left=[Math]::Max($area.Left,[Math]::Min($script:Dialog.Left,$area.Right-$script:Dialog.ActualWidth))
    }
    if (-not [double]::IsNaN($script:Dialog.Top)) {
        $script:Dialog.Top=[Math]::Max($area.Top,[Math]::Min($script:Dialog.Top,$area.Bottom-$script:Dialog.ActualHeight))
    }
}
function Show-Challenge {
    if (-not $script:Enabled -or -not $script:State -or $script:TerminalIds.Contains([string]$script:State.id)) { return }
    $script:DialogRequestedVisible=$true
    if ($SelfTest -or $RenderPreview) { return }
    if (-not $script:Dialog.IsVisible) {
        $script:Dialog.Show()
        $script:Dialog.UpdateLayout()
        $area=Get-ChallengeWorkArea
        $script:Dialog.Left=$area.Left+($area.Width-$script:Dialog.ActualWidth)/2
        $script:Dialog.Top=$area.Top+($area.Height-$script:Dialog.ActualHeight)/2
        [void]$script:Dialog.Activate()
        [void]$script:Dialog.Focus()
    }
}
function Set-Endpoint([string]$Address) {
    $target=[Uri]$Address
    if (-not $target.IsAbsoluteUri -or $target.Scheme -ne 'http' -or $target.Host -ne '127.0.0.1') { throw 'Only the local Harness bridge is allowed.' }
    $part=$target.Query.TrimStart('?').Split('&') | Where-Object { $_.StartsWith('token=') } | Select-Object -First 1
    if (-not $part) { throw 'Challenge token is missing.' }
    $tokenValue=[Uri]::UnescapeDataString($part.Substring(6))
    if ($tokenValue -notmatch '^[A-Za-z0-9_-]{16,128}$') { throw 'Invalid challenge token.' }
    Hide-Challenge
    $script:PendingEndpointUrl=$null
    $script:Base=$target.GetLeftPart([UriPartial]::Authority)
    $script:Token=$tokenValue
    $script:State=$null
    $script:ChartId=$null
    $script:QuestionId=$null
    $script:SubjectsForId=$null
    $script:PendingAnswer=$false
    $script:PollRequest=$null
    $script:LastPoll=0L
    $script:StartedAudioId=$null
    $script:NoteViews.Clear()
    Reset-Impact $null
    $script:ui.NoteLayer.Children.Clear()
    $script:ui.SubjectPanel.Visibility='Collapsed'
    $script:ui.ConnectionHint.Visibility='Collapsed'
    if ($script:TerminalIds.Count -gt 64) { $script:TerminalIds.Clear() }
}
function Queue-Endpoint([string]$Address) {
    $now=Get-Now
    if ($script:Enabled -and ($script:TerminalHideAt -gt $now -or ($script:State -and $script:State.status -eq 'rhythm'))) {
        # Allow an in-flight state response its complete HTTP timeout before
        # falling back. Normal terminal feedback still adds only its 440ms hold.
        if ($script:PendingEndpointUrl -ne $Address) {$script:PendingEndpointDeadline=$now+[ArcadeNative]::RequestTimeoutMilliseconds+500}
        $script:PendingEndpointUrl=$Address
    } else {Set-Endpoint $Address}
}
function Get-Endpoint([string]$Path) { "$($script:Base)$Path`?token=$([Uri]::EscapeDataString($script:Token))" }
function Show-Connection([string]$Message) {
    $script:ui.PluginToggle.ToolTip=$Message
    $script:ui.ConnectionHint.Text=$Message
    $script:ui.ConnectionHint.Visibility='Visible'
}
function Send-Action([hashtable]$Payload) {
    if ($SelfTest) { $script:TestActions.Add($Payload); return }
    if ($Preview -or $PreviewChallenge -or $PreviewRhythm -or $RenderPreview -or -not $script:Token) { return }
    # All lanes share this endpoint's queue. In particular, a quick release must
    # never overtake its press while the UI continues drawing on its own timer.
    $request=[ArcadeNative]::PostOrdered((Get-Endpoint '/api/action'),(ConvertTo-Json $Payload -Compress))
    $request.RequestToken=$script:Token
    $script:Requests.Add($request)
}
function Send-ControllerAction([bool]$Value) {
    $script:Enabled=$Value
    Set-Toggle $Value
    if (-not $Value) { Hide-Challenge }
    if ($SelfTest) { $script:TestActions.Add(@{action='set-enabled';enabled=$Value}); return }
    if ($Preview -or $PreviewChallenge -or $PreviewRhythm -or $RenderPreview -or -not $script:ControllerToken) { return }
    $address="$($script:ControllerBase)/api/action?token=$([Uri]::EscapeDataString($script:ControllerToken))"
    $request=[ArcadeNative]::Post($address,(ConvertTo-Json @{action='set-enabled';enabled=$Value} -Compress))
    $request.IsController=$true
    $request.RequestToken=$script:ControllerToken
    $script:ControllerChanging=$true
    $script:ui.PluginToggle.IsEnabled=$false
    $script:Requests.Add($request)
}
function Exit-Challenge {
    if ($script:State) { [void]$script:TerminalIds.Add([string]$script:State.id) }
    Hide-Challenge
    $script:PendingEndpointUrl=$null
    if ($script:ControllerToken) { Send-ControllerAction $false }
    else {
        Send-Action @{action='exit'}
        $script:Enabled=$false
        Set-Toggle $false
    }
}
function Accept-Controller($Controller,[bool]$ActionResponse=$false) {
    if ($script:ControllerChanging -and -not $ActionResponse) { return }
    if ($ActionResponse) { $script:ControllerChanging=$false; $script:ui.PluginToggle.IsEnabled=$true }
    $identity=$(if ($script:ControllerToken) {"$($script:ControllerBase)|$($script:ControllerToken)"} else {"$($script:Base)|$($script:Token)"})
    if ($identity -ne $script:LastControllerIdentity) {
        $script:LastControllerIdentity=$identity
        $script:LastControllerRevision=$null
        $script:LastControllerServerNow=0L
    }
    $revision=Get-Property $Controller 'revision'
    $serverNow=[long](Get-Property $Controller 'serverNow' 0)
    if ($null -ne $revision -and $null -ne $script:LastControllerRevision) {
        if ([long]$revision -le [long]$script:LastControllerRevision) {return}
    } elseif ($serverNow -and $serverNow -lt $script:LastControllerServerNow) {return}
    if ($null -ne $revision) {$script:LastControllerRevision=[long]$revision}
    if ($serverNow) { $script:LastControllerServerNow=$serverNow }
    $script:ui.PluginToggle.IsEnabled=$true
    if (-not $script:ControllerToken) {
        $script:ControllerBase=$script:Base
        $script:ControllerToken=$script:Token
        $script:Base=$null
        $script:Token=$null
    }
    $script:Enabled=[bool]$Controller.enabled
    Set-Toggle $script:Enabled
    $script:ui.PluginToggle.ToolTip=$null
    $currentUrl=[string](Get-Property $Controller 'currentUrl' '')
    if (-not $script:Enabled -or -not $currentUrl) {
        Hide-Challenge
        $script:PendingEndpointUrl=$null
        if (-not $script:Enabled -and $script:State) { [void]$script:TerminalIds.Add([string]$script:State.id) }
        $script:ControllerCurrentUrl=$null
        $script:State=$null
        $script:Token=$null
        $script:Base=$null
        return
    }
    if ($script:ControllerCurrentUrl -ne $currentUrl) {
        $script:ControllerCurrentUrl=$currentUrl
        Queue-Endpoint $currentUrl
    }
}
function Set-View([string]$Name) {
    foreach ($part in @('Choose','Rhythm','Quiz')) { $script:ui["${part}Panel"].Visibility=$(if ($part -eq $Name) {'Visible'} else {'Collapsed'}) }
    $script:Dialog.Width=$(if ($Name -eq 'Rhythm') {555} else {460})
    $script:ui.QuizPanel.MaxHeight=[Math]::Max(180,[Math]::Min(650,(Get-ChallengeWorkArea).Height-180))
    $title=$(if ($Name -eq 'Rhythm') {'音游挑战'} elseif ($Name -eq 'Quiz') {'答题挑战'} else {'选择挑战'})
    $script:Dialog.Title=$(if ($Name -eq 'Choose') {'杂鱼，接受挑战吧！'} else {$title})
    $script:ui.DialogTitle.Text=$title
    $script:ui.DialogHeader.Visibility=$(if ($Name -eq 'Rhythm') {'Collapsed'} else {'Visible'})
    $script:ui.DialogSurface.Background=[Windows.Media.BrushConverter]::new().ConvertFromString($(if ($Name -eq 'Rhythm') {'#00000000'} else {'#FFFCFDFC'}))
    $script:ui.DialogSurface.BorderBrush=[Windows.Media.BrushConverter]::new().ConvertFromString($(if ($Name -eq 'Rhythm') {'#00000000'} else {'#C8D2CC'}))
    $script:ui.ArenaFrame.Background=[Windows.Media.Brushes]::Transparent
    $script:ui.Arena.Background=[Windows.Media.Brushes]::Transparent
    $script:ui.CancelButton.Content=$(if ($Name -eq 'Choose') {'取消'} else {'退出挑战'})
}
function Reset-Impact([string]$Id) {
    $script:FeedbackChallengeId=$Id
    $script:LastFeedbackId=0L
    $script:TerminalHideAt=0L
    $script:ImpactEffects.Clear()
    $script:ui.ImpactLayer.Children.Clear()
    $script:ui.ImpactBadge.BeginAnimation([Windows.UIElement]::OpacityProperty,$null)
    $script:ui.ImpactBadge.Opacity=0
}
function Animate-Press([int]$Lane) {
    $flash=$(if ($Lane -eq 0) {$script:ui.UpperPressFlash} else {$script:ui.LowerPressFlash})
    $flash.RenderTransformOrigin=[Windows.Point]::new(0.5,0.5)
    $scale=[Windows.Media.ScaleTransform]::new(1,1);$flash.RenderTransform=$scale
    $fade=[Windows.Media.Animation.DoubleAnimation]::new(0.9,0,[Windows.Duration]::new([TimeSpan]::FromMilliseconds(130)))
    $grow=[Windows.Media.Animation.DoubleAnimation]::new(0.9,1.32,[Windows.Duration]::new([TimeSpan]::FromMilliseconds(130)))
    $flash.BeginAnimation([Windows.UIElement]::OpacityProperty,$fade)
    $scale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleXProperty,$grow)
    $scale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty,$grow)
}
function Add-ImpactEffects([int]$Lane,[Windows.Media.Brush]$Color,[bool]$Miss) {
    $centerY=$(if ($Lane -eq 1) {105} else {48})
    $now=Get-Now
    $ring=[Windows.Shapes.Ellipse]::new()
    $ring.Width=46;$ring.Height=46;$ring.Stroke=$Color;$ring.StrokeThickness=2.5
    $ring.RenderTransformOrigin=[Windows.Point]::new(0.5,0.5)
    $scale=[Windows.Media.ScaleTransform]::new(1,1);$ring.RenderTransform=$scale
    [Windows.Controls.Canvas]::SetLeft($ring,71);[Windows.Controls.Canvas]::SetTop($ring,$centerY-23)
    [void]$script:ui.ImpactLayer.Children.Add($ring)
    $grow=[Windows.Media.Animation.DoubleAnimation]::new(0.7,1.8,[Windows.Duration]::new([TimeSpan]::FromMilliseconds(360)))
    $fade=[Windows.Media.Animation.DoubleAnimation]::new(0.95,0,[Windows.Duration]::new([TimeSpan]::FromMilliseconds(360)))
    $scale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleXProperty,$grow);$scale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty,$grow)
    $ring.BeginAnimation([Windows.UIElement]::OpacityProperty,$fade)
    $script:ImpactEffects.Add(@{Shape=$ring;Expires=$now+430})
    $count=$(if ($Miss) {5} else {8})
    for ($i=0;$i -lt $count;$i++) {
        $angle=2*[Math]::PI*$i/$count+0.2
        $particle=[Windows.Shapes.Ellipse]::new()
        $particle.Width=3+($i%3);$particle.Height=$particle.Width;$particle.Fill=$Color
        [Windows.Controls.Canvas]::SetLeft($particle,94+[Math]::Cos($angle)*20)
        [Windows.Controls.Canvas]::SetTop($particle,$centerY+[Math]::Sin($angle)*20)
        $move=[Windows.Media.TranslateTransform]::new();$particle.RenderTransform=$move
        [void]$script:ui.ImpactLayer.Children.Add($particle)
        $duration=[Windows.Duration]::new([TimeSpan]::FromMilliseconds(270+($i%3)*30))
        $ease=[Windows.Media.Animation.QuadraticEase]::new();$ease.EasingMode='EaseOut'
        $x=[Windows.Media.Animation.DoubleAnimation]::new(0,[Math]::Cos($angle)*(25+$i*2),$duration);$x.EasingFunction=$ease
        $y=[Windows.Media.Animation.DoubleAnimation]::new(0,[Math]::Sin($angle)*(20+$i*2),$duration);$y.EasingFunction=$ease
        $move.BeginAnimation([Windows.Media.TranslateTransform]::XProperty,$x);$move.BeginAnimation([Windows.Media.TranslateTransform]::YProperty,$y)
        $particle.BeginAnimation([Windows.UIElement]::OpacityProperty,[Windows.Media.Animation.DoubleAnimation]::new(0.95,0,$duration))
        $script:ImpactEffects.Add(@{Shape=$particle;Expires=$now+430})
    }
    while ($script:ImpactEffects.Count -gt 80) {
        $old=$script:ImpactEffects[0];$script:ui.ImpactLayer.Children.Remove($old.Shape);$script:ImpactEffects.RemoveAt(0)
    }
}
function Show-Impact([string]$Grade,[int]$Lane,[int]$Combo) {
    $palette=@{perfect='#FFE8AD';good='#8DDCF0';miss='#FF8D86'}
    if (-not $palette.ContainsKey($Grade)) {return}
    $color=[Windows.Media.BrushConverter]::new().ConvertFromString($palette[$Grade])
    $script:ui.ImpactGrade.Text=$Grade.ToUpperInvariant()
    $script:ui.ImpactGrade.Foreground=$color
    $script:ui.ImpactCombo.Text="COMBO $Combo"
    $glow=[Windows.Media.Effects.DropShadowEffect]::new()
    $glow.Color=$color.Color;$glow.BlurRadius=12;$glow.ShadowDepth=0;$glow.Opacity=0.45
    $script:ui.ImpactGrade.Effect=$glow
    $script:ui.ImpactBadge.RenderTransformOrigin=[Windows.Point]::new(0.5,0.5)
    $scale=[Windows.Media.ScaleTransform]::new(1,1);$script:ui.ImpactBadge.RenderTransform=$scale
    $bounce=[Windows.Media.Animation.DoubleAnimationUsingKeyFrames]::new()
    [void]$bounce.KeyFrames.Add([Windows.Media.Animation.LinearDoubleKeyFrame]::new(0.9,[Windows.Media.Animation.KeyTime]::FromTimeSpan([TimeSpan]::Zero)))
    [void]$bounce.KeyFrames.Add([Windows.Media.Animation.LinearDoubleKeyFrame]::new(1.07,[Windows.Media.Animation.KeyTime]::FromTimeSpan([TimeSpan]::FromMilliseconds(80))))
    [void]$bounce.KeyFrames.Add([Windows.Media.Animation.LinearDoubleKeyFrame]::new(1,[Windows.Media.Animation.KeyTime]::FromTimeSpan([TimeSpan]::FromMilliseconds(160))))
    $scale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleXProperty,$bounce);$scale.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty,$bounce)
    $fade=[Windows.Media.Animation.DoubleAnimation]::new(1,0,[Windows.Duration]::new([TimeSpan]::FromMilliseconds(380)))
    $script:ui.ImpactBadge.BeginAnimation([Windows.UIElement]::OpacityProperty,$fade)
    $effectColor=$(if ($Grade -eq 'perfect') {[Windows.Media.BrushConverter]::new().ConvertFromString('#67EBDD')} else {$color})
    Add-ImpactEffects $Lane $effectColor ($Grade -eq 'miss')
    if (-not $SelfTest -and -not $RenderPreview) {try {[ArcadeNative]::PlayImpact($Grade,$script:Muted)} catch {}}
    $script:FeedbackDispatchCount++
}
function Consume-Feedback($State) {
    if (-not $script:Enabled) {return 0}
    $count=0
    foreach ($feedback in @(Get-Property $State 'feedback' @())) {
        $id=[long](Get-Property $feedback 'id' 0)
        if ($id -le $script:LastFeedbackId) {continue}
        $script:LastFeedbackId=$id
        $combo=[int](Get-Property $feedback 'combo' (Get-Property $State 'combo' 0))
        Show-Impact ([string]$feedback.grade) ([int]$feedback.lane) $combo
        Write-Startup "feedback game=$($State.id) seq=$id grade=$($feedback.grade) combo=$combo"
        $count++
    }
    return $count
}
function Update-Impact([long]$Now) {
    for ($i=$script:ImpactEffects.Count-1;$i -ge 0;$i--) {
        if ($Now -ge $script:ImpactEffects[$i].Expires) {
            $script:ui.ImpactLayer.Children.Remove($script:ImpactEffects[$i].Shape);$script:ImpactEffects.RemoveAt($i)
        }
    }
    if ($script:TerminalHideAt -gt 0 -and $Now -ge $script:TerminalHideAt) {
        Write-Startup 'terminal-hidden'
        Hide-Challenge
    }
    if ($script:PendingEndpointUrl -and $script:Enabled -and $script:TerminalHideAt -le $Now) {
        if (-not $script:State -or $script:State.status -ne 'rhythm' -or $Now -ge $script:PendingEndpointDeadline) {
            $address=$script:PendingEndpointUrl;$script:PendingEndpointUrl=$null;Set-Endpoint $address
        }
    }
}
function Retire-AudioTask {
    Remove-UnusedAudio
    if ($script:AudioTask) {
        $script:AudioCleanupTasks.Add([ArcadeNative]::DiscardAudio($script:AudioTask))
        $script:AudioTask=$null
        $script:AudioTaskId=$null
    }
}
function Remove-UnusedAudio {
    for ($i=$script:AudioCleanupTasks.Count-1;$i -ge 0;$i--) {
        if ($script:AudioCleanupTasks[$i].IsCompleted) {$script:AudioCleanupTasks.RemoveAt($i)}
    }
    for ($i=$script:AudioPaths.Count-1;$i -ge 0;$i--) {
        $path=$script:AudioPaths[$i]
        if ($path -eq $script:CurrentAudioPath) {continue}
        try {
            [IO.File]::Delete($path)
            $script:AudioPaths.RemoveAt($i)
        } catch {
            # MediaPlayer.Close can release its file asynchronously. The next
            # dispatcher tick retries only retired paths, never the new song.
        }
    }
}
function Stop-Audio {
    $script:Player.Close()
    $script:CurrentAudioPath=$null
    $script:CurrentAudioId=$null
    Retire-AudioTask
}
function Start-Audio($State) {
    if ($SelfTest -or $PreviewRhythm -or $script:StartedAudioId -eq $State.id -or -not $State.chart) { return }
    Stop-Audio
    $script:StartedAudioId=$State.id
    $times=[int[]]@($State.chart.notes | ForEach-Object {[int]$_.timeMs})
    $lanes=[int[]]@($State.chart.notes | ForEach-Object {[int]$_.lane})
    $seed=[int]$State.metrics.lines+[int]$State.metrics.complexity
    $script:AudioTask=[ArcadeNative]::RenderAudio([int]$State.chart.durationMs,[double]$State.chart.bpm,$times,$lanes,$seed,[int](Get-Property $State.chart 'introMs' 2500))
    $script:AudioTaskId=[string]$State.id
}
function Build-Notes($State) {
    $script:ChartId=$State.id
    $script:NoteViews.Clear()
    $script:ui.NoteLayer.Children.Clear()
    foreach ($note in $State.chart.notes) {
        $hold=(Get-Property $note 'type' 'tap') -eq 'hold'
        $chord=$null -ne (Get-Property $note 'chordId' $null)
        $color=[Windows.Media.BrushConverter]::new().ConvertFromString($(if ($note.lane -eq 0) {'#72B491'} else {'#CEA17E'}))
        $shape=[Windows.Controls.Canvas]::new()
        $shape.Height=29
        $shape.Visibility='Collapsed'
        $tail=$null;$cap=$null
        if ($hold) {
            $tail=[Windows.Controls.Border]::new();$tail.Height=14;$tail.CornerRadius=[Windows.CornerRadius]::new(5)
            $tail.Background=$color;$tail.BorderBrush=[Windows.Media.Brushes]::White;$tail.BorderThickness=[Windows.Thickness]::new(1)
            [Windows.Controls.Canvas]::SetLeft($tail,14.5);[Windows.Controls.Canvas]::SetTop($tail,7.5)
            [void]$shape.Children.Add($tail)
            $cap=[Windows.Controls.Border]::new();$cap.Width=5;$cap.Height=23;$cap.Background=[Windows.Media.Brushes]::White;$cap.CornerRadius=[Windows.CornerRadius]::new(2)
            [Windows.Controls.Canvas]::SetTop($cap,3);[void]$shape.Children.Add($cap)
        }
        $head=[Windows.Controls.Border]::new();$head.Width=29;$head.Height=29;$head.CornerRadius=[Windows.CornerRadius]::new(7)
        $head.BorderThickness=[Windows.Thickness]::new($(if ($chord) {3} else {1.5}))
        $head.Background=$color;$head.BorderBrush=$(if ($chord) {[Windows.Media.Brushes]::Gold} else {[Windows.Media.Brushes]::White})
        $glyph=[Windows.Controls.TextBlock]::new()
        $glyph.Text=$(if ($chord) {'双'} elseif ($hold) {'长'} else {'♪'});$glyph.FontSize=$(if ($hold -or $chord) {12} else {17});$glyph.Foreground=[Windows.Media.Brushes]::White
        $glyph.HorizontalAlignment='Center';$glyph.VerticalAlignment='Center';$head.Child=$glyph
        [void]$shape.Children.Add($head)
        [Windows.Controls.Canvas]::SetTop($shape,$(if ($note.lane -eq 0) {33.5} else {90.5}))
        [void]$script:ui.NoteLayer.Children.Add($shape)
        $script:NoteViews[[string]$note.id]=@{Note=$note;Shape=$shape;Head=$head;Tail=$tail;Cap=$cap;Hold=$hold;Chord=$chord}
    }
    Start-Audio $State
}
function Update-Notes($State,[double]$Elapsed) {
    $speed=[double](Get-Property $State.chart 'scrollSpeed' 0.25)
    foreach ($entry in $script:NoteViews.Values) {
        $note=$entry.Note
        $held=$null -ne (Get-Property (Get-Property $State 'activeHolds') ([string]$note.id))
        $x=94+([double]$note.timeMs-$Elapsed)*$speed
        $end=[double](Get-Property $note 'endTimeMs' ([double]$note.timeMs+[double](Get-Property $note 'durationMs' 0)))
        $tailX=94+($end-$Elapsed)*$speed
        if ($held -and $entry.Hold) {$x=94}
        $judged=Get-Property $State.judgements ([string]$note.id) ''
        $visible=-not $judged -and $tailX -gt -25 -and $x -lt 535
        $entry.Shape.Visibility=$(if ($visible) {'Visible'} else {'Collapsed'})
        if ($visible) {
            [Windows.Controls.Canvas]::SetLeft($entry.Shape,$x-14.5)
            if ($entry.Hold) {
                $length=[Math]::Max(0,$tailX-$x)
                $entry.Tail.Width=$length
                $entry.Tail.Opacity=$(if ($held) {1} else {0.78})
                [Windows.Controls.Canvas]::SetLeft($entry.Cap,12+$length)
            }
        }
    }
    $ready=[double](Get-Property $State.chart 'introMs' 2500)-$Elapsed
    $script:ui.Countdown.Text=$(if ($ready -le 0) {''} elseif ($ready -lt 500) {'GO!'} else {[string][Math]::Ceiling($ready/1000)})
    $script:ui.SongProgress.Value=[Math]::Min(100,[Math]::Max(0,100*$Elapsed/[double]$State.chart.durationMs))
}
function Set-SourceTitles($Control,$Sources) {
    $titles=@($Sources | Where-Object {$null -ne $_ -and $_.title} | ForEach-Object {[string]$_.title})
    $Control.Text=$(if ($titles.Count) {'来源：'+($titles -join ' · ')} else {''})
    $Control.Visibility=$(if ($titles.Count) {'Visible'} else {'Collapsed'})
}
function Render-Quiz($State) {
    $subject=@($State.subjects | Where-Object {$_.id -eq $State.subject} | Select-Object -First 1)
    $name=$(if ($subject.Count) {$subject[0].label} else {'知识挑战'})
    $script:ui.QuestionLabel.Text="$name  ·  第 $([Math]::Min(3,[int]$State.questionIndex+1)) / 3 题  ·  答错 $($State.wrong) / 2"
    if ($State.answerFeedback) {
        $prefix=$(if ($State.answerFeedback.correct) {'✓ 上一题答对了。'} else {'× 上一题答错了。'})
        $script:ui.AnswerFeedback.Text="$prefix $($State.answerFeedback.explanation)"
    } else { $script:ui.AnswerFeedback.Text='' }
    Set-SourceTitles $script:ui.AnswerSources (Get-Property $State.answerFeedback 'sources' @())
    if (-not $State.question -or $script:QuestionId -eq $State.question.id) { return }
    $script:QuestionId=$State.question.id
    $script:ui.QuizPanel.ScrollToTop()
    $script:PendingAnswer=$false
    $script:ui.QuestionPrompt.Text=$State.question.prompt
    Set-SourceTitles $script:ui.QuestionSources (Get-Property $State.question 'sources' @())
    $script:ui.AnswerPanel.Children.Clear()
    for ($i=0;$i -lt $State.question.options.Count;$i++) {
        $button=[Windows.Controls.Button]::new()
        $text=[Windows.Controls.TextBlock]::new()
        $text.Text="$([char](65+$i))   $($State.question.options[$i])"; $text.TextWrapping='Wrap'; $text.LineHeight=18
        $button.Content=$text; $button.HorizontalContentAlignment='Left'; $button.Margin=[Windows.Thickness]::new(0,0,0,6); $button.Tag=$i
        $button.Add_Click({
            param($sender,$eventArgs)
            if ($script:PendingAnswer -or -not $script:State.question) { return }
            $script:PendingAnswer=$true
            foreach ($option in $script:ui.AnswerPanel.Children) {$option.IsEnabled=$false}
            Send-Action @{action='answer';questionId=$script:State.question.id;answerIndex=[int]$sender.Tag}
        })
        [void]$script:ui.AnswerPanel.Children.Add($button)
    }
}
function Accept-State($Next,[long]$StartedAt) {
    if ((Get-Property $Next 'client' '') -eq 'native-controller') {Accept-Controller $Next;return}
    if (-not $Next.status) {return}
    if ($script:State -and $Next.id -eq $script:State.id) {
        $revision=Get-Property $Next 'revision'
        $currentRevision=Get-Property $script:State 'revision'
        if ($null -ne $revision -and $null -ne $currentRevision) {
            if ([long]$revision -le [long]$currentRevision) {return}
        } elseif ([long]$Next.serverNow -lt [long]$script:State.serverNow) {return}
    }
    if ($Next.serverNow) {
        $offset=[double]$Next.serverNow-(($StartedAt+(Get-Now))/2.0)
        $script:ServerOffset=$(if ($script:State) {0.8*$script:ServerOffset+0.2*$offset} else {$offset})
    }
    $previous=$script:State
    $script:State=$Next
    if ($script:FeedbackChallengeId -ne [string]$Next.id) {Reset-Impact ([string]$Next.id)}
    $script:ui.ConnectionHint.Visibility='Collapsed'
    $newFeedback=Consume-Feedback $Next
    if ($Next.status -in @('passed','failed','exited','cancelled')) {
        foreach ($entry in $script:NoteViews.Values) {$entry.Shape.Visibility='Collapsed'}
        $firstTerminal=$script:TerminalIds.Add([string]$Next.id)
        if ($firstTerminal -and $newFeedback -gt 0 -and $script:Enabled -and $Next.status -in @('passed','failed') -and $script:ui.RhythmPanel.Visibility -eq 'Visible') {
            $script:TerminalHideAt=(Get-Now)+440
            Write-Startup "terminal-hide-scheduled game=$($Next.id) delayMs=440"
        }
        if (-not $script:Enabled -or $Next.status -in @('exited','cancelled') -or $script:TerminalHideAt -le (Get-Now)) {Hide-Challenge}
        $nextUrl=[string](Get-Property $Next 'nextUrl' '')
        if (-not $script:ControllerToken -and $nextUrl -and $nextUrl -ne "$($script:Base)/?token=$($script:Token)") {Queue-Endpoint $nextUrl}
        return
    }
    if (-not $script:Enabled) {Hide-Challenge;return}
    if ($script:TerminalIds.Contains([string]$Next.id)) {if ($script:TerminalHideAt -le (Get-Now)) {Hide-Challenge};return}
    switch ($Next.status) {
        'choose' {
            Set-View 'Choose'
            if ($script:SubjectsForId -ne $Next.id) {
                $script:SubjectsForId=$Next.id
                $script:ui.SubjectPanel.Visibility='Collapsed'
                $script:ui.SubjectPanel.Children.Clear()
                foreach ($subject in $Next.subjects) {
                    $button=[Windows.Controls.Button]::new()
                    $button.Content=$subject.label; $button.Tag=$subject.id; $button.Padding=[Windows.Thickness]::new(13,8,13,8)
                    $button.Add_Click({param($sender,$eventArgs) Send-Action @{action='start-quiz';subject=[string]$sender.Tag}})
                    [void]$script:ui.SubjectPanel.Children.Add($button)
                }
            }
        }
        'rhythm' {
            Set-View 'Rhythm'
            $rate=[Math]::Round([double]$Next.missRate*100,1)
            $combo=[int](Get-Property $Next 'combo' 0)
            $script:ui.RhythmStats.Text="HIT $($Next.hits)   MISS $($Next.misses)   $rate%   ·   COMBO $combo"
            if ($script:ChartId -ne $Next.id) {Build-Notes $Next}
        }
        'quiz' {Set-View 'Quiz';Render-Quiz $Next}
        default {Hide-Challenge;return}
    }
    Show-Challenge
    $nextUrl=[string](Get-Property $Next 'nextUrl' '')
    if (-not $script:ControllerToken -and $nextUrl -and $nextUrl -ne "$($script:Base)/?token=$($script:Token)") {Queue-Endpoint $nextUrl}
}
function Input-Down([int]$Lane,[string]$Source) {
    if (-not $script:Enabled -or -not $script:State -or $script:State.status -ne 'rhythm') {return}
    $sources=$script:LaneSources[$Lane]
    $wasEmpty=$sources.Count -eq 0
    if ($sources.Add($Source) -and $wasEmpty) {Animate-Press $Lane;Send-Action @{action='press';lane=$Lane}}
}
function Input-Up([int]$Lane,[string]$Source) {
    $sources=$script:LaneSources[$Lane]
    if ($sources.Remove($Source) -and $sources.Count -eq 0 -and $script:State -and $script:State.status -eq 'rhythm') {Send-Action @{action='release';lane=$Lane}}
}
function Release-AllInputs {
    $hadInput=$script:LaneSources[0].Count -gt 0 -or $script:LaneSources[1].Count -gt 0
    foreach ($sources in $script:LaneSources) {$sources.Clear()}
    if ($hadInput -and $script:State -and $script:State.status -eq 'rhythm') {
        # Release both lanes together on focus loss, including any server-held
        # state whose individual key-up event Windows could not deliver.
        Send-Action @{action='release';lane=0}
        Send-Action @{action='release';lane=1}
    }
}
function Should-PollGame {
    if (-not $script:Token -or ($script:ControllerToken -and -not $script:Enabled)) {return $false}
    if ($script:State -and $script:State.status -in @('failed','exited','cancelled')) {return $false}
    if ($script:State -and $script:State.status -eq 'passed' -and (Get-Property $script:State 'activity' '') -eq 'finished') {return $false}
    return $true
}

$script:ui.PluginToggle.Add_Checked({if (-not $script:UpdatingToggle) {Send-ControllerAction $true}})
$script:ui.PluginToggle.Add_Unchecked({if (-not $script:UpdatingToggle) {Send-ControllerAction $false}})
$script:ui.RhythmButton.Add_Click({Send-Action @{action='start-rhythm'}})
$script:ui.QuizButton.Add_Click({$script:ui.SubjectPanel.Visibility='Visible'})
$script:ui.CloseButton.Add_Click({Exit-Challenge})
$script:ui.CancelButton.Add_Click({Exit-Challenge})
$script:MouseDownHandler={
    param($sender,$eventArgs)
    [void]$sender.Focus()
    Input-Down ([int]$sender.Tag) ('mouse:'+[string]$sender.Tag)
    [void]$sender.CaptureMouse()
    $eventArgs.Handled=$true
}
$script:MouseUpHandler={
    param($sender,$eventArgs)
    Input-Up ([int]$sender.Tag) ('mouse:'+[string]$sender.Tag)
    if ($sender.IsMouseCaptured) {$sender.ReleaseMouseCapture()}
    $eventArgs.Handled=$true
}
foreach ($lane in @(0,1)) {
    $button=$(if ($lane -eq 0) {$script:ui.UpperButton} else {$script:ui.LowerButton})
    $button.Tag=$lane
    $button.Add_PreviewMouseLeftButtonDown($script:MouseDownHandler)
    $button.Add_PreviewMouseLeftButtonUp($script:MouseUpHandler)
    $button.Add_LostMouseCapture({param($sender,$eventArgs) Input-Up ([int]$sender.Tag) ('mouse:'+[string]$sender.Tag)})
}
$script:ui.SoundButton.Add_Click({
    $script:Muted=-not $script:Muted; $script:Player.IsMuted=$script:Muted
    $script:ui.SoundButton.Content=$(if ($script:Muted) {'声音：关'} else {'声音：开'})
})
$script:KeyHandler={
    param($sender,$eventArgs)
    if ($eventArgs.IsRepeat) {return}
    if ($eventArgs.Key -in @('D','J')) {Input-Down 0 ('key:'+[string]$eventArgs.Key);$eventArgs.Handled=$true}
    elseif ($eventArgs.Key -in @('F','K')) {Input-Down 1 ('key:'+[string]$eventArgs.Key);$eventArgs.Handled=$true}
    elseif ($eventArgs.Key -eq 'Escape') {Exit-Challenge;$eventArgs.Handled=$true}
}
$script:Dialog.Add_PreviewKeyDown($script:KeyHandler)
$script:KeyUpHandler={
    param($sender,$eventArgs)
    if ($eventArgs.Key -in @('D','J')) {Input-Up 0 ('key:'+[string]$eventArgs.Key);$eventArgs.Handled=$true}
    elseif ($eventArgs.Key -in @('F','K')) {Input-Up 1 ('key:'+[string]$eventArgs.Key);$eventArgs.Handled=$true}
}
$script:Dialog.Add_PreviewKeyUp($script:KeyUpHandler)
$script:Dialog.Add_Deactivated({Release-AllInputs})
$script:Dialog.Add_SizeChanged({Keep-ChallengeOnScreen})
$script:Dialog.Add_Closing({
    param($sender,$eventArgs)
    if (-not $script:Closing) {$eventArgs.Cancel=$true;Exit-Challenge}
})
$script:Player.Add_MediaOpened({
    if ($script:Enabled -and $script:State -and $script:State.status -eq 'rhythm' -and $script:CurrentAudioId -eq [string]$script:State.id) {
        $elapsed=[Math]::Max(0,(Get-Now)+$script:ServerOffset-[double]$script:State.startAt)
        $script:Player.Position=[TimeSpan]::FromMilliseconds($elapsed);$script:Player.Play()
    }
})
$script:Timer=[Windows.Threading.DispatcherTimer]::new()
$script:Timer.Interval=[TimeSpan]::FromMilliseconds(16)
$script:Timer.Add_Tick({
    try {
        $now=Get-Now
        for ($i=$script:Requests.Count-1;$i -ge 0;$i--) {
            $request=$script:Requests[$i]
            if (-not $request.Work.IsCompleted) {continue}
            $script:Requests.RemoveAt($i)
            if ($request -eq $script:PollRequest) {$script:PollRequest=$null}
            if ($request -eq $script:ControllerRequest) {$script:ControllerRequest=$null}
            try {
                $next=ConvertFrom-Json -InputObject ($request.Work.GetAwaiter().GetResult())
                if ($request.IsController -or (Get-Property $next 'client' '') -eq 'native-controller') {
                    if (-not $script:ControllerToken -or $request.RequestToken -eq $script:ControllerToken) {Accept-Controller $next $request.IsAction}
                }
                elseif ($request.RequestToken -eq $script:Token) {Accept-State $next $request.StartedAt}
            } catch {
                if ($request.IsController -and $request.IsAction) {$script:ControllerChanging=$false;$script:ui.PluginToggle.IsEnabled=$true}
                if ($request.IsAction -and $script:PendingAnswer) {$script:PendingAnswer=$false;foreach ($option in $script:ui.AnswerPanel.Children) {$option.IsEnabled=$true}}
                Show-Connection '暂时无法连接 Harness，正在重连…'
            }
        }
        if ($InboxPath -and $now-$script:LastInboxCheck -gt 600) {
            $script:LastInboxCheck=$now
            if (Test-Path -LiteralPath $InboxPath) {
                $inbox=[IO.File]::ReadAllText($InboxPath).Trim()
                if ($inbox -and $inbox -ne $script:LastInboxText) {
                    $script:LastInboxText=$inbox
                    try {$entry=ConvertFrom-Json $inbox;$address=[string]$entry.url} catch {$address=$inbox}
                    if ($address -and $address -ne "$($script:Base)/?token=$($script:Token)") {Queue-Endpoint $address}
                }
            }
        }
        if ($script:ControllerToken -and -not $script:ControllerRequest -and $now-$script:LastControllerPoll -gt 300) {
            $script:LastControllerPoll=$now
            $address="$($script:ControllerBase)/api/state?token=$([Uri]::EscapeDataString($script:ControllerToken))"
            $script:ControllerRequest=[ArcadeNative]::Get($address)
            $script:ControllerRequest.IsController=$true; $script:ControllerRequest.RequestToken=$script:ControllerToken
            $script:Requests.Add($script:ControllerRequest)
        }
        # Keep the current challenge alive while Harness generates after a pass.
        if ((Should-PollGame) -and -not $script:PollRequest -and $now-$script:LastPoll -gt 100) {
            $script:LastPoll=$now
            $script:PollRequest=[ArcadeNative]::Get((Get-Endpoint '/api/state'))
            $script:PollRequest.RequestToken=$script:Token; $script:Requests.Add($script:PollRequest)
        }
        if ($script:AudioTask -and $script:AudioTask.IsCompleted) {
            $audioId=$script:AudioTaskId
            try {
                $path=$script:AudioTask.GetAwaiter().GetResult();$script:AudioPaths.Add($path)
                if ($script:Enabled -and $script:State -and $script:State.status -eq 'rhythm' -and $audioId -eq [string]$script:State.id) {
                    $script:CurrentAudioPath=$path;$script:CurrentAudioId=$audioId
                    $script:Player.Open([Uri]::new($path))
                }
            } catch {Show-Connection '当前系统无法播放声音，可继续按视觉节奏挑战。'}
            $script:AudioTask=$null
            $script:AudioTaskId=$null
        }
        Remove-UnusedAudio
        if ($script:Enabled -and $script:State -and $script:State.status -eq 'rhythm' -and $script:State.chart) {
            $elapsed=$now+$script:ServerOffset-[double]$script:State.startAt
            Update-Notes $script:State $elapsed
        }
        Update-Impact $now
    } catch {Show-Connection "挑战同步异常：$($_.Exception.Message)"}
})
$script:Window.Add_Closing({
    $script:Closing=$true
    $script:Timer.Stop()
    if ($script:ControllerToken -and $script:Enabled) {Send-ControllerAction $false}
    elseif ($script:Token -and $script:State.status -notin @('failed','exited','cancelled')) {Send-Action @{action='exit'}}
    $script:Player.Close()
    $script:Dialog.Close()
})
$script:Window.Add_Closed({[Windows.Threading.Dispatcher]::CurrentDispatcher.BeginInvokeShutdown([Windows.Threading.DispatcherPriority]::Background)})
Write-Startup 'handlers-wired'

$area=[Windows.SystemParameters]::WorkArea
$script:Window.Left=$area.Right-$script:Window.Width-14
$script:Window.Top=$area.Bottom-$script:Window.Height-10
if ($InspectWindow) {$script:Window.ShowInTaskbar=$true;$script:Dialog.ShowInTaskbar=$true}

function Export-NativeControl($Control,[string]$Path,[double]$FixedWidth=0) {
    $measureWidth=$(if ($FixedWidth -gt 0) {$FixedWidth} else {1000})
    $Control.Measure([Windows.Size]::new($measureWidth,1200))
    $width=$(if ($FixedWidth -gt 0) {$FixedWidth} else {$Control.DesiredSize.Width})
    $height=$Control.DesiredSize.Height
    $Control.Arrange([Windows.Rect]::new(0,0,$width,$height));$Control.UpdateLayout()
    $visual=[Windows.Media.DrawingVisual]::new();$context=$visual.RenderOpen()
    try {$context.DrawRectangle([Windows.Media.VisualBrush]::new($Control),$null,[Windows.Rect]::new(12,12,$width,$height))} finally {$context.Close()}
    $bitmap=[Windows.Media.Imaging.RenderTargetBitmap]::new([int][Math]::Ceiling($width)+24,[int][Math]::Ceiling($height)+24,96,96,[Windows.Media.PixelFormats]::Pbgra32)
    $bitmap.Render($visual)
    $encoder=[Windows.Media.Imaging.PngBitmapEncoder]::new();$encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
    $destination=[IO.Path]::GetFullPath($Path);$stream=[IO.File]::Create($destination)
    try {$encoder.Save($stream)} finally {$stream.Dispose()}
    return $destination
}

if ($Validate) {
    [pscustomobject]@{native='WPF';transparentSwitch=$script:Window.AllowsTransparency;separateDialog=$true;controls=$script:ui.Count;externalAssets=$false} | ConvertTo-Json -Compress
    exit 0
}
if ($SelfTest) {
    $checks=[Collections.Generic.List[string]]::new()
    function Test-Native([bool]$Condition,[string]$Label) {if (-not $Condition) {throw "Native self-test failed: $Label"};$checks.Add($Label)}
    function New-TestState([string]$Status,[string]$Id='native-test') {
        [pscustomobject]@{
            id=$Id;status=$Status;serverNow=(Get-Now);activity='challenge';metrics=[pscustomobject]@{lines=128;complexity=16;level=3}
            subjects=@([pscustomobject]@{id='politics';label='政治'},[pscustomobject]@{id='history';label='历史'},[pscustomobject]@{id='chemistry';label='化学'},[pscustomobject]@{id='physics';label='物理'},[pscustomobject]@{id='math';label='数学'},[pscustomobject]@{id='literature';label='文学'},[pscustomobject]@{id='philosophy';label='哲学'})
            subject='math';hits=0;misses=0;totalNotes=2;missRate=0;judgements=[pscustomobject]@{};startAt=(Get-Now)
            chart=[pscustomobject]@{bpm=120;durationMs=5000;notes=@([pscustomobject]@{id='n1';lane=0;timeMs=2500},[pscustomobject]@{id='n2';lane=1;timeMs=3000})}
            question=[pscustomobject]@{id='q1';prompt='2 + 3 = ?';options=@('4','5','6','7')};questionIndex=0;wrong=0;correct=0;answerFeedback=$null;nextUrl=$null
            feedback=@();combo=0;perfectHits=0;goodHits=0;perfectWindowMs=50
        }
    }
    Test-Native (-not $script:ui.PluginToggle.IsChecked -and -not $script:DialogRequestedVisible -and $script:Window.Width -lt 160) 'idle-only-small-unchecked-switch'
    Test-Native (-not $script:ui.PluginToggle.IsEnabled) 'switch-waits-for-first-controller-response'
    Test-Native ($script:Window -ne $script:Dialog -and $script:Dialog.SizeToContent -eq 'Height') 'separate-auto-height-dialog'
    $secondaryArea=Convert-WorkArea ([int[]]@(-1600,-900,0,0)) ([Windows.Media.Matrix]::new(0.8,0,0,0.8,0,0))
    Test-Native ($secondaryArea.Left -eq -1280 -and $secondaryArea.Top -eq -720 -and $secondaryArea.Width -eq 1280 -and $secondaryArea.Height -eq 720) 'monitor-work-area-converts-negative-origin-and-125-percent-dpi'
    Test-Native ($script:ui.DialogTitle.Text -eq '选择挑战' -and $script:ui.ChoicePrompt.Text -eq '杂鱼，接受挑战吧！') 'exact-choice-title-and-prompt'
    Test-Native ($script:ui.RhythmButton.Content -eq '玩音游' -and $script:ui.QuizButton.Content -eq '做题') 'exact-main-buttons'
    Test-Native (-not $script:Dialog.FindName('Cat') -and -not $script:Dialog.FindName('CodeBubbles')) 'no-pet-or-code-bubbles'
    $script:Base='http://127.0.0.1:12345';$script:Token='controller1234567890'
    Accept-Controller ([pscustomobject]@{enabled=$false;currentUrl=$null})
    Test-Native ($script:ControllerToken -eq 'controller1234567890' -and -not $script:Token -and $script:ui.PluginToggle.IsEnabled) 'controller-endpoint-retained-and-switch-enabled'
    $controllerTime=Get-Now
    Accept-Controller ([pscustomobject]@{enabled=$true;currentUrl=$null;serverNow=$controllerTime;revision=8})
    Accept-Controller ([pscustomobject]@{enabled=$false;currentUrl=$null;serverNow=$controllerTime;revision=7})
    Test-Native ($script:Enabled -and $script:LastControllerRevision -eq 8) 'controller-same-millisecond-old-revision-cannot-disable'
    Set-Toggle $false
    $script:Enabled=$false
    $script:ui.PluginToggle.IsChecked=$true
    Test-Native ($script:TestActions[-1].enabled -and -not $script:DialogRequestedVisible) 'enable-without-task-no-dialog'
    Accept-Controller ([pscustomobject]@{enabled=$true;currentUrl='http://127.0.0.1:12345/?token=challenge1234567890'})
    Accept-State (New-TestState 'choose') (Get-Now)
    Test-Native ($script:DialogRequestedVisible -and $script:ui.SubjectPanel.Visibility -eq 'Collapsed') 'real-choose-opens-dialog-with-subjects-hidden'
    $script:ui.QuizButton.RaiseEvent([Windows.RoutedEventArgs]::new([Windows.Controls.Button]::ClickEvent))
    Test-Native ($script:ui.SubjectPanel.Visibility -eq 'Visible' -and $script:ui.SubjectPanel.Children.Count -eq 7) 'quiz-button-reveals-seven-subjects'
    $script:ui.SubjectPanel.Children[4].RaiseEvent([Windows.RoutedEventArgs]::new([Windows.Controls.Button]::ClickEvent))
    Test-Native ($script:TestActions[-1].subject -eq 'math') 'subject-button-tag'
    $script:ui.RhythmButton.RaiseEvent([Windows.RoutedEventArgs]::new([Windows.Controls.Button]::ClickEvent))
    Test-Native ($script:TestActions[-1].action -eq 'start-rhythm') 'rhythm-start-action'
    Accept-State (New-TestState 'rhythm') (Get-Now)
    Test-Native ($script:ui.RhythmPanel.Visibility -eq 'Visible' -and $script:NoteViews.Count -eq 2) 'two-lane-rhythm-view'
    Test-Native ($script:ui.DialogSurface.Background.Color.A -eq 0 -and $script:ui.Arena.Background.Color.A -eq 0 -and $script:Dialog.Opacity -eq 1) 'rhythm-background-alpha-zero-window-opaque'
    $script:ui.Arena.Measure([Windows.Size]::new(505,150));$script:ui.Arena.Arrange([Windows.Rect]::new(0,0,505,150));$script:ui.Arena.UpdateLayout()
    $transparentBitmap=[Windows.Media.Imaging.RenderTargetBitmap]::new(505,150,96,96,[Windows.Media.PixelFormats]::Pbgra32)
    $transparentBitmap.Render($script:ui.Arena);$pixel=[byte[]]::new(4)
    $transparentBitmap.CopyPixels([Windows.Int32Rect]::new(20,15,1,1),$pixel,4,0)
    Test-Native ($pixel[3] -eq 0) 'rhythm-render-real-transparent-pixel'
    $before=$script:TestActions.Count
    foreach ($key in @('D','J','F','K')) {
        $event=[pscustomobject]@{Key=$key;IsRepeat=$false;Handled=$false};& $script:KeyHandler $null $event
        Test-Native ($event.Handled -and $script:TestActions[-1].action -eq 'press' -and $script:TestActions[-1].lane -eq $(if ($key -in @('D','J')) {0} else {1})) "key-$key"
        & $script:KeyUpHandler $null ([pscustomobject]@{Key=$key;Handled=$false})
        Test-Native ($script:TestActions[-1].action -eq 'release') "key-$key-release"
    }
    & $script:KeyHandler $null ([pscustomobject]@{Key='D';IsRepeat=$true;Handled=$false})
    Test-Native ($script:TestActions.Count -eq $before+8) 'key-repeat-ignored'
    $before=$script:TestActions.Count
    foreach ($key in @('D','F')) {& $script:KeyHandler $null ([pscustomobject]@{Key=$key;IsRepeat=$false;Handled=$false})}
    Test-Native ($script:TestActions.Count -eq $before+2 -and $script:TestActions[-2].lane -eq 0 -and $script:TestActions[-1].lane -eq 1) 'df-chord-keeps-both-lane-presses'
    Release-AllInputs
    Test-Native ($script:TestActions[-2].action -eq 'release' -and $script:TestActions[-2].lane -eq 0 -and $script:TestActions[-1].lane -eq 1 -and $script:LaneSources[0].Count -eq 0 -and $script:LaneSources[1].Count -eq 0) 'focus-loss-clears-keys-releases-both-lanes'
    $before=$script:TestActions.Count
    Input-Down 0 'key:D';Input-Down 0 'key:J';Input-Down 0 'key:D'
    Input-Up 0 'key:D'
    Test-Native ($script:TestActions.Count -eq $before+1 -and $script:LaneSources[0].Count -eq 1) 'same-lane-alias-and-repeat-keep-hold'
    Input-Down 0 'mouse:0';Input-Up 0 'key:J'
    Test-Native ($script:TestActions.Count -eq $before+1) 'mouse-keyboard-share-lane-hold'
    Input-Up 0 'mouse:0'
    Test-Native ($script:TestActions.Count -eq $before+2 -and $script:TestActions[-1].action -eq 'release') 'last-input-source-releases-hold'
    $newer=New-TestState 'rhythm' 'revision-order';$newer | Add-Member revision 8
    $older=New-TestState 'rhythm' 'revision-order';$older | Add-Member revision 7;$older.serverNow=$newer.serverNow
    Accept-State $newer (Get-Now);Accept-State $older (Get-Now)
    Test-Native ($script:State.revision -eq 8) 'same-millisecond-old-revision-cannot-rewind'
    $poll=New-TestState 'rhythm' 'feedback-response-order';$poll | Add-Member revision 3
    $poll.feedback=@([pscustomobject]@{id=1;grade='perfect';lane=0;combo=1},[pscustomobject]@{id=2;grade='good';lane=1;combo=2})
    $action=New-TestState 'rhythm' 'feedback-response-order';$action | Add-Member revision 2
    $action.feedback=@($poll.feedback[0]);$action.serverNow=$poll.serverNow
    $before=$script:FeedbackDispatchCount
    Accept-State $poll (Get-Now);Accept-State $action (Get-Now)
    Test-Native ($script:State.revision -eq 3 -and $script:LastFeedbackId -eq 2 -and $script:FeedbackDispatchCount -eq $before+2 -and $script:ui.ImpactCombo.Text -eq 'COMBO 2') 'newer-poll-consumes-both-lanes-before-old-action-rejected'
    $poll.revision=4;Accept-State $poll (Get-Now)
    Test-Native ($script:FeedbackDispatchCount -eq $before+2) 'newer-revision-with-same-feedback-does-not-replay-hits'
    $other=New-TestState 'rhythm' 'revision-new-game';$other | Add-Member revision 1
    Accept-State $other (Get-Now)
    Test-Native ($script:State.id -eq 'revision-new-game' -and $script:State.revision -eq 1) 'revision-comparison-does-not-cross-games'
    $layout=New-TestState 'rhythm' 'hold-layout'
    $layout.chart | Add-Member scrollSpeed 0.6
    $layout.chart | Add-Member introMs 1600
    $layout.chart.notes=@([pscustomobject]@{id='h';lane=0;timeMs=1000;type='hold';durationMs=600;endTimeMs=1600},[pscustomobject]@{id='c0';lane=0;timeMs=2000;type='tap';durationMs=0;endTimeMs=2000;chordId=0},[pscustomobject]@{id='c1';lane=1;timeMs=2000;type='tap';durationMs=0;endTimeMs=2000;chordId=0})
    $layout | Add-Member activeHolds ([pscustomobject]@{})
    Accept-State $layout (Get-Now);Update-Notes $layout 900
    Test-Native ([Math]::Abs([Windows.Controls.Canvas]::GetLeft($script:NoteViews.h.Shape)-139.5) -lt 0.01 -and $script:NoteViews.h.Tail.Width -eq 360) 'chart-scroll-speed-and-long-tail'
    Test-Native ($script:NoteViews.c0.Chord -and $script:NoteViews.c1.Chord -and $script:NoteViews.c0.Head.Child.Text -eq '双') 'chord-id-zero-has-distinct-heads'
    $layout.activeHolds | Add-Member h ([pscustomobject]@{lane=0;endTimeMs=1600;grade='perfect';offsetMs=0})
    Update-Notes $layout 1300
    Test-Native ([Windows.Controls.Canvas]::GetLeft($script:NoteViews.h.Shape) -eq 79.5 -and $script:NoteViews.h.Tail.Width -eq 180 -and $script:ui.Countdown.Text -eq 'GO!') 'active-hold-pins-head-shrinks-tail-dynamic-intro'
    $layout.judgements | Add-Member h 'perfect';Update-Notes $layout 1600
    Test-Native ($script:NoteViews.h.Shape.Visibility -eq 'Collapsed') 'final-hold-judgement-hides-note'
    $impactState=New-TestState 'rhythm'
    $impactState.combo=99
    $impactState.feedback=@([pscustomobject]@{id=1;grade='perfect';lane=0;combo=1;source='hit'},[pscustomobject]@{id=2;grade='good';lane=1;combo=2;source='hit'},[pscustomobject]@{id=3;grade='miss';lane=0;combo=0;source='timeout'})
    $before=$script:FeedbackDispatchCount
    Accept-State $impactState (Get-Now)
    Test-Native ($script:FeedbackDispatchCount -eq $before+3 -and $script:ui.ImpactGrade.Text -eq 'MISS' -and $script:ui.ImpactCombo.Text -eq 'COMBO 0') 'authoritative-three-grades-per-event-combo'
    Accept-State $impactState (Get-Now)
    Test-Native ($script:FeedbackDispatchCount -eq $before+3) 'feedback-repoll-deduplicated'
    $quizState=New-TestState 'quiz'
    $quizState.question | Add-Member sources @([pscustomobject]@{title='原始文献甲';url='https://example.invalid/a'})
    $quizState.answerFeedback=[pscustomobject]@{correct=$true;explanation='这是解释';sources=@([pscustomobject]@{title='原始文献乙';url='https://example.invalid/b'})}
    Accept-State $quizState (Get-Now)
    Test-Native ($script:ui.DialogSurface.Background.Color.A -eq 255 -and $script:ui.DialogHeader.Visibility -eq 'Visible') 'quiz-restores-opaque-surface'
    Test-Native ($script:ui.QuestionSources.Text -eq '来源：原始文献甲' -and $script:ui.AnswerSources.Text -eq '来源：原始文献乙') 'quiz-and-feedback-show-source-titles'
    Test-Native ($script:ui.QuizPanel -is [Windows.Controls.ScrollViewer] -and $script:ui.QuizPanel.MaxHeight -le [Windows.SystemParameters]::WorkArea.Height-180) 'quiz-scrolls-with-exit-outside-viewport'
    $script:ui.AnswerPanel.Children[1].RaiseEvent([Windows.RoutedEventArgs]::new([Windows.Controls.Button]::ClickEvent))
    Test-Native ($script:TestActions[-1].answerIndex -eq 1 -and $script:PendingAnswer) 'quiz-answer-index'
    $before=$script:TestActions.Count
    $script:ui.AnswerPanel.Children[1].RaiseEvent([Windows.RoutedEventArgs]::new([Windows.Controls.Button]::ClickEvent))
    Test-Native ($script:TestActions.Count -eq $before) 'quiz-double-submit-blocked'
    $next=New-TestState 'quiz';$next.question.id='q2';Accept-State $next (Get-Now)
    Test-Native (-not $script:PendingAnswer -and $script:ui.AnswerPanel.Children[0].IsEnabled) 'next-question-unlocked'
    Accept-State (New-TestState 'rhythm' 'terminal-impact') (Get-Now)
    $oldToken=$script:Token
    Queue-Endpoint 'http://127.0.0.1:12345/?token=successor1234567890'
    Test-Native ($script:Token -eq $oldToken -and $script:PendingEndpointUrl) 'successor-waits-for-old-rhythm-terminal'
    Test-Native ($script:PendingEndpointDeadline-(Get-Now) -gt [ArcadeNative]::RequestTimeoutMilliseconds) 'successor-wait-covers-full-http-timeout'
    $last=New-TestState 'passed' 'terminal-impact';$last.activity='generating'
    $last.feedback=@([pscustomobject]@{id=1;grade='perfect';lane=0;combo=1;source='hit'})
    Accept-State $last (Get-Now)
    $deadline=$script:TerminalHideAt;$dispatched=$script:FeedbackDispatchCount
    Accept-State $last (Get-Now)
    Test-Native ($deadline -gt (Get-Now) -and $script:TerminalHideAt -eq $deadline -and $script:DialogRequestedVisible -and $script:FeedbackDispatchCount -eq $dispatched) 'terminal-feedback-hold-not-extended-by-repoll'
    Update-Impact ($deadline+1)
    Test-Native (-not $script:DialogRequestedVisible -and $script:Token -eq 'successor1234567890' -and $script:ImpactEffects.Count -eq 0) 'terminal-hold-finishes-then-switches-successor'
    Accept-State (New-TestState 'rhythm' 'unresponsive-old') (Get-Now)
    Queue-Endpoint 'http://127.0.0.1:12345/?token=boundednext1234567890'
    Update-Impact ($script:PendingEndpointDeadline+1)
    Test-Native ($script:Token -eq 'boundednext1234567890' -and -not $script:PendingEndpointUrl) 'unresponsive-old-handoff-has-bounded-fallback'
    Accept-State (New-TestState 'rhythm' 'cancel-impact') (Get-Now)
    $cancelLast=New-TestState 'failed' 'cancel-impact';$cancelLast.feedback=@([pscustomobject]@{id=1;grade='miss';lane=1;combo=0;source='timeout'})
    Accept-State $cancelLast (Get-Now);Exit-Challenge
    Test-Native (-not $script:DialogRequestedVisible -and $script:TerminalHideAt -eq 0) 'user-cancel-bypasses-feedback-hold'
    $script:Enabled=$true;Set-Toggle $true
    $before=$script:TestActions.Count
    Accept-State (New-TestState 'passed') (Get-Now)
    Test-Native (-not $script:DialogRequestedVisible -and $script:Enabled -and (Should-PollGame) -and $script:TestActions.Count -eq $before) 'pass-hides-without-exit-keeps-generation-heartbeat'
    $script:State.activity='finished'
    Test-Native (-not (Should-PollGame) -and $script:ControllerToken) 'finished-stops-game-poll-keeps-controller'
    Accept-State (New-TestState 'choose') (Get-Now)
    Test-Native (-not $script:DialogRequestedVisible) 'terminal-id-does-not-reopen'
    foreach ($status in @('failed','exited','cancelled')) {
        Accept-State (New-TestState 'choose' "test-$status") (Get-Now)
        Accept-State (New-TestState $status "test-$status") (Get-Now)
        Test-Native (-not $script:DialogRequestedVisible) "$status-hides-dialog"
    }
    Accept-State (New-TestState 'choose' 'cancel-choice') (Get-Now)
    $script:ui.CancelButton.RaiseEvent([Windows.RoutedEventArgs]::new([Windows.Controls.Button]::ClickEvent))
    Test-Native (-not $script:DialogRequestedVisible -and -not $script:ui.PluginToggle.IsChecked -and -not $script:Closing -and $script:TestActions[-1].action -eq 'set-enabled') 'cancel-retains-unchecked-switch'
    Accept-State (New-TestState 'choose' 'cancel-choice') (Get-Now)
    Test-Native (-not $script:DialogRequestedVisible) 'late-choose-after-cancel-stays-hidden'
    Accept-Controller ([pscustomobject]@{enabled=$false;currentUrl=$null})
    Test-Native (-not $script:Token -and -not $script:State) 'disabled-controller-clears-challenge'
    $script:ControllerChanging=$true
    Accept-Controller ([pscustomobject]@{enabled=$true;currentUrl='http://127.0.0.1:12345/?token=challenge1234567890'})
    Test-Native (-not $script:Enabled) 'pending-controller-action-ignores-old-poll'
    $audio=[ArcadeNative]::RenderAudio(2200,120.25,[int[]]@(1600,1900),[int[]]@(0,1),16,1600).GetAwaiter().GetResult()
    try {Test-Native ([Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($audio),0,4) -eq 'RIFF') 'original-pcm-wave'} finally {[IO.File]::Delete($audio)}
    $retiredPath=[IO.Path]::GetTempFileName()
    $retiredJob=[Threading.Tasks.TaskCompletionSource[string]]::new()
    $script:AudioTask=$retiredJob.Task;$script:AudioTaskId='obsolete-audio'
    Retire-AudioTask
    Test-Native (-not $script:AudioTask -and -not $script:AudioTaskId) 'retired-audio-detached-from-current-game'
    try {
        $retiredJob.SetResult($retiredPath)
        $script:AudioCleanupTasks[-1].GetAwaiter().GetResult()
        Test-Native (-not [IO.File]::Exists($retiredPath)) 'retired-audio-late-result-deleted'
    } finally {if ([IO.File]::Exists($retiredPath)) {[IO.File]::Delete($retiredPath)}}
    Remove-UnusedAudio
    Test-Native ($script:AudioCleanupTasks.Count -eq 0) 'completed-audio-cleanup-tasks-pruned'
    $ownedAudio=[IO.Path]::GetTempFileName();$script:AudioPaths.Add($ownedAudio)
    $script:CurrentAudioPath=$ownedAudio;$script:CurrentAudioId='completed-song'
    Hide-Challenge
    Test-Native (-not [IO.File]::Exists($ownedAudio) -and $script:AudioPaths.Count -eq 0 -and -not $script:CurrentAudioPath -and -not $script:CurrentAudioId) 'hide-closes-and-deletes-completed-song'
    [pscustomobject]@{passed=$checks.Count;checks=$checks;native='WPF';separateDialog=$true} | ConvertTo-Json -Compress
    exit 0
}
if ($Preview -or $PreviewChallenge -or $PreviewRhythm -or $PreviewQuiz -or $RenderPreview) {$script:ui.PluginToggle.IsEnabled=$true}
if ($PreviewChallenge) {Set-View 'Choose'}
if ($PreviewQuiz) {
    $script:Enabled=$true;Set-Toggle $true
    $quizPreview=ConvertFrom-Json ([IO.File]::ReadAllText($PreviewQuiz))
    Accept-State $quizPreview (Get-Now)
}
if ($PreviewRhythm) {
    $script:Enabled=$true;Set-Toggle $true
    $previewState=[pscustomobject]@{
        id='rhythm-preview';status='rhythm';serverNow=(Get-Now);activity='challenge'
        metrics=[pscustomobject]@{lines=128;complexity=16;level=3}
        hits=12;misses=0;totalNotes=24;missRate=0;combo=12;perfectHits=8;goodHits=4
        judgements=[pscustomobject]@{};startAt=(Get-Now)
        chart=[pscustomobject]@{bpm=168.25;durationMs=16000;scrollSpeed=0.6;introMs=1600;notes=@(
            [pscustomobject]@{id='p1';lane=0;timeMs=400;type='hold';durationMs=160;endTimeMs=560},[pscustomobject]@{id='p2';lane=0;timeMs=610;type='tap';durationMs=0;endTimeMs=610;chordId=0},[pscustomobject]@{id='p3';lane=1;timeMs=610;type='tap';durationMs=0;endTimeMs=610;chordId=0})}
        feedback=@([pscustomobject]@{id=1;grade='perfect';lane=0;combo=12;source='hit'});nextUrl=$null
    }
    Accept-State $previewState (Get-Now)
    Update-Notes $previewState 0
    $script:ui.Countdown.Text=''
    # Freeze only this exported feedback frame. The live client uses the animations above.
    if ($RenderPreview) {
        $script:ui.ImpactBadge.BeginAnimation([Windows.UIElement]::OpacityProperty,$null)
        $script:ui.ImpactBadge.Opacity=1;$script:ui.ImpactBadge.RenderTransform=$null
    }
}
if ($RenderPreview) {
    if ($PreviewRhythm) {Export-NativeControl $script:ui.DialogSurface $RenderPreview 555}
    elseif ($PreviewChallenge -or $PreviewQuiz) {Export-NativeControl $script:ui.DialogSurface $RenderPreview 460}
    else {Export-NativeControl $script:ui.PluginSwitch $RenderPreview}
    exit 0
}
if ($Url) {Set-Endpoint $Url}
elseif (-not $Preview -and -not $PreviewChallenge -and -not $PreviewRhythm -and -not $PreviewQuiz) {throw 'Use -Url <local controller URL>, -PreviewChallenge or -PreviewRhythm.'}
try {
    $script:Timer.Start();$script:Window.Show()
    if ($PreviewChallenge -or $PreviewRhythm -or $PreviewQuiz) {$script:Dialog.Show()}
    Write-Startup "show-after switchVisible=$($script:Window.IsVisible) dialogVisible=$($script:Dialog.IsVisible)"
    [Windows.Threading.Dispatcher]::Run()
} finally {
    $script:Timer.Stop();$script:Player.Close()
    Retire-AudioTask
    foreach ($request in $script:Requests) {if ($request.IsAction -and -not $request.Work.IsCompleted) {try {[void]$request.Work.Wait(350)} catch {}}}
    if ($script:AudioCleanupTasks.Count) {try {[void][Threading.Tasks.Task]::WhenAll($script:AudioCleanupTasks.ToArray()).Wait([ArcadeNative]::RequestTimeoutMilliseconds)} catch {}}
    foreach ($path in $script:AudioPaths) {try {[IO.File]::Delete($path)} catch {}}
}
