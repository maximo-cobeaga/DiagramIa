import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GifWriter,lzwEncode,quantizeFrame} from '../src/export/gif.js';

/** Decodificador LZW de GIF, escrito aparte del codificador: lo que éste produce lo tiene que poder leer cualquiera. */
function lzwDecode(blocks:Uint8Array,count:number):Uint8Array{
  const bytes:number[]=[];
  for(let at=0;blocks[at];at+=blocks[at]!+1)for(let i=1;i<=blocks[at]!;i++)bytes.push(blocks[at+i]!);
  const CLEAR=256,END=257,out=new Uint8Array(count);
  let table:number[][]=[],codeSize=9,buffer=0,bits=0,at=0,written=0,previous:number[]|null=null;
  const reset=()=>{table=Array.from({length:258},(_,i)=>[i]);codeSize=9;previous=null;};
  reset();
  for(;;){
    while(bits<codeSize){assert.ok(at<bytes.length,'los datos terminan antes del código de fin');buffer|=bytes[at++]!<<bits;bits+=8;}
    const code=buffer&((1<<codeSize)-1);buffer>>>=codeSize;bits-=codeSize;
    if(code===CLEAR){reset();continue;}
    if(code===END)break;
    let entry:number[];
    if(code<table.length)entry=table[code]!;
    else{assert.ok(previous&&code===table.length,`código ${code} fuera de la tabla (${table.length})`);entry=[...previous!,previous![0]!];}
    for(const value of entry)out[written++]=value;
    if(previous&&table.length<4096){table.push([...previous,entry[0]!]);if(table.length===1<<codeSize&&codeSize<12)codeSize++;}
    previous=entry;
  }
  assert.equal(written,count,'la cantidad de píxeles decodificados coincide');
  return out;
}

/** Lee el archivo completo y devuelve cada cuadro ya compuesto sobre el anterior, como lo mostraría un visor. */
function decodeGif(parts:Uint8Array[]){
  const file=Buffer.concat(parts),width=file.readUInt16LE(6),height=file.readUInt16LE(8);
  assert.equal(file.subarray(0,6).toString('latin1'),'GIF89a');
  assert.equal(file[10]!&0x80,0,'sin paleta global');
  const screen=new Uint8Array(width*height*3),frames:{pixels:Uint8Array;delay:number;box:number[]}[]=[];
  let at=13,delay=0,transparent=-1,loops=false;
  for(;;){
    const kind=file[at++];
    if(kind===0x3b)break;
    if(kind===0x21){
      const label=file[at++];
      if(label===0xf9){assert.equal(file[at],4);const packed=file[at+1]!;assert.equal(packed>>2&7,1,'cada cuadro se dibuja sobre el anterior');delay=file.readUInt16LE(at+2);transparent=packed&1?file[at+4]!:-1;at+=6;}
      else{if(label===0xff&&file.subarray(at+1,at+12).toString('latin1')==='NETSCAPE2.0')loops=true;while(file[at])at+=file[at]!+1;at++;}
      continue;
    }
    assert.equal(kind,0x2c,'bloque desconocido');
    const x=file.readUInt16LE(at),y=file.readUInt16LE(at+2),w=file.readUInt16LE(at+4),h=file.readUInt16LE(at+6);
    assert.equal(file[at+8],0x87,'paleta local de 256 colores');
    const palette=file.subarray(at+9,at+9+768);at+=9+768;
    assert.equal(file[at++],8,'tamaño mínimo de código');
    const start=at;while(file[at])at+=file[at]!+1;at++;
    const indices=lzwDecode(file.subarray(start,at),w*h);
    for(let row=0;row<h;row++)for(let column=0;column<w;column++){
      const index=indices[row*w+column]!;if(index===transparent)continue;
      screen.set(palette.subarray(index*3,index*3+3),((y+row)*width+x+column)*3);
    }
    frames.push({pixels:screen.slice(),delay,box:[x,y,w,h]});
  }
  assert.ok(loops,'el GIF se repite');
  assert.equal(at,file.length,'no sobran bytes después del cierre');
  return {width,height,frames};
}

const rgba=(width:number,height:number,color:(x:number,y:number)=>[number,number,number])=>{
  const pixels=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixels.set([...color(x,y),255],(y*width+x)*4);
  return pixels;
};
const rgb=(pixels:Uint8ClampedArray)=>Uint8Array.from(pixels).filter((_,i)=>i%4!==3);

