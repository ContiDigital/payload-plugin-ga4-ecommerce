'use client'

import React from 'react'

type AnalyticsErrorBoundaryProps = {
  children: React.ReactNode
}

type AnalyticsErrorBoundaryState = {
  hasError: boolean
}

export class AnalyticsErrorBoundary extends React.Component<
  AnalyticsErrorBoundaryProps,
  AnalyticsErrorBoundaryState
> {
  constructor(props: AnalyticsErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
    }
  }

  static getDerivedStateFromError(): AnalyticsErrorBoundaryState {
    return {
      hasError: true,
    }
  }

  componentDidCatch(error: Error): void {
    // Keep this as a client-side fallback only.
    // Logging still happens server-side for request failures.
    // eslint-disable-next-line no-console
    console.error('[payload-ga4-analytics] client render error', error)
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role='alert'
          style={{
            border: '1px solid var(--theme-error-500)',
            borderRadius: '0.5rem',
            color: 'var(--theme-error-500)',
            padding: '0.75rem',
          }}
        >
          This analytics panel failed to render. Refresh the page to retry.
        </div>
      )
    }

    return this.props.children
  }
}
