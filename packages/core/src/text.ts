import type {DiagramNode} from './schema.js';

type Shape=NonNullable<DiagramNode['shape']>;
const KIND_SHAPE:Record<DiagramNode['kind'],Shape>={service:'rounded',database:'cylinder',cache:'rounded',queue:'rounded',external:'rounded',actor:'terminator',decision:'diamond',note:'note',text:'text',image:'rectangle',custom:'rectangle'};
/** Forma con la que se dibuja un nodo: la elegida, o la habitual de su tipo. */
export const shapeOf=(n:Pick<DiagramNode,'kind'|'shape'>):Shape=>n.shape??KIND_SHAPE[n.kind];

// Ancho medio de un carácter como fracción del tamaño de fuente. Es una estimación: el engine no puede medir tipografías.
const SANS=.56,MONO=.62;
export const textWidth=(text:string,size:number,mono=false)=>text.length*size*(mono?MONO:SANS);

/** Parte un label en líneas según el ancho disponible; pasado `maxLines`, el resto se abrevia con «…». */
export function wrapLabel(label:string,width:number,size=15,maxLines=3):string[]{
  const perLine=Math.max(4,Math.floor(width/(size*SANS))),lines:string[]=[];
  let line='';
  for(const word of label.split(/\s+/).filter(Boolean)){
    if(!line){line=word;continue;}
    if((line+' '+word).length<=perLine){line+=' '+word;continue;}
    lines.push(line);line=word;
  }
  if(line)lines.push(line);
  const fitted=lines.flatMap(l=>l.length<=perLine?[l]:l.match(new RegExp(`.{1,${perLine}}`,'g'))!);
  if(fitted.length<=maxLines)return fitted;
  const kept=fitted.slice(0,maxLines);kept[maxLines-1]=kept[maxLines-1].slice(0,Math.max(1,perLine-1)).trimEnd()+'…';
  return kept;
}

// Cuánto del ancho y alto de la caja queda libre para texto en cada forma.
const USABLE:Partial<Record<Shape,[number,number]>>={chevron:[.7,.9],ribbon:[.74,.9],diamond:[.86,.5],ellipse:[.74,.7],circle:[.7,.7],triangle:[.5,.45],hexagon:[.72,.9],parallelogram:[.72,.9],trapezoid:[.7,.9],star:[.42,.36],cloud:[.7,.6],cylinder:[.9,.72],'manual-input':[.9,.7],document:[.9,.72],delay:[.78,.9],predefined:[.78,.9],terminator:[.8,.9]};
/** Fracción de la caja disponible para texto, [ancho, alto], según la forma. */
/** Lo que ocupa el dibujo propio de una forma (encabezado, barra, cola): el texto va en el resto de la caja. */
export const SHAPE_INSET:Partial<Record<Shape,{top?:number;bottom?:number}>>={card:{top:30},browser:{top:24},folder:{top:10},bubble:{bottom:16},sticky:{top:6}};
/** Formas que llevan el nombre debajo y tienen tamaño fijo, como un avatar. */
export const LABEL_BELOW_SHAPES:readonly Shape[]=['actor','start','end','avatar','badge','map'];
/** Lado del círculo del icono en una píldora: ocupa la izquierda y corre el texto. */
export const PILL_ICON=32;
export const usableFraction=(shape:Shape):[number,number]=>USABLE[shape]??[1,1];
const round8=(value:number)=>Math.ceil(value/8)*8;
/** Lado del icono grande, en unidades del canvas. El editor lo dibuja con esta misma medida. */
export const ICON_LARGE=28;
export const detailLines=(details:string)=>details?details.split('\n').slice(0,40):[];
/** Ancho del texto de detalle (12 px) en una forma que no es una clase UML: un detalle largo se parte, no estira el nodo. */
export const DETAIL_WIDTH=220;
/** Detalle partido en renglones que entran en `width`. Una clase UML no se parte: cada renglón es un miembro. */
export function detailBlock(details:string,width:number,maxLines=6):string[]{
  return detailLines(details).flatMap(line=>line.trim()==='--'?[line]:wrapLabel(line,Math.max(60,width),12,3)).slice(0,maxLines);
}

/**
 * Tamaño mínimo para que el texto del nodo entre sin cortarse ni salirse de su forma.
 * Los nodos que agrega una IA se agrandan hasta este tamaño: el texto nunca queda pisando el borde.
 */
export function fitSize(n:Pick<DiagramNode,'kind'|'shape'|'label'|'subtitle'|'details'|'style'|'assetId'|'icon'>):{width:number;height:number}{
  const shape=shapeOf(n),size=n.style.fontSize??15,lineHeight=Math.round(size*1.25);
  if(n.assetId||shape==='start'||shape==='end')return {width:24,height:24};
  if(shape==='actor')return {width:48,height:72};
  if(shape==='avatar'||shape==='badge')return {width:88,height:88};
  if(shape==='map')return {width:168,height:112};
  if(shape==='text')return {width:round8(Math.min(360,textWidth(n.label,size))+12),height:round8(lineHeight+8)};
  const raw=detailLines(n.details);
  if(shape==='class'){
    const extra=raw;
    const widest=Math.max(textWidth(n.label,size)*1.05,...extra.map(l=>textWidth(l,12,true)),80);
    return {width:round8(widest+28),height:round8(lineHeight+18+(extra.length?extra.length*16+14:0))};
  }
  // Se busca el ancho más chico (hasta 240 de texto) con el que el label entra en tres líneas o menos.
  let lines=[n.label],inner=Math.min(240,textWidth(n.label,size));
  if(textWidth(n.label,size)>200){inner=200;lines=wrapLabel(n.label,inner,size,4);inner=Math.max(...lines.map(l=>textWidth(l,size)));}
  const extra=detailBlock(n.details,Math.max(Math.min(DETAIL_WIDTH,textWidth(n.details,12)),inner));
  const textW=Math.max(inner,n.subtitle?textWidth(n.subtitle,10,true):0,...extra.map(l=>textWidth(l,12))),textH=lines.length*lineHeight+(n.subtitle?16:0)+extra.length*16;
  const [fw,fh]=USABLE[shape]??[1,1];
  // Un icono chico ocupa la esquina y corre el texto; uno grande va arriba del nombre y suma alto.
  // En la tarjeta y la píldora el icono tiene su lugar (encabezado o círculo): no se suma como esquina ni como icono grande.
  const own=shape==='card'||shape==='pill',large=Boolean(n.icon)&&n.style.iconSize==='large'&&!own,inset=SHAPE_INSET[shape]??{};
  const iconW=shape==='pill'&&n.icon?PILL_ICON+10:n.icon&&!large&&!own?44-24:0;
  return {width:round8((Math.max(textW,large?ICON_LARGE:0)+24+iconW)/fw),height:round8((textH+22+(large?ICON_LARGE+8:0))/fh+(inset.top??0)+(inset.bottom??0))};
}
