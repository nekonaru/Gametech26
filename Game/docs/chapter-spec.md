# Chapter Authoring Spec (Asap yang Tak Padam)

Source of truth: `C:\Users\LOQ 15IRX9\Downloads\ASAP-YANG-TAK-PADAM-GDD.md`
Read section 5 (variables/endings), section 7 (per-chapter detail), section 8 (puzzles), section 13 (language style), section 14.3 (script format).

## Files you produce

For each chapter id `bXX`:

1. `public/data/chapters/bXX.json`  the script
2. `public/locales/chapters/bXX.json` bilingual text:

```json
{
  "id": { "bXX": { "<node>": { "1": "teks Indonesia", "2": "..." } } },
  "en": { "bXX": { "<node>": { "1": "English text", "2": "..." } } }
}
```

`id` branch merges into the Indonesian locale, `en` into English. Keys are dotted paths, so
key `b03.bus.seat.1` resolves to `{ "b03": { "bus": { "seat": { "1": "..." } } } }`.

Rules:
- Every `text` value inside the chapter script must be an i18n key present in the locale file you ship with it. Never put literal prose in the script.
- Speaker names are NOT translated (write them literally: `Dimas`, `Raka`, `Rudi`, `Joy`, `Mak Yah`, `Ibu Joy`, `Ketua RT`, `Pinjol`, `Radio`, `Narator`).
- No em dashes anywhere in any text. Use a period, comma, or colon instead.
- Indonesian text follows GDD section 13: short sentences, plain words, restrained horror.
- English text is a faithful translation, same tone, same length roughly.

## Script schema

```json
{
  "id": "b03",
  "hari": 1,
  "jam": "15:00",
  "pov": "raka",
  "scene": "bus",
  "onEnter": [ { "op": "..." } ],
  "interactables": [
    { "id": "kursi", "prompt": "ui.sit", "position": [1, 0, -2], "once": false,
      "condition": "vars.terimaRudi === true",
      "onUse": [ { "op": "dialog", "node": "b03.bus.seat" } ] }
  ],
  "dialogs": {
    "b03.bus.seat": [
      { "speaker": "Raka", "text": "b03.bus.seat.1" },
      { "speaker": "Raka", "text": "b03.bus.seat.2",
        "choices": [ { "text": "b03.bus.seat.cA", "next": "b03.bus.seat.a", "important": true } ] },
      { "speaker": "Raka", "text": "b03.bus.seat.3", "autoNext": "b03.bus.next" }
    ],
    "b03.bus.seat.a": [ { "speaker": "Raka", "text": "b03.bus.seat.a.1" } ]
  }
}
```

Notes:
- `position` is `[x, y, z]` in meters, within about 6 m of spawn `[0, 0, 0]` (player spawns at origin looking down -Z). Omit for a generic spot.
- `prompt` must be an existing UI key: `ui.interact`, `ui.examine`, `ui.talk`, `ui.read`, `ui.open`, `ui.use`, `ui.take`, `ui.close`.
- A dialog node list plays top to bottom. Use `choices` to branch (each choice must have `next` pointing at another node in the same `dialogs` map), `autoNext` to chain, or plain sequential playback ending the dialog.
- `important: true` on a choice shows the "this will be remembered" tag.
- `once: true` on an interactable makes it unregister after one use. Add it to end-of-chapter exits.

## Available operations (only these; unknown ops log a warning)

Flow: `dialog {node}`, `objective {id, text}` (text is an i18n key), `wait {duration: ms}`,
`checkpoint {id}`, `chapterEnd`, `ending {id}` (`ending_1`..`ending_9`), `cutscene {scene}`.

State: `setFlag {flag, value}`, `addVar {name, value}` (direct set of a GameVariables member),
`if {condition, then: [], else: []}`, `giveClue {id}`, `giveItem {id}`, `removeItem {id}`.

Variables (dedicated ops): `addEmpati {value}`, `addNurani {value}`,
`modifyPercayaDimas {value}` (-5..5), `modifyPercayaRudi {value: bool}`,
`setKonfrontasiDini {value}`, `setEmpatiB15 {value}`, `setJoyDitemui {value}`,
`setB20Pilihan {value}` (`selamatkan_lapor` | `diam` | `biarkan`), `calculateKeyakinan`,
`setPOV {pov}`, `setTime {hari, jam}`, `teleport {pos, yaw}`.

