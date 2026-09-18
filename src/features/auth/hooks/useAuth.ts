import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { LoginInput, RegisterInput } from '../../../../shared'
import { authApi } from '../api/auth.api'
import { authStore } from '../store/auth.store'

export const AUTH_QUERY_KEY = ['auth', 'me'] as const

export function useAuth() {
  const queryClient = useQueryClient()

  // Consulta de perfil en servidor con sincronización local en Dexie
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      try {
        const response = await authApi.getMe()
        await authStore.saveProfile(response.user)
        return response.user
      } catch (err: any) {
        if (err.status === 401) {
          await authStore.clearProfile()
        }
        throw err
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutos de validez en memoria
  })

  // Sincronización proactiva al montar si la red no está disponible
  useEffect(() => {
    if (!data) {
      void authStore.getProfile().then((localUser) => {
        if (localUser && !data) {
          queryClient.setQueryData(AUTH_QUERY_KEY, {
            id: localUser.id,
            email: localUser.email,
            displayName: localUser.displayName,
            avatarUrl: localUser.avatarUrl || null,
            emailVerified: localUser.emailVerified ?? false,
            hasPassword: localUser.hasPassword ?? true,
          })
        }
      })
    }
  }, [data, queryClient])

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
    isLoading,
    isAuthenticated: Boolean(data),
    isError,
    error,
    refetch,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
  }
}
