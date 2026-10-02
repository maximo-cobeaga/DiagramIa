import {writeFile,mkdir} from 'node:fs/promises';
import {z} from 'zod';
import {DocumentSchema,BatchSchema} from '@diagramia/core';
await mkdir('schemas',{recursive:true});
for(const [name,schema]of [['document',DocumentSchema],['action-batch',BatchSchema]]as const){await writeFile(`schemas/${name}.schema.json`,JSON.stringify(z.toJSONSchema(schema),null,2)+'\n');}
console.log('Contratos JSON Schema exportados.');
