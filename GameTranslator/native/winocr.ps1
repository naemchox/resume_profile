# Windows.Media.Ocr server — the Windows counterpart of native/visionocr.swift.
#
# WHY THIS EXISTS. Until now Windows fell straight through to tesseract.js, which reads game fonts
# noticeably worse than the native engine each OS already ships (the same reason visionocr.swift was
# written for macOS). Windows 10/11 carry an OCR engine in the box — Windows.Media.Ocr, the one the
# Snipping Tool's text actions use — and it costs nothing, needs no network, and starts instantly.
# Leaving it unused meant the Windows build was the weakest OCR in a market where the free
# competition (LunaTranslator) can point its OCR at whatever engine the user likes.
#
# WHY POWERSHELL AND NOT A COMPILED HELPER. visionocr is a Swift binary because macOS ships a Swift
# compiler. Windows ships no compiler at all, so a compiled helper would mean checking a prebuilt
# .exe into the repo (unsigned, SmartScreen-flagged, one more thing to cross-compile from a Mac).
# Windows PowerShell 5.1 is present on every supported Windows and can reach WinRT directly, so the
# whole engine is a text file that needs no build step.
#
# MUST RUN UNDER WINDOWS POWERSHELL 5.1 (powershell.exe), NOT PowerShell 7 (pwsh.exe). The WinRT
# bridge below needs System.Runtime.WindowsRuntime, which exists only on .NET Framework. Under pwsh
# the Await helper fails to resolve and every read returns empty.
#
# PROTOCOL (line-based both ways, mirroring `visionocr --serve`'s FIFO contract):
#   startup  -> {"ready":true,"langs":["en-US","ja",...]}
#   stdin    <- {"lang":"ja","path":"C:\\Users\\...\\gt-ocr-1.png"}          ordinary read
#   stdin    <- {"lang":"ja","path":"...","boxes":true}                      read + geometry
#   stdout   -> {"text":"..."}  or  {"text":"","error":"no-pack"}
#   stdout   -> {"text":"...","lines":[{"t":"…","c":[[x,y,w,h]|null,…]}]}    when boxes was asked
#
# The boxes form exists for point-at-a-word, which has to answer "which word is under the cursor"
# and cannot do that from a wall of text. Coordinates are FRACTIONS of the image (0-1), not pixels:
# that is the contract native/visionocr.swift already speaks, so the one hit-test in main.js works
# against either engine without knowing which one answered.
#
# Per CHARACTER, from Windows' per-WORD rectangles, by dividing a word's box evenly across its
# characters. Windows.Media.Ocr has no finer geometry to offer — but the division is close to exact
# for Japanese and Chinese (fixed-width glyphs) and, for Latin text, only has to be good enough to
# say which character of a word the cursor is in, after which the dictionary match claims the whole
# word anyway. A wrong answer inside a word costs nothing; a wrong word would, and this can't
# produce one.
# One response line per request line, in order, so the caller can line requests up against replies
# with a plain queue and no request IDs. PNG goes via a temp file rather than framed binary on
# stdin: PowerShell's stdin is a text reader and feeding raw bytes through it is the kind of thing
# that works on one machine and silently mangles data on the next.

$ErrorActionPreference = 'Stop'

# JSON is ASCII-safe (ConvertTo-Json escapes non-ASCII to \uXXXX, which JSON.parse understands), but
# set the encodings anyway so a path with Japanese characters survives the trip in. Wrapped because
# assigning these throws in some hosts when the handle is already a pipe.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
try { [Console]::InputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# Load the WinRT projections. The [Type, Windows.Foundation, ContentType = WindowsRuntime] form is
# what makes PowerShell surface a WinRT class as a normal .NET type.
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.SoftwareBitmap, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStream, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null

Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null

# WinRT is async-only; PowerShell has no await. This is the standard bridge: grab the generic
# AsTask<T>(IAsyncOperation<T>) overload by reflection, bind it to the result type, and block.
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

function Write-Line($obj) {
  # Depth 8, not 4: the boxes reply nests object → lines → line → chars → box, and ConvertTo-Json
  # does not error when it runs out of depth — it emits the .NET type NAME as a string, which parses
  # fine and arrives as garbage.
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 8))
  [Console]::Out.Flush()
}

# Creating an engine is slow relative to recognising, and the language almost never changes between
# reads, so keep one per language for the life of the process.
$engines = @{}

function Get-Engine($tag) {
  if ($engines.ContainsKey($tag)) { return $engines[$tag] }
  $engine = $null
  try {
    $lang = New-Object -TypeName Windows.Globalization.Language -ArgumentList $tag
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
  } catch {
    $engine = $null
  }
  # A null here is the "language pack not installed" case, not a crash — Windows only carries OCR
  # data for languages the user has actually added. Cache the null too so we don't re-probe on
  # every single frame of a live translation.
  $engines[$tag] = $engine
  return $engine
}

