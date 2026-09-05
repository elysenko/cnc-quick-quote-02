import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/guards';

/**
 * Every screen is deep-linkable at its own URL; wizard, panel and modal state is
 * carried in the URL (route params / query params), never only in a parent component.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'quotes' },

  {
    path: 'login',
    data: { flow: 'auth' },
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    data: { flow: 'auth' },
    loadComponent: () => import('./features/auth/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: '403',
    data: { flow: 'error' },
    loadComponent: () => import('./shared/states/forbidden.component').then((m) => m.ForbiddenComponent),
  },

  {
    path: '',
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'quotes',
        data: { flow: 'quotes' },
        loadComponent: () => import('./features/quotes/quote-list.component').then((m) => m.QuoteListComponent),
      },
      {
        path: 'quotes/new',
        data: { flow: 'quote-wizard' },
        loadComponent: () => import('./features/quotes/quote-new.component').then((m) => m.QuoteNewComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'upload' },
          {
            path: 'upload',
            data: { flow: 'quote-wizard', step: 'upload' },
            loadComponent: () => import('./features/quotes/steps/upload-step.component').then((m) => m.UploadStepComponent),
          },
          {
            path: 'material',
            data: { flow: 'quote-wizard', step: 'material' },
            loadComponent: () => import('./features/quotes/steps/material-step.component').then((m) => m.MaterialStepComponent),
          },
          {
            path: 'bends',
            data: { flow: 'quote-wizard', step: 'bends' },
            loadComponent: () => import('./features/quotes/steps/bends-step.component').then((m) => m.BendsStepComponent),
          },
          {
            path: 'review',
            data: { flow: 'quote-wizard', step: 'review' },
            loadComponent: () => import('./features/quotes/steps/review-step.component').then((m) => m.ReviewStepComponent),
          },
        ],
      },
      {
        path: 'quotes/:id',
        data: { flow: 'quote-detail' },
        loadComponent: () => import('./features/quotes/quote-detail.component').then((m) => m.QuoteDetailComponent),
      },
      {
        path: 'checkout/:quoteId/review',
        data: { flow: 'checkout' },
        loadComponent: () => import('./features/checkout/checkout-review.component').then((m) => m.CheckoutReviewComponent),
      },
      {
        path: 'checkout/:quoteId/shipping',
        data: { flow: 'checkout' },
        loadComponent: () => import('./features/checkout/checkout-shipping.component').then((m) => m.CheckoutShippingComponent),
      },
      {
        path: 'checkout/:quoteId/return',
        data: { flow: 'checkout' },
        loadComponent: () => import('./features/checkout/payment-return.component').then((m) => m.PaymentReturnComponent),
      },
      {
        path: 'orders',
        data: { flow: 'orders' },
        loadComponent: () => import('./features/orders/order-list.component').then((m) => m.OrderListComponent),
      },
      {
        path: 'orders/:id/confirmation',
        data: { flow: 'orders' },
        loadComponent: () => import('./features/orders/confirmation.component').then((m) => m.ConfirmationComponent),
      },
      {
        path: 'account',
        data: { flow: 'account' },
        loadComponent: () => import('./features/account/account.component').then((m) => m.AccountComponent),
      },

      {
        path: 'admin',
        canActivate: [adminGuard],
        data: { flow: 'admin' },
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'materials' },
          {
            path: 'materials',
            data: { flow: 'admin' },
            loadComponent: () => import('./features/admin/admin-materials.component').then((m) => m.AdminMaterialsComponent),
          },
          {
            path: 'pricing',
            data: { flow: 'admin' },
            loadComponent: () => import('./features/admin/admin-pricing.component').then((m) => m.AdminPricingComponent),
          },
          {
            path: 'machine',
            data: { flow: 'admin' },
            loadComponent: () => import('./features/admin/admin-machine.component').then((m) => m.AdminMachineComponent),
          },
          {
            path: 'settings',
            data: { flow: 'admin' },
            loadComponent: () => import('./features/admin/admin-settings.component').then((m) => m.AdminSettingsComponent),
          },
          {
            path: 'business',
            loadComponent: () => import('./features/admin/business/business-shell.component').then((m) => m.BusinessShellComponent),
            children: [
              { path: '', pathMatch: 'full', redirectTo: 'branding' },
              {
                path: 'branding',
                data: { flow: 'admin-business' },
                loadComponent: () => import('./features/admin/business/branding.component').then((m) => m.BrandingComponent),
              },
              {
                path: 'contact',
                data: { flow: 'admin-business' },
                loadComponent: () => import('./features/admin/business/contact.component').then((m) => m.ContactComponent),
              },
              {
                path: 'payment',
                data: { flow: 'admin-business' },
                loadComponent: () => import('./features/admin/business/payment.component').then((m) => m.PaymentComponent),
              },
              {
                path: 'shipping',
                data: { flow: 'admin-business' },
                loadComponent: () => import('./features/admin/business/shipping.component').then((m) => m.AdminShippingComponent),
              },
            ],
          },
        ],
      },
    ],
  },

  {
    path: '**',
    data: { flow: 'error' },
    loadComponent: () => import('./shared/states/not-found.component').then((m) => m.NotFoundComponent),
  },
];
