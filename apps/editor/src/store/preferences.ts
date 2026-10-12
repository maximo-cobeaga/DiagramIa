/** Preferencias de este navegador; nunca entran al documento ni a su historial. */
export type Preferences={showGrid:boolean;snap:boolean;reduceMotion:boolean;paletteLayout:'list'|'grid'};
export const PREFERENCES_KEY='diagramia.preferences';
export const DEFAULT_PREFERENCES:Preferences={showGrid:true,snap:true,reduceMotion:false,paletteLayout:'list'};
export function parsePreferences(raw:string|null):Preferences{
  try{
    const value:unknown=JSON.parse(raw??'null');
    if(!value||typeof value!=='object')return {...DEFAULT_PREFERENCES};
    const p=value as Record<string,unknown>;
    return {showGrid:typeof p.showGrid==='boolean'?p.showGrid:true,snap:typeof p.snap==='boolean'?p.snap:true,
      reduceMotion:typeof p.reduceMotion==='boolean'?p.reduceMotion:false,paletteLayout:p.paletteLayout==='grid'?'grid':'list'};
  }catch{return {...DEFAULT_PREFERENCES};}
}