function Read-Image($path, $tag, $wantBoxes) {
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  try {
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $engine = Get-Engine $tag
    if ($null -eq $engine) { return $null }
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

    # Do NOT use $result.Text. It rebuilds each line by joining OcrWord values with a space, and
    # Windows treats every Japanese/Chinese character cluster as its own "word" — so a clean read of
    # こんにちは comes back as "こ ん に ち は" and both the translator and the vocab splitter choke
    # on it. Rejoin those two scripts with no separator. Korean is left alone: it genuinely does put
    # spaces between words, so stripping them there would corrupt correct output.
    $noSpace = $tag -match '^(ja|zh)'
    $lines = New-Object System.Collections.Generic.List[string]
    $geom = New-Object System.Collections.Generic.List[object]
    # Normalise against the decoded bitmap, not the display: the caller knows what rectangle of
    # screen it handed over and multiplies these fractions back out itself.
    $imgW = [double]$bitmap.PixelWidth
    $imgH = [double]$bitmap.PixelHeight
    foreach ($line in $result.Lines) {
      if ($noSpace) {
        $text = -join ($line.Words | ForEach-Object { $_.Text })
      } else {
        $text = $line.Text
      }
      $lines.Add($text)
      if (-not $wantBoxes) { continue }
      # Rebuilt from the WORDS rather than sliced out of $text: the separator has to be inserted here
      # so the character array and the string stay index-for-index aligned, and $line.Text is not
      # guaranteed to be the words joined the way this loop joins them.
      $chars = New-Object System.Collections.Generic.List[object]
      $built = New-Object System.Text.StringBuilder
      $first = $true
      foreach ($word in $line.Words) {
        if (-not $first -and -not $noSpace) {
          [void]$built.Append(' ')
          $chars.Add($null)   # the space is a real index in the string and has no box of its own
        }
        $first = $false
        [void]$built.Append($word.Text)
        $r = $word.BoundingRect
        $n = [double]$word.Text.Length
        if ($n -lt 1) { continue }
        # One value per line, THEN the array. Writing the four expressions inline separated by commas
        # looks like every other language and is a trap here: PowerShell binds `,` TIGHTER than
        # arithmetic, so `$a / $b, $c / $d` divides by the array ($b, $c) and dies with
        # "[System.Object[]] does not contain a method named op_Division" — an error that names
        # neither the comma nor the line that owns it.
        for ($i = 0; $i -lt $n; $i++) {
          $cx = ($r.X + $r.Width * $i / $n) / $imgW
          $cy = $r.Y / $imgH
          $cw = ($r.Width / $n) / $imgW
          $ch = $r.Height / $imgH
          $chars.Add(@($cx, $cy, $cw, $ch))
        }
      }
      $geom.Add(@{ t = $built.ToString(); c = $chars.ToArray() })
    }
    $out = @{ text = ($lines -join "`n") }
    if ($wantBoxes) { $out.lines = $geom.ToArray() }
    return $out
  } finally {
    try { $stream.Dispose() } catch {}
  }
}

# Tell the caller which languages this machine can actually read before it sends any work, so a
# missing pack can be reported as a fixable setup step instead of as a stream of empty reads.
$available = @()
try { $available = @([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | ForEach-Object { $_.LanguageTag }) } catch {}
Write-Line @{ ready = $true; langs = $available }

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }   # stdin closed — the app is shutting us down
  $line = $line.Trim()
  if (-not $line) { continue }

  try {
    $req = $line | ConvertFrom-Json
    $tag = if ($req.lang) { [string]$req.lang } else { 'en-US' }
    $wantBoxes = [bool]$req.boxes
    $res = Read-Image ([string]$req.path) $tag $wantBoxes
    if ($null -eq $res) {
      Write-Line @{ text = ''; error = 'no-pack'; lang = $tag }
    } else {
      Write-Line $res
    }
  } catch {
    # Never let one bad frame kill the server — the caller falls back to tesseract for this read and
    # the next request still gets served.
    # Line number and inner exception included on purpose. A bare .Message here read as
    # "Exception calling Wait" for every possible cause — a missing file, a bad path, a mistake in
    # this script — and cost a debugging session that a line number would have ended immediately.
    $inner = if ($_.Exception.InnerException) { ' << ' + $_.Exception.InnerException.Message } else { '' }
    Write-Line @{ text = ''; error = ("line $($_.InvocationInfo.ScriptLineNumber): " + [string]$_.Exception.Message + $inner) }
  }
}
