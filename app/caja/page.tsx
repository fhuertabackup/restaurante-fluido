'use client'

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
  const [userEmail, setUserEmail] = useState<string>('')

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setUserEmail(user.email || '')
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'caja') {
        router.replace('/login')
      } else {
        setAuthorized(true)
      }
    }
    checkAuth()
  }, [router])

  // Cargar todos los pedidos
  const fetchOrders = async () => {
    const { data } = await supabase.from('orders').select('*')
    setOrders(data || [])
  }

  useEffect(() => {
    if (!authorized) return
    fetchOrders()
    const channel = supabase.channel('orders-caja').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [authorized])

  const markAsPaid = async (orderId: string) => {
    await supabase.from('orders').update({ status: 'paid' }).eq('id', orderId)
    fetchOrders()
  }

  useEffect(() => {
    if (!authorized) return
    // Sumar solo delivered (ventas realizadas)
    const delivered = orders.filter(o => o.status === 'delivered')
    const sum = delivered.reduce((acc, o) => acc + o.items.reduce((a, i) => a + i.price * i.qty, 0), 0)
    setTotal(sum)
  }, [orders, authorized])

  if (!authorized) return null

  // Separar pedidos
  const pendingPayments = orders.filter(o => ['payment_requested', 'delivered'].includes(o.status))
  const paymentHistory = orders.filter(o => o.status === 'paid').sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return (
    <div className="container" style={{ paddingTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Caja</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>{userEmail}</span>
          <button className="btn btn-secondary" onClick={async () => {
            await supabase.auth.signOut()
            router.push('/login')
          }}>Cerrar sesión</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h2>Ventas del día</h2>
        <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent)' }}>${total.toFixed(0)}</p>
      </div>

      {/* Sección: Pendientes de pago */}
      <h2 style={{ marginBottom: '1rem' }}>Cuentas pendientes</h2>
      {pendingPayments.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No hay cuentas pendientes.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginBottom: '3rem' }}>
          {pendingPayments.map(order => (
            <div key={order.id} className="card" style={{ borderColor: order.status === 'payment_requested' ? 'var(--accent)' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>Mesa {order.table_number}</strong>
                <span style={{ textTransform: 'capitalize', color: order.status === 'payment_requested' ? 'var(--accent)' : 'var(--muted)' }}>
                  {order.status === 'payment_requested' ? 'Esperando pago' : 'Listo para pagar'}
                </span>
              </div>
              <ul style={{ marginLeft: '1rem', marginTop: '0.5rem', color: 'var(--muted)' }}>
                {order.items.map((it, i) => <li key={i}>{it.qty} × {it.name}</li>)}
              </ul>
              <div style={{ marginTop: '0.5rem', fontWeight: 700 }}>
                Subtotal: ${order.items.reduce((a, i) => a + i.price * i.qty, 0).toFixed(0)}
              </div>
              {order.status !== 'paid' && (
                <button className="btn btn-primary" style={{ marginTop: '1rem', width: '100%' }} onClick={() => markAsPaid(order.id)}>
                  Marcar como pagado
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Sección: Historial de pagos */}
      <h2 style={{ marginBottom: '1rem' }}>Historial de pagos</h2>
      {paymentHistory.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No hay pagos registrados hoy.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {paymentHistory.map(order => (
            <div key={order.id} className="card" style={{ borderColor: '#7aad7a' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>Mesa {order.table_number}</strong>
                <span style={{ color: '#7aad7a' }}>Pagado</span>
              </div>
              <ul style={{ marginLeft: '1rem', marginTop: '0.5rem', color: 'var(--muted)' }}>
                {order.items.map((it, i) => <li key={i}>{it.qty} × {it.name}</li>)}
              </ul>
              <div style={{ marginTop: '0.5rem', fontWeight: 700 }}>
                Total: ${order.items.reduce((a, i) => a + i.price * i.qty, 0).toFixed(0)}
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                {new Date(order.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
