/**
 * Codificador GIF89a (ADR 107). Sin dependencias y sin DOM: recibe cuadros RGBA y devuelve los bytes del archivo.
 * Cada cuadro lleva su propia paleta de hasta 255 colores. Un diagrama tiene pocos colores planos, así que los dominantes
 * salen exactos; si hay más (una foto, un degradado, bordes suavizados) se reparten por corte de mediana. Entre cuadros sólo se guarda el rectángulo que cambió, y dentro de él lo que no
 * cambió va transparente: una animación con el fondo quieto pesa poco.
 */
const TRANSPARENT=255,BUCKETS=32768;
// Histograma por cuadro sobre 5 bits por canal. Se reutiliza para no pedir memoria en cada cuadro.
const counts=new Uint32Array(BUCKETS),sumR=new Uint32Array(BUCKETS),sumG=new Uint32Array(BUCKETS),sumB=new Uint32Array(BUCKETS),mapped=new Uint8Array(BUCKETS);

const channel=(bucket:number,axis:number)=>axis===0?bucket>>10:axis===1?bucket>>5&31:bucket&31;
type Box={items:number[];count:number;axis:number;range:number};
function measure(items:number[]):Box{
  const low=[31,31,31],high=[0,0,0];let count=0;
  for(const bucket of items){count+=counts[bucket]!;for(let axis=0;axis<3;axis++){const value=channel(bucket,axis);if(value<low[axis]!)low[axis]=value;if(value>high[axis]!)high[axis]=value;}}
  let axis=0;for(let other=1;other<3;other++)if(high[other]!-low[other]!>high[axis]!-low[axis]!)axis=other;
  return {items,count,axis,range:high[axis]!-low[axis]!};
}
/** Corte de mediana sobre los colores del cuadro: parte siempre la caja que más píxeles y más variedad junta, por la mitad de sus píxeles. */
function medianCut(used:number[],size:number):Box[]{
  const boxes=[measure(used)];
  while(boxes.length<size){
    let pick=-1,score=0;
    for(let i=0;i<boxes.length;i++){const box=boxes[i]!,value=box.items.length>1?box.count*(box.range+1):0;if(value>score){score=value;pick=i;}}
    if(pick<0)break;
    const box=boxes[pick]!,items=box.items.sort((a,b)=>channel(a,box.axis)-channel(b,box.axis));
    let cut=0,seen=0;
    while(cut<items.length-1&&seen+counts[items[cut]!]!<=box.count/2)seen+=counts[items[cut++]!]!;
    cut=Math.max(1,cut);
    boxes.splice(pick,1,measure(items.slice(0,cut)),measure(items.slice(cut)));
  }
  return boxes;
}

export type GifFrame={x:number;y:number;width:number;height:number;indices:Uint8Array;/** 256 colores RGB; el índice 255 es el transparente. */palette:Uint8Array;transparent:boolean};

/**
 * Convierte un cuadro RGBA opaco en índices de paleta. Con `previous`, se limita al rectángulo que cambió y marca como
 * transparente lo que quedó igual. Devuelve null si el cuadro es idéntico al anterior.
 */
