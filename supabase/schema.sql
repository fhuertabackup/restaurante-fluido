-- ============================================
-- Restaurante Fluido - Schema completo
-- ============================================

-- Habilitar extensiones necesarias
create extension if not exists "uuid-ossp";

-- ============================================
-- Tabla: menu (platos)
-- ============================================
create table if not exists menu (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  price numeric not null check (price >= 0),
  category text not null,
  image_url text,
  created_at timestamp default now()
);

-- ============================================
-- Tabla: orders (pedidos)
-- ============================================
create table if not exists orders (
  id uuid default uuid_generate_v4() primary key,
  table_number integer not null,
  status text check (status in ('pending','preparing','ready','delivered')) default 'pending',
  items jsonb not null default '[]', -- [{name, qty, price}]
  created_at timestamp default now()
);

-- ============================================
-- Tabla: profiles (roles de usuario) - CON EMAIL
-- ============================================
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  email text unique not null,
  role text check (role in ('admin','mesero','cocina','caja')) default 'mesero',
  full_name text,
  created_at timestamp default now()
);

-- ============================================
-- Tabla: tables (mesas)
-- ============================================
create table if not exists tables (
  id uuid default uuid_generate_v4() primary key,
  number integer unique not null,
  capacity integer default 4,
  status text check (status in ('available','occupied','reserved')) default 'available',
  created_at timestamp default now()
);

-- ============================================
-- Datos iniciales (opcional)
-- ============================================
insert into tables (number, capacity) values 
(1,4), (2,4), (3,6), (4,2), (5,4), (6,8)
on conflict (number) do nothing;

insert into menu (name, description, price, category) values
('Papas Fritas', 'Papas fritas con sal', 2500, 'Acompañamientos'),
('Hamburguesa Clásica', 'Carne, lechuga, tomate, cebolla', 4500, 'Plato Principal'),
('Coca Cola', 'Bebida 500ml', 1500, 'Bebidas'),
('Agua Mineral', 'Botella 500ml', 1000, 'Bebidas')
on conflict do nothing;

-- ============================================
-- Row Level Security (RLS)
-- ============================================
alter table profiles enable row level security;
alter table orders enable row level security;
alter table tables enable row level security;
-- menu es pública (no requiere RLS para lectura)

-- Policies
create policy "Perfiles visibles para autenticados" on profiles for select using (auth.role() = 'authenticated');
create policy "Perfiles actualizables por uno mismo" on profiles for update using (auth.uid() = id);
create policy "Órdenes visibles para autenticados" on orders for select using (auth.role() = 'authenticated');
create policy "Órdenes insertables por autenticados" on orders for insert with check (auth.role() = 'authenticated');
create policy "Órdenes actualizables por autenticados" on orders for update using (auth.role() = 'authenticated');
create policy "Mesas visibles para autenticados" on tables for select using (auth.role() = 'authenticated');

-- ============================================
-- Trigger: crear profile automáticamente al registrarse
-- ============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role, full_name)
  values (
    new.id,
    new.email,
    'mesero',
    new.raw_user_meta_data->>'full_name'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- Datos de prueba: crear usuarios manualmente si es necesario
-- ============================================
--INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, confirmation_token, email_change, email_change_token, approved_at, last_validation, phone_token, phone_token_expires_at, email_confirmed)
--VALUES 
--('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'mesero@restaurante.com', '加密密码', now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Mesero Uno"}'::jsonb, false, now(), now(), NULL, NULL, '', NULL, '', now(), NULL, NULL, NULL, now())
--ON CONFLICT (email) DO NOTHING;
