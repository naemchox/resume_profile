import { chromium } from "playwright";
const W=1440,H=900;
const b = await chromium.launch();
for (const id of ["services"]) {
  const p = await b.newPage({ viewport:{width:W,height:H}, deviceScaleFactor:2 });
  await p.addInitScript(()=>{ try{localStorage.setItem("theme","light")}catch(e){} });
  await p.goto("file:///Users/jek/TarmSung-Dev/index.html",{waitUntil:"load"});
  await p.evaluate(()=>{document.documentElement.setAttribute("data-theme","light")});
  await p.waitForTimeout(1500);
  await p.evaluate(sel=>{
    const el=document.querySelector(sel);
    window.scrollTo({top: el.getBoundingClientRect().top + window.scrollY - 24, behavior:"instant"});
    document.querySelectorAll(".reveal").forEach(e=>e.classList.add("is-in","arrived","visible"));
  }, "#"+id);
  await p.waitForTimeout(1800);
  await p.screenshot({ path:`/tmp/ts-${id}-light.png` });
  await p.close();
  console.log(id);
}
await b.close();
