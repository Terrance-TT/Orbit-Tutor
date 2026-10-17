/* Orbit Ink Lab — compare three ink input stacks on one page. */
(function () {
  "use strict";

  function makeStat(id) {
    const el = document.getElementById(id);
    const counts = { down: 0, up: 0, strokes: 0 };
    const events = [];
    function render() {
      el.textContent =
        "STROKES: " + counts.strokes +
        "  (down " + counts.down + ", up " + counts.up + ")\n" +
        events.slice(0, 3).join("\n");
    }
    render();
    return {
      counts: counts,
      log: function (msg) {
        events.unshift(msg);
        render();
      },
      render: render,
    };
  }

  function sizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    canvas.width = Math.max(Math.round(w * dpr), 1);
    canvas.height = Math.max(Math.round(h * dpr), 1);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = "#1e293b";
    ctx.fillStyle = "#1e293b";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return ctx;
  }

  function setupPointerPad(canvasId, statId, options) {
    const canvas = document.getElementById(canvasId);
    const stat = makeStat(statId);
    const ctx = sizeCanvas(canvas);
    let activeId = null;
    let last = null;

    function point(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function dot(p) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    function start(e) {
      if (activeId !== null) finish(e);
      activeId = e.pointerId;
      last = point(e);
      dot(last);
      stat.counts.down += 1;
      stat.log("down " + e.pointerType + " id=" + e.pointerId);
    }
    function finish(e) {
      if (activeId === null) return;
      stat.counts.strokes += 1;
      stat.counts.up += 1;
      stat.log("up " + e.pointerType + " id=" + activeId + " -> stroke " + stat.counts.strokes);
      activeId = null;
      last = null;
    }
    function onDown(e) {
      if (e.pointerType === "touch") return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (activeId === e.pointerId) return;
      e.preventDefault();
      start(e);
    }
    function onMove(e) {
      if (e.pointerType === "touch") return;
      if (options.startOnMove && activeId === null && (e.buttons & 1) === 1) {
        start(e);
        return;
      }
      if (activeId === null || e.pointerId !== activeId || !last) return;
      e.preventDefault();
      const p = point(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
    }
    function onUp(e) {
      if (e.pointerType === "touch") return;
      if (e.pointerId !== activeId) return;
      finish(e);
    }

    canvas.addEventListener("pointerdown", onDown, { passive: false });
    canvas.addEventListener("pointermove", onMove, { passive: false });
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    if (options.suppressGestures) {
      const stop = function (e) { e.preventDefault(); };
      canvas.addEventListener("touchstart", stop, { passive: false });
      canvas.addEventListener("touchmove", stop, { passive: false });
      canvas.addEventListener("touchend", stop, { passive: false });
      canvas.addEventListener("dblclick", stop);
      canvas.addEventListener("gesturestart", stop);
    }
  }

  setupPointerPad("pad1", "stat1", { startOnMove: false, suppressGestures: false });
  setupPointerPad("pad2", "stat2", { startOnMove: true, suppressGestures: true });

  (function setupSignaturePad() {
    const canvas = document.getElementById("pad3");
    const stat = makeStat("stat3");
    sizeCanvas(canvas);
    const sp = new SignaturePad(canvas, {
      throttle: 0,
      minDistance: 0,
      penColor: "#1e293b",
      minWidth: 2,
      maxWidth: 3,
    });
    sp.addEventListener("endStroke", function () {
      stat.counts.strokes += 1;
      stat.log("endStroke -> stroke " + stat.counts.strokes);
    });
    canvas.addEventListener("pointerdown", function (e) {
      stat.counts.down += 1;
      stat.log("down " + e.pointerType + " id=" + e.pointerId);
    });
    canvas.addEventListener("pointerup", function (e) {
      stat.counts.up += 1;
      stat.log("up " + e.pointerType + " id=" + e.pointerId);
    });
    canvas.addEventListener("pointercancel", function (e) {
      stat.log("cancel " + e.pointerType + " id=" + e.pointerId);
    });
  })();
})();
