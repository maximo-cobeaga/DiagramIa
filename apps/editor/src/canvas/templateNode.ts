import {emptyDocument,fitSize,type DiagramDocument,type DiagramNode,type Point} from '@diagramia/core';
import {snap,type NodeTemplate} from '../store/viewStore';

const CLASS_DETAILS='+ atributo: tipo\n--\n+ metodo(): tipo';

/**
 * El nodo que crea una plantilla de la paleta, centrado en `at`. Lo usan la creación, la vista previa que sigue al
 * cursor y las miniaturas de la paleta: lo que se ve antes de soltar es exactamente lo que queda.
 */
export function templateNode(template:NodeTemplate,at:Point,id='ghost'):DiagramNode{
  const base={kind:template.kind,shape:template.shape,label:template.label,subtitle:'',details:template.details??(template.shape==='class'?CLASS_DETAILS:''),style:template.style??{},assetId:null,icon:template.icon??null};
  const need=fitSize(base),size={width:Math.max(template.size.width,need.width),height:Math.max(template.size.height,need.height)};
  return {...base,link:null,id,size,position:{x:snap(at.x-size.width/2),y:snap(at.y-size.height/2)},zoneId:null,groupId:null};
}

const empty=emptyDocument('preview','Vista previa');
/** Documento mínimo con un solo nodo, para dibujarlo con el mismo código que el canvas. */
export const singleNodeDocument=(node:DiagramNode):DiagramDocument=>({...empty,nodes:[node]});
