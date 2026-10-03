import type {Point} from '@diagramia/core';

type InkStroke={addPoint:(point:Point&{t:number})=>void};
type Recognizer={startDrawing:(options:{recognitionType:string;alternatives:number})=>{addStroke:(stroke:InkStroke)=>void;getPrediction:()=>Promise<{text:string}[]>;clear:()=>void};finish:()=>void};
export type HandwritingPlatform={createHandwritingRecognizer?:(options:{languages:string[]})=>Promise<Recognizer>;HandwritingStroke?:new()=>InkStroke};
export type RecognitionResult={status:'recognized';text:string}|{status:'unavailable'|'failed';text:''};
/** API local del dispositivo. No manda escritura al gateway, no genera texto si no hay un reconocedor real. */
export async function recognizeHandwriting(strokes:Point[][],platform:HandwritingPlatform,timeoutMs=4000):Promise<RecognitionResult>{
  if(!platform.createHandwritingRecognizer||!platform.HandwritingStroke)return {status:'unavailable',text:''};
  let recognizer:Recognizer|undefined,drawing:ReturnType<Recognizer['startDrawing']>|undefined,expired=false,timer:ReturnType<typeof setTimeout>|undefined;
  const release=()=>{try{drawing?.clear();recognizer?.finish();}catch{/* liberar recursos no invalida la predicción */}drawing=undefined;recognizer=undefined;};
  const work=async():Promise<RecognitionResult>=>{
    try{
      recognizer=await platform.createHandwritingRecognizer!({languages:['es']});
      if(expired)return {status:'failed',text:''};
      drawing=recognizer.startDrawing({recognitionType:'text',alternatives:1});
      let t=0;for(const points of strokes){const stroke=new platform.HandwritingStroke!();for(const p of points)stroke.addPoint({...p,t:t+=8});drawing.addStroke(stroke);t+=100;}
      const prediction=await drawing.getPrediction(),text=prediction[0]?.text?.replace(/\s+/g,' ').trim().slice(0,200);
      return text?{status:'recognized',text}:{status:'failed',text:''};
    }catch{return {status:'failed',text:''};}
    finally{release();}
  };
  try{return await Promise.race([work(),new Promise<RecognitionResult>(resolve=>{timer=setTimeout(()=>{expired=true;release();resolve({status:'failed',text:''});},timeoutMs);})]);}
  finally{clearTimeout(timer);}
}
export function deviceHandwriting():HandwritingPlatform{
  const nav=navigator as Navigator&Pick<HandwritingPlatform,'createHandwritingRecognizer'>;
  return {createHandwritingRecognizer:nav.createHandwritingRecognizer?.bind(nav),HandwritingStroke:(globalThis as unknown as HandwritingPlatform).HandwritingStroke};
}
