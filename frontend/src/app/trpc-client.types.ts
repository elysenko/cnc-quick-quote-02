/**
 * Frontend-local tRPC client contract.
 *
 * Pattern: split-package tRPC contract type. The frontend and backend build as
 * independent packages (each with its own Dockerfile and node_modules), so the
 * frontend MUST NOT import backend source: the backend's type chain pulls in
 * nestjs-trpc, @nestjs/common and generated @prisma/client types that do not
 * exist in the frontend build context. Instead we declare the client-facing
 * router surface here with zero runtime deps. Keep this file in sync with the
 * procedures exposed in backend/src (see backend/src/users/users.router.ts).
 *
 * The shape mirrors @trpc/client's proxy call surface
 * (client.<router>.<procedure>.query/mutate), which is what call sites use.
 */

/** Mirrors the Prisma `User` model (backend/prisma/schema.prisma). Dates are
 * ISO strings after JSON serialization over the wire. */
export interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN';
  createdAt: string;
  updatedAt: string;
}

/** Client-facing surface of the backend tRPC router. */
export type AppRouterClient = {
  users: {
    findAll: { query(): Promise<User[]> };
    findById: { query(input: { id: string }): Promise<User | null> };
  };
};
