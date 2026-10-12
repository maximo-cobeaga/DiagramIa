/** Catálogo compartido por el servidor y la comparación de planes. No forma parte del documento. */
export type PlanId='free'|'pro';
export type PlanLimits={dailyCredits:number;monthlyCredits:number;maxDocuments:number;maxDocumentBytes:number;maxBytes:number;maxOwnElements:number};
export const PLANS:Record<PlanId,PlanLimits>={
  free:{dailyCredits:6,monthlyCredits:20,maxDocuments:3,maxDocumentBytes:10_000_000,maxBytes:30_000_000,maxOwnElements:5},
  pro:{dailyCredits:40,monthlyCredits:400,maxDocuments:100,maxDocumentBytes:10_000_000,maxBytes:1_000_000_000,maxOwnElements:200}
};
