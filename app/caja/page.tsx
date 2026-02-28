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

type GroupedAccount = {
  table_number: number
  orders: Order[]
  total: number
  items: OrderItem[]
  status: string
}

export default function CajaPage() {
  const supabase = createClient()
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [authorized, setAuthorized] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [activeTab, setActiveTab] = useState<'cuentas' | 'historial' | 'estadisticas'>('cuentas')
  
  // Para el modal de pago ahora pasamos el grupo de la mesa
  const [paymentModal, setPaymentModal] = useState<GroupedAccount | null>(null)
  const [payMethod, setPayMethod] = useState<'efectivo' | 'tarjeta' | 'transferencia'>('efectivo')
  const [paying, setPaying] = useState(false)

  // ── Estadísticas ─────────────────────────────────────────────────────────────
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
    
    // Liquidar todas las tandas de la mesa en una sola tanda de actualizaciones
    const ids = paymentModal.orders.map(o => o.id)
    await supabase.from('orders')
      .update({ status: 'paid', payment_method: payMethod })
      .in('id', ids)
    
    setPaymentModal(null)
    setPaying(false)
    fetchOrders()
  }

  if (!authorized) return null

  // ── Agrupación de Cuentas por Mesa ──────────────────────────────────────────
  const pendingPayments = orders.filter(o => ['pending', 'preparing', 'ready', 'delivered', 'payment_requested'].includes(o.status))
  
  const groupedAccounts: Record<number, GroupedAccount> = pendingPayments.reduce((acc, order) => {
    const t = order.table_number
    if (!acc[t]) acc[t] = { table_number: t, orders: [], total: 0, items: [], status: 'pending' }
    
    acc[t].orders.push(order)
    order.items.forEach(it => {
      const ex = acc[t].items.find(x => x.name === it.name)
      if (ex) ex.qty += it.qty
      else acc[t].items.push({ ...it })
      acc[t].total += it.price * it.qty
    })

    // Estado visual de la cuenta: prioridad a 'payment_requested'
    if (order.status === 'payment_requested' || acc[t].status === 'pending') {
      acc[t].status = order.status
    } else if (order.status === 'ready' && acc[t].status !== 'payment_requested') {
      acc[t].status = 'ready'
    }
    
    return acc
  }, {} as Record<number, GroupedAccount>)

  const displayAccounts = Object.values(groupedAccounts).sort((a,b) => a.table_number - b.table_number)

  const paymentHistory = orders.filter(o => o.status === 'paid')
  const totalVentas = paymentHistory.reduce((acc, o) => acc + o.items.reduce((a, i) => a + i.price * i.qty, 0), 0)
  const maxQty = topProducts[0]?.[1] || 1
  const horasPico = Object.entries(byHour).sort(([, a], [, b]) => b - a).slice(0, 8)
  const maxByHour = Math.max(...Object.values(byHour), 1)

  const tabStyle = (tab: string): React.CSSProperties => ({
    padding: '0.5rem 1.1rem', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
    background: activeTab === tab ? 'var(--accent)' : 'transparent',
    color: activeTab === tab ? '#0f0f0f' : 'var(--text)',
    border: '1px solid', borderColor: activeTab === tab ? 'var(--accent)' : 'var(--border)',
    borderRadius: '8px', transition: 'all 0.15s',
  })

  const methodBtn = (m: string): React.CSSProperties => ({
    flex: 1, padding: '0.75rem', borderRadius: '10px', border: '2px solid',
    borderColor: payMethod === m ? 'var(--accent)' : 'var(--border)',
    background: payMethod === m ? 'rgba(200,169,110,0.12)' : 'transparent',
    color: 'var(--text)', cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s',
  })

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
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
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>Mesas activas</p>
          <p style={{ fontSize: '1.8rem', fontWeight: 700, color: displayAccounts.length > 0 ? '#d35f5f' : 'var(--text)' }}>{displayAccounts.length}</p>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>Órdenes pagadas</p>
          <p style={{ fontSize: '1.8rem', fontWeight: 700 }}>{paymentHistory.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
        <button style={tabStyle('cuentas')} onClick={() => setActiveTab('cuentas')}>📊 Cuentas</button>
        <button style={tabStyle('historial')} onClick={() => setActiveTab('historial')}>📜 Historial</button>
        <button style={tabStyle('estadisticas')} onClick={() => setActiveTab('estadisticas')}>📈 Estadísticas</button>
      </div>

      {/* TAB: CUENTAS (Agrupadas por Mesa) */}
      {activeTab === 'cuentas' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
          {displayAccounts.length === 0 ? (
            <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
              ☕ No hay mesas consumiendo ahora mismo.
            </div>
          ) : (
            displayAccounts.map(account => (
              <div key={account.table_number} className="card" style={{ borderColor: account.status === 'payment_requested' ? '#d35f5f' : 'var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0 }}>Mesa {account.table_number}</h3>
                  {account.status === 'payment_requested' && (
                    <span style={{ background: '#d35f5f', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>PIDE CUENTA</span>
                  )}
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
                  {account.orders.length} tanda(s) registradas
                </div>
                <ul style={{ margin: '0 0 1rem 1rem', padding: 0, fontSize: '0.875rem', color: 'var(--muted)' }}>
                  {account.items.map((it, i) => (
                    <li key={i} style={{ marginBottom: '0.25rem' }}>{it.qty} × {it.name}</li>
                  ))}
                </ul>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: 'auto' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>Total a cobrar</p>
                    <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>${account.total.toFixed(0)}</p>
                  </div>
                  <button className="btn btn-primary" onClick={() => setPaymentModal(account)}>💰 Cobrar</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB: HISTORIAL (Tickets individuales pagados) */}
      {activeTab === 'historial' && (
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem' }}>Mesa</th>
                <th style={{ padding: '0.75rem' }}>Hora</th>
                <th style={{ padding: '0.75rem' }}>Productos</th>
                <th style={{ padding: '0.75rem' }}>Pago</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {paymentHistory.map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem', fontWeight: 600 }}>{o.table_number}</td>
                  <td style={{ padding: '0.75rem', color: 'var(--muted)' }}>{new Date(o.created_at).toLocaleTimeString()}</td>
                  <td style={{ padding: '0.75rem', fontSize: '0.78rem' }}>{o.items.map(i => `${i.qty}x ${i.name}`).join(', ')}</td>
                  <td style={{ padding: '0.75rem' }}><span style={{ textTransform: 'capitalize', padding: '0.1rem 0.4rem', background: 'rgba(200,169,110,0.1)', borderRadius: '4px', fontSize: '0.7rem' }}>{o.payment_method || '—'}</span></td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700 }}>${o.items.reduce((a, i) => a + i.price * i.qty, 0).toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB: ESTADISTICAS */}
      {activeTab === 'estadisticas' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          <div className="card">
            <h3 style={{ marginBottom: '1.25rem' }}>TOP 5 Productos</h3>
            {topProducts.map(([name, qty]) => (
              <div key={name} style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.25rem' }}>
                  <span>{name}</span>
                  <strong>{qty} u.</strong>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'var(--border)', borderRadius: '3px' }}>
                  <div style={{ height: '100%', width: `${(qty / maxQty) * 100}%`, background: 'var(--accent)', borderRadius: '3px' }}></div>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '1.25rem' }}>Ventas por Hora</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.4rem', height: '150px', paddingTop: '1rem' }}>
              {Array.from({ length: 24 }).map((_, h) => {
                const val = byHour[h] || 0
                return (
                  <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                    <div style={{ width: '100%', background: val > 0 ? 'var(--accent)' : 'rgba(255,255,255,0.05)', height: `${(val / maxByHour) * 100}%`, borderRadius: '2px 2px 0 0', minHeight: '2px' }}></div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>{h}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {topTable && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Mesa con más ventas</p>
              <p style={{ fontSize: '3rem', fontWeight: 800, margin: '0.5rem 0', color: 'var(--accent)' }}>#{topTable[0]}</p>
              <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>${topTable[1].toFixed(0)} facturados</p>
            </div>
          )}
        </div>
      )}

      {/* MODAL DE PAGO */}
      {paymentModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '450px', width: '100%', border: '1px solid var(--accent)' }}>
            <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Cobrar Mesa {paymentModal.table_number}</h2>
            
            <div className="card" style={{ background: 'rgba(255,255,255,0.03)', marginBottom: '1.5rem' }}>
              <div style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '1rem' }}>
                {paymentModal.items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.3rem', color: 'var(--muted)' }}>
                    <span>{it.qty} × {it.name}</span>
                    <span>${(it.price * it.qty).toFixed(0)}</span>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '1.1rem' }}>Total a pagar</strong>
                <strong style={{ fontSize: '1.8rem', color: 'var(--accent)' }}>${paymentModal.total.toFixed(0)}</strong>
              </div>
            </div>

            <p style={{ fontSize: '0.9rem', marginBottom: '0.75rem', fontWeight: 600 }}>Método de pago:</p>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
              <button style={methodBtn('efectivo')} onClick={() => setPayMethod('efectivo')}>💵 Efectivo</button>
              <button style={methodBtn('tarjeta')} onClick={() => setPayMethod('tarjeta')}>💳 Tarjeta</button>
              <button style={methodBtn('transferencia')} onClick={() => setPayMethod('transferencia')}>🏦 Transf.</button>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setPaymentModal(null)} disabled={paying}>Cancelar</button>
              <button className="btn btn-primary" style={{ flex: 2, padding: '0.75rem' }} onClick={confirmPayment} disabled={paying}>
                {paying ? 'Procesando...' : 'Confirmar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
