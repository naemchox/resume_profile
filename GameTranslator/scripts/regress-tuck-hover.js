const [pageUrl, mainUrl] = process.argv.slice(2);
function ev(url,e,ms=45000){return new Promise((res,rej)=>{const ws=new WebSocket(url);
 ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:e,awaitPromise:true,includeCommandLineAPI:true,returnByValue:true}}));
 ws.onmessage=(m)=>{const d=JSON.parse(m.data);if(d.id!==1)return;ws.close();res(d.result?.result?.value??JSON.stringify(d.result?.exceptionDetails?.exception||d.result));};
 ws.onerror=(x)=>rej(new Error(x.message));setTimeout(()=>rej(new Error('timeout')),ms);});}
(async()=>{
  // Tucked mode on, then show a card and park the cursor ON THE CARD (far from the pill).
  console.log('setup:', await ev(pageUrl, `(async () => {
    const sel = document.getElementById('pillStyleSel');
    sel.value = 'ghost'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    if (!document.getElementById('panel').hidden) document.getElementById('settingsBtn').click();
    await new Promise(r => setTimeout(r, 800));
    return 'ghost mode on';
  })()`));
  await ev(mainUrl, `require('electron').ipcMain._invokeHandlers.get('translate:text')(null, 'library')`, 30000);
  await new Promise(r => setTimeout(r, 2500));
  console.log(await ev(pageUrl, `(async () => {
    const card = document.getElementById('result'), pill = document.querySelector('.pill');
    const cb = card.getBoundingClientRect(), pb = pill.getBoundingClientRect();
    const cx = Math.round(cb.left + cb.width/2), cy = Math.round(cb.top + 12);
    const dist = Math.round(Math.hypot(Math.max(pb.left-cx,0,cx-pb.right), Math.max(pb.top-cy,0,cy-pb.bottom)));
    const log = [{ t: 0, cardOpen: !card.hidden, tucked: pill.classList.contains('tucked'), cursorToPill: dist + 'px' }];
    // Sit on the card for 14s, jiggling one pixel so it reads as a live cursor.
    for (let i = 0; i < 140; i++) {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: cx + (i%2), clientY: cy, bubbles: true }));
      await new Promise(r => setTimeout(r, 100));
      if (i % 40 === 39) log.push({ t: (i+1)/10 + 's', cardOpen: !card.hidden, tucked: pill.classList.contains('tucked') });
    }
    // Now leave.
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 5, bubbles: true }));
    for (let i = 0; i < 8; i++) { await new Promise(r => setTimeout(r, 1000));
      if (pill.classList.contains('tucked')) { log.push({ t: 'left +' + (i+1) + 's', tucked: true }); break; } }
    return JSON.stringify(log, null, 0);
  })()`));
  process.exit(0);})().catch(e=>{console.log('FAIL',e.message);process.exit(1);});
