import {useStore} from '../store/createStore';
import {setTheme,viewStore} from '../store/viewStore';
import {DEFAULT_PREFERENCES} from '../store/preferences';

export function EditorPreferences(){
  const prefs=useStore(viewStore);
  return <div className="preferences">
    <div className="settings-intro"><span className="eyebrow">A TU MANERA</span><h2>Tu espacio, tus reglas.</h2><p>Ajustá el canvas a tu forma de pensar. Se guarda en este navegador.</p></div>
    <section className="settings-card"><div className="settings-heading"><span aria-hidden="true">◐</span><div><h3>Apariencia</h3><p>Un lugar cómodo para concentrarte.</p></div></div>
      <fieldset className="theme-options"><legend>Tema del editor</legend>{([['light','Claro'],['dark','Oscuro'],['system','Sistema']] as const).map(([id,label])=><label key={id} className={'theme-choice '+id+(prefs.themeMode===id?' selected':'')}><input type="radio" name="editor-theme" value={id} checked={prefs.themeMode===id} onChange={()=>setTheme(id)}/><span className="theme-preview" aria-hidden="true"><i/><i/><i/></span><span>{label}</span></label>)}</fieldset>
      <label className="setting-row"><span><strong>Vista del catálogo</strong><small>Nombres al lado del elemento o miniaturas en cuadrícula.</small></span><select aria-label="Vista del catálogo" value={prefs.paletteLayout} onChange={e=>viewStore.set({paletteLayout:e.target.value as 'list'|'grid'})}><option value="list">Lista</option><option value="grid">Cuadrícula</option></select></label>
    </section>
    <section className="settings-card"><div className="settings-heading"><span aria-hidden="true">⌘</span><div><h3>Canvas y movimiento</h3><p>Las ayudas justas para trabajar con precisión.</p></div></div>
      {([{key:'showGrid',title:'Mostrar cuadrícula',detail:'Puntos de referencia en el fondo del canvas.'},{key:'snap',title:'Alineación inteligente',detail:'Ajustá las piezas a la cuadrícula y a otras piezas. Alt la libera.'},{key:'reduceMotion',title:'Reducir movimiento',detail:'Cámara instantánea y menos efectos. También se respeta tu sistema.'}] as const).map(({key,title,detail})=><label className="setting-row" key={key}><span><strong>{title}</strong><small>{detail}</small></span><input className="setting-switch" type="checkbox" role="switch" checked={prefs[key]} onChange={e=>viewStore.set({[key]:e.target.checked})}/></label>)}
    </section>
    <div className="settings-footer"><button onClick={()=>{viewStore.set({...DEFAULT_PREFERENCES});setTheme('system');}}>Restablecer preferencias</button><span>El contenido de tus diagramas se conserva.</span></div>
  </div>;
}
