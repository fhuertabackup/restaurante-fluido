'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

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
  const router = useRouter()
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [cart, setCart] = useState<{item: MenuItem; qty: number}[]>([])
  const [tableNumber, setTableNumber] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<{type: 'success' | 'error'; text: string} | null>(null)

  // Cargar carrito guardado al iniciar
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
      setMessage({ type: 'error', text: 'Ingresa el número de mesa' })
      return
    }
    if (cart.length === 0) {
      setMessage({ type: 'error', text: 'El carrito está vacío' })
      return
    }

    setSending(true)
    setMessage(null)

    try {
      const items = cart.map(c => ({
        name: c.item.name,
        qty: c.qty,
        price: c.item.price
      }))
      const { error } = await supabase.from('orders').insert({
        table_number: tableNum,
        items,
        status: 'pending'
      })
      if (error) throw error

      // Limpiar
      localStorage.removeItem('cart')
      setCart([])
      setTableNumber('')
      setMessage({ type: 'success', text: 'Pedido enviado. Cocina lo preparará.' })
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Error: ' + (err.message || 'No se pudo enviar') })
    } finally {
      setSending(false)
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
        <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={() => router.push('/login') }}>
          Iniciar sesión empleados
        </button>
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

                {message && (
                  <p style={{
                    marginTop: '0.75rem',
                    color: message.type === 'success' ? '#7aad7a' : '#ff6b6b',
                    fontSize: '0.875rem'
                  }}>
                    {message.text}
                  </p>
                )}

                <button
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: '1rem' }}
                  onClick={submitOrder}
                  disabled={sending}
                >
                  {sending ? 'Enviando...' : 'Enviar pedido'}
                </button>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
