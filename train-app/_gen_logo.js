// Logo concept generator — self-contained PNG (fs+zlib only), 3 variants. node _gen_logo.js
const fs = require('fs'); const zlib = require('zlib');
const N = 512;
function inTri(px,py,ax,ay,bx,by,cx,cy){const d1=(px-bx)*(ay-by)-(ax-bx)*(py-by);const d2=(px-cx)*(by-cy)-(bx-cx)*(py-cy);const d3=(px-ax)*(cy-ay)-(cx-ax)*(py-ay);const neg=d1<0||d2<0||d3<0,pos=d1>0||d2>0||d3>0;return !(neg&&pos);}
// rounded-rect signed test (inside if true)
function inRR(px,py,x,y,w,h,r){const dx=Math.max(x-px,0,px-(x+w));const dy=Math.max(y-py,0,py-(y+h));if(dx===0&&dy===0){const cx=Math.min(Math.max(px,x+r),x+w-r),cy=Math.min(Math.max(py,y+r),y+h-r);return Math.hypot(px-cx,py-cy)<=r || (px>=x+r&&px<=x+w-r)||(py>=y+r&&py<=y+h-r);}return false;}
const BG=[11,18,32], LIME=[163,230,53], DIM=[80,110,40];
function mix(a,b,t){return [Math.round(a[0]+(b[0]-a[0])*t),Math.round(a[1]+(b[1]-a[1])*t),Math.round(a[2]+(b[2]-a[2])*t)];}
// each variant returns a fn(px,py)->[r,g,b] with 3x3 supersample applied by render()
const VARIANTS = {
  // A: bold solid peak
  bold: (px,py)=> inTri(px,py,256,108,406,404,106,404) ? LIME : BG,
  // B: outlined peak (peak with notch) — current style, refined
  outline: (px,py)=> (inTri(px,py,256,104,412,408,100,408) && !inTri(px,py,256,196,344,360,168,360)) ? LIME : BG,
  // C: race — two summits, dim 'you' behind + bright 'committed self' ahead
  race: (px,py)=>{
    if (inTri(px,py,330,150,470,412,190,412)) return LIME;      // front (committed self)
    if (inTri(px,py,196,196,316,412,76,412))  return mix(BG,LIME,0.42); // back (you), muted
    return BG;
  },
};
function render(fn){
  const sq={x:0,y:0,w:N,h:N,r:112};
  const buf=Buffer.alloc(N*N*4);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    let r=0,g=0,b=0,inside=0;
    for(let sy=0;sy<3;sy++)for(let sx=0;sx<3;sx++){
      const fx=x+(sx+0.5)/3, fy=y+(sy+0.5)/3;
      if(!inRR(fx,fy,sq.x,sq.y,sq.w,sq.h,sq.r)) continue; // outside rounded corner → transparent
      inside++; const c=fn(fx,fy); r+=c[0];g+=c[1];b+=c[2];
    }
    const o=(y*N+x)*4; const a=inside/9;
    if(inside){r/=inside;g/=inside;b/=inside;}
    buf[o]=Math.round(r);buf[o+1]=Math.round(g);buf[o+2]=Math.round(b);buf[o+3]=Math.round(a*255);
  }
  return buf;
}
const crc=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=crc[(c^b[i])&0xFF]^(c>>>8);return(c^0xFFFFFFFF)>>>0;}
function chunk(ty,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const t=Buffer.from(ty);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(Buffer.concat([t,d])),0);return Buffer.concat([l,t,d,c]);}
function png(rgba){const raw=Buffer.alloc(N*(N*4+1));for(let y=0;y<N;y++){raw[y*(N*4+1)]=0;rgba.copy(raw,y*(N*4+1)+1,y*N*4,y*N*4+N*4);}const idat=zlib.deflateSync(raw,{level:9});const sig=Buffer.from([137,80,78,71,13,10,26,10]);const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(N,0);ihdr.writeUInt32BE(N,4);ihdr[8]=8;ihdr[9]=6;return Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))]);}
for(const k of Object.keys(VARIANTS)){fs.writeFileSync('logo-'+k+'.png',png(render(VARIANTS[k])));console.log('wrote logo-'+k+'.png');}
