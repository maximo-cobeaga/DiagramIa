'use strict';
// Native graph data: each scenario owns its topology and its playback route.
const flowNode=(id,x,y,es,en,kind='service',sub='')=>({id,x,y,w:148,h:82,es,en,kind,sub});
const flowEdge=(id,from,to,d,es='',en='',x=0,y=0,alternative=false)=>({id,from,to,d,es,en,x,y,alternative});
const commonNodes=[
  {...flowNode('user',24,250,'Usuario','Customer','service','CHECKOUT'),w:130},
  {...flowNode('api',202,250,'API','API','service','POST /orders'),w:130},
  {...flowNode('identity',380,250,'Validación','Validation','decision'),w:130},
  flowNode('stock',558,90,'Reservar stock','Reserve stock','service','INVENTORY'),
  flowNode('inventory',780,90,'Inventario','Inventory','database','POSTGRESQL')
];
const commonEdges=[
  flowEdge('request','user','api','M154 291H202'),
  flowEdge('validate','api','identity','M332 291H380'),
  flowEdge('reserve','identity','stock','M445 250V131H558','Válido','Valid',490,119),
  flowEdge('query','stock','inventory','M706 131H780')
];
const flowStep=(nodes,edges,es,en,tone='normal')=>({nodes,edges,es,en,tone});
const FLOW_SCENARIOS={
  success:{height:660,duration:18000,
    description:{es:'Stock, pago y confirmación. Después, tres tareas en paralelo.',en:'Stock, payment and confirmation. Then, three parallel tasks.'},
    note:{es:'Las tareas finales se ejecutan en paralelo.',en:'The final tasks run in parallel.'},
    nodes:[...commonNodes,
      flowNode('gateway',558,330,'Pasarela','Gateway','service','PAYMENT'),
      flowNode('decision',780,330,'¿Autorizado?','Authorized?','decision'),
      flowNode('order',984,250,'Pedido','Order','database','CONFIRMED'),
      flowNode('events',984,440,'Eventos','Events','service','ORDER.CREATED'),
      flowNode('mail',780,550,'Enviar email','Send email','service','NOTIFICATION'),
      flowNode('fulfilment',558,550,'Preparar envío','Prepare delivery','service','FULFILMENT'),
      {...flowNode('audit',202,550,'Registrar','Record','database','AUDIT LOG'),w:148}
    ],
    edges:[...commonEdges,
      flowEdge('stock-ok','inventory','gateway','M854 172V222Q854 232 844 232H642Q632 232 632 242V330','Disponible','Available',692,221),
      flowEdge('authorize','gateway','decision','M706 371H780'),
      flowEdge('confirm','decision','order','M928 371H952Q966 371 966 357V305Q966 291 980 291H984','Sí','Yes',952,351),
      flowEdge('emit','order','events','M1058 332V440'),
      flowEdge('notify','events','mail','M984 481H966Q954 481 954 493V579Q954 591 942 591H928'),
      flowEdge('ship','events','fulfilment','M1058 522V638H632V632'),
      flowEdge('audit-log','events','audit','M984 481H970V526H276V550'),
      flowEdge('request-response','order','api','M1058 250V45H267V250','201 CREATED','201 CREATED',604,33,true)
    ],
    steps:[
      flowStep(['user'],['request'],'El usuario envía el pedido.','The customer places the order.'),
      flowStep(['api'],['validate'],'La API recibe y valida la solicitud.','The API receives and validates the request.'),
      flowStep(['identity'],['reserve'],'Los datos son válidos. Se reserva stock.','The data is valid. Stock is reserved.'),
      flowStep(['stock'],['query'],'Inventario comprueba la disponibilidad.','Inventory checks availability.'),
      flowStep(['inventory'],['stock-ok'],'Hay stock. El pedido pasa a la pasarela.','Stock is available. The order reaches the gateway.'),
      flowStep(['gateway'],['authorize'],'La pasarela solicita autorización.','The gateway requests authorization.'),
      flowStep(['decision'],['confirm'],'Pago autorizado: se confirma el pedido.','Payment authorized: the order is confirmed.'),
      flowStep(['order'],['emit','request-response'],'El pedido se guarda y responde al usuario.','The order is saved and returns a response.'),
      flowStep(['events'],['notify','ship','audit-log'],'Un evento dispara tres tareas en paralelo.','One event triggers three tasks in parallel.'),
      flowStep(['mail','fulfilment','audit'],[],'Email, envío y auditoría completan el recorrido.','Email, delivery and audit complete the flow.')
    ]
  },
  failure:{height:720,duration:27000,
    description:{es:'El pago falla. El flujo se bifurca: recuperar la compra o cancelar al vencer.',en:'Payment fails. The flow branches: recover the order or cancel when it expires.'},
    note:{es:'Rama punteada: si vence el plazo, se cancela y se libera el stock.',en:'Dashed branch: if time runs out, cancel and release the stock.'},
    nodes:[...commonNodes,
      flowNode('gateway',558,290,'Pasarela','Gateway','service','PAYMENT'),
      flowNode('decision',780,290,'¿Autorizado?','Authorized?','decision'),
      flowNode('pending',984,290,'Pendiente','Pending','database','PAYMENT_FAILED'),
      flowNode('notify',984,450,'Avisar al usuario','Notify customer','service','ACTION REQUIRED'),
      flowNode('method',780,450,'Otro medio','New method','service','PAYMENT METHOD'),
      flowNode('retry',558,450,'Reintentar','Retry','service','ATTEMPT 02'),
      flowNode('order',984,90,'Confirmado','Confirmed','database','RECOVERED'),
      flowNode('expiry',984,610,'Vence el plazo','Time expires','service','15 MIN'),
      flowNode('cancel',780,610,'Cancelar','Cancel','service','ORDER.CANCELLED'),
      flowNode('release',558,610,'Liberar stock','Release stock','database','INVENTORY')
    ],
    edges:[...commonEdges,
      flowEdge('stock-ok','inventory','gateway','M854 172V186Q854 196 844 196H642Q632 196 632 206V290'),
      flowEdge('authorize','gateway','decision','M706 331H780'),
      flowEdge('decline','decision','pending','M928 331H984','No','No',956,318),
      flowEdge('flag','pending','notify','M1058 372V450'),
      flowEdge('choose','notify','method','M984 491H928','Cambiar','Change',956,478),
      flowEdge('retry-payment','method','retry','M780 491H706'),
      flowEdge('retry-loop','retry','gateway','M632 450V372','Nuevo intento','New attempt',689,416),
      flowEdge('recover','decision','order','M854 290V216Q854 206 864 206H1048Q1058 206 1058 196V172','Sí / intento 02','Yes / attempt 02',973,195),
      flowEdge('timeout','notify','expiry','M1058 532V610','Sin respuesta','No response',1102,577,true),
      flowEdge('cancel-order','expiry','cancel','M984 651H928','','',0,0,true),
      flowEdge('release-stock','cancel','release','M780 651H706','','',0,0,true)
    ],
    steps:[
      flowStep(['user'],['request'],'El usuario inicia la compra.','The customer starts the order.'),
      flowStep(['api'],['validate'],'La API valida la solicitud.','The API validates the request.'),
      flowStep(['identity'],['reserve'],'La solicitud es válida. Se reserva stock.','The request is valid. Stock is reserved.'),
      flowStep(['stock'],['query'],'Inventario consulta las unidades disponibles.','Inventory checks the available units.'),
      flowStep(['inventory'],['stock-ok'],'Las unidades quedan reservadas temporalmente.','The units are temporarily reserved.'),
      flowStep(['gateway'],['authorize'],'Primer intento de autorización.','First authorization attempt.'),
      flowStep(['decision'],['decline'],'La pasarela rechaza el pago.','The gateway declines the payment.','failure'),
      flowStep(['pending'],['flag'],'El pedido queda pendiente, no se pierde.','The order remains pending and is preserved.','failure'),
      flowStep(['notify'],['choose'],'Se avisa al usuario. Puede cambiar el medio de pago.','The customer is notified and can change payment method.'),
      flowStep(['method'],['retry-payment'],'El usuario elige otro medio de pago.','The customer selects another payment method.'),
      flowStep(['retry'],['retry-loop'],'El flujo vuelve a la pasarela con un nuevo intento.','The flow returns to the gateway for another attempt.'),
      flowStep(['gateway'],['authorize'],'Segundo intento, sin duplicar el pedido.','Second attempt, without duplicating the order.'),
      flowStep(['decision'],['recover'],'Esta vez se autoriza el pago.','This time the payment is authorized.'),
      flowStep(['order'],[],'Compra recuperada: el pedido queda confirmado.','Order recovered: the purchase is confirmed.'),
      flowStep(['order'],[],'Si nadie responde, la rama alternativa cancela y libera stock.','If no one responds, the alternate branch cancels and releases stock.')
    ]
  }
};
