// App icon generator — "race" logo (two summits: you + committed self). Full-bleed
// (opaque square, content in the maskable safe zone) so it works as any+maskable.
// Self-contained (fs+zlib). Run: node _gen_icons.js
const fs = require('fs'); const zlib = require('zlib');
function inTri(px,py,ax,ay,bx,by,cx,cy){const d1=(px-bx)*(ay-by)-(ax-bx)*(py-by);const d2=(px-cx)*(by-cy)-(bx-cx)*(py-cy);const d3=(px-ax)*(cy-ay)-(cx-ax)*(py-ay);const neg=d1<0||d2<0||d3<0,pos=d1>0||d2>0||d3>0;return !(neg&&pos);}
const BG=[11,18,32], LIME=[163,230,53], BACK=[79,110,41]; // BACK = bg→lime ~0.42 (muted summit)
// race design in 512-space, nudged into the safe zone for maskable
function colorAt(px,py){
  if(inTri(px,py,322,166,452,402,192,402)) return LIME;     // front summit (committed self)
  if(inTri(px,py,200,202,300,402,100,402)) return BACK;     // back summit (you), muted
  return BG;
}
function render(N){
  const s=N/512, buf=Buffer.alloc(N*N*4);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    let r=0,g=0,b=0;
    for(let sy=0;sy<3;sy++)for(let sx=0;sx<3;sx++){const c=colorAt((x+(sx+0.5)/3)/s,(y+(sy+0.5)/3)/s);r+=c[0];g+=c[1];b+=c[2];}
    const o=(y*N+x)*4; buf[o]=Math.round(r/9);buf[o+1]=Math.round(g/9);buf[o+2]=Math.round(b/9);buf[o+3]=255;
  }
  return buf;
}
const T=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=T[(c^b[i])&0xFF]^(c>>>8);return(c^0xFFFFFFFF)>>>0;}
function chunk(ty,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const t=Buffer.from(ty);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(Buffer.concat([t,d])),0);return Buffer.concat([l,t,d,c]);}
function png(N,rgba){const raw=Buffer.alloc(N*(N*4+1));for(let y=0;y<N;y++){raw[y*(N*4+1)]=0;rgba.copy(raw,y*(N*4+1)+1,y*N*4,y*N*4+N*4);}const idat=zlib.deflateSync(raw,{level:9});const sig=Buffer.from([137,80,78,71,13,10,26,10]);const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(N,0);ihdr.writeUInt32BE(N,4);ihdr[8]=8;ihdr[9]=6;return Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))]);}
for(const [name,N] of [['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180]]){fs.writeFileSync(name,png(N,render(N)));console.log('wrote',name);}
