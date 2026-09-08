# Windows.Media.SpeechRecognition dictation — the Windows counterpart of native/speak.swift.
#
# WHY THIS EXISTS. Speak-to-translate was macOS-only because SFSpeechRecognizer is, so the Windows
# build simply answered "Voice input is macOS-only" — on the platform where nearly every buyer is.
# Windows 10/11 carry a recogniser in the box (the one Voice Typing uses), it runs on-device, and it
# costs nothing. The same argument that got Windows.Media.Ocr written applies here.
#
# WHY POWERSHELL. Same reason as winocr.ps1: Windows ships no compiler, so a compiled helper would
# mean an unsigned prebuilt .exe in the repo, cross-compiled from a Mac. Windows PowerShell 5.1 is on
# every supported Windows and reaches WinRT directly.
#
# MUST RUN UNDER WINDOWS POWERSHELL 5.1 (powershell.exe), NOT PowerShell 7 (pwsh.exe) — the Await
# bridge needs System.Runtime.WindowsRuntime, which is .NET Framework only. Same constraint, same
# reason, as winocr.ps1.
#
# WHAT IS DIFFERENT FROM THE MAC HELPER, deliberately. speak.swift streams {"partial"} lines as you
# talk, because SFSpeechRecognizer hands them over for free. The WinRT equivalent of that is an
# event-driven ContinuousRecognitionSession whose TypedEventHandler generics have to be built by
# reflection in PowerShell — a large amount of fragile code for a nicety. One-shot RecognizeAsync
# gives the same FINAL sentence with an Await and nothing else, and it ends on silence by itself,
# which is the behaviour that actually matters. So: no partials on Windows, and the pill stays on
# "Speak now" until the sentence lands. Pressing the shortcut again kills this process rather than
# sending "stop" — with no partials there is nothing part-said to keep.
#
#   winspeak.ps1 <locale>        e.g. winspeak.ps1 ja-JP   (defaults to en-US)
#
# PROTOCOL — identical to speak.swift, one JSON line per event, then exit:
#   {"state":"ready"}                 mic is live
#   {"final":"the whole sentence"}    what you said
#   {"error":"mic"|"privacy"|"speech"|"recognizer"|"network"} no mic, speech policy not accepted,
#                                     recogniser failure, no language installed, or no connection

$ErrorActionPreference = 'Stop'

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

function Write-Line($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
}

$tag = if ($args.Count -gt 0 -and $args[0]) { $args[0] } else { 'en-US' }

try {
  [Windows.Media.SpeechRecognition.SpeechRecognizer, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
  [Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
  Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
} catch {
  Write-Line @{ error = 'engine' }
  exit 3
}

# WinRT is async-only and PowerShell has no await — same reflection bridge as winocr.ps1.
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and
  $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($operation, $resultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($resultType)
  $task = $asTask.Invoke($null, @($operation))
  $task.Wait(-1) | Out-Null
  $task.Result
}

# An IAsyncAction (no result) — CompileConstraintsAsync returns an operation, but the recogniser's
# own disposal path does not, so keep a separate helper rather than faking a result type.
$recognizer = $null
try {
  $lang = New-Object -TypeName Windows.Globalization.Language -ArgumentList $tag
  $recognizer = New-Object -TypeName Windows.Media.SpeechRecognition.SpeechRecognizer -ArgumentList $lang
} catch {
  # No recogniser data for this language. Windows only carries what the user has added, exactly like
  # the OCR packs — 'recognizer' is the caller's code for that; its 'engine' means "no microphone".
  Write-Line @{ error = 'recognizer' }
  exit 3
}

# The two waits that decide how the phrase ends, matched to speak.swift's numbers so the feel is the
# same on both platforms: 6s of nothing at the start = give up, then quiet after words = done.
#
# End silence was 0.8s and that is far too eager. Apple Dictation cuts off at 30s and is widely
# disliked for exactly this — pausing to think, a mumble the mic misses, a quiet moment while you read
# what you just said — and 0.8s is forty times tighter than the number people already complain about.
# Anyone speaking a language that is not their first pauses longer than that mid-sentence. 2s still
# ends by itself without a keypress, which is the point of the feature, but it stops guillotining
# ordinary speech. Keep this in step with SILENCE_STOP in native/speak.swift. (jek, 2026-08-07)
try {
  $recognizer.Timeouts.InitialSilenceTimeout = [TimeSpan]::FromSeconds(6)
  $recognizer.Timeouts.EndSilenceTimeout = [TimeSpan]::FromSeconds(2)
} catch {}

# Both CompileConstraintsAsync and RecognizeAsync answer with the SAME status enum, and every value
# except Success used to collapse into one of two messages — so a dropped connection came out as
# "No speech pack for this language" (compile) or "Voice input failed - try again" (recognise). Both
# send the user somewhere that cannot help. NetworkFailure and MicrophoneUnavailable are the two the
# enum tells us outright; name them. (jek reported the offline case, 2026-08-07.)
$St = [Windows.Media.SpeechRecognition.SpeechRecognitionResultStatus]
function Status-Error($status, $fallback) {
  if ($status -eq $St::NetworkFailure) { return 'network' }
  if ($status -eq $St::MicrophoneUnavailable) { return 'engine' }
  return $fallback
}

try {
  $compile = Await ($recognizer.CompileConstraintsAsync()) ([Windows.Media.SpeechRecognition.SpeechRecognitionCompilationResult])
  if ($compile.Status -ne $St::Success) {
    $code = Status-Error $compile.Status 'recognizer'
    Write-Line @{ error = $code }
    if ($code -eq 'network') { exit 7 } else { exit 3 }
  }
} catch {
  Write-Line @{ error = 'recognizer' }
  exit 3
}

Write-Line @{ state = 'ready' }

try {
  $result = Await ($recognizer.RecognizeAsync()) ([Windows.Media.SpeechRecognition.SpeechRecognitionResult])
} catch {
  # WinRT reports every one of these as a failed call rather than a status, so this is the only place
  # they can be told apart from a real crash. They CAN be told apart from each other after all: the
  # unaccepted speech policy names itself in the message, and it is by far the most common of the
  # three on a fresh Windows install — "Online speech recognition" ships OFF. It used to fold into
  # 'mic', which sent the user to Privacy › Microphone, a pane where everything already said Allow and
  # nothing they could do would help. (jek, Win11 2026-08-07: measured, HasAccepted unset, mic consent
  # Allow at every scope, RecognizeAsync threw "The speech privacy policy was not accepted".)
  if ($_.Exception.Message -match 'privacy policy') {
    Write-Line @{ error = 'privacy' }
    exit 6
  }
  # WinRT raises the dropped-connection case here too rather than handing back a status, and it names
  # itself in the message the same way the privacy policy does.
  if ($_.Exception.Message -match 'network|offline|internet|no such host') {
    Write-Line @{ error = 'network' }
    exit 7
  }
  Write-Line @{ error = 'mic' }
  exit 4
}

$status = $result.Status
if ($status -eq $St::UserCanceled -or $status -eq $St::TimeoutExceeded) {
  # Said nothing. Not an error — the caller already says "Heard nothing" when no words arrive.
  Write-Line @{ final = '' }
  exit 0
}
if ($status -ne $St::Success) {
  $code = Status-Error $status 'speech'
  Write-Line @{ error = $code }
  if ($code -eq 'network') { exit 7 } else { exit 5 }
}

Write-Line @{ final = [string]$result.Text }
exit 0