test('LZW: lo comprimido se decodifica igual, con datos repetidos, con ruido y al llenar la tabla',()=>{
  let seed=7;const random=()=>(seed=seed*1103515245+12345&0x7fffffff)/0x7fffffff;
  const cases:Record<string,Uint8Array>={
    'un píxel':Uint8Array.of(5),
    'un solo color':new Uint8Array(70_000).fill(3),
    // El ruido llena la tabla de 4096 códigos varias veces y pasa por todos los tamaños de código.
    'ruido de 256 valores':Uint8Array.from({length:120_000},()=>Math.floor(random()*256)),
    'franjas':Uint8Array.from({length:50_000},(_,i)=>(i>>5)%7),
    'bloque de 255 bytes justo':Uint8Array.from({length:300},(_,i)=>i%256)
  };
  for(const [name,indices] of Object.entries(cases))assert.deepEqual(lzwDecode(lzwEncode(indices),indices.length),indices,name);
});

test('un diagrama de pocos colores vuelve idéntico, un cuadro repetido no se guarda y un cambio chico ocupa sólo su rectángulo',()=>{
  const width=64,height=48,lime:[number,number,number]=[212,242,70],blue:[number,number,number]=[36,92,246],white:[number,number,number]=[255,255,255];
  const first=rgba(width,height,(x,y)=>x>8&&x<30&&y>10&&y<30?lime:white);
  const second=rgba(width,height,(x,y)=>x>8&&x<30&&y>10&&y<30?lime:x>=40&&x<44&&y>=20&&y<24?blue:white);
  const writer=new GifWriter(width,height),a=quantizeFrame(first,null,width,height)!;
  assert.equal(quantizeFrame(first.slice(),first,width,height),null,'un cuadro idéntico al anterior no produce nada');
  const b=quantizeFrame(second,first,width,height)!;
  assert.deepEqual([b.x,b.y,b.width,b.height],[40,20,4,4],'sólo se guarda el rectángulo que cambió');
  writer.add(a,160);writer.add(b,80);
  const decoded=decodeGif(writer.finish());
  assert.deepEqual([decoded.width,decoded.height,decoded.frames.length],[width,height,2]);
  assert.deepEqual(decoded.frames.map(frame=>frame.delay),[16,8],'la duración va en centésimas de segundo');
  assert.deepEqual(decoded.frames[0]!.pixels,rgb(first),'los colores de marca salen exactos');
  assert.deepEqual(decoded.frames[1]!.pixels,rgb(second));
});

test('lo que no cambió dentro del rectángulo va transparente y se sigue viendo lo anterior',()=>{
  const width=40,height=30,base=rgba(width,height,(x,y)=>[x*6%256,y*8%256,90]);
  // Cambian dos esquinas opuestas: el rectángulo es todo el cuadro, pero casi todos sus píxeles quedan iguales.
  const next=base.slice();next.set([1,2,3,255],0);next.set([250,251,252,255],(width*height-1)*4);
  const frame=quantizeFrame(next,base,width,height)!;
  assert.deepEqual([frame.x,frame.y,frame.width,frame.height],[0,0,width,height]);
  assert.ok(frame.transparent);assert.equal(frame.indices.filter(index=>index!==255).length,2,'sólo dos píxeles llevan color');
  const writer=new GifWriter(width,height);writer.add(quantizeFrame(base,null,width,height)!,80);writer.add(frame,80);
  const decoded=decodeGif(writer.finish());
  assert.deepEqual([...decoded.frames[1]!.pixels.subarray(0,3)],[1,2,3]);
  assert.deepEqual(decoded.frames[1]!.pixels.subarray(3,(width*height-1)*3),decoded.frames[0]!.pixels.subarray(3,(width*height-1)*3),'el resto queda como en el cuadro anterior');
});

test('con más de 255 colores, cada píxel toma un color cercano',()=>{
  const width=128,height=128,frame=rgba(width,height,(x,y)=>[x*2,y*2,(x+y)%256]);
  const writer=new GifWriter(width,height);writer.add(quantizeFrame(frame,null,width,height)!,80);
  const pixels=decodeGif(writer.finish()).frames[0]!.pixels,source=rgb(frame);
  let worst=0;for(let i=0;i<source.length;i++)worst=Math.max(worst,Math.abs(source[i]!-pixels[i]!));
  assert.ok(worst<=48,`ningún canal se aleja demasiado del original (peor caso ${worst})`);
});
