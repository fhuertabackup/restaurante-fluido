'use client'

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Order = {
  id: string
  table_number: number
  status: 'pending' | 'preparing' | 'ready' | 'delivered'
  items: { name: string; qty: number }[]
  created_at: string
}

export default function CocinaPage() {
  const supabase = createClient()
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [authorized, setAuthorized] = useState(false)
  const [userEmail, setUserEmail] = useState<string>('')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const knownIdsRef = useRef<Set<string>>(new Set())

  // Inicializar audio solo en el cliente
  useEffect(() => {
    audioRef.current = new Audio('/sounds/alert.mp3')
  }, [])

  const playAlert = () => {
    if (!soundEnabled) return
    try {
      if (audioRef.current) {
        audioRef.current.currentTime = 0
        audioRef.current.play().catch(() => {})
      }
    } catch {}
  }

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setUserEmail(user.email || '')
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'cocina') {
        router.replace('/login')
      } else {
        setAuthorized(true)
      }
    }
    checkAuth()
  }, [router])

  useEffect(() => {
    if (!authorized) return

    const fetchOrders = async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: true })
      const fetched = data || []

      // Detectar nuevos pedidos pendientes para reproducir sonido
      fetched.forEach(o => {
        if (o.status === 'pending' && !knownIdsRef.current.has(o.id)) {
          if (knownIdsRef.current.size > 0) {
            // Solo suena si no es la carga inicial
            playAlert()
          }
          knownIdsRef.current.add(o.id)
        }
      })

      setOrders(fetched)
    }

    fetchOrders()

    const channel = supabase.channel('orders-cocina')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const newOrder = payload.new as Order
          if (newOrder.status === 'pending') {
            playAlert()
            knownIdsRef.current.add(newOrder.id)
          }
          fetchOrders()
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        () => fetchOrders()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [authorized, soundEnabled])

  const updateStatus = async (orderId: string, status: Order['status']) => {
    await supabase.from('orders').update({ status }).eq('id', orderId)
    setOrders(orders.map(o => o.id === orderId ? {...o, status} : o))
  }

  if (!authorized) return null

  // Solo mostrar pedidos activos en cocina (no delivered, no paid)
  const activeOrders = orders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status))

  return (
    <div className="container" style={{ paddingTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ marginBottom: 0 }}>🍳 Cocina</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Toggle sonido */}
          <button
            className="btn btn-secondary"
            style={{
              padding: '0.4rem 0.8rem',
              fontSize: '0.85rem',
              background: soundEnabled ? 'rgba(200,169,110,0.15)' : undefined,
              borderColor: soundEnabled ? 'var(--accent)' : undefined,
            }}
            onClick={() => setSoundEnabled(v => !v)}
            title="Activar/desactivar sonido de alerta"
          >
            {soundEnabled ? '🔔 Sonido ON' : '🔕 Sonido OFF'}
          </button>
          <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>{userEmail}</span>
          <button className="btn btn-secondary" onClick={async () => {
            await supabase.auth.signOut()
            router.push('/login')
          }}>Cerrar sesión</button>
        </div>
      </div>

      {activeOrders.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</p>
          <p>No hay pedidos pendientes</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {activeOrders.map(order => (
            <div key={order.id} className="card" data-status={order.status}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong style={{ fontSize: '1.1rem' }}>Mesa {order.table_number}</strong>
                <span style={{
                  textTransform: 'capitalize',
                  fontWeight: 600,
                  color: order.status === 'ready' ? 'var(--accent)'
                       : order.status === 'preparing' ? '#5fa8d3'
                       : 'var(--muted)'
                }}>
                  {order.status === 'pending' ? '🆕 Nuevo'
                   : order.status === 'preparing' ? '🔥 Preparando'
                   : '✅ Listo'}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
                {new Date(order.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <ul style={{ marginLeft: '1rem', marginBottom: '1rem', color: 'var(--muted)' }}>
                {order.items.map((it, i) => (
                  <li key={i}><strong>{it.qty}</strong> × {it.name}</li>
                ))}
              </ul>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {order.status === 'pending' && (
                  <button className="btn btn-primary" onClick={() => updateStatus(order.id, 'preparing')}>
                    🔥 Empezar
                  </button>
                )}
                {order.status === 'preparing' && (
                  <button className="btn btn-primary" onClick={() => updateStatus(order.id, 'ready')}>
                    ✅ Listo
                  </button>
                )}
                {order.status === 'ready' && (
                  <button className="btn btn-secondary" onClick={() => updateStatus(order.id, 'delivered')}>
                    📦 Entregar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
