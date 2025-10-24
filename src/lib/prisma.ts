import { PrismaClient } from '@prisma/client';

// Prevent creating multiple instances of PrismaClient in development
// when using hot-reloading (ts-node-dev / nodemon).
const g = global as any;

export const prisma: PrismaClient = g.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') g.__prisma = prisma;
