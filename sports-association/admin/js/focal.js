// ตัวปรับตำแหน่งรูป: ลากบนรูปเพื่อเลือก "จุดสำคัญ" แล้วเห็นกรอบเส้นประของทุกที่ที่เว็บหลักครอปรูปนี้
// ค่าที่ได้ { x, y } (0–100) คือ object-position: จุดนี้ของรูปจะอยู่ตำแหน่งเดียวกัน (สัดส่วนเดียวกัน) ในทุกกรอบ
import { IMAGE_FRAMES } from './config.js';
import { esc } from './ui.js';

const COLORS = ['#1450C8', '#D81B60', '#0E9F6E', '#B7791F'];
export const CENTER = Object.freeze({ x: 50, y: 50 });

const clamp = v => Math.min(100, Math.max(0, Math.round(v)));
export function normPos(p) {
  return p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)) ? { x: clamp(p.x), y: clamp(p.y) } : { ...CENTER };
}

// style ของรูปย่อในรายการ ให้ครอปตรงกับตำแหน่งที่ตั้งไว้
export function posAttr(p) {
  if (!p) return '';
  const { x, y } = normPos(p);
  return ` style="object-position:${x}% ${y}%"`;
}

// frames: ชื่อชุดใน IMAGE_FRAMES หรืออาร์เรย์ [[ชื่อ, สัดส่วน]]
export function framesOf(frames) {
  return typeof frames === 'string' ? IMAGE_FRAMES[frames] || [] : frames || [];
}

/**
 * ครอบ <img> ที่มีอยู่แล้วด้วยตัวปรับตำแหน่ง
 * คืน { el, pos, set(pos), refresh() }
 */
export function focalEditor(img, frames, { onChange } = {}) {
  const list = framesOf(frames);
  let pos = { ...CENTER };

  const el = document.createElement('div');
  el.className = 'focal';
  el.innerHTML = `
    <div class="focal-stage">
      <div class="focal-layer">
        ${list.map(([label], i) => `<div class="focal-frame${i ? '' : ' is-main'}" style="--c:${COLORS[i % COLORS.length]}"><span>${esc(label)}</span></div>`).join('')}
        <button type="button" class="focal-dot" aria-label="จุดสำคัญของรูป (ใช้ลูกศรเพื่อเลื่อน)"></button>
      </div>
    </div>
    <div class="focal-bar">
      <span class="focal-hint">ลากบนรูปเพื่อเลือกจุดสำคัญ${list.length ? ' · เส้นประ = ส่วนที่จะเห็นบนเว็บ' : ''}</span>
      <button type="button" class="btn btn-ghost btn-sm" data-focal-center>กลับกึ่งกลาง</button>
    </div>`;
  img.replaceWith(el);
  const stage = el.querySelector('.focal-stage');
  stage.prepend(img);
  const layer = el.querySelector('.focal-layer');
  const dot = el.querySelector('.focal-dot');
  const frameEls = [...el.querySelectorAll('.focal-frame')];

  function draw() {
    const a = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0;
    dot.style.left = `${pos.x}%`;
    dot.style.top = `${pos.y}%`;
    frameEls.forEach((f, i) => {
      f.hidden = !a;
      if (!a) return;
      const r = list[i][1];
      // object-fit: cover → ด้านที่เกินถูกตัด ตำแหน่งที่ตัดตาม object-position
      let w = 100, h = 100;
      if (r > a) h = (a / r) * 100; else w = (r / a) * 100;
      f.style.width = `${w}%`;
      f.style.height = `${h}%`;
      f.style.left = `${(100 - w) * pos.x / 100}%`;
      f.style.top = `${(100 - h) * pos.y / 100}%`;
    });
  }

  function set(p, notify = false) {
    pos = normPos(p);
    draw();
    if (notify) onChange?.(pos);
  }

  const fromEvent = e => {
    const b = layer.getBoundingClientRect();
    return { x: ((e.clientX - b.left) / b.width) * 100, y: ((e.clientY - b.top) / b.height) * 100 };
  };
  layer.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    layer.setPointerCapture(e.pointerId);
    el.classList.add('is-dragging');
    dot.focus({ preventScroll: true });
    set(fromEvent(e), true);
  });
  layer.addEventListener('pointermove', e => {
    if (layer.hasPointerCapture(e.pointerId)) set(fromEvent(e), true);
  });
  const end = () => el.classList.remove('is-dragging');
  layer.addEventListener('pointerup', end);
  layer.addEventListener('pointercancel', end);

  dot.addEventListener('keydown', e => {
    const step = e.shiftKey ? 5 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    set({ x: pos.x + d[0], y: pos.y + d[1] }, true);
  });
  el.querySelector('[data-focal-center]').addEventListener('click', () => set(CENTER, true));
  img.addEventListener('load', draw);

  draw();
  return {
    el,
    get pos() { return { ...pos }; },
    set: p => set(p),
    refresh: draw
  };
}
