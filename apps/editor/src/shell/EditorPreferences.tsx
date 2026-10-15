import {useStore} from '../store/createStore';
import {setTheme,viewStore} from '../store/viewStore';
import {accountStore} from '../store/accountStore';
import {DEFAULT_PREFERENCES} from '../store/preferences';
import {LANG,setLanguage,t,type Lang} from '../i18n';

export function EditorPreferences(){
  const prefs=useStore(viewStore),{auth}=useStore(accountStore);
  return <div className="preferences">
    <div className="settings-intro"><span className="eyebrow">{t('A TU MANERA')}</span><h2>{t('Tu espacio, tus reglas.')}</h2><p>{t('Ajustá el canvas a tu forma de pensar. Se guarda en este navegador.')}</p></div>
    <section className="settings-card"><div className="settings-heading"><span aria-hidden="true">◐</span><div><h3>{t('Apariencia')}</h3><p>{t('Un lugar cómodo para concentrarte.')}</p></div></div>
      <fieldset className="theme-options"><legend>{t('Tema del editor')}</legend>{([['light',t('Claro')],['dark',t('Oscuro')],['system',t('Sistema')]] as const).map(([id,label])=><label key={id} className={'theme-choice '+id+(prefs.themeMode===id?' selected':'')}><input type="radio" name="editor-theme" value={id} checked={prefs.themeMode===id} onChange={()=>setTheme(id)}/><span className="theme-preview" aria-hidden="true"><i/><i/><i/></span><span>{label}</span></label>)}</fieldset>
      <label className="setting-row"><span><strong>{t('Idioma')}</strong><small>{t('El editor se recarga para aplicar el cambio. Tus diagramas no cambian.')}</small></span><select aria-label={t('Idioma')} value={LANG} onChange={e=>setLanguage(e.target.value as Lang)}><option value="en">English</option><option value="es">Español</option></select></label>
      <label className="setting-row"><span><strong>{t('Vista del catálogo')}</strong><small>{t('Nombres al lado del elemento o miniaturas en cuadrícula.')}</small></span><select aria-label={t('Vista del catálogo')} value={prefs.paletteLayout} onChange={e=>viewStore.set({paletteLayout:e.target.value as 'list'|'grid'})}><option value="list">{t('Lista')}</option><option value="grid">{t('Cuadrícula')}</option></select></label>
    </section>
    <section className="settings-card"><div className="settings-heading"><span aria-hidden="true">⌘</span><div><h3>{t('Canvas y movimiento')}</h3><p>{t('Las ayudas justas para trabajar con precisión.')}</p></div></div>
      {([{key:'showGrid',title:t('Mostrar cuadrícula'),detail:t('Puntos de referencia en el fondo del canvas.')},{key:'snap',title:t('Alineación inteligente'),detail:t('Ajustá las piezas a la cuadrícula y a otras piezas. Alt la libera.')},{key:'reduceMotion',title:t('Reducir movimiento'),detail:t('Cámara instantánea y menos efectos. También se respeta tu sistema.')}] as const).map(({key,title,detail})=><label className="setting-row" key={key}><span><strong>{title}</strong><small>{detail}</small></span><input className="setting-switch" type="checkbox" role="switch" checked={prefs[key]} onChange={e=>viewStore.set({[key]:e.target.checked})}/></label>)}
    </section>
    {auth!=='unavailable'&&<section className="settings-card"><div className="settings-heading"><span aria-hidden="true">☁</span><div><h3>{t('Guardado')}</h3><p>{t('Tus diagramas siempre quedan en este navegador. La nube los lleva a cualquier dispositivo.')}</p></div></div>
      <label className="setting-row"><span><strong>{t('Guardar automáticamente en la nube')}</strong><small>{auth==='signed-in'?t('Cada diagrama con contenido se guarda solo en tu cuenta y sigue guardándose con cada cambio. Cuenta para el límite de tu plan, y al guardarse por primera vez se reinicia el historial de deshacer de ese diagrama.'):t('Iniciá sesión para usarlo: cada diagrama con contenido se guardará solo en tu cuenta.')}</small></span><input className="setting-switch" type="checkbox" role="switch" aria-label={t('Guardar automáticamente en la nube')} checked={prefs.autoCloud} onChange={e=>viewStore.set({autoCloud:e.target.checked})}/></label>
    </section>}
    <div className="settings-footer"><button onClick={()=>{viewStore.set({...DEFAULT_PREFERENCES});setTheme('system');}}>{t('Restablecer preferencias')}</button><span>{t('El contenido de tus diagramas se conserva.')}</span></div>
  </div>;
}
