/**
 * Auto-player harness for smoke-testing the game without a real pointer.
 *
 * The tab used for testing is usually hidden, so requestAnimationFrame never
 * fires. The harness therefore drives the simulation itself with
 * `engine.update(1/60)` on a fixed interval.
 *
 * Load it into the page (dev or dist build) and call window.__play.start().
 *
 *   const src = await (await fetch('/tools/auto-play.js')).text();
 *
 * It is intentionally kept out of `public/` so it never ships in dist.
 * Copy it next to the build (or serve the repo root) when testing dist.
 */
(function () {
  if (window.__play) return 'exists';

  var A = window.__asap;
  if (!A) return 'no-game';

  var S = {
    running: false,
    done: false,
    errors: [],
    log: [],
    stall: null,
    chapter: null,
    scope: null,
    scopeChanges: 0,
    usedAt: {},
    visitedAt: {},
    ticks: 0,
    idle: 0,
    used: null,
    visited: null,
    timer: null
  };
  window.__play = S;

  function step(n) {
    for (var i = 0; i < n; i++) A.game.engine.update(1 / 60);
  }

  function attached(screen) {
    return !!(screen && screen.element && screen.element.isConnected &&
      screen.element.style.display !== 'none');
  }

  /** Inline-visibility check that works for position:fixed overlays too. */
  function visible(id) {
    var el = document.getElementById(id);
    return !!(el && el.isConnected && el.style.display !== 'none');
  }

  S.tick = function () {
    if (S.done || !S.running) return;
    S.ticks++;
    try {
      step(1);

      if (attached(A.game.endingScreen)) {
        S.done = true;
        S.running = false;
        S.log.push('ending:' + A.gameState.get('currentChapter'));
        return;
      }

      var ch = A.gameState.get('currentChapter');
      if (ch !== S.chapter) {
        S.chapter = ch;
        S.idle = 0;
        S.log.push('chapter:' + ch);
      }

      // Objektif baru membuka cakupan pemakaian baru: interaktif yang tadi
      // terkunci boleh dicoba lagi (pintu, telepon), tetapi riwayat lama
      // tetap diingat: kalau tidak, dua interaktif yang saling menyetel
      // objektif bolak-balik akan mengulang percakapan yang sama selamanya.
      var objId = null;
      try {
        var o = A.scriptRunner.getObjective();
        objId = o && o.id ? o.id : null;
      } catch (eObj) { objId = null; }
      var scope = ch + '|' + objId;
      if (scope !== S.scope) {
        S.scope = scope;
        S.scopeChanges++;
        if (S.scopeChanges > 80) {
          S.running = false;
          S.stall = ch;
          S.log.push('obj-loop');
          return;
        }
        if (!S.usedAt[scope]) S.usedAt[scope] = {};
        if (!S.visitedAt[scope]) S.visitedAt[scope] = {};
        S.used = S.usedAt[scope];
        S.visited = S.visitedAt[scope];
        S.idle = 0;
        S.log.push('obj:' + objId);
      }

      // Day boundary: the summary has to be dismissed before the next chapter
      // (and before any interactable of the finished one becomes reachable).
      // NB: .day-summary is position:fixed, so offsetParent is null while visible -
      // detect it by inline display instead.
      if (A.game.currentScreen === 'DaySummaryScreen' || visible('day-summary')) {
        var cont = document.getElementById('summary-continue');
        if (cont && cont.getClientRects().length) {
          cont.click();
          S.idle = 0;
          return;
        }
      }

      var dialogOpen = A.gameState.get('inDialog') || attached(A.game.dialogScreen);
      if (dialogOpen) {
        var ds = A.game.dialogScreen;
        if (ds.waitingForChoice && ds.element) {
          var btns = Array.prototype.slice.call(ds.element.querySelectorAll('.choice-btn'));
          var fresh = btns.filter(function (b) { return !S.visited[b.dataset.choice]; });
          var pick = fresh[0] || btns[btns.length - 1];
          if (pick) {
            S.visited[pick.dataset.choice] = true;
            pick.click();
          }
        } else {
          A.scriptRunner.handleDialogContinue();
        }
        S.idle = 0;
        return;
      }

      // Tombol "lewati puzzle" memunculkan konfirmasi gaya baru (bukan
      // window.confirm). Kalau tidak dikonfirmasi, modal menumpuk dan
      // cabang puzzle di bawah ini terus mengklik skip tanpa pernah tutup.
      var confirmOk = document.querySelector('.confirm-dialog-backdrop .confirm-ok');
      if (confirmOk && confirmOk.getClientRects().length) {
        confirmOk.click();
        S.idle = 0;
        return;
      }

      if (A.gameState.get('inPuzzle') || attached(A.game.puzzleScreen)) {
        var skip = document.getElementById('puzzle-skip');
        if (skip && skip.getClientRects().length) {
          skip.click();
          S.idle = 0;
          return;
        }
      }

      // Rantai operasi skrip yang sedang berjalan belum tentu membuka dialog:
      // cameraAnim menunggu 2400 ms dulu, gotoScene & wait juga sunyi. Selama
      // isOpsBusy(), menembak interaktif berikutnya menjalankan dua rantai
      // sekaligus: dialog saling menimpa (resolveContinue menunggal) dan
      // objective bisa mendarat terbalik (b01: "rumah" baru disetel setelah
      // "ke_pasar", lalu seluruh pemakaian scope baru langsung habis → stall).
      // Idle tetap dihitung supaya rantai yang menggantung terdeteksi.
      if (A.scriptRunner.isOpsBusy && A.scriptRunner.isOpsBusy()) {
        S.idle++;
        if (S.idle > 400) {
          S.running = false;
          S.stall = ch;
          S.log.push('ops-hang:' + ch);
        }
        return;
      }

      var script = A.scriptRunner.getCurrentScript();
      var list = (script && script.interactables) ? script.interactables : [];
      var next = null;
      for (var j = 0; j < list.length; j++) {
        if (!S.used[list[j].id]) { next = list[j]; break; }
      }
      if (next) {
        S.used[next.id] = true;
        A.scriptRunner.handleInteractableUse(next.id);
        S.idle = 0;
        return;
      }

      // Nothing left in this chapter: waiting on an async transition.
      // 10 detik: pergantian hari menyusun fade chapterEnd + ringkasan hari +
      // membangun scene berikutnya tanpa dialog terbuka: jendela hening yang
      // jauh lebih lama daripada transit scene biasa dalam satu bab.
      S.idle++;
      if (S.idle > 400) {
        S.running = false;
        S.stall = ch;
        S.log.push('stall:' + ch);
      }
    } catch (e) {
      S.errors.push(String((e && e.stack) || e));
      S.running = false;
      S.log.push('throw');
    }
  };

  S.start = function () {
    if (!S.timer) S.timer = setInterval(S.tick, 25);
    S.running = true;
    return true;
  };

  S.stop = function () {
    S.running = false;
    return true;
  };

  S.reset = function () {
    S.done = false;
    S.stall = null;
    S.idle = 0;
    S.errors = [];
    S.log = [];
    S.chapter = null;
    S.scope = null;
    S.scopeChanges = 0;
    S.usedAt = {};
    S.visitedAt = {};
    S.used = null;
    S.visited = null;
    return true;
  };

  return 'installed';
})();
