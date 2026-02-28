'use client'

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

type Order = {
  id: string
  table_number: number
  status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'payment_requested' | 'paid'
  items: { name: string; qty: number; price: number }[]
  created_at: string
}

type WaiterCall = {
  id: string
  table_number: number
  status: 'pending' | 'attended'
  created_at: string
}

export default function MeseroPage() {
  const supabase = createClient()
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [calls, setCalls] = useState<WaiterCall[]>([])
  const [selectedTable, setSelectedTable] = useState<number | null>(null)
  const [authorized, setAuthorized] = useState(false)
  const [userEmail, setUserEmail] = useState<string>('')
  const [showQR, setShowQR] = useState(false)
  const MESAS = [1,2,3,4,5,6]

  useEffect(() => {
    // Recuperar selección de mesa guardada
    const saved = localStorage.getItem('mesero_table')
    if (saved) setSelectedTable(Number(saved))

    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserEmail(user.email || '')
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'mesero') {
        router.replace('/login')
      } else {
        setAuthorized(true)
      }
    }
    checkAuth()
  }, [router])

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .not('status', 'in', '("paid")')
      .order('created_at', { ascending: true })
    setOrders(data || [])
  }

  const fetchCalls = async () => {
    const { data } = await supabase
      .from('waiter_calls')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    setCalls(data || [])
  }

  useEffect(() => {
    if (!authorized) return
    fetchOrders()
    fetchCalls()

    const channelOrders = supabase.channel('orders-mesero')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .subscribe()

    // Canal de llamadas de mesero (si existe la tabla)
    const channelCalls = supabase.channel('waiter-calls')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waiter_calls' }, fetchCalls)
      .subscribe()

    return () => {
      supabase.removeChannel(channelOrders)
      supabase.removeChannel(channelCalls)
    }
  }, [authorized])

  const transferOrder = async (orderId: string, inputId: string) => {
    const input = document.getElementById(inputId) as HTMLInputElement
    const newTable = Number(input?.value)
    if (!newTable) return alert('Ingresa número de mesa')
    await supabase.from('orders').update({ table_number: newTable }).eq('id', orderId)
    fetchOrders()
  }

  const markDelivered = async (orderId: string) => {
    await supabase.from('orders').update({ status: 'delivered' }).eq('id', orderId)
    fetchOrders()
  }

  const attendCall = async (callId: string) => {
    await supabase.from('waiter_calls').update({ status: 'attended' }).eq('id', callId)
    fetchCalls()
  }

  const handleTableSelect = (table: number | null) => {
    setSelectedTable(table)
    if (table === null) {
      localStorage.removeItem('mesero_table')
    } else {
      localStorage.setItem('mesero_table', String(table))
    }
  }

  if (!authorized) return null

  // Pedidos activos (excluyendo paid)
  const activeOrders = orders.filter(o =>
    ['pending', 'preparing', 'ready', 'delivered', 'payment_requested'].includes(o.status)
  )

  // Mesas únicas con pedidos activos
  const activeTables = [...new Set(activeOrders.map(o => o.table_number))].sort((a, b) => a - b)

  // Filtro por mesa seleccionada
  const filteredOrders = selectedTable
    ? activeOrders.filter(o => o.table_number === selectedTable)
    : activeOrders

  const pendingCallsCount = calls.length

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      pending: '🆕 Nuevo',
      preparing: '🔥 Preparando',
      ready: '✅ Listo para entregar',
      delivered: '📦 Entregado',
      payment_requested: '💳 Pide cuenta',
    }
    return map[s] || s
  }

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      pending: 'var(--muted)',
      preparing: '#5fa8d3',
      ready: 'var(--accent)',
      delivered: '#7aad7a',
      payment_requested: '#d35f5f',
    }
    return map[s] || 'var(--muted)'
  }

  return (
    <div className="container" style={{ paddingTop: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h1 style={{ marginBottom: 0 }}>🧑‍🍳 Mesero</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>{userEmail}</span>
          <button className="btn btn-secondary" onClick={async () => {
            await supabase.auth.signOut()
            router.push('/login')
          }}>Cerrar sesión</button>
        </div>
      </div>

      {/* Llamadas pendientes */}
      {pendingCallsCount > 0 && (
        <div className="card" style={{
          marginBottom: '1.5rem',
          borderColor: '#d35f5f',
          background: 'rgba(211,95,95,0.06)'
        }}>
          <h3 style={{ color: '#d35f5f', marginBottom: '0.75rem' }}>
            🔔 {pendingCallsCount} llamada{pendingCallsCount > 1 ? 's' : ''} de mesero
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {calls.map(call => (
              <div key={call.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="card" style={{ padding: '0.3rem 0.75rem', fontWeight: 600 }}>
                  Mesa {call.table_number}
                </span>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '0.3rem 0.75rem', fontSize: '0.85rem' }}
                  onClick={() => attendCall(call.id)}
                >
                  Atendido
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtro por mesa */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Ver mesa:</span>
          <button
            className="btn"
            style={{
              padding: '0.3rem 0.75rem',
              fontSize: '0.85rem',
              background: selectedTable === null ? 'var(--accent)' : undefined,
              color: selectedTable === null ? 'var(--bg)' : undefined,
              borderColor: selectedTable === null ? 'var(--accent)' : undefined,
            }}
            onClick={() => handleTableSelect(null)}
          >
            Todas
          </button>
          {activeTables.map(t => (
            <button
              key={t}
              className="btn"
              style={{
                padding: '0.3rem 0.75rem',
                fontSize: '0.85rem',
                background: selectedTable === t ? 'var(--accent)' : undefined,
                color: selectedTable === t ? 'var(--bg)' : undefined,
                borderColor: selectedTable === t ? 'var(--accent)' : undefined,
              }}
              onClick={() => handleTableSelect(t)}
            >
              Mesa {t}
            </button>
          ))}
          {activeTables.length === 0 && (
            <span style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Sin pedidos activos</span>
          )}
        </div>
      </div>

      {/* Pedidos */}
      {filteredOrders.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}>
          <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>✅</p>
          <p>{selectedTable ? `No hay pedidos para mesa ${selectedTable}` : 'No hay pedidos activos'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {filteredOrders.map(order => (
            <div
              key={order.id}
              className="card"
              style={{ borderColor: order.status === 'payment_requested' ? '#d35f5f' : order.status === 'ready' ? 'var(--accent)' : undefined }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <strong style={{ fontSize: '1.1rem' }}>Mesa {order.table_number}</strong>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: statusColor(order.status) }}>
                  {statusLabel(order.status)}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
                {new Date(order.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <ul style={{ marginLeft: '1rem', marginBottom: '1rem', color: 'var(--muted)' }}>
                {order.items.map((it, i) => <li key={i}>{it.qty} × {it.name}</li>)}
              </ul>
              <div style={{ fontWeight: 700, marginBottom: '0.75rem' }}>
                ${order.items.reduce((a, i) => a + i.price * i.qty, 0).toFixed(0)}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Transferir mesa */}
                {['pending', 'preparing', 'ready'].includes(order.status) && (
                  <>
                    <input
                      type="number"
                      placeholder="Nueva mesa"
                      id={`transfer-${order.id}`}
                      style={{ width: '80px', padding: '0.25rem', fontSize: '0.9rem' }}
                    />
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                      onClick={() => transferOrder(order.id, `transfer-${order.id}`)}
                    >
                      Transferir
                    </button>
                  </>
                )}
                {/* Marcar entregado */}
                {order.status === 'ready' && (
                  <button
                    className="btn btn-primary"
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.875rem' }}
                    onClick={() => markDelivered(order.id)}
                  >
                    📦 Entregar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Sección QR de mesas */}
      <div style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ marginBottom: 0 }}>📱 QR de Mesas</h2>
          <button className="btn btn-secondary" style={{ fontSize: '0.85rem' }} onClick={() => setShowQR(v => !v)}>
            {showQR ? 'Ocultar QRs' : 'Mostrar QRs'}
          </button>
        </div>
        {showQR && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem' }}>
            {MESAS.map(n => (
              <div key={n} className="card" style={{ textAlign: 'center' }}>
                <p style={{ fontWeight: 700, marginBottom: '0.75rem' }}>Mesa {n}</p>
                <img
                  src={`/api/qr?tabla=${n}`}
                  alt={`QR Mesa ${n}`}
                  style={{ width: '100%', maxWidth: '140px', height: 'auto', borderRadius: '8px' }}
                />
                <a
                  href={`/mesa/${n}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary"
                  style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.3rem' }}
                >
                  Abrir vista
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
