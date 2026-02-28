'use client'

import { useEffect } from 'react'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Cargar tema guardado
    const saved = localStorage.getItem('rf_theme') || 'dark'
    document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : 'dark')
  }, [])
  return <>{children}</>
}

export function ThemeToggle() {
  const toggle = () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark'
    const next = current === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('rf_theme', next)
    // Forzar re-render del ícono
    const btn = document.getElementById('theme-toggle-btn')
    if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙'
  }

  return (
    <button
      id="theme-toggle-btn"
      onClick={toggle}
      title="Cambiar tema"
      style={{
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '0.35rem 0.6rem',
        cursor: 'pointer',
        fontSize: '1rem',
        lineHeight: 1,
      }}
    >
      ☀️
    </button>
  )
}