export function quantizeFrame(rgba:Uint8ClampedArray|Uint8Array,previous:Uint8ClampedArray|Uint8Array|null,width:number,height:number):GifFrame|null{
  let x0=0,y0=0,x1=width-1,y1=height-1;
  if(previous){
    x0=width;y0=height;x1=-1;y1=-1;
    for(let y=0,p=0;y<height;y++)for(let x=0;x<width;x++,p+=4){
      if(rgba[p]!==previous[p]||rgba[p+1]!==previous[p+1]||rgba[p+2]!==previous[p+2]){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
    }
    if(x1<0)return null;
  }
  const boxWidth=x1-x0+1,boxHeight=y1-y0+1,indices=new Uint8Array(boxWidth*boxHeight),used:number[]=[];
  counts.fill(0);sumR.fill(0);sumG.fill(0);sumB.fill(0);
  const same=(p:number)=>previous!==null&&rgba[p]===previous[p]&&rgba[p+1]===previous[p+1]&&rgba[p+2]===previous[p+2];
  for(let y=y0;y<=y1;y++)for(let x=x0,p=(y*width+x0)*4;x<=x1;x++,p+=4){
    if(same(p))continue;
    const r=rgba[p]!,g=rgba[p+1]!,b=rgba[p+2]!,bucket=(r>>3)<<10|(g>>3)<<5|b>>3;
    if(!counts[bucket])used.push(bucket);
    counts[bucket]!++;sumR[bucket]!+=r;sumG[bucket]!+=g;sumB[bucket]!+=b;
  }
  const palette=new Uint8Array(768),boxes=used.length>TRANSPARENT?medianCut(used,TRANSPARENT):used.map(bucket=>({items:[bucket],count:counts[bucket]!}));
  boxes.forEach((box,index)=>{
    let r=0,g=0,b=0,n=box.count,top=box.items[0]!;
    for(const bucket of box.items){mapped[bucket]=index;if(counts[bucket]!>counts[top]!)top=bucket;}
    // Si un color domina su caja (el relleno de una pieza frente a sus bordes suavizados), la caja lleva ese color exacto.
    const members=counts[top]!*2>=box.count?[top]:box.items;
    if(members.length===1)n=counts[top]!;
    for(const bucket of members){r+=sumR[bucket]!;g+=sumG[bucket]!;b+=sumB[bucket]!;}
    palette[index*3]=Math.round(r/n);palette[index*3+1]=Math.round(g/n);palette[index*3+2]=Math.round(b/n);
  });
  let transparent=false;
  for(let y=y0,o=0;y<=y1;y++)for(let x=x0,p=(y*width+x0)*4;x<=x1;x++,p+=4,o++){
    if(same(p)){indices[o]=TRANSPARENT;transparent=true;continue;}
    const bucket=(rgba[p]!>>3)<<10|(rgba[p+1]!>>3)<<5|rgba[p+2]!>>3;
    indices[o]=mapped[bucket]!;
  }
  return {x:x0,y:y0,width:boxWidth,height:boxHeight,indices,palette,transparent};
}

/** Compresión LZW de GIF para índices de 8 bits, ya partida en sub-bloques de hasta 255 bytes y con su terminador. */
export function lzwEncode(indices:Uint8Array):Uint8Array{
  const CLEAR=256,END=257;
  let out=new Uint8Array(Math.max(1024,indices.length>>1)),length=0,block=length++,blockSize=0,buffer=0,bits=0,codeSize=9,next=END+1;
  const table=new Map<number,number>();
  const byte=(value:number)=>{
    if(blockSize===255){out[block]=255;block=length++;blockSize=0;}
    if(length+2>out.length){const grown=new Uint8Array(out.length*2);grown.set(out);out=grown;}
    out[length++]=value;blockSize++;
  };
  const emit=(code:number)=>{buffer|=code<<bits;bits+=codeSize;while(bits>=8){byte(buffer&255);buffer>>>=8;bits-=8;}};
  emit(CLEAR);
  let prefix=indices[0]??0;
  for(let i=1;i<indices.length;i++){
    const value=indices[i]!,key=prefix<<8|value,found=table.get(key);
    if(found!==undefined){prefix=found;continue;}
    emit(prefix);
    if(next<4096){
      // El decodificador agranda el código cuando el que se acaba de asignar ya no entra en el tamaño actual.
      if(next===1<<codeSize)codeSize++;
      table.set(key,next++);
    }else{emit(CLEAR);table.clear();next=END+1;codeSize=9;}
    prefix=value;
  }
  emit(prefix);emit(END);
  if(bits>0)byte(buffer&255);
  out[block]=blockSize;
  if(length+1>out.length){const grown=new Uint8Array(length+1);grown.set(out);out=grown;}
  // Un bloque vacío al final cierra los datos de la imagen (si el último quedó en 0 bytes, ya es ese cierre).
  if(blockSize>0)out[length++]=0;
  return out.subarray(0,length);
}

const u16=(value:number)=>[value&255,value>>8&255];

/** Arma el archivo cuadro a cuadro. Las partes se pasan tal cual a un Blob: no se copia el archivo entero en memoria. */
export class GifWriter{
  readonly parts:Uint8Array[]=[];
  frames=0;
  constructor(readonly width:number,readonly height:number){
    // Cabecera, pantalla lógica sin paleta global y extensión NETSCAPE2.0 para que se repita sin fin.
    this.parts.push(Uint8Array.from([0x47,0x49,0x46,0x38,0x39,0x61,...u16(width),...u16(height),0x70,0,0,
      0x21,0xff,0x0b,0x4e,0x45,0x54,0x53,0x43,0x41,0x50,0x45,0x32,0x2e,0x30,0x03,0x01,0,0,0]));
  }
  /** Agrega un cuadro que se muestra `delayMs` (GIF mide en centésimas; por debajo de 20 ms los navegadores lo frenan). */
  add(frame:GifFrame,delayMs:number){
    const delay=Math.max(2,Math.min(65535,Math.round(delayMs/10)));
    this.parts.push(Uint8Array.from([
      // Control gráfico: no borrar el cuadro anterior (lo transparente deja ver lo que ya estaba) y cuánto dura.
      0x21,0xf9,0x04,0x04|(frame.transparent?1:0),...u16(delay),TRANSPARENT,0,
      // Descriptor de imagen con paleta local de 256 colores, y tamaño mínimo de código LZW.
      0x2c,...u16(frame.x),...u16(frame.y),...u16(frame.width),...u16(frame.height),0x87]),frame.palette,Uint8Array.of(8),lzwEncode(frame.indices));
    this.frames++;
  }
  finish():Uint8Array[]{this.parts.push(Uint8Array.of(0x3b));return this.parts;}
}
