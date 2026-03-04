'use client'

import React from 'react'

type AnalyticsNavLinkProps = {
  href?: string
  label?: string
}

export const AnalyticsNavLink: React.FC<AnalyticsNavLinkProps> = ({
  href = '/admin/analytics',
  label = 'Analytics',
}) => {
  return (
    <a
      href={href}
      style={{
        color: 'inherit',
        display: 'block',
        fontSize: '0.95rem',
        padding: '0.35rem 0',
        textDecoration: 'none',
      }}
    >
      {label}
    </a>
  )
}
