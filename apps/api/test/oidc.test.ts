import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import type {AddressInfo} from 'node:net';
import {OidcAuthenticator} from '../src/auth/oidc.js';
import {createApp} from '../src/server.js';
import {UsageLedger} from '../src/usage.js';

test('OIDC validates PKCE, state, browser binding, nonce, signature and single-use callback',async()=>{
  const keys=generateKeyPairSync('rsa',{modulusLength:2048}),wrong=generateKeyPairSync('rsa',{modulusLength:2048});
  let issuer='',nonce='',challenge='',expectedRedirect='',badSignature=false,tokenCalls=0;
  const jwt=(payload:object)=>{
    const head=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:'test-key'})).toString('base64url');
    const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
    const input=`${head}.${body}`;
    return `${input}.${sign('RSA-SHA256',Buffer.from(input),badSignature?wrong.privateKey:keys.privateKey).toString('base64url')}`;
  };
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url??'/',issuer);
    const json=(value:unknown)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(value));};
    if(url.pathname==='/.well-known/openid-configuration')return json({issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks',response_types_supported:['code'],subject_types_supported:['public'],id_token_signing_alg_values_supported:['RS256'],token_endpoint_auth_methods_supported:['client_secret_post'],code_challenge_methods_supported:['S256']});
    if(url.pathname==='/jwks')return json({keys:[{...keys.publicKey.export({format:'jwk'}),kid:'test-key',use:'sig',alg:'RS256'}]});
    if(url.pathname==='/token'){
      tokenCalls++;
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
      const body=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      const verifier=body.get('code_verifier')??'',computed=createHash('sha256').update(verifier).digest('base64url');
      if(body.get('code')!=='good'||body.get('client_id')!=='test-client'||body.get('client_secret')!=='test-secret'||body.get('redirect_uri')!==expectedRedirect||computed!==challenge){res.statusCode=400;return json({error:'invalid_grant'});}
      const now=Math.floor(Date.now()/1000);
      return json({access_token:'local-test',token_type:'Bearer',expires_in:3600,id_token:jwt({iss:issuer,sub:'user-123',aud:'test-client',iat:now,exp:now+3600,nonce,email:'test@example.com',email_verified:true})});
    }
    res.statusCode=404;res.end();
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  issuer=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try{
    const auth=new OidcAuthenticator({issuer,clientId:'test-client',clientSecret:'test-secret',redirectUri:issuer+'/callback',homeUrl:issuer+'/'});
    expectedRedirect=issuer+'/callback';
    const first=await auth.begin();nonce=first.redirect.searchParams.get('nonce')!;challenge=first.redirect.searchParams.get('code_challenge')!;
    assert.equal(first.redirect.searchParams.get('code_challenge_method'),'S256');
    const callback=new URL(issuer+'/callback?code=good&state='+encodeURIComponent(first.redirect.searchParams.get('state')!));
    await assert.rejects(auth.finish(callback,'otra-pestaña'),/vencido|no iniciado/);
    assert.equal(tokenCalls,0,'cookie incorrecta bloquea antes de llamar al token endpoint');
    const second=await auth.begin();nonce=second.redirect.searchParams.get('nonce')!;challenge=second.redirect.searchParams.get('code_challenge')!;
    const valid=new URL(issuer+'/callback?code=good&state='+encodeURIComponent(second.redirect.searchParams.get('state')!));
    assert.deepEqual(await auth.finish(valid,second.cookie),{issuer,subject:'user-123',email:'test@example.com'});
    await assert.rejects(auth.finish(valid,second.cookie),/vencido|no iniciado/);
    const third=await auth.begin();nonce=third.redirect.searchParams.get('nonce')!;challenge=third.redirect.searchParams.get('code_challenge')!;badSignature=true;
    const forged=new URL(issuer+'/callback?code=good&state='+encodeURIComponent(third.redirect.searchParams.get('state')!));
    await assert.rejects(auth.finish(forged,third.cookie));
    badSignature=false;

    // El proxy Vite quita /api antes de entregar el callback. El servidor debe enviar al proveedor la URI pública registrada.
    const options:any={providers:[],ledger:new UsageLedger({dailyTokenBudget:1000,dailyUsdBudget:1,requestsPerMinute:10,ledgerPath:null}),config:{maxOutputTokens:1000,maxContextChars:1000,maxRepairs:0,timeoutMs:1000},productPrompt:'Prueba',allowedOrigins:[],token:null,accounts:{signIn:async()=>({token:'session-test'})}};
    const app=createApp(options);
    await new Promise<void>(resolve=>app.listen(0,'127.0.0.1',resolve));
    try{
      const gateway=`http://127.0.0.1:${(app.address() as AddressInfo).port}`;
      expectedRedirect=gateway+'/api/v1/auth/callback';
      options.oidc=new OidcAuthenticator({issuer,clientId:'test-client',clientSecret:'test-secret',redirectUri:expectedRedirect,homeUrl:gateway+'/'});
      const login=await fetch(gateway+'/v1/auth/login',{redirect:'manual'});
      assert.equal(login.status,302);
      const target=new URL(login.headers.get('location')!);nonce=target.searchParams.get('nonce')!;challenge=target.searchParams.get('code_challenge')!;
      const flowCookie=login.headers.get('set-cookie')!.split(';')[0];
      const callback=await fetch(gateway+'/v1/auth/callback?code=good&state='+encodeURIComponent(target.searchParams.get('state')!),{headers:{cookie:flowCookie},redirect:'manual'});
      assert.equal(callback.status,302);
      assert.ok(callback.headers.get('set-cookie')?.includes('diagramia_session=session-test'));
    }finally{await new Promise<void>(resolve=>app.close(resolve));}
  }finally{await new Promise<void>(resolve=>server.close(resolve));}
});
