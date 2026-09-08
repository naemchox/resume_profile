/* ข้อมูลของเดโมนี้ใบเดียว — เครื่องประกอบอยู่ที่ playbook/build-multi.mjs
   อะไรที่เป็น "กติกาของเว็บหลายหน้า" อยู่ในเครื่อง อะไรที่เป็น "ของแบรนด์นี้" อยู่ไฟล์นี้ */
export default {
  base: "https://tarmsung.pages.dev/work/the-terrace-multi/",

  /* เมนูชุดเดียว ใช้ทั้งบนหัว บนมือถือ และท้ายหน้า — สามที่ อ่านจากลิสต์เดียว */
  nav: [
    { url: "",          label: "หน้าแรก" },
    { url: "venue/",    label: "สถานที่" },
    { url: "packages/", label: "แพ็กเกจ & เมนู" },
    { url: "story/",    label: "รีวิว & วิธีทำงาน" },
    { url: "contact/",  label: "ติดต่อ & นัดชม" },
  ],

  pages(rd) {
    const B = (n) => rd(`_src/b-${n}.html`);
    const ROOMS = JSON.parse(rd("_src/rooms.json"));

    const list = [
      { file: "index.html", url: "", depth: 0, og: "hero.jpg",
        title: "เดอะ เทอเรส — เวนิวจัดงานแต่งและงานเลี้ยงบริษัท ทองหล่อ",
        desc: "เวนิวจัดงานริมน้ำ ทองหล่อ รับงานแต่ง งานเลี้ยงบริษัท และประชุมสัมมนา 40–300 ที่นั่ง ราคาต่อท่านบอกไว้ตรงหน้าแรก นัดชมสถานที่ฟรีทุกวัน",
        body: B("hero") + B("hubs") + B("bar") + B("compare") + B("cta") },

      { file: "venue/index.html", url: "venue/", depth: 1, og: "hall-grand.jpg",
        title: "สถานที่ — สามพื้นที่ในรั้วเดียวกัน | เดอะ เทอเรส",
        desc: "ห้องบอลรูม 120–300 ที่นั่ง ลานซุ้มริมน้ำ 60–150 ที่นั่ง และห้องประชุมชั้น 2 40–80 ที่นั่ง ทุกห้องเดินถึงกันในสองนาที",
        crumb: [{ url: "", label: "หน้าแรก" }, { label: "สถานที่" }],
        hero: ["สถานที่", "สามพื้นที่ ในรั้วเดียวกัน", "ย้ายจากพิธีเช้าไปงานเลี้ยงเย็นได้โดยแขกไม่ต้องขึ้นรถ กดเข้าไปดูรายละเอียดของแต่ละห้องได้เลย"],
        body: B("rooms") + B("facility") },

      { file: "packages/index.html", url: "packages/", depth: 1, og: "detail-table.jpg",
        title: "แพ็กเกจจัดงานและเมนูอาหาร พร้อมราคาต่อท่าน | เดอะ เทอเรส",
        desc: "แพ็กเกจงานแต่ง งานเลี้ยงบริษัท และสัมมนา พร้อมโต๊ะจีน ฿6,900/โต๊ะ บุฟเฟต์ ฿890/ท่าน ค็อกเทล ฿590/ท่าน คิดราคาประเมินงานของคุณได้ในหน้านี้",
        crumb: [{ url: "", label: "หน้าแรก" }, { label: "แพ็กเกจ & เมนู" }],
        hero: ["แพ็กเกจ &amp; เมนู", "ราคาบอกไว้ตรงนี้ ไม่ต้องทักมาถาม", "เลือกแพ็กเกจ ใส่จำนวนแขก แล้วดูราคาประเมินได้ทันที เมนูทุกชุดปรับรายการได้โดยไม่คิดเพิ่ม"],
        scripts: ["js/quote.js"],
        body: B("packages") + B("quote") + B("menu") + B("runsheet") },

      { file: "story/index.html", url: "story/", depth: 1, og: "garden.jpg",
        title: "รีวิวลูกค้า วิธีทำงาน และคำถามที่พบบ่อย | เดอะ เทอเรส",
        desc: "เจ้าของงานที่จัดกับเราแล้วพูดว่าอะไร ขั้นตอนตั้งแต่ทักมาจนวันงานจบ และคำตอบของคำถามที่ถูกถามบ่อยที่สุดก่อนตัดสินใจจอง",
        crumb: [{ url: "", label: "หน้าแรก" }, { label: "รีวิว & วิธีทำงาน" }],
        hero: ["รีวิว &amp; วิธีทำงาน", "คนที่จัดไปแล้ว พูดว่าอะไร", "อ่านที่มาของเวนิว ขั้นตอนการทำงานจริง และคำถามที่เจ้าของงานถามบ่อยที่สุด"],
        body: B("story") + B("how") + B("voices") + B("faq") },

      { file: "contact/index.html", url: "contact/", depth: 1, og: "hero.jpg",
        title: "ติดต่อและนัดชมสถานที่ ทองหล่อ ซอย xx | เดอะ เทอเรส",
        desc: "เปิดให้ชมสถานที่ทุกวัน 10:00–19:00 สุขุมวิท xx (ทองหล่อ) ซอย xx โทร 02-xxx-xxxx หรือทักไลน์ เดิน 8 นาทีจาก BTS ทองหล่อ",
        crumb: [{ url: "", label: "หน้าแรก" }, { label: "ติดต่อ & นัดชม" }],
        hero: ["ติดต่อ &amp; นัดชม", "แวะมาดูของจริงก่อนตัดสินใจ", "ไม่มีค่าใช้จ่าย ไม่ต้องมัดจำ นัดล่วงหน้าได้ทุกวัน เพราะบางช่วงมีงานจริงอยู่ในห้อง"],
        body: B("visit") + B("map") },
    ];

    /* หน้ารายละเอียดห้อง — ของที่หน้าเดียวทำไม่ได้: การ์ดหนึ่งใบมีหน้าเป็นของตัวเอง
       ส่งลิงก์ห้องเดียวให้ลูกค้าได้ และ Google เก็บเป็นคนละหน้า */
    for (const r of ROOMS) {
      const others = ROOMS.filter((o) => o.slug !== r.slug);
      list.push({
        file: `rooms/${r.slug}/index.html`, url: `rooms/${r.slug}/`, depth: 2, og: r.img,
        title: `${r.name} — ${r.spec[0][1]} | เดอะ เทอเรส`,
        desc: r.lead.slice(0, 155),
        crumb: [{ url: "", label: "หน้าแรก" }, { url: "venue/", label: "สถานที่" }, { label: r.name }],
        hero: ["ห้องจัดงาน", r.name, r.lead],
        body: `
  <section class="section">
    <div class="wrap detail">
      <div class="reveal">
        <img src="{{R}}img/${r.img}" alt="${r.alt}" width="1200" height="900">
        ${r.body.map((t) => `<p style="margin-top:var(--s4)">${t}</p>`).join("\n        ")}
      </div>
      <div class="reveal d1">
        <h2 style="font-family:var(--font-d);font-size:var(--t-xl);margin-bottom:var(--s3)">รายละเอียดห้อง</h2>
        <ul class="spec">
${r.spec.map(([k, v]) => `          <li><b>${k}</b><span>${v}</span></li>`).join("\n")}
        </ul>
        <p style="margin-top:var(--s5)"><a class="btn btn--brass btn--lg" href="{{R}}packages/">ดูราคาแพ็กเกจ</a></p>
        <p style="margin-top:var(--s3)"><a class="btn btn--dark btn--lg" href="tel:021184499">โทรนัดชมห้องนี้</a></p>
        <div class="roomnav">
${others.map((o) => `          <a class="btn btn--dark btn--sm" href="{{R}}rooms/${o.slug}/">${o.name} →</a>`).join("\n")}
        </div>
      </div>
    </div>
  </section>
`,
      });
    }
    return list;
  },

  /* เว็บหน้าเดียวไม่มีทางพิมพ์ URL ผิดได้ เว็บหลายหน้ามี พิมพ์ผิดแล้วเจอหน้าขาว
     ของเซิร์ฟเวอร์ = คนที่ตั้งใจจะจองงานหลุดมือไปเฉยๆ */
  notFound(rd) {
    return {
      file: "404.html", url: "404", depth: 0, og: "hero.jpg",
      title: "ไม่พบหน้านี้ | เดอะ เทอเรส",
      desc: "หน้าที่คุณเปิดไม่มีอยู่ กลับไปหน้าแรกหรือเลือกจากเมนูได้เลย",
      hero: ["404", "ไม่พบหน้าที่คุณเปิด", "อาจถูกย้ายหรือพิมพ์ที่อยู่ผิด เลือกจากเมนูข้างล่างได้เลย ไม่ต้องเริ่มใหม่"],
      body: rd("_src/b-hubs.html"),
    };
  },
};
