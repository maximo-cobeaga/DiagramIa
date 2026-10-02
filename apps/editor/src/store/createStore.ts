import {useSyncExternalStore} from 'react';

export type Store<T>={get:()=>T;set:(next:Partial<T>|((state:T)=>Partial<T>))=>void;subscribe:(listener:()=>void)=>()=>void};

/** Store mínimo sin dependencias: estado inmutable, actualizaciones parciales y suscripción para React. */
export function createStore<T extends object>(initial:T):Store<T>{
  let state=initial;const listeners=new Set<()=>void>();
  return {
    get:()=>state,
    set(next){
      const patch=typeof next==='function'?next(state):next;
      if(Object.entries(patch).every(([key,value])=>Object.is(state[key as keyof T],value)))return;
      state={...state,...patch};listeners.forEach(listener=>listener());
    },
    subscribe(listener){listeners.add(listener);return()=>{listeners.delete(listener);};}
  };
}
export const useStore=<T>(store:Store<T>):T=>useSyncExternalStore(store.subscribe,store.get);
