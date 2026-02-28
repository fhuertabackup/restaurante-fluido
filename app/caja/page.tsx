'use client'

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

type Order = {
  id: string
  table_number: number
  items: { name: string; qty: number; price: number }[]
  status: string
  created_at: string
}

export default function CajaPage() {
  const supabase = createClient()
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [authorized, setAuthorized] = useState(false)
  const [userEmail, setUserEmail] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'cuentas' | 'historial' | 'estadisticas'>('cuentas')

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserEmail(user.email || '')
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'caja') router.replace('/login')
      else setAuthorized(true)
    }
    checkAuth()
  }, [router])

  const fetchOrders = async () => {
    const { data } = await supabase.from('orders').select('*')
    setOrders(data || [])
  }

  useEffect(() => {
    if (!authorized) return
    fetchOrders()
    const channel = supabase.channel('orders-caja')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [authorized])

  const markAsPaid = async (orderId: string) => {
    await supabase.from('orders').update({ status: 'paid' }).eq('id', orderId)
    fetchOrders()
  }

  if (!authorized) return null

  const pendingPayments = orders.filter(o => ['payment_requested', 'delivered'].includes(o.status))
  const paymentHistory = orders
    .filter(o => o.status === 'paid')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const totalVentas = paymentHistory.reduce((acc, o) =>
    acc + o.items.reduce((a, i) => a + i.price * i.qty, 0), 0)

  // ── Estadísticas ────────────────────────────────────────
  const paidOrders = orders.filter(o => o.status === 'paid')

  // Top 5 productos más vendidos
  const topProducts = useMemo(() => {
    const map: Record<string, number> = {}
    paidOrders.forEach(o => {
      o.items.forEach(it => { map[it.name] = (map[it.name] || 0) + it.qty })
    })
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
  }, [paidOrders])

  const maxQty = topProducts[0]?.[1] || 1

  // Pedidos por hora
  const byHour = useMemo(() => {
    const map: Record<number, number> = {}
    paidOrders.forEach(o => {
      const h = new Date(o.created_at).getHours()
      map[h] = (map[h] || 0) + 1
    })
    return map
  }, [paidOrders])

  const horasPico = Object.entries(byHour)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
  const maxByHour = Math.max(...Object.values(byHour), 1)

  // Mesa con más ventas
  const topTable = useMemo(() => {
    const map: Record<number, number> = {}
    paidOrders.forEach(o => {
      const total = o.items.reduce((a, i) => a + i.price * i.qty, 0)
      map[o.table_number] = (map[o.table_number] || 0) + total
    })
    const sorted = Object.entries(map).sort(([, a], [, b]) => b - a)
    return sorted[0]
  }, [paidOrders])

  const tabStyle = (tab: string) => ({
    padding: '0.5rem 1.2rem',
    fontWeight: 600,
    fontSize: '0.9rem',
    cursor: 'pointer',
    background: activeTab === tab ? 'var(--accent)' : 'transparent',
    color: activeTab === tab ? 'var(--bg)' : 'var(--fg)',
    border: '1px solid',
    borderColor: activeTab === tab ? 'var(--accent)' : 'var(--border)',
    borderRadius: '8px',
    transition: 'all 0.15s',
  } as React.CSSProperties)

  return (
    <div className="container" style={{ paddingTop: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h1 style={{ marginBottom: 0 }}>💰 Caja</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>{userEmail}</span>
          <button className="btn btn-secondary" onClick={async () => {
            await supabase.auth.signOut(); router.push('/login')
          }}>Cerrar sesión</button>
        </div>
      </div>

      {/* KPI resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>Ventas del día</p>
          <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent)' }}>${totalVentas.toFixed(0)}</p>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>Cuentas pendientes</p>
          <p style={{ fontSize: '2rem', fontWeight: 700, color: pendingPayments.length > 0 ? '#d35f5f' : 'var(--fg)' }}>
            {pendingPayments.length}
          </p>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>Pedidos pagados</p>
          <p style={{ fontSize: '2rem', fontWeight: 700 }}>{paymentHistory.length}</p>
        </div>
        {topTable && (
          <div className="card" style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>Mesa top</p>
            <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent)' }}>
              Mesa {topTable[0]} <span style={{ fontSize: '1rem' }}>(${Number(topTable[1]).toFixed(0)})</span>
            </p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button style={tabStyle('cuentas')} onClick={() => setActiveTab('cuentas')}>
          💳 Cuentas ({pendingPayments.length})
        </button>
        <button style={tabStyle('historial')} onClick={() => setActiveTab('historial')}>
          📋 Historial
        </button>
        <button style={tabStyle('estadisticas')} onClick={() => setActiveTab('estadisticas')}>
          📊 Estadísticas
        </button>
      </div>

      {/* Tab: Cuentas pendientes */}
      {activeTab === 'cuentas' && (
        <>
          {pendingPayments.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}>
              <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>✅</p>
              <p>No hay cuentas pendientes</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {pendingPayments.map(order => (
                <div key={order.id} className="card" style={{
                  borderColor: order.status === 'payment_requested' ? '#d35f5f' : undefined
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>Mesa {order.table_number}</strong>
                    <span style={{ color: order.status === 'payment_requested' ? '#d35f5f' : 'var(--muted)', fontWeight: 600 }}>
                      {order.status === 'payment_requested' ? '💳 Pide cuenta' : 'Listo para pagar'}
                    </span>
                  </div>
                  <ul style={{ marginLeft: '1rem', marginTop: '0.5rem', color: 'var(--muted)' }}>
                    {order.items.map((it, i) => <li key={i}>{it.qty} × {it.name}</li>)}
                  </ul>
                  <div style={{ marginTop: '0.5rem', fontWeight: 700, fontSize: '1.1rem' }}>
                    Total: ${order.items.reduce((a, i) => a + i.price * i.qty, 0).toFixed(0)}
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ marginTop: '1rem', width: '100%' }}
                    onClick={() => markAsPaid(order.id)}
                  >
                    ✅ Marcar como pagado
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Tab: Historial */}
      {activeTab === 'historial' && (
        <>
          {paymentHistory.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}>
              <p>No hay pagos registrados</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {paymentHistory.map(order => (
                <div key={order.id} className="card" style={{ borderColor: '#7aad7a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>Mesa {order.table_number}</strong>
                    <span style={{ color: '#7aad7a', fontWeight: 600 }}>✓ Pagado</span>
                  </div>
                  <ul style={{ marginLeft: '1rem', marginTop: '0.5rem', color: 'var(--muted)', fontSize: '0.875rem' }}>
                    {order.items.map((it, i) => <li key={i}>{it.qty} × {it.name}</li>)}
                  </ul>
                  <div style={{ marginTop: '0.5rem', fontWeight: 700 }}>
                    ${order.items.reduce((a, i) => a + i.price * i.qty, 0).toFixed(0)}
                  </div>
                  <div style={{ marginTop: '0.25rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
                    {new Date(order.created_at).toLocaleString('es-CL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Tab: Estadísticas */}
      {activeTab === 'estadisticas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {paidOrders.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}>
              <p>No hay datos de ventas aún</p>
            </div>
          ) : (
            <>
              {/* Top productos */}
              <div className="card">
                <h3 style={{ marginBottom: '1rem' }}>🥇 Top 5 productos más vendidos</h3>
                {topProducts.map(([name, qty], i) => (
                  <div key={name} style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.9rem' }}>
                      <span><strong style={{ color: 'var(--accent)' }}>#{i + 1}</strong> {name}</span>
                      <span style={{ fontWeight: 700 }}>{qty} uds</span>
                    </div>
                    <div style={{ background: 'var(--border)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${(qty / maxQty) * 100}%`,
                        background: 'var(--accent)',
                        borderRadius: '4px',
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Pedidos por hora pico */}
              <div className="card">
                <h3 style={{ marginBottom: '1rem' }}>⏰ Horario de mayor actividad</h3>
                {horasPico.length === 0 ? (
                  <p style={{ color: 'var(--muted)' }}>Sin datos</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {horasPico.map(([hora, count]) => (
                      <div key={hora} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ width: '50px', fontSize: '0.85rem', color: 'var(--muted)', flexShrink: 0 }}>
                          {String(hora).padStart(2, '0')}:00
                        </span>
                        <div style={{ flex: 1, background: 'var(--border)', borderRadius: '4px', height: '10px' }}>
                          <div style={{
                            height: '100%',
                            width: `${(count / maxByHour) * 100}%`,
                            background: '#5fa8d3',
                            borderRadius: '4px',
                          }} />
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, width: '30px' }}>{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
