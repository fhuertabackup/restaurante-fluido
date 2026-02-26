import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function middleware(request: Request) {
  const { data: { session } } = await createClient().auth.getSession()

  // Rutas públicas (login, menú) no requieren auth
  const publicPaths = ['/login', '/']
  const isPublic = publicPaths.some(path => request.url.includes(path))

  if (!session && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (session && isPublic && request.url.includes('/login')) {
    return NextResponse.redirect(new URL('/mesero', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
