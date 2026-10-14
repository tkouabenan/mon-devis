import { PrismaClient } from '@prisma/client';

/**
 * Client Prisma singleton (évite l'épuisement du pool de connexions en développement
 * à cause du rechargement à chaud de Next.js).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export type { Prisma } from '@prisma/client';
