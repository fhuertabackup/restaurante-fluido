# Restaurante Fluido - MVP

Sistema integral para restaurantes con Supabase + Next.js.

## 📦 Estructura

- `app/page.tsx`: Menú público (clientes)
- `app/login/page.tsx`: Login de empleados
- `app/mesero/page.tsx`: Panel mesero
- `app/cocina/page.tsx`: Panel cocina
- `app/caja/page.tsx`: Panel caja
- `lib/supabase/`: Clientes Supabase
- `supabase/schema.sql`: Tablas iniciales

## 🚀 Despliegue

### 1. Crear proyecto en Supabase
- Ve a supabase.com, crea proyecto.
- En Settings → API copia URL y anon key.
- Crea un archivo `.env.local` con:

```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 2. Aplicar schema
- En Supabase Dashboard → SQL Editor, ejecuta `supabase/schema.sql`.

### 3. Deploy en Vercel
```bash
vercel --prod
```
Conecta tu repo y despliega.

## 🔐 Auth
Por simplicidad, se usa Supabase Auth. Crea usuarios en Supabase → Auth → Users (email/password).

## 📱 PWA
Ya incluye manifest y service worker básico. Instala en móvil como app nativa.

## 🧠 Roles
- **Cliente**: ve menú, hace pedidos (sin login).
- **Mesero**: login, crea pedidos por mesa.
- **Cocina**: ver pedidos, cambiar estados.
- **Caja**: ver todos los pedidos, calcular ventas.

## 🔄 Realtime
Se usa Supabase Realtime para actualizaciones en vivo entre cocina, mesero y caja.

## ⚙️ Próximos pasos
- Pago integrado (Stripe)
- Autenticación por rol (policies en Supabase)
- Inventario
- Encuestas de satisfacción
