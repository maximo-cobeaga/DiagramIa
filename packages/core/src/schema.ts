import {z} from 'zod';

export const SCHEMA_VERSION='1.7.0';
export const READABLE_VERSIONS=['1.0.0','1.1.0','1.2.0','1.3.0','1.4.0','1.5.0','1.6.0','1.7.0'] as const;

export const Id=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
const Label=z.string().min(1).max(200);
const Coord=z.number().finite().min(-1_000_000).max(1_000_000);
export const PositionSchema=z.strictObject({x:Coord,y:Coord});
export const SizeSchema=z.strictObject({width:z.number().min(24).max(4000),height:z.number().min(24).max(4000)});
export const BoundsSchema=z.strictObject({x:Coord,y:Coord,width:z.number().min(100).max(10000),height:z.number().min(100).max(10000)});
export const NODE_KINDS=['service','database','cache','queue','external','actor','decision','note','text','image','custom'] as const;
export const PORTS=['auto','top','right','bottom','left'] as const;
const Port=z.enum(PORTS);
// Iconos para cualquier tema, no sólo arquitectura (1.6.0): personas, ideas, negocio, educación, comunicación, lugares y tiempo.
// Los diez primeros son los originales; el orden no importa para el documento, que guarda el nombre.
export const ICONS=['user','server','database','cloud','lock','queue','globe','bolt','mail','gear',
  'users','heart','idea','star','target','flag','question','check','alert',
  'coin','cart','store','chart','trend','briefcase','file','calendar','clock','tag','box','truck',
  'chat','phone','bell','laptop','wifi','home','building','pin','book','graduation','pencil',
  'search','key','shield','leaf','play','link','photo',
  // Viajes, ocio y vida cotidiana.
  'car','bus','train','plane','ship','bike','umbrella','sun','wave','mountain','food','coffee','bed','camera','map','ticket','music','bag','sparkle'] as const;
export const ASSET_TYPES=['image/png','image/jpeg','image/webp','image/svg+xml'] as const;
// Sin almacenamiento de archivos todavía (P4.3), las imágenes viajan dentro del documento: por eso el tope es bajo.
export const MAX_ASSET_BYTES=400_000;
const Route=z.array(PositionSchema).min(2).max(80);
// `kind` dice qué ES el elemento (lo usa la IA y la documentación); `shape` dice cómo se dibuja. Sin shape, cada kind tiene su forma habitual.
export const SHAPES=['rectangle','rounded','ellipse','circle','diamond','triangle','hexagon','parallelogram','trapezoid','star','cloud','cylinder','note','text','terminator','document','predefined','manual-input','delay','actor','class','package','component','start','end',
  // 1.6.0: formas con dibujo propio para temas generales (nota adhesiva, tarjeta con encabezado, globo de diálogo, etc.).
  'sticky','card','bubble','pill','avatar','badge','ribbon','folder','browser','chevron','map'] as const;
