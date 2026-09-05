import { ApplicationConfig, InjectionToken } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouterClient } from './trpc-client.types';
import { routes } from './app.routes';

/**
 * Typed tRPC client injection token.
 *
 * We use the InjectionToken pattern rather than ngx-trpc's provider helper
 * because it gives us full type safety without coupling to ngx-trpc's
 * internal API. The client is typed by the frontend-local AppRouterClient
 * contract (trpc-client.types.ts) — NOT by importing backend source, which
 * would drag nestjs/prisma types into the frontend build (they do not exist
 * in this package's build context and fail compilation).
 */
export const TRPC_CLIENT = new InjectionToken<AppRouterClient>('TRPC_CLIENT');

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    provideAnimations(),
    {
      provide: TRPC_CLIENT,
      useFactory: () =>
        // `any` router generic: the real AppRouter type lives in the backend
        // package and is not importable here (split-package build). The cast
        // to AppRouterClient restores full call-site type safety.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createTRPCClient<any>({
          links: [
            httpBatchLink({
              url: '/trpc',
            }),
          ],
        }) as unknown as AppRouterClient,
    },
  ],
};
