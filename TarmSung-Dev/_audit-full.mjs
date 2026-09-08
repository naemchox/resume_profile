import { chromium } from "playwright";
import { readFileSync, existsSync, statSync } from "node:fs";
const SITES=["krua-baansuan","glow-clinic","parcela","homecraft","the-bed","lumen","summit","velvet-leaf","the-terrace"];
const b=await chromium.launch();
const rows=[];
for (const n of SITES) {
  const c=await b.newContext({viewport:{width:1280,height:800}});
  const p=await c.newPage(); const errs=[];
  p.on("pageerror",e=>errs.push(e.message.slice(0,60)));
  p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,60));});
  await p.goto(`file:///Users/jek/TarmSung-Dev/work/${n}/index.html`,{waitUntil:"load"});
  await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(1000);

  const base = await p.evaluate(() => {
    const secs=[...document.querySelectorAll("main > section, body > section, main > div")];
    const bgs=new Set(); let darkest=1;
    const lum=(c)=>{const m=c.match(/[\d.]+/g); if(!m||m.length<3) return 1;
      const [r,g,bl]=m.map(Number); return (0.2126*r+0.7152*g+0.0722*bl)/255;};
    for(const s of secs){const bg=getComputedStyle(s).backgroundColor; bgs.add(bg);
      if(!/rgba\(0, 0, 0, 0\)/.test(bg)) darkest=Math.min(darkest,lum(bg));}
    return { sections:secs.length, bgCount:bgs.size, darkestBg:+darkest.toFixed(2),
             pageH:document.documentElement.scrollHeight,
             imgs:document.querySelectorAll("img").length,
             svgs:document.querySelectorAll("svg").length,
             reveals:document.querySelectorAll(".reveal, .rise").length };
  });

  // อนิเมชันเห็นจริงไหม: ไถ 250px/วิ แล้ววัด opacity ตอนบล็อกเข้ามาในจอ 150px
  const seen = await p.evaluate(() => new Promise(done => {
    const el=[...document.querySelectorAll(".reveal,.rise")].find(e=>{
      const cs=getComputedStyle(e); return cs.opacity==="0" && e.getBoundingClientRect().top>2000;});
    if(!el) return done(null);
    const V=250, t0=performance.now(); let out=null;
    const step=(now)=>{ const t=(now-t0)/1000; window.scrollTo(0,t*V);
      const top=el.getBoundingClientRect().top;
      if(out===null && top<=650) out=+Number(getComputedStyle(el).opacity).toFixed(2);
      if(top<400||t>60) return done(out);
      requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }));

  const css = existsSync(`work/${n}/css/styles.css`) ? readFileSync(`work/${n}/css/styles.css`,"utf8") : readFileSync(`work/${n}/index.html`,"utf8");
  const html = readFileSync(`work/${n}/index.html`,"utf8");
  const js = existsSync(`work/${n}/js/main.js`) ? readFileSync(`work/${n}/js/main.js`,"utf8") : html;
  rows.push({ site:n, ...base,
    keyframes:(css.match(/@keyframes/g)||[]).length,
    rootMargin:(js.match(/rootMargin:\s*"([^"]+)"/)||[])[1]||"—",
    rulePathLen: html.includes('class="rule"') ? (html.match(/pathLength="1"/g)||[]).length+"/"+(html.match(/class="rule"/g)||[]).length : "—",
    reelMB: existsSync(`assets/work/reel/${n}.mp4`) ? +(statSync(`assets/work/reel/${n}.mp4`).size/1048576).toFixed(2) : "—",
    opacityตอนเข้าจอ: seen, errs:errs.length?errs.slice(0,2):"—" });
  await c.close();
}
console.log(JSON.stringify(rows,null,1));
await b.close();