export const ARROWS=['none','arrow','open','triangle','diamond','diamond-filled','circle'] as const;
export const LINES=['orthogonal','straight','curved'] as const;
// Los colores sólo admiten #RRGGBB: nunca llega CSS arbitrario al dibujo ni al export.
const Color=z.string().regex(/^#[0-9a-fA-F]{6}$/);
const Dash=z.enum(['solid','dashed','dotted']);
// `iconSize: large` dibuja el icono grande y centrado sobre el nombre, como una tarjeta (1.6.0).
export const NodeStyleSchema=z.strictObject({fill:Color,stroke:Color,textColor:Color,strokeWidth:z.number().min(0).max(8),dash:Dash,fontSize:z.number().int().min(8).max(48),bold:z.boolean(),italic:z.boolean(),align:z.enum(['left','center','right']),iconSize:z.enum(['small','large'])}).partial();
export const EdgeStyleSchema=z.strictObject({stroke:Color,textColor:Color,strokeWidth:z.number().min(0.5).max(8),dash:Dash,fontSize:z.number().int().min(8).max(32)}).partial();
export const ZoneStyleSchema=z.strictObject({fill:Color,stroke:Color,textColor:Color,dash:Dash}).partial();
/** Punto de enganche de una conexión sobre el borde de un nodo, relativo a su caja (0..1 en cada eje). */
export const AnchorSchema=z.strictObject({x:z.number().min(0).max(1),y:z.number().min(0).max(1)});
export const DrawingSchema=z.strictObject({id:Id,kind:z.enum(['line','arrow','freehand']),points:z.array(PositionSchema).min(2).max(500),style:EdgeStyleSchema.default({})});

// Los campos se declaran sin defaults para que los `changes` parciales no reinicien valores omitidos.
const nodeFields={kind:z.enum(NODE_KINDS),label:Label,position:PositionSchema,size:SizeSchema,zoneId:Id.nullable(),groupId:Id.nullable(),subtitle:z.string().max(120),assetId:Id.nullable(),icon:z.enum(ICONS).nullable(),
  // Enlace a una página (1.6.0). Sólo http(s): nunca javascript:, data: ni rutas locales.
  link:z.string().max(2000).regex(/^https?:\/\/[^\s"<>]+$/i,'El enlace debe empezar con https:// o http://').nullable(),shape:z.enum(SHAPES).nullable(),style:NodeStyleSchema,details:z.string().max(2000)};
export const NodeSchema=z.strictObject({id:Id,...nodeFields,zoneId:nodeFields.zoneId.default(null),groupId:nodeFields.groupId.default(null),subtitle:nodeFields.subtitle.default(''),assetId:nodeFields.assetId.default(null),icon:nodeFields.icon.default(null),link:nodeFields.link.default(null),shape:nodeFields.shape.default(null),style:NodeStyleSchema.default({}),details:nodeFields.details.default('')});
const edgeFields={from:Id,to:Id,label:z.string().max(160),alternative:z.boolean(),fromPort:Port,toPort:Port,fromAnchor:AnchorSchema.nullable(),toAnchor:AnchorSchema.nullable(),startArrow:z.enum(ARROWS),endArrow:z.enum(ARROWS),line:z.enum(LINES),style:EdgeStyleSchema};
export const EdgeSchema=z.strictObject({id:Id,...edgeFields,label:edgeFields.label.default(''),points:Route.optional(),alternative:edgeFields.alternative.default(false),fromPort:Port.default('auto'),toPort:Port.default('auto'),fromAnchor:AnchorSchema.nullable().default(null),toAnchor:AnchorSchema.nullable().default(null),startArrow:z.enum(ARROWS).default('none'),endArrow:z.enum(ARROWS).default('arrow'),line:z.enum(LINES).default('orthogonal'),style:EdgeStyleSchema.default({})});
export const ZoneSchema=z.strictObject({id:Id,label:Label,bounds:BoundsSchema,style:ZoneStyleSchema.default({})});
export const GroupSchema=z.strictObject({id:Id,label:z.string().max(200).default(''),parentId:Id.nullable().default(null)});
export const FrameSchema=z.strictObject({id:Id,label:Label,bounds:BoundsSchema});
export const AssetSchema=z.strictObject({id:Id,label:Label,mediaType:z.enum(ASSET_TYPES),data:z.string().min(8).max(Math.ceil(MAX_ASSET_BYTES/3)*4+4).regex(/^[A-Za-z0-9+/]+={0,2}$/),width:z.number().int().min(1).max(8192),height:z.number().int().min(1).max(8192)});
const annotationFields={targetId:Id.nullable(),severity:z.enum(['info','warning','risk']),text:z.string().min(1).max(1000),suggestion:z.string().max(1000),source:z.enum(['user','ai']),resolved:z.boolean()};
export const AnnotationSchema=z.strictObject({id:Id,...annotationFields,targetId:annotationFields.targetId.default(null),severity:annotationFields.severity.default('info'),suggestion:annotationFields.suggestion.default(''),source:annotationFields.source.default('user'),resolved:annotationFields.resolved.default(false)});
// Un escenario es una rama con nombre de la misma animación; un estado es la etiqueta que un nodo muestra desde ese paso en adelante.
const scenarioFields={label:Label,description:z.string().max(300)};
export const ScenarioSchema=z.strictObject({id:Id,...scenarioFields,description:scenarioFields.description.default('')});
// Cámara de un paso (1.7.0): a qué distancia mira lo que el paso resalta y cómo llega hasta ahí.
// auto: con frame, el frame; si no, lo resaltado con buena parte del diagrama alrededor. stay: no mueve la vista.
export const STEP_FOCUS=['auto','close','medium','wide','overview','stay'] as const;
export const STEP_TRANSITIONS=['smooth','slow','cut'] as const;
export const StepStateSchema=z.strictObject({nodeId:Id,label:z.string().min(1).max(40),tone:z.enum(['normal','failure']).default('normal')});
const stepFields={caption:z.string().max(500),durationMs:z.number().int().min(100).max(30000),nodeIds:z.array(Id).max(100),edgeIds:z.array(Id).max(100),tone:z.enum(['normal','failure']),frameId:Id.nullable(),scenarioIds:z.array(Id).max(20),states:z.array(StepStateSchema).max(20),focus:z.enum(STEP_FOCUS),transition:z.enum(STEP_TRANSITIONS)};
export const StepSchema=z.strictObject({id:Id,...stepFields,tone:stepFields.tone.default('normal'),frameId:stepFields.frameId.default(null),scenarioIds:stepFields.scenarioIds.default([]),states:stepFields.states.default([]),focus:stepFields.focus.default('auto'),transition:stepFields.transition.default('smooth')});
const trackClipFields={stepId:Id,nodeIds:z.array(Id).max(100),edgeIds:z.array(Id).max(100),caption:z.string().max(500),frameId:Id.nullable()};
export const TrackClipSchema=z.strictObject({id:Id,stepId:Id,nodeIds:trackClipFields.nodeIds.default([]),edgeIds:trackClipFields.edgeIds.default([]),caption:trackClipFields.caption.default(''),frameId:trackClipFields.frameId.default(null)});
export const AnimationTrackSchema=z.strictObject({id:Id,label:Label,kind:z.enum(['highlight','caption','camera']),clips:z.array(TrackClipSchema).max(200).default([])});
export const AnimationSchema=z.strictObject({id:Id,label:Label,scenarios:z.array(ScenarioSchema).max(20).default([]),steps:z.array(StepSchema).min(1).max(200),tracks:z.array(AnimationTrackSchema).max(12).default([])});
export const DocumentSchema=z.strictObject({
  schemaVersion:z.literal(SCHEMA_VERSION),id:Id,title:Label,revision:z.number().int().nonnegative(),
  nodes:z.array(NodeSchema).max(2000),edges:z.array(EdgeSchema).max(4000),zones:z.array(ZoneSchema).max(200),
  drawings:z.array(DrawingSchema).max(2000).default([]),
  groups:z.array(GroupSchema).max(500).default([]),frames:z.array(FrameSchema).max(200).default([]),
  animations:z.array(AnimationSchema).max(100),
  assets:z.array(AssetSchema).max(40).default([]),annotations:z.array(AnnotationSchema).max(500).default([]),
  appliedBatches:z.array(z.strictObject({id:Id,signature:z.string().max(150000)})).max(100).default([])
});
export type DiagramDocument=z.infer<typeof DocumentSchema>;
export type DiagramNode=z.infer<typeof NodeSchema>;
export type DiagramEdge=z.infer<typeof EdgeSchema>;
export type DiagramDrawing=z.infer<typeof DrawingSchema>;
export type DiagramZone=z.infer<typeof ZoneSchema>;
export type DiagramGroup=z.infer<typeof GroupSchema>;
export type DiagramFrame=z.infer<typeof FrameSchema>;
export type DiagramAnimation=z.infer<typeof AnimationSchema>;
export type DiagramStep=z.infer<typeof StepSchema>;
export type DiagramTrack=z.infer<typeof AnimationTrackSchema>;
export type DiagramTrackClip=z.infer<typeof TrackClipSchema>;
export type DiagramAsset=z.infer<typeof AssetSchema>;
export type DiagramAnnotation=z.infer<typeof AnnotationSchema>;
export type DiagramScenario=z.infer<typeof ScenarioSchema>;
export type Port=z.infer<typeof Port>;

export const PlacementSchema=z.strictObject({
  inside:Id.optional(),insideLabel:Label.optional(),
  below:Id.optional(),above:Id.optional(),rightOf:Id.optional(),leftOf:Id.optional(),
  gap:z.number().min(0).max(1000).default(40)
});
export type Placement=z.infer<typeof PlacementSchema>;
const Ids=z.array(Id).min(1).max(500);

export const ActionSchema=z.discriminatedUnion('type',[
  z.strictObject({type:z.literal('UPDATE_DOCUMENT'),changes:z.strictObject({title:Label}).partial()}),
  z.strictObject({type:z.literal('ADD_NODE'),node:NodeSchema,placement:PlacementSchema.optional()}),
  z.strictObject({type:z.literal('UPDATE_NODE'),id:Id,changes:z.strictObject(nodeFields).partial()}),
  z.strictObject({type:z.literal('MOVE_NODE'),id:Id,position:PositionSchema.optional(),placement:PlacementSchema.optional()}).refine(a=>Boolean(a.position)!==Boolean(a.placement),'Use exactly one of position or placement'),
  z.strictObject({type:z.literal('MOVE_NODES'),ids:Ids,dx:Coord,dy:Coord}),
  z.strictObject({type:z.literal('RESIZE_NODE'),id:Id,size:SizeSchema,position:PositionSchema.optional()}),
  z.strictObject({type:z.literal('DELETE_NODE'),id:Id}),
  z.strictObject({type:z.literal('ADD_EDGE'),edge:EdgeSchema}),
  z.strictObject({type:z.literal('UPDATE_EDGE'),id:Id,changes:z.strictObject({...edgeFields,points:Route.nullable()}).partial()}),
  z.strictObject({type:z.literal('DELETE_EDGE'),id:Id}),
  z.strictObject({type:z.literal('ADD_DRAWING'),drawing:DrawingSchema}),
  z.strictObject({type:z.literal('UPDATE_DRAWING'),id:Id,changes:z.strictObject({kind:z.enum(['line','arrow','freehand']),points:z.array(PositionSchema).min(2).max(500),style:EdgeStyleSchema}).partial()}),
  z.strictObject({type:z.literal('DELETE_DRAWING'),id:Id}),
  z.strictObject({type:z.literal('CREATE_ZONE'),zone:ZoneSchema}),
  z.strictObject({type:z.literal('UPDATE_ZONE'),id:Id,changes:z.strictObject({label:Label,bounds:BoundsSchema,style:ZoneStyleSchema}).partial()}),
  z.strictObject({type:z.literal('MOVE_ZONE'),id:Id,position:PositionSchema}),
  z.strictObject({type:z.literal('DELETE_ZONE'),id:Id,members:z.enum(['release','delete']).default('release')}),
  z.strictObject({type:z.literal('CREATE_GROUP'),group:GroupSchema,nodeIds:Ids}),
  z.strictObject({type:z.literal('UPDATE_GROUP'),id:Id,changes:z.strictObject({label:z.string().max(200)}).partial()}),
  z.strictObject({type:z.literal('DELETE_GROUP'),id:Id}),
  z.strictObject({type:z.literal('CREATE_FRAME'),frame:FrameSchema}),
  z.strictObject({type:z.literal('UPDATE_FRAME'),id:Id,changes:z.strictObject({label:Label,bounds:BoundsSchema}).partial()}),
  z.strictObject({type:z.literal('DELETE_FRAME'),id:Id}),
  z.strictObject({type:z.literal('CREATE_ANIMATION'),animation:AnimationSchema}),
  z.strictObject({type:z.literal('UPDATE_ANIMATION'),id:Id,changes:z.strictObject({label:Label}).partial()}),
  z.strictObject({type:z.literal('DELETE_ANIMATION'),id:Id}),
  z.strictObject({type:z.literal('ADD_STEP'),animationId:Id,step:StepSchema,index:z.number().int().min(0).max(200).optional()}),
  z.strictObject({type:z.literal('UPDATE_STEP'),animationId:Id,stepId:Id,changes:z.strictObject(stepFields).partial()}),
  z.strictObject({type:z.literal('MOVE_STEP'),animationId:Id,stepId:Id,index:z.number().int().min(0).max(200)}),
  z.strictObject({type:z.literal('DELETE_STEP'),animationId:Id,stepId:Id}),
  z.strictObject({type:z.literal('ADD_TRACK'),animationId:Id,track:AnimationTrackSchema}),
  z.strictObject({type:z.literal('UPDATE_TRACK'),animationId:Id,trackId:Id,changes:z.strictObject({label:Label,kind:z.enum(['highlight','caption','camera'])}).partial()}),
  z.strictObject({type:z.literal('DELETE_TRACK'),animationId:Id,trackId:Id}),
  z.strictObject({type:z.literal('ADD_TRACK_CLIP'),animationId:Id,trackId:Id,clip:TrackClipSchema}),
  z.strictObject({type:z.literal('UPDATE_TRACK_CLIP'),animationId:Id,trackId:Id,clipId:Id,changes:z.strictObject(trackClipFields).partial()}),
  z.strictObject({type:z.literal('DELETE_TRACK_CLIP'),animationId:Id,trackId:Id,clipId:Id}),
  z.strictObject({type:z.literal('ADD_SCENARIO'),animationId:Id,scenario:ScenarioSchema}),
  z.strictObject({type:z.literal('UPDATE_SCENARIO'),animationId:Id,scenarioId:Id,changes:z.strictObject(scenarioFields).partial()}),
  z.strictObject({type:z.literal('DELETE_SCENARIO'),animationId:Id,scenarioId:Id}),
  z.strictObject({type:z.literal('ADD_ASSET'),asset:AssetSchema}),
  z.strictObject({type:z.literal('ADD_ANNOTATION'),annotation:AnnotationSchema}),
  z.strictObject({type:z.literal('UPDATE_ANNOTATION'),id:Id,changes:z.strictObject(annotationFields).partial()}),
  z.strictObject({type:z.literal('DELETE_ANNOTATION'),id:Id}),
  z.strictObject({type:z.literal('ALIGN_NODES'),ids:Ids,mode:z.enum(['left','center','right','top','middle','bottom'])}),
  z.strictObject({type:z.literal('DISTRIBUTE_NODES'),ids:Ids,axis:z.enum(['horizontal','vertical'])}),
  z.strictObject({type:z.literal('ARRANGE_DOCUMENT'),direction:z.enum(['right','down']).default('right')}),
  z.strictObject({type:z.literal('LAYOUT_NODES'),ids:Ids,direction:z.enum(['right','down']).default('right'),gap:z.number().min(8).max(400).default(60)})
]);
export const BatchSchema=z.strictObject({id:Id,baseRevision:z.number().int().nonnegative(),actions:z.array(ActionSchema).min(1).max(200)});
export type Action=z.infer<typeof ActionSchema>;
export type ActionInput=z.input<typeof ActionSchema>;
export type ActionBatch=z.infer<typeof BatchSchema>;
export type ActionBatchInput=z.input<typeof BatchSchema>;

export const ACTION_TYPES=ActionSchema.options.map(option=>option.shape.type.value);
// Sólo se anuncian operaciones que el engine ejecuta hoy. `custom` se valida pero se dibuja como caja genérica.
export const CAPABILITIES={
  schemaVersion:SCHEMA_VERSION,readableVersions:READABLE_VERSIONS,actions:ACTION_TYPES,nodeKinds:NODE_KINDS,shapes:SHAPES,arrows:ARROWS,lines:LINES,trackKinds:['highlight','caption','camera'],stepFocus:STEP_FOCUS,stepTransitions:STEP_TRANSITIONS,ports:PORTS,icons:ICONS,assetTypes:ASSET_TYPES,
  reservedNodeKinds:['custom'],
  limits:{assets:40,assetBytes:MAX_ASSET_BYTES,annotations:500,scenariosPerAnimation:20,nodes:2000,edges:4000,drawings:2000,zones:200,groups:500,frames:200,animations:100,stepsPerAnimation:200,tracksPerAnimation:12,clipsPerTrack:200,actionsPerBatch:200,idempotencyLedger:100,animationMs:600000}
} as const;
