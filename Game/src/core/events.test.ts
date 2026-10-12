import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './events.js';

describe('EventBus', () => {
  it('emit memanggil listener dengan data', () => {
    const bus = new EventBus();
    const seen: unknown[] = [];
    bus.on<number>('tick', v => seen.push(v));
    bus.emit('tick', 42);
    bus.emit('tick', 43);
    expect(seen).toEqual([42, 43]);
  });

  it('fungsi kembalian on() berfungsi sebagai unsubscribe', () => {
    const bus = new EventBus();
    const cb = vi.fn();
    const off = bus.on('go', cb);
    off();
    bus.emit('go', 1);
    expect(cb).not.toHaveBeenCalled();
  });

  it('off() menghapus listener tertentu tanpa menyentuh lainnya', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('go', a);
    bus.on('go', b);
    bus.off('go', a);
    bus.emit('go', 1);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('listener yang melempar error tidak mematikan listener berikutnya', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bus = new EventBus();
    const after = vi.fn();
    bus.on('go', () => {
      throw new Error('boom');
    });
    bus.on('go', after);
    bus.emit('go', 1);
    expect(after).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('emit pada event tanpa pendengar tidak melempar error', () => {
    const bus = new EventBus();
    expect(() => bus.emit('kosong', 1)).not.toThrow();
  });

  it('clear(event) menghapus satu event; clear() tanpa argumen menghapus semua', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('x', a);
    bus.on('y', b);
    bus.clear('x');
    bus.emit('x', 1);
    bus.emit('y', 1);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    bus.clear();
    bus.emit('y', 2);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('pendengar boleh menambah listener lain selama emit tanpa crash', () => {
    const bus = new EventBus();
    const inner = vi.fn();
    bus.on('outer', () => bus.on('inner', inner));
    expect(() => bus.emit('outer', 1)).not.toThrow();
    // Listener inner baru aktif untuk emit berikutnya, bukan tengah iterasi.
    bus.emit('inner', 1);
    expect(inner).toHaveBeenCalledTimes(1);
  });
});
