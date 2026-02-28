import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tabla = searchParams.get('tabla')

  if (!tabla) {
    return NextResponse.json({ error: 'Parámetro tabla requerido' }, { status: 400 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || 'https://restaurante-fluido.vercel.app'
  const url = `${baseUrl}/mesa/${tabla}`

  const svg = await QRCode.toString(url, {
    type: 'svg',
    margin: 2,
    color: { dark: '#1A1A1A', light: '#FFFFFF' },
    width: 300,
  })

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