Scene: `loadScene {scene}` (loads another chapter file by id), `setLighting {preset, transition}`,
`playSound {key, options}`, `startPuzzle {id, config}`, `echo {from, to, data}`, `setEcho {key, value}`.

Condition expression syntax (strings, evaluated with `vars`, `flags`, `clues` in scope):
`"vars.investigasi >= 4"`, `"flags.b05_ask_A === true"`, `"clues.includes('c3')"`, `"!vars.terimaRudi"`.

## Lighting presets (exact names)

`pagi_desa`, `sore`, `malam_rumah`, `hutan_malam`, `api`, `flashback`, `teror`, `ending_true`.

## Scene ids (use the one already assigned to your chapter in `src/game/chapter.ts`)

`rumah_dimas`, `kedai_kopi`, `bus`, `warung_mak_yah`, `gubuk_briefing`, `hutan_kecil`,
`jalan_desa`, `ladang_joy`, `balai_desa`, `tepi_hutan`, `hutan_berputar`, `hutan_api`,
plus extras allowed: `pasar`, `proyek`, `terminal`, `mimpi`, `penjara`, `ladang_joy_pondok`.

## Puzzle config for `startPuzzle`

```json
{ "op": "startPuzzle", "id": "p1",
  "config": {
    "type": "dial",
    "title": "Laci Terkunci",
    "description": "Empat angka dari tanggal penting.",
    "data": { "digits": 4, "hints": ["Lihat kalender dinding", "Tanggal keluarga besar"] },
    "onSolve": [ { "op": "giveClue", "id": "c1" }, { "op": "objective", "id": "lanjut", "text": "b04.obj.exit" } ],
    "onSkip": [ { "op": "giveClue", "id": "c1" } ],
    "onHelp": [ { "op": "setEcho", "key": "help_p1", "value": true } ]
  } }
```

`title`, `description` and `data.hints` are i18n keys OR literal short labels; prefer i18n keys
placed in your locale file for `id` and `en`. Puzzle types: `dial` (data: digits, hints),
`jigsaw` (data: pieces[{id,image,rotation}], gridSize{cols,rows}), `calendar` (data: dates[{day,month}], events[{title,description}]),
`evidence` (data: clues[{id,name}], categories[{id,name,slots}]), `navigation` (data: landmarks[{name,direction}], instructions[]),
`timing` (data: rings, speeds[]).

## Ops whitelist summary for interactables

Each chapter must end with an interactable (a door, bed, path, or "continue" object) whose
`onUse` ends with `{ "op": "chapterEnd" }` so the game advances. If the chapter is meant to
trigger an ending directly, use `{ "op": "ending", "id": "ending_N" }` instead of `chapterEnd`.

## Clues (exact ids)

`c1` B4 kwitansi pinjol, `c2a` B5 lokasi kebakaran, `c2b` B5 penjaga ladang Joy,
`c3` B9 pola kebakaran, `c4` B11 laporan kehilangan, `c5` B13 rincian utang (P2),
`c6` B13 jadwal kebakaran (P3), `c7` B13 bukti cukong (echo).

Investigation score = number of clue ids owned (c1, c2a, c2b, c3, c4, c5, c6 -> max 7).

## Flags referenced by the code (use these exact names when the GDD mentions them)

`b05_ask_A`, `b05_ask_B`, `b05_ask_C`, `b10_choose_help`, `b10_choose_run`,
`b14_door_locked`, `b14_door_open`, `b16_stop_look`, `b17_confess`, `b18_goHome`.

## Tone rules

- 40% exploration/interaction, 20% dialog, rest atmosphere. Every chapter needs at least
  4 interactables and at least one meaningful choice.
- Choices that matter get `"important": true`.
- Never describe arson technique, accelerants, or how to set a fire. B8/B10/B12B show only
  symbolic action, environmental reaction, and Dimas's feelings (GDD section 16).
- Content is PG-13 horror: no gore detail, no graphic death; deaths are heard, not shown.

## Validation

Run `node -e "JSON.parse(require('fs').readFileSync('<file>','utf8'))"` on every file you write.
Do not modify any file outside `public/data/chapters/` and `public/locales/chapters/`.
