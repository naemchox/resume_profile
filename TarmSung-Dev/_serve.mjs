import { createServer } from "http";
import { readFileSync, existsSync, statSync } from "fs";
import { extname, join, dirname } from "path";
import { fileURLToPath } from "url";
/* 26/8/26 ROOT เคยฮาร์ดโค้ดเป็นพาธ Windows ของอีกเครื่อง (C:/Users/PC/...) — บนแมคมันไม่มีจริง
   เซิร์ฟเวอร์จึงตอบ 404 ทุกไฟล์ และด่านที่ต้องเปิดหน้าจริง (audit-nav ฯลฯ) รันไม่ได้เลย */
const ROOT=join(dirname(fileURLToPath(import.meta.url)));
const PORT=Number(process.env.PORT)||8123;
const MIME={".html":"text/html;charset=utf-8",".css":"text/css",".js":"text/javascript",".mp4":"video/mp4",".webm":"video/webm",".webp":"image/webp",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml",".json":"application/json",".woff2":"font/woff2",".ico":"image/x-icon",".txt":"text/plain"};
createServer((q,s)=>{
  let p=join(ROOT,decodeURIComponent(q.url.split("?")[0]));
  if(existsSync(p)&&statSync(p).isDirectory())p=join(p,"index.html");
  if(!existsSync(p)){s.writeHead(404);return s.end("404")}
  s.writeHead(200,{"Content-Type":MIME[extname(p)]||"application/octet-stream","Cache-Control":"no-store"});
  s.end(readFileSync(p));
}).listen(PORT,()=>console.log("เปิดที่ http://localhost:"+PORT+"/"));
