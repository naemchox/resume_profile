// ตารางที่กดหัวคอลัมน์เพื่อเรียงได้
//
// แยกเป็นไฟล์ใหม่แทนที่จะเพิ่มใน ui.js ด้วยเหตุผลเดียวกับ form.js —
// ui.js เป็นของกลางที่หลายคนแตะอยู่ ของใหม่ที่ยังไม่นิ่งไม่ควรไปทับซ้อนตรงนั้น
//
// วนสามจังหวะต่อคอลัมน์: กด 1 = น้อยไปมาก (ก-ฮ / A-Z / 1-9)
//                        กด 2 = มากไปน้อย (ฮ-ก / Z-A / 9-1)
//                        กด 3 = กลับไปลำดับตั้งต้น คือลำดับที่ผู้เรียกส่งเข้ามา
// การกดคอลัมน์อื่นเริ่มนับหนึ่งใหม่เสมอ ไม่เรียงซ้อนสองคอลัมน์
// เพราะการเรียงซ้อนต้องมีอะไรบอกผู้ใช้ว่าตอนนี้ซ้อนอยู่กี่ชั้น ซึ่งอ่านยากกว่าที่ได้ประโยชน์
import { el, emptyRow } from './ui.js';

// columns: [{ label, align }]
// rows:    [{ cells: [{ node, text, num }], class }]
//          text = ค่าที่เอาไปเรียง (ไม่ใส่ = ใช้ '') · num = ใส่เมื่ออยากให้เรียงแบบตัวเลข
export function sortTable(columns, rows, { dense = false } = {}) {
  const cellOf = (row, i) => row.cells[i] ?? {};

  let sortCol = -1, sortDir = 0;
  const marks = [];

  const headRow = el('tr', {}, ...columns.map((col, i) => {
    const label = typeof col === 'string' ? col : col.label;
    const align = typeof col === 'string' ? null : col.align;
    const mark = el('span', { class: 'sort-mark' }, '');
    marks.push(mark);
    const th = el('th', { class: (align ? `ta-${align} ` : '') + 'sortable',
                          tabindex: '0', role: 'button' }, label, mark);
    const toggle = () => {
      if (sortCol !== i) { sortCol = i; sortDir = 1; }
      else if (sortDir === 1) { sortDir = -1; }
      else { sortCol = -1; sortDir = 0; }
      draw();
    };
    th.addEventListener('click', toggle);
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
    return th;
  }));

  const tbody = el('tbody', {});

  function draw() {
    let shown = rows;

    if (sortDir !== 0) {
      // ลำดับตั้งต้นเป็นตัวตัดสินสุดท้าย ไม่งั้นแถวที่ค่าเท่ากันจะสลับที่ไปมาทุกครั้งที่กด
      const order = new Map(rows.map((r, i) => [r, i]));
      shown = [...rows].sort((a, b) => {
        const A = cellOf(a, sortCol), B = cellOf(b, sortCol);
        const cmp = (A.num != null && B.num != null)
          ? A.num - B.num
          : String(A.text ?? '').localeCompare(String(B.text ?? ''), 'th', { numeric: true });
        return (cmp || order.get(a) - order.get(b)) * sortDir;
      });
    }

    marks.forEach((m, i) => {
      m.textContent = sortCol === i ? (sortDir === 1 ? '▲' : '▼') : '';
    });

    tbody.textContent = '';
    if (shown.length) {
      for (const r of shown) {
        tbody.append(el('tr', { class: r.class ?? null },
          ...r.cells.map((c, i) => {
            const align = typeof columns[i] === 'string' ? null : columns[i].align;
            return el('td', { class: align ? `ta-${align}` : null }, c.node ?? c.text ?? '');
          })));
      }
    } else {
      tbody.append(emptyRow(columns.length));
    }
  }

  draw();
  return el('div', { class: 'table-wrap stable' + (dense ? ' dense' : '') },
    el('table', {}, el('thead', {}, headRow), tbody));
}
