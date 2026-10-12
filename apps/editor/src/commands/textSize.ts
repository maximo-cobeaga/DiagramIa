import {fitSize,type ActionInput,type DiagramNode} from '@diagramia/core';

export const textSize=(value:number)=>Math.max(8,Math.min(48,Math.round(value)));

/** Cambia la letra y agranda la pieza si el nuevo texto ya no cabe. Un lote conserva undo y revisión atómicos. */
export function textSizeActions(nodes:DiagramNode[],target:number|((current:number)=>number)):ActionInput[]{
  return nodes.flatMap(node=>{
    const current=node.style.fontSize??15,size=textSize(typeof target==='number'?target:target(current));
    if(size===current)return [];
    const style={...node.style,fontSize:size},needed=fitSize({...node,style});
    const width=Math.max(node.size.width,needed.width),height=Math.max(node.size.height,needed.height);
    return [
      {type:'UPDATE_NODE' as const,id:node.id,changes:{style}},
      ...(width>node.size.width||height>node.size.height?[{type:'RESIZE_NODE' as const,id:node.id,size:{width,height}}]:[])
    ];
  });
}
