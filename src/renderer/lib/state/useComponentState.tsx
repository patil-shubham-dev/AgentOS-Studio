import { useCallback, useMemo } from 'react'

export type ComponentStateCategory = 'populated' | 'empty' | 'loading' | 'error' | 'disabled'

export interface ComponentStateConfig {
  isEmpty?: boolean
  isLoading?: boolean
  error?: string | null
  isDisabled?: boolean
  retry?: () => void
}

export interface ComponentState {
  category: ComponentStateCategory
  isEmpty: boolean
  isLoading: boolean
  error: string | null
  isDisabled: boolean
  retry: () => void
  element: JSX.Element | null
}

export interface StateRenderer {
  empty?: JSX.Element
  loading?: JSX.Element
  error?: (message: string, retry: () => void) => JSX.Element
  disabled?: JSX.Element
  populated?: JSX.Element
}

export function useComponentState(config: ComponentStateConfig, renderers?: StateRenderer): ComponentState {
  const { isEmpty = false, isLoading = false, error = null, isDisabled = false, retry } = config

  const category: ComponentStateCategory = useMemo(() => {
    if (isDisabled) return 'disabled'
    if (error) return 'error'
    if (isLoading) return 'loading'
    if (isEmpty) return 'empty'
    return 'populated'
  }, [isDisabled, error, isLoading, isEmpty])

  const handleRetry = useCallback(() => {
    retry?.()
  }, [retry])

  const element = useMemo(() => {
    if (renderers) {
      if (category === 'empty' && renderers.empty) return renderers.empty
      if (category === 'loading' && renderers.loading) return renderers.loading
      if (category === 'error' && renderers.error && error) return renderers.error(error, handleRetry)
      if (category === 'disabled' && renderers.disabled) return renderers.disabled
      if (category === 'populated' && renderers.populated) return renderers.populated
    }
    return null
  }, [category, renderers, error, handleRetry])

  return {
    category,
    isEmpty,
    isLoading,
    error,
    isDisabled,
    retry: handleRetry,
    element,
  }
}

export const defaultEmptyRenderer = (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
      <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
    </div>
    <p className="text-sm text-muted-foreground">Nothing here yet</p>
  </div>
)

export const defaultLoadingRenderer = (
  <div className="flex items-center justify-center py-8">
    <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
  </div>
)

export function defaultErrorRenderer(message: string, retry: () => void) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
        <svg className="w-5 h-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <p className="text-sm text-destructive font-medium mb-1">Something went wrong</p>
      <p className="text-xs text-muted-foreground mb-3 max-w-xs">{message}</p>
      <button onClick={retry} className="text-xs text-primary underline hover:no-underline">
        Try again
      </button>
    </div>
  )
}

export const defaultDisabledRenderer = (
  <div className="flex items-center justify-center py-8 opacity-50 cursor-not-allowed">
    <p className="text-sm text-muted-foreground">Not available</p>
  </div>
)
