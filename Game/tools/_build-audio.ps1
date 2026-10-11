# Download & proses audio Mixkit untuk game (semua sumber: Mixkit License,
# bebas dipakai komersial tanpa atribusi).
# Hasil: public/assets/audio/<key>.mp3 (mono 44.1kHz, loudnorm, loop crossfade).
param([switch]$Force)

$src = "$env:TEMP\mixkit-src"
$out = "public\assets\audio"
New-Item -ItemType Directory -Force -Path $src, $out | Out-Null

# key | mixkit id | durasi potong (detik) | crossfade loop (0 = one-shot) | jenis (sfx|music)
$map = @(
  # --- ambience loop ---
  'ambience_morning|2464|16|3|sfx'
  'ambience_pagi|2472|16|3|sfx'
  'ambience_night|1789|16|3|sfx'
  'ambience_house_night|2475|16|3|sfx'
  'ambience_forest|1210|16|3|sfx'
  'ambience_hutan|1213|16|3|sfx'
  'ambience_forest_night|2414|16|3|sfx'
  'ambience_fire|1329|16|3|sfx'
  'ambience_fire_distant|1736|16|3|sfx'
  'ambience_bus|2707|16|3|sfx'
  'ambience_cafe|444|16|3|sfx'
  'ambience_warung|123|16|3|sfx'
  'ambience_hall|364|16|3|sfx'
  'ambience_village|371|16|3|sfx'
  'ambience_house|2505|16|3|sfx'
  # --- musik loop (crossfade 4s) ---
  'music_trek_petang|580|60|4|music'
  'music_trek_hujan|168|60|4|music'
  'music_trek_pulang|52|60|4|music'
  # --- SFX one-shot (tanpa crossfade loop) ---
  'footstep|535|1.2|0|sfx'
  'langkah_kering|1222|1.4|0|sfx'
  'footstep_wet|537|1.4|0|sfx'
  'run_fast|1274|2|0|sfx'
  'heartbeat|494|4|1.5|sfx'
  'breath|2232|1.6|0|sfx'
  'whisper|302|2|0|sfx'
  'static|1446|2|0|sfx'
  'radio_berita|2565|4|0|sfx'
  'dog_bark|1|2|0|sfx'
  'phone_ring|1357|4|0|sfx'
  'journal_note|1104|1.2|0|sfx'
  'satwa_kabur|20|2.5|0|sfx'
  'wind_low|2658|4|0|sfx'
  'whisper_wind|1157|4|0|sfx'
  'heat_wave|1267|4|0|sfx'
  'distant_glow|1330|3|0|sfx'
  'bara_jauh|1330|3|0|sfx'
)

$errors = @()
foreach ($entry in $map) {
  $p = $entry.Split('|')
  $key = $p[0]; $id = $p[1]; [double]$trim = $p[2]; [int]$xfade = [int]$p[3]; $kind = $p[4]
  $dst = "$out\$key.mp3"

  if ((Test-Path $dst) -and -not $Force) { continue }

  $url = if ($kind -eq 'music') { "https://assets.mixkit.co/music/$id/$id.mp3" }
         else { "https://assets.mixkit.co/active_storage/sfx/$id/$id-preview.mp3" }
  $srcFile = "$src\$id-$kind.mp3"
  if (-not (Test-Path $srcFile)) {
    try {
      Invoke-WebRequest -Uri $url -OutFile $srcFile -UseBasicParsing -TimeoutSec 120
    } catch { $errors += "$key ($id): download gagal - $($_.Exception.Message)"; continue }
  }

  $dur = [double](ffprobe -v error -show_entries format=duration -of csv=p=0 $srcFile 2>$null)
  if (-not $dur -or $dur -lt 0.2) { $errors += "$key ($id): ffprobe gagal"; continue }
  if ($dur -lt $trim) { $trim = $dur - 0.05 }
  if ($trim -le 0) { $errors += "$key ($id): sumber terlalu pendek ($dur dtk)"; continue }

  # loudnorm (target -18 LUFS, peak -2 dBTP)
  $af = "loudnorm=I=-18:TP=-2:LRA=11"

  if ($xfade -gt 0) {
    # Loop mulus: tail (xfade detik terakhir) di-crossfade ke head, hasil akhir
    # berdurasi trim-xfade dan titik loop kontinyu (tanpa klik/detak di boundary).
    $D = $trim; $X = [double]$xfade
    if ($D -le (2 * $X) + 1) { $X = [math]::Max(0.5, ($D - 1) / 3) }
    $f = "[0:a]atrim=0:${D},asetpts=PTS-STARTPTS,aresample=44100," +
         "asplit=2[s1][s2];" +
         "[s1]atrim=0:$($D - $X),asetpts=PTS-STARTPTS[main];" +
         "[s2]atrim=$($D - $X):${D},asetpts=PTS-STARTPTS[tail];" +
         "[main]asplit=2[m1][m2];" +
         "[m1]atrim=0:${X},asetpts=PTS-STARTPTS[head];" +
         "[m2]atrim=${X}:,asetpts=PTS-STARTPTS[rest];" +
         "[tail][head]acrossfade=d=${X}:curve1=tri:curve2=tri[cross];" +
         "[cross][rest]concat=n=2:v=0:a=1,${af}[out]"
    $null = ffmpeg -y -v error -i $srcFile -filter_complex $f -map "[out]" `
      -ac 1 -ar 44100 -c:a libmp3lame -b:a 64k $dst 2>&1
  } else {
    # one-shot: bitrate lebih tinggi untuk transien (langkah, ketukan)
    $bitrate = if ($trim -le 4.5) { '96k' } else { '64k' }
    $null = ffmpeg -y -v error -i $srcFile -af "atrim=0:${trim},asetpts=PTS-STARTPTS,${af}" `
      -ac 1 -ar 44100 -c:a libmp3lame -b:a $bitrate $dst 2>&1
  }

  if (-not (Test-Path $dst)) { $errors += "$key ($id): ffmpeg gagal" }
}

"=== hasil ==="
Get-ChildItem $out -Filter *.mp3 | Sort-Object Name | ForEach-Object {
  "{0,-26} {1,7:N0} KB" -f $_.Name, ($_.Length / 1KB)
}
$total = (Get-ChildItem $out -Filter *.mp3 | Measure-Object Length -Sum).Sum
"TOTAL: {0:N2} MB dari {1} file" -f ($total / 1MB), (Get-ChildItem $out -Filter *.mp3).Count
if ($errors.Count) { "=== GALAT ==="; $errors }
