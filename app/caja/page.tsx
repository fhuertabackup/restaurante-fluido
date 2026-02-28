'use client'

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

type OrderItem = { name: string; qty: number; price: number }

type Order = {
  id: string
  table_number: number
  items: OrderItem[]
  status: string
  created_at: string
  payment_method?: string
}

export default function CajaPage() {
  const supabase = createClient()
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [authorized, setAuthorized] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [activeTab, setActiveTab] = useState<'cuentas' | 'historial' | 'estadisticas'>('cuentas')
  const [paymentModal, setPaymentModal] = useState<Order | null>(null)
  const [payMethod, setPayMethod] = useState<'efectivo' | 'tarjeta' | 'transferencia'>('efectivo')
  const [paying, setPaying] = useState(false)

  // ── Estadísticas (todos los hooks SIEMPRE antes de any conditional return) ────
  const paidOrders = useMemo(() => orders.filter(o => o.status === 'paid'), [orders])

  const topProducts = useMemo(() => {
    const map: Record<string, number> = {}
    paidOrders.forEach(o => o.items.forEach(it => { map[it.name] = (map[it.name] || 0) + it.qty }))
    return Object.entries(map).sort(([, a], [, b]) => b - a).slice(0, 5)
  }, [paidOrders])

  const byHour = useMemo(() => {
    const map: Record<number, number> = {}
    paidOrders.forEach(o => {
      const h = new Date(o.created_at).getHours()
      map[h] = (map[h] || 0) + 1
    })
    return map
  }, [paidOrders])

  const topTable = useMemo(() => {
    const map: Record<number, number> = {}
    paidOrders.forEach(o => {
      const total = o.items.reduce((a, i) => a + i.price * i.qty, 0)
      map[o.table_number] = (map[o.table_number] || 0) + total
    })
    return Object.entries(map).sort(([, a], [, b]) => b - a)[0]
  }, [paidOrders])

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserEmail(user.email || '')
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'caja') router.replace('/login')
      else setAuthorized(true)
    }
    check()
  }, [router])

  const fetchOrders = async () => {
    const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false })
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

  const confirmPayment = async () => {
    if (!paymentModal) return
    setPaying(true)
    await supabase.from('orders').update({ status: 'paid', payment_method: payMethod }).eq('id', paymentModal.id)
    setPaymentModal(null)
    setPaying(false)
    fetchOrders()
  }

  // ── Early return DESPUÉS de todos los hooks ──────────────────────────────────
  if (!authorized) return null

  const pendingPayments = orders.filter(o => ['payment_requested', 'delivered'].includes(o.status))
  const paymentHistory = orders.filter(o => o.status === 'paid')
  const totalVentas = paymentHistory.reduce((acc, o) => acc + o.items.reduce((a, i) => a + i.price * i.qty, 0), 0)
  const maxQty = topProducts[0]?.[1] || 1
  const horasPico = Object.entries(byHour).sort(([, a], [, b]) => b - a).slice(0, 8)
  const maxByHour = Math.max(...Object.values(byHour), 1)

  const tabStyle = (tab: string): React.CSSProperties => ({
    padding: '0.5rem 1.1rem',
    fontWeight: 600,
    fontSize: '0.875rem',
    cursor: 'pointer',
    background: activeTab === tab ? 'var(--accent)' : 'transparent',
    color: activeTab === tab ? '#0f0f0f' : 'var(--fg, var(--text))',
    border: '1px solid',
    borderColor: activeTab === tab ? 'var(--accent)' : 'var(--border)',
    borderRadius: '8px',
    transition: 'all 0.15s',
  })

  const methodBtn = (m: string): React.CSSProperties => ({
    flex: 1,
    padding: '0.75rem',
    borderRadius: '10px',
    border: '2px solid',
    borderColor: payMethod === m ? 'var(--accent)' : 'var(--border)',
    background: payMethod === m ? 'rgba(200,169,110,0.12)' : 'transparent',
    color: 'var(--text)',
    cursor: 'pointer',
    fontWeight: 600,
    transition: 'all 0.15s',
  })

  return (
    <div className="container" style={{ paddingTop: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h1 style={{ marginBottom: 0 }}>💰 Caja</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>{userEmail}</span>
          <button className="btn btn-secondary" onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}>Cerrar sesión</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>Ventas del día</p>
          <p style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent)' }}>${totalVentas.toFixed(0)}</p>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>Cuentas pendientes</p>
          <p style={{ fontSize: '1.8rem', fontWeight: 700, color: pendingPayments.length > 0 ? '#d35f5f' : 'var(--text)' }}>{pendingPayments.length}</p>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>Pedidos pagados</p>
          <p style={{ fontSize: '1.8rem', fontWeight: 700 }}>{paymentHistory.length}</p>
        </div>
        {topTable && (
          <div className="card" style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>Mesa top</p>
            <p style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent)' }}>
              Mesa {topTable[0]} <span style={{ fontSize: '0.9rem' }}>(${Number(topTable[1]).toFixed(0)})</span>
            </p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button style={tabStyle('cuentas')} onClick={() => setActiveTab('cuentas')}>💳 Cuentas ({pendingPayments.length})</button>
        <button style={tabStyle('historial')} onClick={() => setActiveTab('historial')}>📋 Historial</button>
        <button style={tabStyle('estadisticas')} onClick={() => setActiveTab('estadisticas')}>📊 Estadísticas</button>
      </div>

      {/* Tab: Cuentas */}
      {activeTab === 'cuentas' && (
        pendingPayments.length === 0
          ? <div className="card" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}><p>✅ No hay cuentas pendientes</p></div>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {pendingPayments.map(order => {
                const total = order.items.reduce((a, i) => a + i.price * i.qty, 0)
                return (
                  <div key={order.id} className="card" style={{ borderColor: order.status === 'payment_requested' ? '#d35f5f' : undefined }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <strong>Mesa {order.table_number}</strong>
                      <span style={{ color: order.status === 'payment_requested' ? '#d35f5f' : 'var(--muted)', fontWeight: 600, fontSize: '0.85rem' }}>
                        {order.status === 'payment_requested' ? '💳 Pide cuenta' : 'Para pagar'}
                      </span>
                    </div>
                    <ul style={{ marginLeft: '1rem', marginBottom: '0.75rem', color: 'var(--muted)', fontSize: '0.875rem' }}>
                      {order.items.map((it, i) => <li key={i}>{it.qty} × {it.name}</li>)}
                    </ul>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.75rem' }}>Total: ${total.toFixed(0)}</div>
                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => { setPaymentModal(order); setPayMethod('efectivo') }}>
                      💳 Cobrar
                    </button>
                  </div>
                )
              })}
            </div>
      )}

      {/* Tab: Historial */}
      {activeTab === 'historial' && (
        paymentHistory.length === 0
          ? <div className="card" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}><p>Sin pagos aún</p></div>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: '1rem' }}>
              {paymentHistory.map(order => {
                const total = order.items.reduce((a, i) => a + i.price * i.qty, 0)
                const methodIcon: Record<string, string> = { efectivo: '💵', tarjeta: '💳', transferencia: '📲' }
                return (
                  <div key={order.id} className="card" style={{ borderColor: '#7aad7a' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <strong>Mesa {order.table_number}</strong>
                      <span style={{ color: '#7aad7a', fontWeight: 600, fontSize: '0.85rem' }}>
                        {order.payment_method ? methodIcon[order.payment_method] || '✓' : '✓'} Pagado
                      </span>
                    </div>
                    <ul style={{ marginLeft: '1rem', marginTop: '0.5rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                      {order.items.map((it, i) => <li key={i}>{it.qty} × {it.name}</li>)}
                    </ul>
                    <div style={{ marginTop: '0.5rem', fontWeight: 700 }}>${total.toFixed(0)}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                      {new Date(order.created_at).toLocaleString('es-CL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                      {order.payment_method && <span style={{ marginLeft: '0.5rem', textTransform: 'capitalize' }}>· {order.payment_method}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
      )}

      {/* Tab: Estadísticas */}
      {activeTab === 'estadisticas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {paidOrders.length === 0
            ? <div className="card" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}><p>Sin datos de ventas aún</p></div>
            : <>
                <div className="card">
                  <h3 style={{ marginBottom: '1rem' }}>🥇 Top 5 productos</h3>
                  {topProducts.map(([name, qty], i) => (
                    <div key={name} style={{ marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                        <span><strong style={{ color: 'var(--accent)' }}>#{i + 1}</strong> {name}</span>
                        <span style={{ fontWeight: 700 }}>{qty} uds</span>
                      </div>
                      <div style={{ background: 'var(--border)', borderRadius: '4px', height: '8px' }}>
                        <div style={{ height: '100%', width: `${(qty / maxQty) * 100}%`, background: 'var(--accent)', borderRadius: '4px' }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="card">
                  <h3 style={{ marginBottom: '1rem' }}>⏰ Actividad por hora</h3>
                  {horasPico.map(([hora, count]) => (
                    <div key={hora} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <span style={{ width: '48px', fontSize: '0.8rem', color: 'var(--muted)', flexShrink: 0 }}>{String(hora).padStart(2, '0')}:00</span>
                      <div style={{ flex: 1, background: 'var(--border)', borderRadius: '4px', height: '10px' }}>
                        <div style={{ height: '100%', width: `${(count / maxByHour) * 100}%`, background: '#5fa8d3', borderRadius: '4px' }} />
                      </div>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{count}</span>
                    </div>
                  ))}
                </div>
              </>
          }
        </div>
      )}

      {/* Modal de pago */}
      {paymentModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div className="card" style={{ maxWidth: '420px', width: '100%' }}>
            <h2 style={{ marginBottom: '0.75rem' }}>Cobrar Mesa {paymentModal.table_number}</h2>
            <ul style={{ marginLeft: '1rem', marginBottom: '0.75rem', color: 'var(--muted)', fontSize: '0.875rem' }}>
              {paymentModal.items.map((it, i) => (
                <li key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{it.qty} × {it.name}</span>
                  <span>${(it.price * it.qty).toFixed(0)}</span>
                </li>
              ))}
            </ul>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
              Total: ${paymentModal.items.reduce((a, i) => a + i.price * i.qty, 0).toFixed(0)}
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>Método de pago</p>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {(['efectivo', 'tarjeta', 'transferencia'] as const).map(m => (
                <button key={m} style={methodBtn(m)} onClick={() => setPayMethod(m)}>
                  {m === 'efectivo' ? '💵' : m === 'tarjeta' ? '💳' : '📲'}<br />
                  <span style={{ fontSize: '0.8rem', textTransform: 'capitalize' }}>{m}</span>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setPaymentModal(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={confirmPayment} disabled={paying}>
                {paying ? 'Procesando…' : '✅ Confirmar pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
