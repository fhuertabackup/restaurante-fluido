'use client'

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'

type MenuItem = {
  id: string
  name: string
  description: string
  price: number
  category: string
  image_url?: string
}

type Order = {
  id: string
  table_number: number
  status: string
  items: { name: string; qty: number; price: number }[]
  created_at: string
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  pending:           { label: 'En espera · Enviado a cocina',  color: '#8A8A8A', icon: '🕐' },
  preparing:         { label: 'Preparando su pedido…',         color: '#5fa8d3', icon: '🔥' },
  ready:             { label: 'Listo — el mesero lo trae ya',  color: '#C8A96E', icon: '✅' },
  delivered:         { label: 'Pedido entregado. ¡Buen provecho!', color: '#7aad7a', icon: '🍽️' },
  payment_requested: { label: 'Cuenta solicitada. En camino…',color: '#9a7acd', icon: '💳' },
  paid:              { label: 'Pagado. ¡Gracias!',             color: '#7aad7a', icon: '🎉' },
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

  // Cargar menú
  useEffect(() => {
    supabase.from('menu').select('*').order('category').then(({ data }) => setMenu(data || []))
  }, [])

  // Cargar carrito local
  useEffect(() => {
    const saved = localStorage.getItem(`cart_mesa_${numero}`)
    if (saved) try { setCart(JSON.parse(saved)) } catch {}
  }, [numero])

  useEffect(() => {
    localStorage.setItem(`cart_mesa_${numero}`, JSON.stringify(cart))
  }, [cart, numero])

  const fetchActiveOrder = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('table_number', Number(numero))
      .not('status', 'in', '("paid")')
      .order('created_at', { ascending: false })
      .limit(1)
    setActiveOrder(data?.[0] || null)
  }, [numero])

  // Realtime del pedido de esta mesa
  useEffect(() => {
    fetchActiveOrder()
    const channel = supabase.channel(`mesa-${numero}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders',
        filter: `table_number=eq.${numero}` }, fetchActiveOrder)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [numero, fetchActiveOrder])

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
      const newItems = cart.map(c => ({ name: c.item.name, qty: c.qty, price: c.item.price }))

      if (activeOrder && ['pending', 'preparing', 'ready'].includes(activeOrder.status)) {
        // Fusionar con pedido existente
        const merged = [...activeOrder.items]
        newItems.forEach(ni => {
          const found = merged.find((i: any) => i.name === ni.name)
          if (found) found.qty += ni.qty
          else merged.push(ni)
        })
        await supabase.from('orders').update({ items: merged }).eq('id', activeOrder.id)
      } else {
        // Nuevo pedido
        await supabase.from('orders').insert({
          table_number: Number(numero),
          items: newItems,
          status: 'pending',
        })
      }
      localStorage.removeItem(`cart_mesa_${numero}`)
      setCart([])
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

  const grouped = menu.reduce((acc, item) => {
    (acc[item.category] ||= []).push(item)
    return acc
  }, {} as Record<string, MenuItem[]>)

  const orderStatus = activeOrder ? STATUS_LABELS[activeOrder.status] : null
  const orderTotal = activeOrder
    ? activeOrder.items.reduce((a, i) => a + i.price * i.qty, 0)
    : 0

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{
        padding: '1rem 1.5rem',
        borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 10,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.2rem' }}>🍽️ Restaurante Fluido</h1>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>Mesa {numero}</p>
        </div>
        <button
          className="btn btn-secondary"
          style={{ fontSize: '0.85rem', padding: '0.35rem 0.85rem' }}
          onClick={callWaiter}
          disabled={callSent}
        >
          {callSent ? '✅ Mesero en camino' : '🔔 Llamar mesero'}
        </button>
      </header>

      {/* Estado del pedido activo */}
      {activeOrder && orderStatus && (
        <div style={{
          margin: '1rem', padding: '1rem', borderRadius: '12px',
          border: `1px solid ${orderStatus.color}`,
          background: `${orderStatus.color}15`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.4rem' }}>{orderStatus.icon}</span>
            <strong style={{ color: orderStatus.color }}>{orderStatus.label}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--muted)' }}>
            <span>{activeOrder.items.map(i => `${i.qty}× ${i.name}`).join(', ')}</span>
            <strong style={{ color: 'var(--fg)' }}>${orderTotal.toFixed(0)}</strong>
          </div>
          {activeOrder.status === 'delivered' && (
            <button
              className="btn btn-primary"
              style={{ marginTop: '0.75rem', width: '100%' }}
              onClick={requestPayment}
            >
              💳 Pedir la cuenta
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', padding: '1rem' }}>
        {/* Menú */}
        <div>
          {Object.entries(grouped).map(([cat, items]) => (
            <section key={cat} style={{ marginBottom: '1.5rem' }}>
              <h2 style={{
                fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: 'var(--accent)',
                borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem', marginBottom: '0.75rem'
              }}>
                {cat}
              </h2>
              {items.map(item => (
                <div key={item.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.75rem 0', borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{ flex: 1, paddingRight: '1rem' }}>
                    <div style={{ fontWeight: 600 }}>{item.name}</div>
                    {item.description && (
                      <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: '0.15rem' }}>{item.description}</div>
                    )}
                    <div style={{ fontWeight: 700, color: 'var(--accent)', marginTop: '0.25rem' }}>${item.price.toFixed(0)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    {(() => {
                      const inCart = cart.find(c => c.item.id === item.id)
                      return inCart ? (
                        <>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg)' }}
                          >−</button>
                          <span style={{ fontWeight: 700, minWidth: '20px', textAlign: 'center' }}>{inCart.qty}</span>
                          <button
                            onClick={() => addToCart(item)}
                            style={{ width: '28px', height: '28px', borderRadius: '50%', border: 'none', background: 'var(--accent)', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bg)' }}
                          >+</button>
                        </>
                      ) : (
                        <button
                          onClick={() => addToCart(item)}
                          style={{ padding: '0.3rem 0.8rem', borderRadius: '20px', border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}
                        >
                          + Agregar
                        </button>
                      )
                    })()}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>

      {/* Carrito flotante */}
      {cart.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'var(--card, #252525)', borderTop: '1px solid var(--border)',
          padding: '1rem 1.5rem', boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
          zIndex: 50,
        }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontWeight: 600 }}>Carrito ({cart.reduce((s, c) => s + c.qty, 0)} items)</span>
              <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '1.2rem' }}>${total.toFixed(0)}</span>
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
              onClick={submitOrder}
              disabled={submitting}
            >
              {submitting ? 'Enviando…' : '🚀 Enviar pedido a cocina'}
            </button>
          </div>
        </div>
      )}

      {/* Espaciador para el carrito flotante */}
      {cart.length > 0 && <div style={{ height: '120px' }} />}
    </div>
  )
}
