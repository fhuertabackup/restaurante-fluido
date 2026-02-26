'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

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

  const total = cart.reduce((sum, c) => sum + c.item.price * c.qty, 0)

  const grouped = menu.reduce((acc, item) => {
    (acc[item.category] ||= []).push(item)
    return acc
  }, {} as Record<string, MenuItem[]>)

  return (
    <div className="container" style={{ paddingTop: '2rem' }}>
      <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1>Restaurante Fluido</h1>
        <p style={{ color: 'var(--muted)' }}>Menú digital</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '2rem' }}>
        <div>
          {Object.entries(grouped).map(([cat, items]) => (
            <section key={cat} style={{ marginBottom: '2rem' }}>
              <h2 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                {cat}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
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
          <div className="card" style={{ position: 'sticky', top: '1rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Carrito</h3>
            {cart.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>Tu pedido está vacío</p>
            ) : (
              <>
                {cart.map(({item, qty}) => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span>{item.name} × {qty}</span>
                    <span>${(item.price * qty).toFixed(0)}</span>
                  </div>
                ))}
                <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '1rem 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.2rem' }}>
                  <span>Total</span>
                  <span>${total.toFixed(0)}</span>
                </div>
                <button className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
                  Enviar pedido
                </button>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
