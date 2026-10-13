// Mini Shooter 3D — o'yin serveri (qo'shimcha kutubxonasiz). Ishga tushirish: node server.js
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PUB=__dirname,OK=['index.html','sw.js','manifest.webmanifest','icon-192.png','icon-512.png'],MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const srv=http.createServer((req,res)=>{
 let u=decodeURIComponent(req.url.split('?')[0]);if(u==='/')u='/index.html';
 const f=path.join(PUB,path.normalize(u));if(!OK.includes(path.basename(f))||path.dirname(f)!==PUB){res.writeHead(404);return res.end('404');}
 fs.readFile(f,(e,b)=>{if(e){res.writeHead(404);return res.end('404');}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(b);});
});
const rooms=new Map();
function parse(b){
 if(b.length<2)return null;const op=b[0]&15;let len=b[1]&127,o=2;
 if(len===126){if(b.length<4)return null;len=b.readUInt16BE(2);o=4;}
 else if(len===127){if(b.length<10)return null;len=Number(b.readBigUInt64BE(2));o=10;}
 const mk=b[1]&128,need=o+(mk?4:0)+len;if(b.length<need)return null;
 let d=b.slice(o+(mk?4:0),need);
 if(mk){const m=b.slice(o,o+4);d=Buffer.from(d);for(let i=0;i<d.length;i++)d[i]^=m[i&3];}
 return{op,data:d,len:need};
}
function sendRaw(sock,data,op){
 const p=Buffer.isBuffer(data)?data:Buffer.from(data);let h;
 if(p.length<126)h=Buffer.from([128|op,p.length]);
 else if(p.length<65536){h=Buffer.alloc(4);h[0]=128|op;h[1]=126;h.writeUInt16BE(p.length,2);}
 else{h=Buffer.alloc(10);h[0]=128|op;h[1]=127;h.writeBigUInt64BE(BigInt(p.length),2);}
 try{sock.write(Buffer.concat([h,p]));}catch(e){}
}
function bcast(room,obj){const s=JSON.stringify(obj);room.forEach(c=>sendRaw(c.sock,s,1));}
function peers(room){bcast(room,{t:'peers',peers:[...room].map(c=>({peer:c.peer,presence:c.pres}))});}
function leave(c){if(!c.room)return;const r=rooms.get(c.room);c.room=null;if(!r)return;r.delete(c);if(r.size)peers(r);else rooms.delete(c.name);}
function onMsg(c,txt){
 let m;try{m=JSON.parse(txt);}catch(e){return;}
 if(m.t==='join'){
  const name=String(m.room||'1').slice(0,24);leave(c);
  let r=rooms.get(name);if(!r){r=new Set();rooms.set(name,r);}
  if(r.size>=8){sendRaw(c.sock,JSON.stringify({t:'full'}),1);return;}
  c.room=name;c.name=name;c.pres={};r.add(c);sendRaw(c.sock,JSON.stringify({t:'hello',peer:c.peer}),1);peers(r);
 }else if(!c.room)return;
 else if(m.t==='ev'){const r=rooms.get(c.room);if(r&&typeof m.topic==='string'&&m.topic.length<24)bcast(r,{t:'ev',topic:m.topic,data:m.data,peer:c.peer});}
 else if(m.t==='pres'&&m.patch&&typeof m.patch==='object'){
  for(const k of Object.keys(m.patch).slice(0,16)){const v=m.patch[k];if(v===null)delete c.pres[k];else if(typeof v!=='object'&&String(v).length<40)c.pres[k]=v;}
  const r=rooms.get(c.room);if(r)peers(r);
 }
}
srv.on('upgrade',(req,sock)=>{
 const key=req.headers['sec-websocket-key'];if(!key){sock.destroy();return;}
 sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')+'\r\n\r\n');
 const c={sock,peer:crypto.randomBytes(4).toString('hex'),room:null,name:'',pres:{}};let buf=Buffer.alloc(0);
 sock.on('data',d=>{
  buf=Buffer.concat([buf,d]);if(buf.length>1e6){sock.destroy();return;}
  let f;while((f=parse(buf))){buf=buf.slice(f.len);if(f.op===8){sock.end();return;}if(f.op===9){sendRaw(sock,f.data,10);continue;}if(f.op===1)onMsg(c,f.data.toString());}
 });
 sock.on('close',()=>leave(c));sock.on('error',()=>leave(c));
});
srv.listen(process.env.PORT||3000,()=>console.log('Server tayyor: port',process.env.PORT||3000));
