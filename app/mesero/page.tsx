'use client'

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ThemeToggle } from '@/components/ThemeToggle'

// ── Tipos ────────────────────────────────────────────────────────────────────
type MenuItem = { id: string; name: string; price: number; category: string; description?: string }
type OrderItem = { name: string; qty: number; price: number }
type Order = {
  id: string
  table_number: number
  status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'payment_requested' | 'paid'
  items: OrderItem[]
  created_at: string
}
type WaiterCall = { id: string; table_number: number; status: 'pending' | 'attended'; created_at: string }

// ────────────────────────────────────────────────────────────────────────────
export default function MeseroPage() {
  const supabase = createClient()
  const router = useRouter()

  // Auth
  const [authorized, setAuthorized] = useState(false)
  const [userEmail, setUserEmail] = useState('')

  // Datos
  const [orders, setOrders] = useState<Order[]>([])
  const [calls, setCalls] = useState<WaiterCall[]>([])
  const [menu, setMenu] = useState<MenuItem[]>([])

  // Mesas dinámicas (persistidas en localStorage)
  const [tables, setTables] = useState<number[]>([])
  const [newTableInput, setNewTableInput] = useState('')

  // Filtro de vista
  const [selectedTable, setSelectedTable] = useState<number | null>(null)

  // Panel de tomar pedido
  const [orderingTable, setOrderingTable] = useState<number | null>(null)
  const [cart, setCart] = useState<{ item: MenuItem; qty: number }[]>([])
  const [sendingOrder, setSendingOrder] = useState(false)

  // Panel QR
  const [showQR, setShowQR] = useState(false)

  // Tabs
  const [activeTab, setActiveTab] = useState<'pedidos' | 'tomar' | 'mesas'>('pedidos')

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('mesero_table')
    if (saved) setSelectedTable(Number(saved))
    const savedTables = localStorage.getItem('rf_tables')
    setTables(savedTables ? JSON.parse(savedTables) : [1, 2, 3, 4, 5, 6])
  }, [])

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserEmail(user.email || '')
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'mesero') router.replace('/login')
      else setAuthorized(true)
    }
    check()
  }, [router])

  // ── Menú ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authorized) return
    supabase.from('menu').select('*').order('category').then(({ data }) => setMenu(data || []))
  }, [authorized])

  // ── Datos en tiempo real ──────────────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    const { data } = await supabase.from('orders').select('*')
      .not('status', 'eq', 'paid')
      .order('created_at', { ascending: true })
    setOrders(data || [])
  }, [])

  const fetchCalls = useCallback(async () => {
    const { data } = await supabase.from('waiter_calls').select('*').eq('status', 'pending')
    setCalls(data || [])
  }, [])

  useEffect(() => {
    if (!authorized) return
    fetchOrders()
    fetchCalls()
    const ch = supabase.channel('mesero-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waiter_calls' }, fetchCalls)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [authorized, fetchOrders, fetchCalls])

  // ── Mesas dinámicas ───────────────────────────────────────────────────────
  const persistTables = (t: number[]) => {
    setTables(t)
    localStorage.setItem('rf_tables', JSON.stringify(t))
  }

  const addTable = () => {
    const n = parseInt(newTableInput)
    if (!n || tables.includes(n)) return
    persistTables([...tables, n].sort((a, b) => a - b))
    setNewTableInput('')
  }

  const removeTable = (n: number) => {
    if (!confirm(`¿Eliminar mesa ${n}? Si tiene pedidos activos, no se borrarán.`)) return
    persistTables(tables.filter(t => t !== n))
    if (selectedTable === n) { setSelectedTable(null); localStorage.removeItem('mesero_table') }
  }

  // ── Lógica de tabla / filtros ─────────────────────────────────────────────
  const handleTableSelect = (t: number | null) => {
    setSelectedTable(t)
    if (t === null) localStorage.removeItem('mesero_table')
    else localStorage.setItem('mesero_table', String(t))
  }

  const markDelivered = async (orderId: string) => {
    await supabase.from('orders').update({ status: 'delivered' }).eq('id', orderId)
    fetchOrders()
  }

  const attendCall = async (callId: string) => {
    await supabase.from('waiter_calls').update({ status: 'attended' }).eq('id', callId)
    fetchCalls()
  }

  // ── Tomar pedido ──────────────────────────────────────────────────────────
  const cartAdd = (item: MenuItem) => {
    setCart(c => {
      const ex = c.find(x => x.item.id === item.id)
      if (ex) return c.map(x => x.item.id === item.id ? { ...x, qty: x.qty + 1 } : x)
      return [...c, { item, qty: 1 }]
    })
  }

  const cartRemove = (itemId: string) => {
    setCart(c => {
      const ex = c.find(x => x.item.id === itemId)
      if (!ex) return c
      if (ex.qty === 1) return c.filter(x => x.item.id !== itemId)
      return c.map(x => x.item.id === itemId ? { ...x, qty: x.qty - 1 } : x)
    })
  }

  const sendOrder = async () => {
    if (!orderingTable || cart.length === 0) return
    setSendingOrder(true)
    const newItems: OrderItem[] = cart.map(c => ({ name: c.item.name, qty: c.qty, price: c.item.price }))

    // Buscar ticket activo para esa mesa (excluyendo paid)
    const activeOrder = orders.find(o => o.table_number === orderingTable)

    if (activeOrder) {
      // Fusionar al ticket existente — también reactivar si estaba en payment_requested
      const merged = [...activeOrder.items]
      newItems.forEach(ni => {
        const found = merged.find((i: OrderItem) => i.name === ni.name)
        if (found) found.qty += ni.qty
        else merged.push(ni)
      })
      const newStatus = activeOrder.status === 'payment_requested' ? 'pending' : activeOrder.status
      await supabase.from('orders').update({ items: merged, status: newStatus }).eq('id', activeOrder.id)
    } else {
      // Crear nuevo ticket
      await supabase.from('orders').insert({
        table_number: orderingTable,
        items: newItems,
        status: 'pending',
      })
    }
    setCart([])
    setSendingOrder(false)
    setOrderingTable(null)
    setActiveTab('pedidos')
    fetchOrders()
  }

  if (!authorized) return null

  const activeOrders = orders.filter(o => ['pending', 'preparing', 'ready', 'delivered', 'payment_requested'].includes(o.status))
  const filteredOrders = selectedTable ? activeOrders.filter(o => o.table_number === selectedTable) : activeOrders
  const cartTotal = cart.reduce((s, c) => s + c.item.price * c.qty, 0)
  const groupedMenu = menu.reduce((acc, item) => { (acc[item.category] ||= []).push(item); return acc }, {} as Record<string, MenuItem[]>)

  const statusLabel: Record<string, string> = {
    pending: '🆕 Nuevo', preparing: '🔥 Preparando', ready: '✅ Listo',
    delivered: '📦 Entregado', payment_requested: '💳 Pide cuenta',
  }
  const statusColor: Record<string, string> = {
    pending: 'var(--muted)', preparing: '#5fa8d3', ready: 'var(--accent)',
    delivered: '#7aad7a', payment_requested: '#d35f5f',
  }

  const tabBtn = (t: string, label: string) => ({
    style: {
      padding: '0.45rem 1rem', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
      background: activeTab === t ? 'var(--accent)' : 'transparent',
      color: activeTab === t ? '#0f0f0f' : 'var(--text)',
      border: '1px solid', borderColor: activeTab === t ? 'var(--accent)' : 'var(--border)',
      borderRadius: '8px', transition: 'all 0.15s',
    } as React.CSSProperties,
    onClick: () => setActiveTab(t as any),
    children: label,
  })

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h1 style={{ marginBottom: 0 }}>🧑‍🍳 Mesero</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <ThemeToggle />
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{userEmail}</span>
          <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }} onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}>Salir</button>
        </div>
      </div>

      {/* Llamadas pendientes */}
      {calls.length > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem', borderColor: '#d35f5f', background: 'rgba(211,95,95,0.06)' }}>
          <h3 style={{ color: '#d35f5f', marginBottom: '0.75rem', fontSize: '0.95rem' }}>🔔 {calls.length} llamada{calls.length > 1 ? 's' : ''} de mesero</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {calls.map(call => (
              <div key={call.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className="card" style={{ padding: '0.25rem 0.6rem', fontWeight: 600, fontSize: '0.875rem' }}>Mesa {call.table_number}</span>
                <button className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }} onClick={() => attendCall(call.id)}>Atendido</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button {...tabBtn('pedidos', '📋 Pedidos')}>📋 Pedidos</button>
        <button {...tabBtn('tomar', '🍽️ Tomar pedido')}>🍽️ Tomar pedido</button>
        <button {...tabBtn('mesas', '📱 Mesas / QR')}>📱 Mesas / QR</button>
      </div>

      {/* ── TAB: PEDIDOS ───────────────────────────────────────────────────── */}
      {activeTab === 'pedidos' && (
        <>
          {/* Filtro por mesa */}
          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Mesa:</span>
              <button
                className="btn"
                style={{ padding: '0.25rem 0.7rem', fontSize: '0.82rem', background: selectedTable === null ? 'var(--accent)' : undefined, color: selectedTable === null ? '#0f0f0f' : undefined, borderColor: selectedTable === null ? 'var(--accent)' : 'var(--border)' }}
                onClick={() => handleTableSelect(null)}
              >Todas</button>
              {tables.map(t => (
                <button key={t} className="btn"
                  style={{ padding: '0.25rem 0.7rem', fontSize: '0.82rem', background: selectedTable === t ? 'var(--accent)' : undefined, color: selectedTable === t ? '#0f0f0f' : undefined, borderColor: selectedTable === t ? 'var(--accent)' : 'var(--border)' }}
                  onClick={() => handleTableSelect(t)}
                >Mesa {t}</button>
              ))}
            </div>
          </div>

          {filteredOrders.length === 0
            ? <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                <p>✅ {selectedTable ? `No hay pedidos para mesa ${selectedTable}` : 'No hay pedidos activos'}</p>
              </div>
            : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {filteredOrders.map(order => (
                  <div key={order.id} className="card" style={{ borderColor: order.status === 'payment_requested' ? '#d35f5f' : order.status === 'ready' ? 'var(--accent)' : undefined }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <strong>Mesa {order.table_number}</strong>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: statusColor[order.status] }}>{statusLabel[order.status]}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
                      {new Date(order.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <ul style={{ marginLeft: '1rem', marginBottom: '0.75rem', color: 'var(--muted)', fontSize: '0.875rem' }}>
                      {order.items.map((it, i) => <li key={i}>{it.qty} × {it.name}</li>)}
                    </ul>
                    <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>${order.items.reduce((a, i) => a + i.price * i.qty, 0).toFixed(0)}</div>
                    {order.status === 'ready' && (
                      <button className="btn btn-primary" style={{ width: '100%', padding: '0.4rem' }} onClick={() => markDelivered(order.id)}>📦 Entregar</button>
                    )}
                  </div>
                ))}
              </div>
          }
        </>
      )}

      {/* ── TAB: TOMAR PEDIDO ──────────────────────────────────────────────── */}
      {activeTab === 'tomar' && (
        <div>
          {/* Selección de mesa */}
          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <p style={{ fontWeight: 600, marginBottom: '0.75rem' }}>¿Para qué mesa?</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {tables.map(t => (
                <button key={t} className="btn"
                  style={{ padding: '0.4rem 0.85rem', background: orderingTable === t ? 'var(--accent)' : undefined, color: orderingTable === t ? '#0f0f0f' : undefined, borderColor: orderingTable === t ? 'var(--accent)' : 'var(--border)' }}
                  onClick={() => setOrderingTable(t)}
                >Mesa {t}</button>
              ))}
            </div>
            {orderingTable && orders.find(o => o.table_number === orderingTable) && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.82rem', color: '#5fa8d3' }}>
                ℹ️ Mesa {orderingTable} tiene un pedido activo — los productos se agregarán al mismo ticket
              </p>
            )}
          </div>

          {orderingTable && (
            <div style={{ display: 'grid', gridTemplateColumns: menu.length > 0 ? '1fr 280px' : '1fr', gap: '1.25rem' }}>
              {/* Menú */}
              <div>
                {Object.entries(groupedMenu).map(([cat, items]) => (
                  <section key={cat} style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)', borderBottom: '1px solid var(--border)', paddingBottom: '0.3rem', marginBottom: '0.75rem' }}>{cat}</h3>
                    {items.map(item => {
                      const inCart = cart.find(c => c.item.id === item.id)
                      return (
                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid var(--border)' }}>
                          <div>
                            <span style={{ fontWeight: 500 }}>{item.name}</span>
                            <span style={{ marginLeft: '0.75rem', color: 'var(--accent)', fontWeight: 700 }}>${item.price.toFixed(0)}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                            {inCart ? (
                              <>
                                <button onClick={() => cartRemove(item.id)} style={{ width: '26px', height: '26px', borderRadius: '50%', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text)', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                                <span style={{ minWidth: '20px', textAlign: 'center', fontWeight: 700 }}>{inCart.qty}</span>
                                <button onClick={() => cartAdd(item)} style={{ width: '26px', height: '26px', borderRadius: '50%', border: 'none', background: 'var(--accent)', cursor: 'pointer', color: '#0f0f0f', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                              </>
                            ) : (
                              <button onClick={() => cartAdd(item)} style={{ padding: '0.25rem 0.65rem', borderRadius: '20px', border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', fontSize: '0.82rem' }}>+ Agregar</button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </section>
                ))}
              </div>

              {/* Carrito lateral */}
              <div>
                <div className="card" style={{ position: 'sticky', top: '1rem' }}>
                  <h3 style={{ marginBottom: '0.75rem' }}>🛒 Mesa {orderingTable}</h3>
                  {cart.length === 0
                    ? <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Sin items aún</p>
                    : <>
                        {cart.map(c => (
                          <div key={c.item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.4rem' }}>
                            <span>{c.qty} × {c.item.name}</span>
                            <span>${(c.item.price * c.qty).toFixed(0)}</span>
                          </div>
                        ))}
                        <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.75rem', paddingTop: '0.75rem', fontWeight: 700, fontSize: '1.1rem', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Total</span><span>${cartTotal.toFixed(0)}</span>
                        </div>
                        <button
                          className="btn btn-primary"
                          style={{ width: '100%', marginTop: '1rem' }}
                          disabled={sendingOrder}
                          onClick={sendOrder}
                        >
                          {sendingOrder ? 'Enviando…' : '🚀 Enviar a cocina'}
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.8rem' }}
                          onClick={() => setCart([])}
                        >Limpiar</button>
                      </>
                  }
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: MESAS / QR ────────────────────────────────────────────────── */}
      {activeTab === 'mesas' && (
        <div>
          {/* Agregar mesa */}
          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ marginBottom: '0.75rem' }}>Gestión de mesas</h3>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="number"
                placeholder="Número de mesa"
                value={newTableInput}
                onChange={e => setNewTableInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTable()}
                style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.9rem' }}
              />
              <button className="btn btn-primary" onClick={addTable}>+ Agregar</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {tables.map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.3rem 0.75rem' }}>
                  <span style={{ fontWeight: 600 }}>Mesa {t}</span>
                  <a href={`/mesa/${t}`} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: 'var(--accent)', textDecoration: 'none' }}>🔗</a>
                  <button onClick={() => removeTable(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d35f5f', fontSize: '1rem', lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
          </div>

          {/* QR */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ marginBottom: 0 }}>📱 Códigos QR</h3>
              <button className="btn btn-secondary" style={{ fontSize: '0.82rem' }} onClick={() => setShowQR(v => !v)}>
                {showQR ? 'Ocultar' : 'Mostrar QRs'}
              </button>
            </div>
            {showQR && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
                {tables.map(n => (
                  <div key={n} style={{ textAlign: 'center' }}>
                    <p style={{ fontWeight: 700, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Mesa {n}</p>
                    <img src={`/api/qr?tabla=${n}`} alt={`QR Mesa ${n}`} style={{ width: '100%', maxWidth: '140px', borderRadius: '8px' }} />
                    <a href={`/mesa/${n}`} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ display: 'block', marginTop: '0.4rem', fontSize: '0.78rem', padding: '0.25rem' }}>Abrir vista</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
