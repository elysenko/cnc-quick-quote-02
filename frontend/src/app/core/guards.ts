import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Redirects anonymous users to /login preserving the return URL. Redirects at most
 * once and never from /login itself, so no guard/shell redirect loop is possible.
 * In preview builds a demo session is seeded so deep links render their own screen.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  auth.ensurePreviewSession();
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Non-admins get an explicit 403 view rather than a silent redirect. */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAdmin()) return true;
  return router.createUrlTree(['/403']);
};
