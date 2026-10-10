import {Component,type ErrorInfo,type ReactNode} from 'react';
import {documentStore} from '../store/documentStore';
import {track} from '../telemetry';
import {saveFile} from '../ui';

/**
 * Último recurso (ADR 094): si un componente falla al dibujarse, la página no queda en blanco. El trabajo ya está guardado
 * en este navegador; se ofrece volver a intentar, recargar y bajar una copia. Sólo se mide el tipo de error, nunca su mensaje.
 */
export class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean;attempts:number}>{
  state={failed:false,attempts:0};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:unknown,_info:ErrorInfo){
    const name=error instanceof Error&&/^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(error.name)?error.name:'Unknown';
    track('js_error',{kind:'error',name,where:'react/boundary'});
  }
  private download=()=>{
    try{const {doc}=documentStore.get();saveFile(`${doc.id}.diagramia.json`,JSON.stringify(doc,null,2)+'\n','application/json');}
    catch{/* si ni el documento se puede leer, queda la copia guardada en el navegador */}
  };
  render(){
    if(!this.state.failed)return this.props.children;
    return <main className="crash" role="alert">
      <h1>Algo falló al mostrar el editor</h1>
      <p>Tu trabajo está guardado en este navegador. Probá continuar; si vuelve a pasar, recargá la página.</p>
      <div className="crash-actions">
        {this.state.attempts<2&&<button className="primary" onClick={()=>this.setState(state=>({failed:false,attempts:state.attempts+1}))}>Continuar</button>}
        <button className={this.state.attempts<2?'':'primary'} onClick={()=>location.reload()}>Recargar la página</button>
        <button onClick={this.download}>Descargar una copia de mi diagrama</button>
      </div>
    </main>;
  }
}
