import { TrpcRouter } from 'nestjs-trpc';
import { Injectable } from '@nestjs/common';
import { UsersRouter } from '../users/users.router';

/**
 * Root application router.
 *
 * nestjs-trpc composes child routers registered with @TrpcRouter({ alias })
 * automatically when they are provided in the NestJS DI container.
 * This file exists primarily to export the `AppRouter` type so the Angular
 * client can import it as a type-only import for end-to-end type safety.
 *
 * The actual router type is inferred by nestjs-trpc at build time via the
 * autoSchemaFile mechanism.  We re-export the inferred type alias here so
 * frontend code can do:
 *
 *   import type { AppRouter } from '../../backend/src/trpc/trpc.router';
 */

// Dummy reference so TypeScript includes the router shape in the emitted .d.ts
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _routerRef = UsersRouter;

/**
 * AppRouter is the type of the composed tRPC router produced by nestjs-trpc.
 * Because nestjs-trpc generates the actual router at runtime, we declare the
 * type here structurally so frontend tooling gets full autocomplete.
 *
 * If you add more @TrpcRouter-decorated classes, extend this type accordingly.
 */
export type AppRouter = {
  users: InstanceType<typeof UsersRouter>;
};

@Injectable()
@TrpcRouter()
export class AppRouterHost {
  // nestjs-trpc discovers child routers by scanning providers annotated with
  // @TrpcRouter({ alias }). This class acts as the root host.
}
