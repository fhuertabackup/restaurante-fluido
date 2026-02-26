'use client'

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
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
  const [total, setTotal] = useState(0)
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'caja') {
        router.replace('/login')
      } else {
        setAuthorized(true)
      }
    }
    checkAuth()
  }, [router])

  useEffect(() => {
    if (!authorized) return
    const fetchOrders = async () => {
      const { data } = await supabase.from('orders').select('*')
      setOrders(data || [])
    }
    fetchOrders()
    const channel = supabase.channel('orders-caja').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [authorized])

  useEffect(() => {
    if (!authorized) return
    const delivered = orders.filter(o => o.status === 'delivered')
    const sum = delivered.reduce((acc, o) => acc + o.items.reduce((a, i) => a + i.price * i.qty, 0), 0)
    setTotal(sum)
  }, [orders, authorized])

  return (
    <div className="container" style={{ paddingTop: '2rem' }}>
      <h1>Caja</h1>
      <div className="card" style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h2>Ventas del día</h2>
        <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent)' }}>${total.toFixed(0)}</p>
      </div>

      <h2>Todas las mesas</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {orders.map(order => (
          <div key={order.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>Mesa {order.table_number}</strong>
              <span style={{ textTransform: 'capitalize' }}>{order.status}</span>
            </div>
            <ul style={{ marginLeft: '1rem', marginTop: '0.5rem', color: 'var(--muted)' }}>
              {order.items.map((it, i) => <li key={i}>{it.qty} × {it.name} (${it.price})</li>)}
            </ul>
            <div style={{ marginTop: '0.5rem', fontWeight: 700 }}>
              Subtotal: ${order.items.reduce((a, i) => a + i.price * i.qty, 0).toFixed(0)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
