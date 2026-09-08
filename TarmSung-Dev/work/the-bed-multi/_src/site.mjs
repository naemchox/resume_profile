/* ข้อมูลของเดโมนี้ใบเดียว — เครื่องประกอบอยู่ที่ playbook/build-multi.mjs
   เว็บนี้เป็นภาษาอังกฤษทั้งหน้าตามฉบับหน้าเดียว จึงคงภาษาไว้ ไม่แปลครึ่งๆ */
export default {
  base: "https://tarmsung.pages.dev/work/the-bed-multi/",

  nav: [
    { url: "",           label: "Residence" },
    { url: "suites/",    label: "Suites" },
    { url: "amenities/", label: "Amenities" },
    { url: "story/",     label: "Voices" },
    { url: "contact/",   label: "Location" },
  ],

  pages(rd) {
    const B = (n) => rd(`_src/b-${n}.html`);
    const SUITES = JSON.parse(rd("_src/suites.json"));

    const list = [
      { file: "index.html", url: "", depth: 0, og: "exterior.jpg",
        title: "The Bed Phatthanakan xx — A Residence of Quiet Luxury",
        desc: "A boutique residence on Soi Phatthanakan xx, Bangkok. Three suite plans from 28 to 58 sqm, refined common areas, and viewings by appointment seven days a week.",
        body: B("hero") + B("marquee") + B("residence") + B("hubs") },

      { file: "suites/index.html", url: "suites/", depth: 1, og: "suite-classic.jpg",
        title: "The Suites — three plans from 28 to 58 sqm | The Bed Phatthanakan xx",
        desc: "The Atelier 28 sqm from ฿12,500, The Reader 42 sqm from ฿17,800, The Salon 58 sqm from ฿24,500. Rates, dimensions and aspect for every plan.",
        crumb: [{ url: "", label: "Residence" }, { label: "Suites" }],
        hero: ["The Suites", "Three plans, three ways to live", "Every suite has its own page with rates, dimensions, aspect and the reasoning behind the plan. Open the one that sounds like your day."],
        body: B("suites") },

      { file: "amenities/index.html", url: "amenities/", depth: 1, og: "lounge.jpg",
        title: "Amenities &amp; Gallery — what the building already provides | The Bed",
        desc: "The lounge, the work room, the service the building runs on, and photographs of the rooms and common areas as they stand today.",
        crumb: [{ url: "", label: "Residence" }, { label: "Amenities" }],
        hero: ["Amenities &amp; Gallery", "What is here before you furnish anything", "The parts of the building you share, and photographs of the rooms as they are today — not renders."],
        body: B("amenities") + B("gallery") },

      { file: "story/index.html", url: "story/", depth: 1, og: "living.jpg",
        title: "Voices — what residents say after a year here | The Bed Phatthanakan xx",
        desc: "Residents on the quiet, the service, the commute and the things a floor plan cannot tell you about living at The Bed Phatthanakan xx.",
        crumb: [{ url: "", label: "Residence" }, { label: "Voices" }],
        hero: ["Voices", "The part a floor plan cannot tell you", "What residents say after a year in the building — about the quiet, the service, and the commute on a Tuesday morning."],
        body: B("voices") },

      { file: "contact/index.html", url: "contact/", depth: 1, og: "exterior.jpg",
        title: "Location &amp; Viewings — Soi Phatthanakan xx, Bangkok | The Bed",
        desc: "Soi Phatthanakan xx, Suan Luang, Bangkok. How the commute works, and how to book a viewing at the hour you would normally come home.",
        crumb: [{ url: "", label: "Residence" }, { label: "Location" }],
        hero: ["Location &amp; Viewings", "Come at the hour you would come home", "See the building when the light and the traffic are what they will be every day — not at ten in the morning when everything is quiet."],
        body: B("location") + B("contact") },
    ];

    /* หน้ารายละเอียดห้องพัก — ของที่หน้าเดียวทำไม่ได้: การ์ดหนึ่งใบมีหน้าเป็นของตัวเอง
       ส่งลิงก์ห้องเดียวให้คนที่สนใจได้ และ Google เก็บเป็นคนละหน้า */
    for (const s of SUITES) {
      const others = SUITES.filter((o) => o.slug !== s.slug);
      list.push({
        file: `suites/${s.slug}/index.html`, url: `suites/${s.slug}/`, depth: 2, og: s.img,
        title: `${s.name} — ${s.size}, ${s.rate} | The Bed Phatthanakan xx`,
        desc: s.lead.slice(0, 155),
        crumb: [{ url: "", label: "Residence" }, { url: "suites/", label: "Suites" }, { label: s.name }],
        hero: [s.tier, s.name, s.lead],
        body: `
  <section class="bg-paper">
    <div class="detail">
      <div>
        <img src="{{R}}img/${s.img}" alt="${s.alt}" width="1200" height="1200">
        ${s.body.map((t) => `<p style="margin-top:1.25rem">${t}</p>`).join("\n        ")}
      </div>
      <div>
        <h2 style="font-family:Cinzel,Georgia,serif;font-size:1.35rem;letter-spacing:.04em;margin-bottom:1rem">The specification</h2>
        <ul class="spec">
${s.spec.map(([k, v]) => `          <li><b>${k}</b><span>${v}</span></li>`).join("\n")}
        </ul>
        <div class="suitenav">
          <a class="btn-gold" href="{{R}}contact/">Reserve a viewing</a>
        </div>
        <div class="suitenav">
${others.map((o) => `          <a class="btn-gold btn-ink" href="{{R}}suites/${o.slug}/">${o.name} →</a>`).join("\n")}
        </div>
      </div>
    </div>
  </section>
`,
      });
    }
    return list;
  },

  /* เว็บหน้าเดียวไม่มีทางพิมพ์ URL ผิดได้ เว็บหลายหน้ามี */
  notFound(rd) {
    return {
      file: "404.html", url: "404", depth: 0, og: "exterior.jpg",
      title: "Page not found | The Bed Phatthanakan xx",
      desc: "That page does not exist. Head back to the residence or pick from the menu below.",
      hero: ["404", "That page is not here", "It may have moved, or the address was mistyped. Pick up where you meant to below — no need to start over."],
      body: rd("_src/b-hubs.html"),
    };
  },
};
