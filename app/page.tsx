'use client'

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type MenuItem = {
  id: string
  name: string
  description: string
  price: number
  category: string
  image_url?: string
}

export default function HomePage() {
  const supabase = createClient()
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [cart, setCart] = useState<{item: MenuItem; qty: number}[]>([])
  const [tableNumber, setTableNumber] = useState('')
  const [deliveredOrder, setDeliveredOrder] = useState<any>(null)

  // Cargar carrito guardado
  useEffect(() => {
    const saved = localStorage.getItem('cart')
    if (saved) {
      try {
        setCart(JSON.parse(saved))
      } catch {}
    }
  }, [])

  // Guardar carrito en localStorage cada vez que cambie
  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart))
  }, [cart])

  // Buscar si hay pedido delivered para la mesa actual
  useEffect(() => {
    if (!tableNumber) {
      setDeliveredOrder(null)
      return
    }
    const fetchDelivered = async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('table_number', Number(tableNumber))
        .eq('status', 'delivered')
        .order('created_at', { ascending: false })
        .limit(1)
      if (data && data.length > 0) setDeliveredOrder(data[0])
      else setDeliveredOrder(null)
    }
    fetchDelivered()
  }, [tableNumber])

  useEffect(() => {
    const fetchMenu = async () => {
      const { data } = await supabase.from('menu').select('*').order('category')
      setMenu(data || [])
    }
    fetchMenu()
  }, [])

  const addToCart = (item: MenuItem) => {
    setCart(cart => {
      const existing = cart.find(c => c.item.id === item.id)
      if (existing) return cart.map(c => c.item.id === item.id ? {...c, qty: c.qty + 1} : c)
      return [...cart, {item, qty: 1}]
    })
  }

  const removeFromCart = (itemId: string) => {
    setCart(cart => {
      const existing = cart.find(c => c.item.id === itemId)
      if (!existing) return cart
      if (existing.qty === 1) return cart.filter(c => c.item.id !== itemId)
      return cart.map(c => c.item.id === itemId ? {...c, qty: c.qty - 1} : c)
    })
  }

  const total = cart.reduce((sum, c) => sum + c.item.price * c.qty, 0)

  const submitOrder = async () => {
    const tableNum = Number(tableNumber)
    if (!tableNum) {
      alert('Ingresa el número de mesa')
      return
    }
    if (cart.length === 0) {
      alert('El carrito está vacío')
      return
    }

    const newItems = cart.map(c => ({
      name: c.item.name,
      qty: c.qty,
      price: c.item.price
    }))

    try {
      // Buscar pedido existente para esta mesa (que no esté delivered ni paid)
      const { data: existingOrders } = await supabase
        .from('orders')
        .select('*')
        .eq('table_number', tableNum)
        .in('status', ['pending', 'preparing', 'ready'])
        .order('created_at', { ascending: false })
        .limit(1)

      if (existingOrders && existingOrders.length > 0) {
        // Combinar items
        const existing = existingOrders[0]
        const merged = [...existing.items]
        newItems.forEach(newItem => {
          const found = merged.find((i: any) => i.name === newItem.name)
          if (found) {
            found.qty += newItem.qty
          } else {
            merged.push(newItem)
          }
        })

        // Actualizar pedido existente
        const { error: updateError } = await supabase
          .from('orders')
          .update({ items: merged })
          .eq('id', existing.id)
        if (updateError) throw updateError
      } else {
        // Crear nuevo pedido
        const { error: insertError } = await supabase.from('orders').insert({
          table_number: tableNum,
          items: newItems,
          status: 'pending'
        })
        if (insertError) throw insertError
      }

      // Limpiar carrito
      localStorage.removeItem('cart')
      setCart([])
      setTableNumber('')
      setDeliveredOrder(null)
      alert('Pedido enviado a cocina.')
    } catch (err: any) {
      alert('Error: ' + (err.message || 'No se pudo enviar'))
    }
  }

  const requestPayment = async () => {
    if (!deliveredOrder) return
    const { error } = await supabase
      .from('orders')
      .update({ status: 'payment_requested' })
      .eq('id', deliveredOrder.id)
    if (error) {
      alert('Error: ' + error.message)
    } else {
      setDeliveredOrder(null)
      alert('Cuenta solicitada. El personal de caja le notificará.')
    }
  }

  const grouped = menu.reduce((acc, item) => {
    (acc[item.category] ||= []).push(item)
    return acc
  }, {} as Record<string, MenuItem[]>)

  return (
    <div className="container" style={{ paddingTop: '2rem' }}>
      <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1>Restaurante Fluido</h1>
        <p style={{ color: 'var(--muted)' }}>Menú digital</p>
        <Link href="/login" className="btn btn-secondary" style={{ marginTop: '1rem', display: 'inline-block' }}>
          Iniciar sesión empleados
        </Link>
      </header>

      <div className="menu-grid">
        <div>
          {Object.entries(grouped).map(([cat, items]) => (
            <section key={cat} style={{ marginBottom: '2rem' }}>
              <h2 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                {cat}
              </h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: '1rem'
              }}>
                {items.map(item => (
                  <div key={item.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {item.image_url && (
                      <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px' }} />
                    )}
                    <div>
                      <h3 style={{ fontSize: '1rem' }}>{item.name}</h3>
                      <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>{item.description}</p>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                      <span style={{ fontWeight: 700, color: 'var(--accent)' }}>${item.price.toFixed(0)}</span>
                      <button className="btn btn-primary" onClick={() => addToCart(item)}>Agregar</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside>
          <div className="card cart-sticky">
            <h3 style={{ marginBottom: '1rem' }}>Carrito</h3>
            {cart.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>Tu pedido está vacío</p>
            ) : (
              <>
                {cart.map(({item, qty}) => (
                  <div key={item.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem'
                  }}>
                    <span>{item.name} × {qty}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>${(item.price * qty).toFixed(0)}</span>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                        onClick={() => removeFromCart(item.id)}
                      >
                        −
                      </button>
                    </div>
                  </div>
                ))}
                <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '1rem 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.2rem' }}>
                  <span>Total</span>
                  <span>${total.toFixed(0)}</span>
                </div>

                <div style={{ marginTop: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Número de mesa</label>
                  <input
                    type="number"
                    placeholder="Ej: 5"
                    value={tableNumber}
                    onChange={e => setTableNumber(e.target.value)}
                    className="card"
                    style={{ width: '100%', padding: '0.5rem' }}
                  />
                </div>

                {deliveredOrder && (
                  <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(200,169,110,0.1)', borderRadius: '8px' }}>
                    <p style={{ marginBottom: '0.5rem' }}>Su pedido ha sido entregado.</p>
                    <button
                      className="btn btn-primary"
                      style={{ width: '100%' }}
                      onClick={requestPayment}
                    >
                      Pedir cuenta
                    </button>
                  </div>
                )}

                {!deliveredOrder && (
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: '1rem' }}
                    onClick={submitOrder}
                  >
                    Enviar pedido
                  </button>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
