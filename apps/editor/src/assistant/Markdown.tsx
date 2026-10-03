import type {ReactNode} from 'react';

/** Negrita, cursiva y código en línea. Todo lo demás es texto: nunca se interpreta HTML que venga del modelo. */
function inline(text:string):ReactNode[]{
  const parts:ReactNode[]=[],pattern=/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last=0,match:RegExpExecArray|null;
  while((match=pattern.exec(text))){
    if(match.index>last)parts.push(text.slice(last,match.index));
    const token=match[0],key=parts.length;
    parts.push(token.startsWith('**')?<strong key={key}>{token.slice(2,-2)}</strong>:token.startsWith('`')?<code key={key}>{token.slice(1,-1)}</code>:<em key={key}>{token.slice(1,-1)}</em>);
    last=match.index+token.length;
  }
  if(last<text.length)parts.push(text.slice(last));
  return parts;
}

/**
 * Markdown chico para las respuestas del asistente: párrafos, títulos, listas y énfasis.
 * Alcanza para que una explicación se lea bien sin cargar una librería ni abrir la puerta a HTML.
 */
export function Markdown({text}:{text:string}){
  const blocks:ReactNode[]=[];
  let list:{ordered:boolean;items:string[]}|null=null,paragraph:string[]=[];
  const flushParagraph=()=>{if(paragraph.length){blocks.push(<p key={blocks.length}>{inline(paragraph.join(' '))}</p>);paragraph=[];}};
  const flushList=()=>{
    if(!list)return;
    const items=list.items.map((item,i)=><li key={i}>{inline(item)}</li>);
    blocks.push(list.ordered?<ol key={blocks.length}>{items}</ol>:<ul key={blocks.length}>{items}</ul>);list=null;
  };
  for(const raw of text.replace(/\r/g,'').split('\n')){
    const line=raw.trim(),heading=line.match(/^#{1,6}\s+(.*)$/),bullet=line.match(/^[-*•]\s+(.*)$/),numbered=line.match(/^\d+[.)]\s+(.*)$/);
    if(!line){flushParagraph();flushList();continue;}
    if(heading){flushParagraph();flushList();blocks.push(<p key={blocks.length} className="md-heading">{inline(heading[1])}</p>);continue;}
    if(bullet||numbered){
      flushParagraph();
      const ordered=Boolean(numbered);
      if(list&&list.ordered!==ordered)flushList();
      list??={ordered,items:[]};list.items.push((bullet??numbered)![1]);continue;
    }
    flushList();paragraph.push(line);
  }
  flushParagraph();flushList();
  return <div className="md">{blocks}</div>;
}
