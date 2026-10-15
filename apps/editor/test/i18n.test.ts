import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {pickLanguage,translate} from '../src/i18n.js';
import {EN} from '../src/i18n.en.js';
import {serverTextIn} from '../src/serverText.js';
import {BUILTIN_LIBRARY,openDocument,validateDocument,validateLibrary} from '@diagramia/core';
import {localizeContentIn} from '../src/content.en.js';

/** Claves que el código pasa a `t()`, leídas del árbol sintáctico: es lo que una persona ve en pantalla. */
function keysInCode():Map<string,string>{
  const root=fileURLToPath(new URL('../src',import.meta.url)),found=new Map<string,string>();
  (function walk(dir:string){
    for(const name of readdirSync(dir)){
      const full=join(dir,name);
      if(statSync(full).isDirectory()){walk(full);continue;}
      if(!/\.tsx?$/.test(name)||/i18n(\.en)?\.ts$/.test(name))continue;
      const source=ts.createSourceFile(full,readFileSync(full,'utf8'),ts.ScriptTarget.Latest,true,name.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
      (function visit(node:ts.Node){
        if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='t'){
          const first=node.arguments[0];
          assert.ok(first&&(ts.isStringLiteral(first)||ts.isNoSubstitutionTemplateLiteral(first)),`${name}: t() necesita un texto literal para poder traducirse (${node.getText(source).slice(0,60)})`);
          if(!found.has(first.text))found.set(first.text,name);
        }
        ts.forEachChild(node,visit);
      })(source);
    }
  })(root);
  return found;
}
const holes=(text:string)=>[...text.matchAll(/\{(\d+)\}/g)].map(match=>match[1]).sort().join(',');

test('todo texto visible del editor tiene su inglés y conserva los datos que intercala',()=>{
  const used=keysInCode();
  assert.ok(used.size>1000,'no se encontraron los textos del editor');
  const missing=[...used].filter(([key])=>!(key in EN)).map(([key,file])=>`${file}: ${key}`);
  assert.deepEqual(missing,[],'textos sin traducción: se verían en español en el editor en inglés');
  for(const [key,value] of Object.entries(EN)){
    assert.ok(value.trim().length>0||!key.trim(),`traducción vacía para «${key}»`);
    assert.equal(holes(value),holes(key),`«${key}» y su traducción no intercalan los mismos datos`);
    assert.equal(/^\s/.test(value),/^\s/.test(key),`«${key}»: el espacio inicial es parte del texto`);
    assert.equal(/\s$/.test(value),/\s$/.test(key),`«${key}»: el espacio final es parte del texto`);
  }
  assert.deepEqual(Object.keys(EN).filter(key=>!used.has(key)),[],'traducciones de textos que ya no existen');
});

test('los ejemplos y la biblioteca base se abren en inglés sin español a la vista, con los mismos IDs y siendo documentos válidos',()=>{
  const texts=(value:unknown,key='',out:string[]=[]):string[]=>{
    if(typeof value==='string'){if(['label','title','subtitle','details','caption','text','description','name'].includes(key))out.push(value);}
    else if(Array.isArray(value))for(const item of value)texts(item,key,out);
    else if(value&&typeof value==='object')for(const [name,child] of Object.entries(value))texts(child,name,out);
    return out;
  };
  const ids=(value:unknown)=>JSON.stringify(value,(key,child)=>['label','title','subtitle','details','caption','text','description','name'].includes(key)?undefined:child);
  const spanish=/[áéíóúñ¿¡]|\b(el|la|los|las|del|una|con|para|que|se|sus?)\b/i;
  for(const name of ['architecture','checkout-success','checkout-failure','login','explain-idea','plan-task']){
    const source=openDocument(JSON.parse(readFileSync(fileURLToPath(new URL(`../../../examples/${name}.diagramia.json`,import.meta.url)),'utf8'))).document;
    assert.equal(localizeContentIn('es',source),source,'en español el ejemplo no se toca');
    const english=localizeContentIn('en',source);
    assert.deepEqual(texts(english).filter(text=>spanish.test(text)),[],`${name}: textos sin traducir`);
    assert.equal(ids(english),ids(source),`${name}: traducir sólo cambia textos`);
    assert.doesNotThrow(()=>validateDocument(english),`${name}: el ejemplo traducido sigue siendo un documento válido`);
  }
  const library=localizeContentIn('en',BUILTIN_LIBRARY);
  assert.deepEqual(texts(library).filter(text=>spanish.test(text)),[],'biblioteca base: textos sin traducir');
  assert.equal(ids(library),ids(BUILTIN_LIBRARY));assert.doesNotThrow(()=>validateLibrary(library));
});

test('el idioma sale del enlace, después de lo elegido y por último del navegador',()=>{
  assert.equal(pickLanguage('en','es','es-AR'),'en');assert.equal(pickLanguage(null,'es','en-US'),'es');
  assert.equal(pickLanguage('fr','xx','es-419'),'es','un valor desconocido no cuenta');
  assert.equal(pickLanguage(null,null,'pt-BR'),'en');assert.equal(pickLanguage(null,null,null),'en');
});

test('traducir conserva el español si falta la entrada, oculta el contexto y ordena los datos según cada idioma',()=>{
  const dictionary={'Auto@@vehículo':'Car','{0} de {1}':'{1} total, {0} used'};
  assert.equal(translate(null,'Auto@@vehículo'),'Auto');assert.equal(translate(dictionary,'Auto@@vehículo'),'Car');
  assert.equal(translate(dictionary,'Sin traducción'),'Sin traducción');
  assert.equal(translate(null,'{0} de {1}',[2,5]),'2 de 5');assert.equal(translate(dictionary,'{0} de {1}',[2,5]),'5 total, 2 used');
  assert.equal(translate(null,'Pestaña «{0}».',['$& {1}']),'Pestaña «$& {1}».','un dato del usuario nunca se interpreta como patrón');
});

test('los mensajes del gateway se traducen por su texto y uno desconocido se muestra tal como llegó',()=>{
  const limit='Se agotaron los créditos de IA: máximo 6 por día y 20 por mes. Con el plan Pro tenés más.';
  assert.equal(serverTextIn('es',limit),limit);
  assert.equal(serverTextIn('en',limit),'You ran out of AI credits: the maximum is 6 per day and 20 per month. The Pro plan gives you more.');
  assert.equal(serverTextIn('en','El plan gratuito admite hasta 3 diagramas en la nube. Pasá a Pro para guardar más.'),'The Free plan allows up to 3 cloud diagrams. Go Pro to save more.');
  assert.equal(serverTextIn('en','Iniciá sesión para usar IA.'),'Sign in to use the AI.');
  assert.equal(serverTextIn('en','Mensaje nuevo que todavía no tiene traducción.'),'Mensaje nuevo que todavía no tiene traducción.');
});
