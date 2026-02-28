'use client'

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'

type MenuItem = { id: string; name: string; description?: string; price: number; category: string }
type OrderItem = { name: string; qty: number; price: number }
type Order = {
  id: string
  table_number: number
  status: string
  items: OrderItem[]
  created_at: string
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  pending:           { label: 'Enviado a cocina · En espera',   color: '#8A8A8A', icon: '🕐' },
  preparing:         { label: 'Preparando su pedido…',          color: '#5fa8d3', icon: '🔥' },
  ready:             { label: 'Listo — el mesero lo trae ya',   color: '#C8A96E', icon: '✅' },
  delivered:         { label: '¡Pedido entregado! Buen provecho', color: '#7aad7a', icon: '🍽️' },
  payment_requested: { label: 'Cuenta solicitada. En camino…', color: '#9a7acd', icon: '💳' },
  paid:              { label: '¡Gracias por su visita!',        color: '#7aad7a', icon: '🎉' },
}

export default function MesaPage() {
  const params = useParams()
  const numero = String(params.numero)
  const supabase = createClient()

  const [menu, setMenu] = useState<MenuItem[]>([])
  const [cart, setCart] = useState<{ item: MenuItem; qty: number }[]>([])
  const [activeOrder, setActiveOrder] = useState<Order | null>(null)
  const [callSent, setCallSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [view, setView] = useState<'menu' | 'status'>('menu')

  // Cargar menú
  useEffect(() => {
    supabase.from('menu').select('*').order('category').then(({ data }) => setMenu(data || []))
  }, [])

  // Recuperar carrito de localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`cart_mesa_${numero}`)
    if (saved) try { setCart(JSON.parse(saved)) } catch {}
  }, [numero])

  useEffect(() => {
    localStorage.setItem(`cart_mesa_${numero}`, JSON.stringify(cart))
  }, [cart, numero])

  // Pedido activo de la mesa
  const fetchActiveOrder = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('table_number', Number(numero))
      .not('status', 'eq', 'paid')
      .order('created_at', { ascending: false })
      .limit(1)
    setActiveOrder(data?.[0] || null)
  }, [numero])

  useEffect(() => {
    fetchActiveOrder()
    const channel = supabase.channel(`mesa-rt-${numero}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `table_number=eq.${numero}` }, fetchActiveOrder)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [numero, fetchActiveOrder])

  // Cambiar automáticamente a pestaña status cuando hay pedido activo
  useEffect(() => {
    if (activeOrder && ['pending', 'preparing', 'ready', 'delivered', 'payment_requested'].includes(activeOrder.status)) {
      setView('status')
    }
  }, [activeOrder?.id])

  const addToCart = (item: MenuItem) => {
    setCart(c => {
      const ex = c.find(x => x.item.id === item.id)
      if (ex) return c.map(x => x.item.id === item.id ? { ...x, qty: x.qty + 1 } : x)
      return [...c, { item, qty: 1 }]
    })
  }

  const removeFromCart = (itemId: string) => {
    setCart(c => {
      const ex = c.find(x => x.item.id === itemId)
      if (!ex) return c
      if (ex.qty === 1) return c.filter(x => x.item.id !== itemId)
      return c.map(x => x.item.id === itemId ? { ...x, qty: x.qty - 1 } : x)
    })
  }

  const total = cart.reduce((s, c) => s + c.item.price * c.qty, 0)

  const submitOrder = async () => {
    if (cart.length === 0) return
    setSubmitting(true)
    try {
      const newItems: OrderItem[] = cart.map(c => ({ name: c.item.name, qty: c.qty, price: c.item.price }))

      if (activeOrder && activeOrder.status !== 'paid') {
        // Ticket activo: fusionar items
        const merged: OrderItem[] = [...activeOrder.items]
        newItems.forEach(ni => {
          const found = merged.find(i => i.name === ni.name)
          if (found) found.qty += ni.qty
          else merged.push(ni)
        })
        // Si estaba pidiendo cuenta, volver a estado activo
        const newStatus = activeOrder.status === 'payment_requested' ? 'pending' : activeOrder.status
        await supabase.from('orders').update({ items: merged, status: newStatus }).eq('id', activeOrder.id)
      } else {
        // Sin ticket activo: crear nuevo
        await supabase.from('orders').insert({ table_number: Number(numero), items: newItems, status: 'pending' })
      }
      localStorage.removeItem(`cart_mesa_${numero}`)
      setCart([])
      setView('status')
      await fetchActiveOrder()
    } finally {
      setSubmitting(false)
    }
  }

  const requestPayment = async () => {
    if (!activeOrder) return
    await supabase.from('orders').update({ status: 'payment_requested' }).eq('id', activeOrder.id)
    fetchActiveOrder()
  }

  const callWaiter = async () => {
    await supabase.from('waiter_calls').insert({ table_number: Number(numero), status: 'pending' })
    setCallSent(true)
    setTimeout(() => setCallSent(false), 5000)
  }

  const grouped = menu.reduce((acc, item) => { (acc[item.category] ||= []).push(item); return acc }, {} as Record<string, MenuItem[]>)
  const orderStatus = activeOrder ? STATUS_LABELS[activeOrder.status] : null
  const orderTotal = activeOrder ? activeOrder.items.reduce((a, i) => a + i.price * i.qty, 0) : 0
  const canAddMore = !activeOrder || ['pending', 'preparing', 'ready', 'delivered', 'payment_requested'].includes(activeOrder.status)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{
        padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 10,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.1rem' }}>🍽️ Restaurante Fluido</h1>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>Mesa {numero}</p>
        </div>
        <button
          className="btn btn-secondary"
          style={{ fontSize: '0.82rem', padding: '0.3rem 0.75rem' }}
          onClick={callWaiter}
          disabled={callSent}
        >
          {callSent ? '✅ En camino' : '🔔 Llamar mesero'}
        </button>
      </header>

      {/* Tabs menú / estado */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={() => setView('menu')}
          style={{ flex: 1, padding: '0.65rem', fontWeight: 600, fontSize: '0.875rem', background: view === 'menu' ? 'rgba(200,169,110,0.1)' : 'transparent', borderBottom: view === 'menu' ? '2px solid var(--accent)' : 'none', color: view === 'menu' ? 'var(--accent)' : 'var(--muted)', border: 'none', cursor: 'pointer' }}
        >
          🍴 Menú
        </button>
        <button
          onClick={() => setView('status')}
          style={{ flex: 1, padding: '0.65rem', fontWeight: 600, fontSize: '0.875rem', background: view === 'status' ? 'rgba(200,169,110,0.1)' : 'transparent', borderBottom: view === 'status' ? '2px solid var(--accent)' : 'none', color: view === 'status' ? 'var(--accent)' : 'var(--muted)', border: 'none', cursor: 'pointer' }}
        >
          📦 Mi pedido {activeOrder && activeOrder.status !== 'paid' ? `· ${orderStatus?.icon}` : ''}
        </button>
      </div>

      {/* Vista: Menú */}
      {view === 'menu' && (
        <div style={{ padding: '1rem 1.25rem', paddingBottom: cart.length > 0 ? '120px' : '1.5rem' }}>
          {!canAddMore && activeOrder?.status === 'paid' && (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
              Gracias. Si desea pedir algo más, un nuevo ticket se abrirá.
            </div>
          )}
          {Object.entries(grouped).map(([cat, items]) => (
            <section key={cat} style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)', borderBottom: '1px solid var(--border)', paddingBottom: '0.35rem', marginBottom: '0.75rem' }}>{cat}</h2>
              {items.map(item => {
                const inCart = cart.find(c => c.item.id === item.id)
                return (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, paddingRight: '1rem' }}>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      {item.description && <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.1rem' }}>{item.description}</div>}
                      <div style={{ fontWeight: 700, color: 'var(--accent)', marginTop: '0.2rem' }}>${item.price.toFixed(0)}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                      {inCart ? (
                        <>
                          <button onClick={() => removeFromCart(item.id)} style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text)', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                          <span style={{ minWidth: '22px', textAlign: 'center', fontWeight: 700 }}>{inCart.qty}</span>
                          <button onClick={() => addToCart(item)} style={{ width: '28px', height: '28px', borderRadius: '50%', border: 'none', background: 'var(--accent)', cursor: 'pointer', color: '#0f0f0f', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                        </>
                      ) : (
                        <button onClick={() => addToCart(item)} style={{ padding: '0.3rem 0.8rem', borderRadius: '20px', border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', fontSize: '0.82rem' }}>+ Agregar</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </section>
          ))}
        </div>
      )}

      {/* Vista: Estado del pedido */}
      {view === 'status' && (
        <div style={{ padding: '1.25rem' }}>
          {!activeOrder || activeOrder.status === 'paid' ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🍽️</p>
              <p>No hay pedido activo.</p>
              <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => setView('menu')}>Ver menú</button>
            </div>
          ) : (
            <div>
              {/* Estado */}
              <div style={{ padding: '1.25rem', borderRadius: '12px', border: `1px solid ${orderStatus?.color}`, background: `${orderStatus?.color}15`, marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.75rem' }}>{orderStatus?.icon}</span>
                  <strong style={{ color: orderStatus?.color, fontSize: '1rem' }}>{orderStatus?.label}</strong>
                </div>
              </div>

              {/* Items del pedido */}
              <div className="card" style={{ marginBottom: '1rem' }}>
                <h3 style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>Tu pedido</h3>
                {activeOrder.items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.35rem', color: 'var(--muted)' }}>
                    <span>{it.qty} × {it.name}</span>
                    <span>${(it.price * it.qty).toFixed(0)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
                  <span>Total</span><span>${orderTotal.toFixed(0)}</span>
                </div>
              </div>

              {/* Acciones */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {activeOrder.status === 'delivered' && (
                  <button className="btn btn-primary" style={{ width: '100%' }} onClick={requestPayment}>💳 Pedir la cuenta</button>
                )}
                {activeOrder.status === 'payment_requested' && (
                  <div style={{ textAlign: 'center', color: '#9a7acd', padding: '0.5rem', fontSize: '0.875rem' }}>
                    Cuenta solicitada. Se le atenderá en breve.
                  </div>
                )}
                <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => setView('menu')}>
                  {activeOrder.status === 'payment_requested' ? '¿Quiere agregar algo más?' : '+ Agregar más al pedido'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Carrito flotante */}
      {cart.length > 0 && view === 'menu' && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--card)', borderTop: '1px solid var(--border)', padding: '1rem 1.25rem', boxShadow: '0 -4px 20px rgba(0,0,0,0.3)', zIndex: 50 }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            {activeOrder && activeOrder.status === 'payment_requested' && (
              <p style={{ fontSize: '0.78rem', color: '#9a7acd', textAlign: 'center', marginBottom: '0.4rem' }}>
                Al enviar, se agregarán al ticket actual y se cancelará la solicitud de cuenta
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 600 }}>{cart.reduce((s, c) => s + c.qty, 0)} items</span>
              <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '1.2rem' }}>${total.toFixed(0)}</span>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }} onClick={submitOrder} disabled={submitting}>
              {submitting ? 'Enviando…' : activeOrder ? '➕ Agregar al pedido' : '🚀 Enviar pedido a cocina'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
