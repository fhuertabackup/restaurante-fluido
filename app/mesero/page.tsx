'use client'

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Order = {
  id: string
  table_number: number
  status: 'pending' | 'preparing' | 'ready' | 'delivered'
  items: { name: string; qty: number }[]
}

export default function MeseroPage() {
  const supabase = createClient()
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [table, setTable] = useState('')
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'mesero') {
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
      const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: true })
      setOrders(data || [])
    }
    fetchOrders()
    const channel = supabase.channel('orders-mesero').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [authorized])

  const createOrder = async () => {
    const tableNum = Number(table)
    if (!tableNum) return
    const cart = JSON.parse(localStorage.getItem('cart') || '[]')
    if (cart.length === 0) return alert('Carrito vacío')
    await supabase.from('orders').insert({ table_number: tableNum, items: cart, status: 'pending' })
    localStorage.removeItem('cart')
    setTable('')
    alert('Pedido enviado')
  }

  return (
    <div className="container" style={{ paddingTop: '2rem' }}>
      <h1>Mesero</h1>
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3>Nuevo pedido</h3>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <input type="number" placeholder="Mesa" value={table} onChange={e => setTable(e.target.value)} className="card" style={{ padding: '0.5rem' }} />
          <button className="btn btn-primary" onClick={createOrder}>Crear pedido</button>
        </div>
      </div>

      <h2>Pedidos activos</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
        {orders.map(order => (
          <div key={order.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>Mesa {order.table_number}</strong>
              <span style={{ textTransform: 'capitalize' }}>{order.status}</span>
            </div>
            <ul style={{ marginLeft: '1rem', marginTop: '0.5rem' }}>
              {order.items.map((it, i) => <li key={i}>{it.qty} × {it.name}</li>)}
            </ul>
            {order.status === 'ready' && (
              <button className="btn btn-secondary" style={{ marginTop: '0.5rem' }} onClick={async () => {
                await supabase.from('orders').update({ status: 'delivered' }).eq('id', order.id)
                setOrders(orders.map(o => o.id === order.id ? {...o, status: 'delivered'} : o))
              }}>Marcar entregado</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
