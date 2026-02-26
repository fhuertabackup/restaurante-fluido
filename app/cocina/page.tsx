'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

type Order = {
  id: string
  table_number: number
  status: 'pending' | 'preparing' | 'ready' | 'delivered'
  items: { name: string; qty: number }[]
  created_at: string
}

export default function CocinaPage() {
  const supabase = createClient()
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    const fetchOrders = async () => {
      const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: true })
      setOrders(data || [])
    }
    fetchOrders()

    const channel = supabase.channel('orders-cocina').on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders' },
      () => fetchOrders()
    ).subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const updateStatus = async (orderId: string, status: Order['status']) => {
    await supabase.from('orders').update({ status }).eq('id', orderId)
    setOrders(orders.map(o => o.id === orderId ? {...o, status} : o))
  }

  return (
    <div className="container" style={{ paddingTop: '2rem' }}>
      <h1 style={{ marginBottom: '1rem' }}>Cocina</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {orders.map(order => (
          <div key={order.id} className="card" data-status={order.status}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <strong>Mesa {order.table_number}</strong>
              <span style={{ textTransform: 'capitalize', color: order.status === 'ready' ? 'var(--accent)' : 'var(--muted)' }}>
                {order.status}
              </span>
            </div>
            <ul style={{ marginLeft: '1rem', marginBottom: '1rem', color: 'var(--muted)' }}>
              {order.items.map((it, i) => (
                <li key={i}>{it.qty} × {it.name}</li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {order.status === 'pending' && (
                <button className="btn btn-primary" onClick={() => updateStatus(order.id, 'preparing')}>Empezar</button>
              )}
              {order.status === 'preparing' && (
                <button className="btn btn-primary" onClick={() => updateStatus(order.id, 'ready')}>Listo</button>
              )}
              {order.status === 'ready' && (
                <button className="btn btn-secondary" onClick={() => updateStatus(order.id, 'delivered')}>Entregar</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
