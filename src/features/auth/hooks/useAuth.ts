import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { LoginInput, RegisterInput } from '../../../../shared'
import { authApi } from '../api/auth.api'
import { authStore } from '../store/auth.store'

export const AUTH_QUERY_KEY = ['auth', 'me'] as const

export function useAuth() {
  const queryClient = useQueryClient()
  const [hasResolvedInitialAuth, setHasResolvedInitialAuth] = useState(false)
  const [isDexieResolved, setIsDexieResolved] = useState(false)

  // Consulta de perfil en servidor con sincronización local en Dexie
  const meQuery = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      try {
        const response = await authApi.getMe()
        await authStore.saveProfile(response.user)
        return response.user
      } catch (err: unknown) {
        // Invariant 1.2: Solo un HTTP 401 explícito revoca el perfil local en Dexie
        const status = (err as { status?: number })?.status
        if (status === 401) {
          await authStore.clearProfile()
          throw err
        }
        // Fallos de red, ECONNREFUSED o 5xx: recuperar perfil de Dexie para mantener sesión offline
        const localUser = await authStore.getProfile()
        if (localUser) {
          return {
            id: localUser.id,
            email: localUser.email,
            displayName: localUser.displayName,
            avatarUrl: localUser.avatarUrl || null,
            emailVerified: localUser.emailVerified ?? false,
            hasPassword: localUser.hasPassword ?? true,
          }
        }
        throw err
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutos de validez en memoria
  })

  const { data } = meQuery

  // 1. Sincronización proactiva instantánea desde Dexie al arrancar
  useEffect(() => {
    void authStore
      .getProfile()
      .then((localUser) => {
        if (localUser && !queryClient.getQueryData(AUTH_QUERY_KEY)) {
          queryClient.setQueryData(AUTH_QUERY_KEY, {
            id: localUser.id,
            email: localUser.email,
            displayName: localUser.displayName,
            avatarUrl: localUser.avatarUrl || null,
            emailVerified: localUser.emailVerified ?? false,
            hasPassword: localUser.hasPassword ?? true,
          })
        }
        setIsDexieResolved(true)
      })
      .catch(() => {
        setIsDexieResolved(true)
      })
  }, [queryClient])

  // 2. Resolución normal de arranque: cuando Dexie y meQuery (éxito o error) han respondido
  useEffect(() => {
    if (!hasResolvedInitialAuth && isDexieResolved && meQuery.isFetched) {
      setHasResolvedInitialAuth(true)
    }
  }, [hasResolvedInitialAuth, isDexieResolved, meQuery.isFetched])

  // 3. Timeout de seguridad anti-splash infinito (4s):
  // Si la red se cuelga o no responde, forzamos hasResolvedInitialAuth para no atrapar al usuario.
  // Limpia el timer cuando la resolución normal o el timeout concluyen.
  useEffect(() => {
    if (hasResolvedInitialAuth) return
    const timer = setTimeout(() => {
      setHasResolvedInitialAuth(true)
    }, 4000)
    return () => clearTimeout(timer)
  }, [hasResolvedInitialAuth])

  // Mutación de Login
  const loginMutation = useMutation({
    mutationFn: async (input: LoginInput) => {
      const response = await authApi.login(input)
      await authStore.saveProfile(response.user)
      queryClient.setQueryData(AUTH_QUERY_KEY, response.user)
      return response.user
    },
  })

  // Mutación de Registro
  const registerMutation = useMutation({
    mutationFn: async (input: RegisterInput) => {
      const response = await authApi.register(input)
      await authStore.saveProfile(response.user)
      queryClient.setQueryData(AUTH_QUERY_KEY, response.user)
      return response.user
    },
  })

  // Mutación de Logout
  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        await authApi.logout()
      } finally {
        await authStore.clearProfile()
        queryClient.setQueryData(AUTH_QUERY_KEY, null)
      }
    },
  })

  return {
    user: data || null,
    hasResolvedInitialAuth,
    isLoading: !hasResolvedInitialAuth,
    isAuthenticated: Boolean(data),
    isSyncingInBackground: meQuery.isFetching,
    isError: meQuery.isError,
    error: meQuery.error,
    refetch: meQuery.refetch,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
  }
}

export type AuthContextValue = ReturnType<typeof useAuth>


