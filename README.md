# APP — Administrador de Préstamos Personales

Stack: **Next.js 14** · **Supabase** (PostgreSQL + Auth + Storage) · **Vercel**

---

## Instalación local

### 1. Clonar y dependencias

```bash
git clone <tu-repo>
cd app-prestamos
npm install
```

### 2. Variables de entorno

```bash
cp .env.example .env.local
```

Edita `.env.local` con tus claves de Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

### 3. Base de datos Supabase

En el Dashboard de Supabase → **SQL Editor**, ejecuta en orden:

```
supabase/migrations/001_schema_inicial.sql
```

Esto crea todas las tablas, RLS, triggers y funciones.

### 4. Storage Buckets

En Supabase Dashboard → **Storage**, crea estos buckets:

| Bucket | Público |
|--------|---------|
| `documentos-clientes` | ❌ No |
| `comprobantes-pagos` | ❌ No |
| `logos-agencias` | ✅ Sí |

### 5. Primer usuario (SuperAdmin)

En Supabase → **Authentication → Users**, crea el primer usuario:

- Email: `superadmin@app.local`
- Password: (el que quieras)

Luego en SQL Editor:

```sql
INSERT INTO usuarios (id, agencia_id, nombre, username, rol)
VALUES (
  '<uuid-del-usuario-creado>',
  '00000000-0000-0000-0000-000000000001',
  'Super Administrador',
  'superadmin',
  'superadmin'
);
```

### 6. Correr localmente

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

---

## Deploy en Vercel

1. Sube el proyecto a GitHub
2. Importa en [vercel.com](https://vercel.com)
3. Agrega las variables de entorno en Vercel Dashboard
4. Deploy automático ✅

---

## Estructura del Proyecto

```
APP/
├── supabase/
│   └── migrations/
│       └── 001_schema_inicial.sql    ← Schema completo con RLS
├── src/
│   ├── app/
│   │   ├── login/page.tsx            ← P1: Login
│   │   └── (dashboard)/
│   │       ├── layout.tsx            ← Shell con Sidebar + Topbar
│   │       ├── dashboard/page.tsx    ← P2: Dashboard
│   │       ├── clientes/page.tsx     ← P5: Clientes
│   │       ├── prestamos/page.tsx    ← P7: Préstamos
│   │       ├── caja/page.tsx         ← P8: Caja
│   │       ├── fondeadores/page.tsx  ← P9: Fondeadores
│   │       ├── calendario/page.tsx   ← P10: Calendario
│   │       ├── auditoria/page.tsx    ← P11: Auditoría
│   │       ├── papelera/page.tsx     ← P12: Papelera
│   │       ├── perfil/page.tsx       ← P13: Mi Perfil
│   │       ├── whatsapp/page.tsx     ← P14: WhatsApp
│   │       ├── usuarios/page.tsx     ← P4: Usuarios
│   │       └── agencias/page.tsx     ← P3: Agencias
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx           ← Nav dinámica por rol
│   │   │   └── Topbar.tsx
│   │   ├── dashboard/
│   │   │   ├── KpiCard.tsx
│   │   │   ├── CortesTable.tsx       ← Cortes del día + WA
│   │   │   ├── AlertaBanner.tsx
│   │   │   └── FiltrosDashboard.tsx
│   │   └── clientes/
│   │       ├── ClientesTable.tsx
│   │       └── FiltrosClientes.tsx
│   ├── lib/supabase/
│   │   ├── client.ts                 ← Browser client
│   │   └── server.ts                 ← Server client
│   └── types/index.ts                ← Types + PERMISOS por rol
├── middleware.ts                      ← Auth + RLS por ruta
├── .env.example
└── package.json
```

---

## Reglas de Negocio Implementadas

| Regla | Dónde |
|-------|-------|
| Fondo Disponible = Fondeadores − Cartera | `fn_fondo_disponible()` en SQL |
| Bloqueo de desembolso si sin fondos | `prestamos/page.tsx` + RPC |
| Jerarquía de abono: Mora → Interés → Capital | `fn_conciliar_pago()` trigger |
| Cortes del día ajustados por feriados | `fn_generar_cortes_mes()` |
| Cambio obligatorio de contraseña | `middleware.ts` + `perfil/page.tsx` |
| Auditoría automática en cada acción | Triggers en SQL |
| Soft Delete en todos los registros | `deleted_at IS NULL` en RLS |

---

## Matriz de Permisos

| Pantalla | Promotor | Gerente | Admin | SuperAdmin |
|----------|----------|---------|-------|------------|
| Dashboard | Parcial | Equipo | Agencia | Global |
| Clientes | Solo los suyos | Su equipo | Toda agencia | Todo |
| Préstamos / Solicitar | ✅ | ✅ | ✅ | ✅ |
| Préstamos / Aprobar | ❌ | ✅ | ❌ | ✅ |
| Préstamos / Desembolsar | ❌ | ❌ | ✅ | ✅ |
| Caja / Registrar abono | ✅ | ✅ | ✅ | ✅ |
| Caja / Conciliar | ❌ | ✅ | ✅ | ✅ |
| Fondeadores | ❌ | ❌ | ✅ | ✅ |
| Calendario | ❌ | ❌ | ✅ | ✅ |
| Usuarios | ❌ | ❌ | ✅ | ✅ |
| Agencias | ❌ | ❌ | ❌ | ✅ |
| Auditoría | ❌ | ❌ | ❌ | ✅ |
| Papelera / Restaurar | ❌ | ❌ | ✅ | ✅ |
| Papelera / Purgar | ❌ | ❌ | ❌ | ✅ |
| WhatsApp / Ver plantillas | ✅ | ✅ | ✅ | ✅ |
| WhatsApp / Editar plantillas | ❌ | ❌ | ✅ | ✅ |
| WhatsApp / Envío masivo | ❌ | ❌ | ✅ | ✅ |
