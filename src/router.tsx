import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import {
  AuthLayout,
  AuthSplash,
  ForgotPasswordModal,
  LoginForm,
  RegisterForm,
  ResetPasswordForm,
  VerifyEmailCard,
} from './features/auth/components'
import type { AuthContextValue } from './features/auth/hooks/useAuth'

export interface RouterContext {
  auth: AuthContextValue
}

// 1. Root Route: Conditionally renders <AuthSplash /> during initial resolution (0 flickers)
const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: function RootComponent() {
    const context = rootRoute.useRouteContext()
    if (!context.auth?.hasResolvedInitialAuth) {
      return <AuthSplash />
    }
    return <Outlet />
  },
})

// 2. Guest Layout Route: Shell for Login, Register, Forgot Password, Reset Password
const guestLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'guest',
  beforeLoad: ({ context }) => {
    // Invariant 1.1: Do not prematurely redirect during initial hydration
    if (!context.auth.hasResolvedInitialAuth) return
    if (context.auth.isAuthenticated) {
      throw redirect({ to: '/' })
    }
  },
  component: function GuestLayout() {
    return <AuthLayout />
  },
})

// Guest child routes
const loginRoute = createRoute({
  getParentRoute: () => guestLayoutRoute,
  path: '/login',
  component: LoginForm,
})

const registerRoute = createRoute({
  getParentRoute: () => guestLayoutRoute,
  path: '/register',
  component: RegisterForm,
})

const forgotPasswordRoute = createRoute({
  getParentRoute: () => guestLayoutRoute,
  path: '/forgot-password',
  component: ForgotPasswordModal,
})

const resetPasswordRoute = createRoute({
  getParentRoute: () => guestLayoutRoute,
  path: '/reset-password',
  validateSearch: (search: Record<string, unknown>): { token?: string } => {
    return {
      token: typeof search.token === 'string' ? search.token : undefined,
    }
  },
  component: ResetPasswordForm,
})

// 3. Dual-Access Verify Email Route: accessible with or without active session
const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verify-email',
  validateSearch: (search: Record<string, unknown>): { token?: string } => {
    return {
      token: typeof search.token === 'string' ? search.token : undefined,
    }
  },
  component: function VerifyEmailPage() {
    return (
      <AuthLayout>
        <VerifyEmailCard />
      </AuthLayout>
    )
  },
})

// 4. Authenticated Route: Guarded couple space
export const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: ({ context }) => {
    // Invariant 1.1: Do not eject user while checking Dexie / session
    if (!context.auth.hasResolvedInitialAuth) return
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login' })
    }
  },
})

// Assemble route tree
const routeTree = rootRoute.addChildren([
  guestLayoutRoute.addChildren([
    loginRoute,
    registerRoute,
    forgotPasswordRoute,
    resetPasswordRoute,
  ]),
  verifyEmailRoute,
  authenticatedRoute,
])

export const router = createRouter({
  routeTree,
  context: {
    // Initial dummy context; provided at runtime by <RouterProvider context={{ auth }} />
    auth: undefined!,
  },
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}