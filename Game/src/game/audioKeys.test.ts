import { describe, expect, it } from 'vitest';
import { collectChapterAudioKeys } from './audioKeys.js';
import type { ChapterScript } from './scriptRunner.js';

function fixture(): ChapterScript {
  return {
    id: 'bx',
    hari: 1,
    jam: '07:00',
    pov: 'dimas',
    scene: 'rumah',
    onEnter: [
      { op: 'playSound', key: 'ambience_morning', options: { loop: true } },
      {
        op: 'if', condition: 'flags.x', then: [{ op: 'playSound', key: 'dog_bark' }],
        else: [{ op: 'playSound', key: 'ambience_morning' }]
      },
      { op: 'playSound' },
      { op: 'playSound', key: 42 },
      null
    ],
    onSpawn: [{ op: 'playSound', key: 'breath' }],
    onExit: [{ op: 'playSound', key: 'static' }],
    interactables: [
      {
        id: 'radio', prompt: 'ui.use',
        onUse: [
          { op: 'playSound', key: 'radio_berita' },
          {
            op: 'choice', options: [
              { text: 'a', onSelect: [{ op: 'playSound', key: 'journal_note' }] },
              { text: 'b' }
            ]
          },
          {
            op: 'startPuzzle', config: {
              onSolve: [{ op: 'playSound', key: 'heartbeat' }],
              onSkip: [{ op: 'playSound', key: 'heartbeat' }],
              onHelp: [{ op: 'playSound', key: 'whisper' }]
            }
          }
        ]
      }
    ],
    dialogs: {
      'bx.a': [
        {
          speaker: 'Dimas', text: 'bx.a.1',
          onEnter: [{ op: 'playSound', key: 'wind_low' }],
          onExit: [{ op: 'playSound', key: 'footstep_wet' }],
          choices: [
            { text: 'tanya', next: 'bx.b', onSelect: [{ op: 'playSound', key: 'phone_ring' }] },
            { text: 'diam', next: 'bx.b' }
          ]
        },
        null
      ],
      'bx.b': [
        { speaker: 'Raka', text: 'bx.b.1', autoNext: 'bx.a' }
      ],
      'rusak': 'bukan-array'
    }
  } as unknown as ChapterScript;
}

describe('collectChapterAudioKeys', () => {
  it('menemukan key di semua sarang op dan mendedupe', () => {
    const keys = collectChapterAudioKeys(fixture()).sort();
    expect(keys).toEqual([
      'ambience_morning', 'breath', 'dog_bark', 'footstep_wet', 'heartbeat',
      'journal_note', 'phone_ring', 'radio_berita', 'static', 'whisper', 'wind_low'
    ].sort());
  });

  it('naskah kosong menghasilkan daftar kosong', () => {
    expect(collectChapterAudioKeys({
      id: 'x', hari: 1, jam: '00:00', pov: 'dimas', scene: 's',
      onEnter: [], interactables: [], dialogs: {}
    })).toEqual([]);
  });
});
