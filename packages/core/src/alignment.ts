import type {ActionInput,DiagramDocument} from './schema.js';
import {documentBounds,nodeRect,unionRects,type Rect} from './geometry.js';
import {groupMembers,rootGroupId} from './engine.js';
import {selectionMoveActions} from './selection.js';

export type AlignmentGuide={axis:'x'|'y';at:number;from:number;to:number};
export type SelectionAlign='left'|'center'|'right'|'top'|'middle'|'bottom'|'horizontal'|'vertical';

/** Ajuste suave de bordes y centros. La tolerancia la pasa la UI en unidades de documento. */
export function snapSelection(doc:DiagramDocument,ids:string[],dx:number,dy:number,tolerance:number):{dx:number;dy:number;guides:AlignmentGuide[]}{
  const picked=new Set(ids),moving=doc.nodes.filter(n=>picked.has(n.id)||(n.zoneId&&picked.has(n.zoneId))).map(n=>n.id);
  const box=documentBounds(doc,[...ids,...moving]);if(!box)return {dx,dy,guides:[]};
  const excluded=new Set([...ids,...moving]),targets=[...doc.nodes.filter(n=>!excluded.has(n.id)).map(nodeRect),...doc.drawings.filter(n=>!excluded.has(n.id)).map(n=>documentBounds({...doc,nodes:[],drawings:[n],zones:[],frames:[],edges:[]})!)];
  const moved={...box,x:box.x+dx,y:box.y+dy},guides:AlignmentGuide[]=[];
  const match=(axis:'x'|'y')=>{
    const start=axis==='x'?'x':'y',size=axis==='x'?'width':'height',other=axis==='x'?'y':'x',span=axis==='x'?'height':'width';
    let best:{delta:number;at:number;target:Rect}|null=null;
    for(const target of targets){
      // Evita guías a elementos muy alejados de la zona de trabajo.
      if(target[other]>moved[other]+moved[span]+400||target[other]+target[span]<moved[other]-400)continue;
      for(const factor of [.5,0,1])for(const targetFactor of [.5,0,1]){
        const at=target[start]+target[size]*targetFactor,delta=at-(moved[start]+moved[size]*factor);
        if(Math.abs(delta)<=tolerance&&(!best||Math.abs(delta)<Math.abs(best.delta)))best={delta,at,target};
      }
    }
    if(best)guides.push({axis,at:best.at,from:Math.min(moved[other],best.target[other])-12,to:Math.max(moved[other]+moved[span],best.target[other]+best.target[span])+12});
    return best?.delta??0;
  };
  return {dx:dx+match('x'),dy:dy+match('y'),guides};
}

/** Un grupo completo es una pieza: alinear/distribuir nunca desarma sus distancias internas. */
export function selectionUnits(doc:DiagramDocument,ids:string[]):{ids:string[];box:Rect}[]{
  const picked=new Set(ids),seen=new Set<string>(),units:{ids:string[];box:Rect}[]=[];
  for(const id of ids){
    if(seen.has(id)||doc.edges.some(e=>e.id===id))continue;
    if(doc.nodes.some(n=>n.id===id&&n.zoneId&&picked.has(n.zoneId)))continue;
    const root=rootGroupId(doc,id),members=root?groupMembers(doc,root):[],unit=members.length&&members.every(id=>picked.has(id))?members:[id];
    const box=documentBounds(doc,unit);if(!box)continue;
    unit.forEach(id=>seen.add(id));units.push({ids:unit,box});
  }
  return units;
}

export function alignSelectionActions(doc:DiagramDocument,ids:string[],mode:SelectionAlign):ActionInput[]{
  const units=selectionUnits(doc,ids),bounds=unionRects(units.map(u=>u.box));if(!bounds||units.length<2)return [];
  const actions:ActionInput[]=[];
  if(mode==='horizontal'||mode==='vertical'){
    if(units.length<3)return [];
    const axis=mode==='horizontal'?'x':'y',size=mode==='horizontal'?'width':'height';
    units.sort((a,b)=>a.box[axis]-b.box[axis]);const first=units[0].box,last=units.at(-1)!.box;
    const gap=(last[axis]+last[size]-first[axis]-units.reduce((sum,u)=>sum+u.box[size],0))/(units.length-1);
    let position=first[axis];
    for(const unit of units){const delta=position-unit.box[axis];actions.push(...selectionMoveActions(doc,unit.ids,axis==='x'?delta:0,axis==='y'?delta:0));position+=unit.box[size]+gap;}
  }else{
    for(const unit of units){const b=unit.box;
      const dx=mode==='left'?bounds.x-b.x:mode==='center'?bounds.x+bounds.width/2-b.x-b.width/2:mode==='right'?bounds.x+bounds.width-b.x-b.width:0;
      const dy=mode==='top'?bounds.y-b.y:mode==='middle'?bounds.y+bounds.height/2-b.y-b.height/2:mode==='bottom'?bounds.y+bounds.height-b.y-b.height:0;
      if(dx||dy)actions.push(...selectionMoveActions(doc,unit.ids,dx,dy));
    }
  }
  return actions;
}
