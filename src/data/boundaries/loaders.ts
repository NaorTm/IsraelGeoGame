export const boundaryRegionLoaders = {
  "center": () => import('./center.ts'),
  "haifa": () => import('./haifa.ts'),
  "jerusalem": () => import('./jerusalem.ts'),
  "judea_samaria": () => import('./judea_samaria.ts'),
  "north": () => import('./north.ts'),
  "shephelah": () => import('./shephelah.ts'),
  "south": () => import('./south.ts'),
  "tel_aviv": () => import('./tel_aviv.ts'),
} as const;

export type BoundaryRegionId = keyof typeof boundaryRegionLoaders;
