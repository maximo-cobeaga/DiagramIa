'use strict';
// Recorridos cortos de la vida diaria de un equipo (no sólo de ingeniería): cada escenario tiene su topología y su ruta de reproducción.
const flowNode=(id,x,es,en,kind='service',sub='')=>({id,x,y:108,w:130,h:82,es,en,kind,sub});
const flowEdge=(id,from,to,d,es='',en='',x=0,y=0,alternative=false)=>({id,from,to,d,es,en,x,y,alternative});
const flowStep=(nodes,edges,es,en,tone='normal')=>({nodes,edges,es,en,tone});
// Cuatro piezas en línea: 30, 230, 430 y 630. Las conexiones salen del borde derecho y entran por el izquierdo.
const line=['M160 149H230','M360 149H430','M560 149H630'];

const FLOW_SCENARIOS={
  campaign:{width:780,height:300,duration:12500,zone:'MARKETING / CAMPAÑA',
    description:{es:'Una idea se vuelve campaña. Si faltan cambios, vuelve al borrador.',en:'An idea becomes a campaign. If changes are needed, it goes back to draft.'},
    note:{es:'La rama punteada es el camino de vuelta.',en:'The dashed branch is the way back.'},
    nodes:[
      flowNode('idea',30,'Idea','Idea','service','EQUIPO'),
      flowNode('draft',230,'Borrador','Draft','service','CONTENIDO'),
      flowNode('review',430,'¿Aprobada?','Approved?','decision'),
      flowNode('publish',630,'Publicada','Published','database','CALENDARIO')
    ],
    edges:[
      flowEdge('propose','idea','draft',line[0]),
      flowEdge('submit','draft','review',line[1]),
      flowEdge('approve','review','publish',line[2],'Sí','Yes',580,140),
      flowEdge('back','review','draft','M495 197V250H295V197','Con cambios','Needs changes',395,243,true)
    ],
    steps:[
      flowStep(['idea'],['propose'],'Alguien del equipo propone una idea.','Someone on the team proposes an idea.'),
      flowStep(['draft'],['submit'],'Se arma el primer borrador.','The first draft takes shape.'),
      flowStep(['review'],['back'],'Si faltan cambios, vuelve al borrador.','If changes are needed, it goes back to draft.'),
      flowStep(['draft','review'],['submit'],'Se ajusta y se revisa otra vez.','It is adjusted and reviewed again.'),
      flowStep(['publish'],['approve'],'Aprobada: se publica en el calendario.','Approved: it is published on the calendar.')
    ]
  },
  hiring:{width:780,height:300,duration:10000,zone:'PERSONAS / PRIMER DÍA',
    description:{es:'De la oferta aceptada al primer día, sin que nada se pierda.',en:'From accepted offer to first day, with nothing lost.'},
    note:{es:'Cada área sabe qué le toca y cuándo.',en:'Every team knows what is theirs and when.'},
    nodes:[
      flowNode('offer',30,'Oferta aceptada','Offer accepted','service','CANDIDATO'),
      flowNode('contract',230,'Contrato','Contract','service','FIRMA'),
      flowNode('setup',430,'Equipo y accesos','Gear & access','service','IT'),
      flowNode('day1',630,'Primer día','First day','database','BIENVENIDA')
    ],
    edges:[
      flowEdge('sign','offer','contract',line[0]),
      flowEdge('request','contract','setup',line[1]),
      flowEdge('ready','setup','day1',line[2])
    ],
    steps:[
      flowStep(['offer'],['sign'],'La persona acepta la oferta.','The candidate accepts the offer.'),
      flowStep(['contract'],['request'],'Se firma el contrato.','The contract is signed.'),
      flowStep(['setup'],['ready'],'IT prepara el equipo y los accesos.','IT prepares the equipment and access.'),
      flowStep(['day1'],[],'Todo listo para su primer día.','Everything is ready for day one.')
    ]
  },
  purchase:{width:780,height:300,duration:11000,zone:'OPERACIONES / COMPRA',
    description:{es:'Las compras chicas salen solas. Las grandes pasan por Finanzas.',en:'Small purchases go through. Large ones go to Finance.'},
    note:{es:'La rama punteada es el atajo para lo chico.',en:'The dashed branch is the shortcut for small ones.'},
    nodes:[
      flowNode('ask',30,'Pedido','Request','service','UN ÁREA'),
      flowNode('amount',230,'¿Es grande?','Large?','decision'),
      flowNode('finance',430,'Aprobación','Approval','service','FINANZAS'),
      flowNode('order',630,'Compra','Purchase','database','ORDEN')
    ],
    edges:[
      flowEdge('send','ask','amount',line[0]),
      flowEdge('large','amount','finance',line[1],'Sí','Yes',385,140),
      flowEdge('approved','finance','order',line[2]),
      flowEdge('small','amount','order','M295 197V250H695V197','No: sigue directo','No: goes straight',470,243,true)
    ],
    steps:[
      flowStep(['ask'],['send'],'Un área pide comprar algo.','A team asks to buy something.'),
      flowStep(['amount'],['large'],'Se mira el monto. Este es grande.','The amount is checked. This one is large.'),
      flowStep(['finance'],['approved'],'Finanzas lo revisa y lo aprueba.','Finance reviews and approves it.'),
      flowStep(['order'],[],'Se genera la orden de compra.','The purchase order is created.')
    ]
  }
};
