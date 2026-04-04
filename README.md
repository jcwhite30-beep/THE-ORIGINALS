# 🐉 The Originals — Guild Management

Sistema de gestión de puntos para el guild **The Originals** de Tales of Pirates.

## Stack
- **Next.js 14.2.5** (App Router)
- **Tailwind CSS** (tema dark gaming)
- **Supabase** (DB + Auth + RLS)
- **Tesseract.js** (OCR para reportes de maze)
- **Vercel** (hosting)

---

## Estructura de archivos

```
/
├── app/
│   ├── layout.tsx          ← Root layout + fuente Rajdhani
│   ├── globals.css         ← Tailwind + CSS vars
│   ├── page.tsx            ← Redirect a /dashboard
│   ├── dashboard/
│   │   └── page.tsx        ← Dashboard público (leaderboard + runas)
│   └── admin/
│       └── page.tsx        ← Panel de admin (login + upload + alertas)
├── lib/
│   ├── supabase.ts         ← Cliente Supabase + tipos + API helpers
│   └── ocr.ts              ← Parser de reportes + Tesseract.js
├── sql/
│   └── schema.sql          ← Schema completo para Supabase
├── .env.local.example      ← Variables de entorno requeridas
├── next.config.mjs
├── package.json
└── tailwind.config.ts
```

---

## Setup en 5 pasos

### 1. Supabase
1. Crea proyecto en [supabase.com](https://supabase.com)
2. Ir a **SQL Editor** → pegar y ejecutar `sql/schema.sql`
3. Ir a **Settings > API** → copiar `Project URL` y `anon public key`

### 2. Variables de entorno
```bash
cp .env.local.example .env.local
# Editar .env.local con tus valores de Supabase
```

### 3. Instalar y correr local
```bash
npm install
npm run dev
# → http://localhost:3000
```

### 4. GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TU_USUARIO/originals-guild.git
git push -u origin main
```

### 5. Vercel
1. Conectar repo en [vercel.com](https://vercel.com)
2. **Settings > Environment Variables** → agregar:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy 🚀

---

## Lógica de puntos BD

```
Total maze = 5 pts
─────────────────────────────
Admin pts    = configurable (ej: 1 pt)
Event pts    = configurable (ej: 0.5 pts)
Participant  = (5 - admin - event) / N participantes
```

**Ejemplo:** 8 participantes, 1 pt admin, 0 pts evento:
`(5 - 1 - 0) / 8 = 0.5 pts por persona`

---

## Roles
| Role       | Acceso                                      |
|------------|---------------------------------------------|
| Público    | Leaderboard BD/FV, runas, guild events      |
| Manager    | Cargar mazes, ver alertas                   |
| SuperAdmin | Todo + ver admin_points + gestionar usuarios|

---

## OCR — Tips para Tales of Pirates
- La fuente del juego puede ser difícil para Tesseract. 
- **Recomendado**: usar el campo de **Pegado Rápido** si el OCR falla.
- Formato aceptado: `NombrePJ 3` / `NombrePJ: 2.5` / `NombrePJ - 1`
- Los nombres no encontrados generan alertas automáticas con sugerencias fuzzy.

---

## Crear primer SuperAdmin
Después de registrar el usuario en Supabase Auth, correr en SQL Editor:
```sql
INSERT INTO admin_profiles (id, username, role)
VALUES ('UUID_DEL_USUARIO', 'Morgan', 'superadmin');
```
