'use client'

import { useEffect } from 'react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Unhandled error:', error)
  }, [error])

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>Algo salió mal</h2>
      <p style={{ color: 'var(--muted)' }}>{error.message}</p>
      <button className="btn btn-primary" onClick={reset}>Intentar de nuevo</button>
    </div>
  )
}
