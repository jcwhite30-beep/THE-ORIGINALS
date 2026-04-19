'use client'
import { fmtM, getSimbolo } from '@/lib/fmt'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const sty = {
  inp: { width:'100%', background:'#191919', border:'1px solid #2a2a2a', borderRadius:'10px', padding:'11px 14px', color:'#f5f0e8', fontSize:'13px', outline:'none', boxSizing:'border-box' as const, fontFamily:'inherit' },
  lbl: { display:'block', fontSize:'10px', fontWeight:'600' as const, color:'#7a6a5a', textTransform:'uppercase' as const, letterSpacing:'1.2px', marginBottom:'6px' },
  sel: { width:'100%', background:'#191919', border:'1px solid #2a2a2a', borderRadius:'10px', padding:'11px 14px', color:'#f5f0e8', fontSize:'13px', outline:'none', fontFamily:'inherit' },
}

export default function RecaudosPage() {
  const supabase = createClient()
  const [pagos, setPagos] = useState<any[]>([])
  const [agencia, setAgencia] = useState<any>(null)
  const [agencias, setAgencias] = useState<any[]>([])
  const [filtroAgencia, setFiltroAgencia] = useState('all')
  const [prestamos, setPrestamos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'nuevo'|null>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'pendientes'|'conciliados'>('pendientes')
  const [fotoPreview, setFotoPreview] = useState<string|null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    prestamo_id:'', monto_total:'', metodo_pago:'efectivo',
    fecha_pago: new Date().toISOString().split('T')[0], foto:null as File|null
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      supabase.from('usuarios').select('id, rol, agencia_id').eq('id', session.user.id).single()
        .then(({ data: p }) => {
          setPerfil(p)
          loadAll(p)
          supabase.from('agencias').select('nombre,moneda_principal').eq('id', p.agencia_id).single()
            .then(({ data: ag }) => setAgencia(ag))
          if (p.rol === 'superadmin') {
            supabase.from('agencias').select('id,nombre').order('nombre')
              .then(({ data: ags }) => setAgencias(ags || []))
            setFiltroAgencia(p.agencia_id || 'all')
          }
          supabase.channel('caja-rt')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos' }, () => loadAll(p))
            .subscribe()
        })
    })
  }, [])

  async function loadAll(p: any) {
    setLoading(true)

    // Obtener clientes asignados según jerarquía
    let clienteIds: string[] | null = null
    if (p.rol === 'promotor') {
      const { data: clis } = await supabase.from('clientes')
        .select('id').eq('promotor_id', p.id).is('deleted_at', null)
      clienteIds = (clis || []).map((c: any) => c.id)
    } else if (p.rol === 'gerente') {
      const { data: proms } = await supabase.from('usuarios')
        .select('id').eq('agencia_id', p.agencia_id).eq('rol', 'promotor')
      const promIds = [p.id, ...(proms || []).map((u: any) => u.id)]
      const { data: clis } = await supabase.from('clientes')
        .select('id').in('promotor_id', promIds).is('deleted_at', null)
      clienteIds = (clis || []).map((c: any) => c.id)
    }

    // Query simple de pagos — sin relaciones anidadas para evitar fallos silenciosos
    const { data: pagosRaw, error: qErr } = await supabase
      .from('pagos')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (qErr) console.error('Pagos error:', qErr.message)
    
    // Enriquecer con datos del préstamo y cliente
    const pagosRawData = pagosRaw || []
    const presIdsPagos = [...new Set(pagosRawData.map((x:any) => x.prestamo_id).filter(Boolean))] as string[]
    const promIdsPagos = [...new Set(pagosRawData.map((x:any) => x.promotor_id).filter(Boolean))] as string[]
    
    let presMap: Record<string,any> = {}
    let promMap: Record<string,any> = {}
    let cliMap: Record<string,any> = {}

    if (presIdsPagos.length > 0) {
      const { data: presArr } = await supabase.from('prestamos')
        .select('id, monto_original, saldo_capital, cliente_id').in('id', presIdsPagos)
      const cliIds = [...new Set((presArr||[]).map((x:any) => x.cliente_id).filter(Boolean))] as string[]
      ;(presArr||[]).forEach((x:any) => { presMap[x.id] = x })
      if (cliIds.length > 0) {
        const { data: cliArr } = await supabase.from('clientes')
          .select('id, nombre, telefono, promotor_id').in('id', cliIds)
        ;(cliArr||[]).forEach((x:any) => { cliMap[x.id] = x })
      }
    }
    if (promIdsPagos.length > 0) {
      const { data: promArr } = await supabase.from('usuarios')
        .select('id, nombre').in('id', promIdsPagos)
      ;(promArr||[]).forEach((x:any) => { promMap[x.id] = x })
    }

    // Filtrar según jerarquía
    let pagosData = pagosRawData.map((pago: any) => {
      const pres = presMap[pago.prestamo_id] || null
      const cli = pres ? cliMap[pres.cliente_id] : null
      const prom = promMap[pago.promotor_id] || null
      return { ...pago, prestamo: pres ? { ...pres, cliente: cli } : null, promotor: prom }
    })

    // Filtro por jerarquía
    if (p.rol === 'promotor' && clienteIds !== null) {
      pagosData = pagosData.filter((pago: any) => {
        const cli = pago.prestamo?.cliente
        return cli && clienteIds!.includes(cli.id || pago.prestamo?.cliente_id)
      })
    } else if (p.rol === 'gerente' && clienteIds !== null) {
      pagosData = pagosData.filter((pago: any) => {
        const cli = pago.prestamo?.cliente
        return cli && clienteIds!.includes(cli.id || pago.prestamo?.cliente_id)
      })
    }
    // Admin: filtrar por agencia, SuperAdmin: filtrar por filtroAgencia si se seleccionó
    if (p.rol === 'admin') {
      pagosData = pagosData.filter((pago: any) => pago.agencia_id === p.agencia_id)
    }

    setPagos(pagosData)

    // Préstamos activos para dropdown
    let qp = supabase.from('prestamos')
      .select('id, monto_original, saldo_capital, cliente:clientes(nombre,telefono)')
      .eq('estado', 'activo').eq('agencia_id', p.agencia_id).is('deleted_at', null)
    if (p.rol === 'promotor' && clienteIds !== null && clienteIds.length > 0) {
      qp = clienteIds.length === 1
        ? qp.eq('cliente_id', clienteIds[0])
        : qp.in('cliente_id', clienteIds)
    }
    const { data: dp } = await qp
    setPrestamos(dp || [])
    setLoading(false)
  }

  async function registrarPago() {
    if (!form.prestamo_id || !form.monto_total) { setError('Préstamo y monto son obligatorios'); return }
    setSaving(true); setError('')
    const monto = parseFloat(form.monto_total)

    let foto_url = null
    if (form.foto) {
      const ext = form.foto.name.split('.').pop()
      const path = `pagos/${perfil.agencia_id}/${Date.now()}.${ext}`
      const { data: up, error: upErr } = await supabase.storage.from('comprobantes-pagos').upload(path, form.foto, { upsert:true })
      if (!upErr && up) {
        const { data: url } = supabase.storage.from('comprobantes-pagos').getPublicUrl(up.path)
        foto_url = url.publicUrl
      }
    }

    const { error: e } = await supabase.from('pagos').insert({
      prestamo_id: form.prestamo_id,
      promotor_id: perfil.id,
      agencia_id: perfil.agencia_id,
      monto_total: monto,
      monto_capital: monto,
      metodo_pago: form.metodo_pago,
      fecha_pago: form.fecha_pago,
      estado: 'por_conciliar',
      comprobante_url: foto_url,
    })
    if (e) { setError(e.message); setSaving(false); return }
    setModal(null); setFotoPreview(null); loadAll(perfil); setSaving(false)
  }

  async function conciliar(id: string) {
    if (!confirm('¿Confirmar conciliación? El saldo del préstamo bajará automáticamente.')) return
    const { data: pagoCon } = await supabase.from('pagos')
      .select('monto_total, prestamo_id, prestamo:prestamos(monto_original,cliente_id,cliente:clientes(nombre,promotor_id))')
      .eq('id', id).single()
    await supabase.from('pagos').update({ estado:'conciliado', conciliado_por: perfil.id, conciliado_at: new Date().toISOString() }).eq('id', id)

    // Actualizar fecha_proximo_pago al siguiente período (15 o 30, nunca 31)
    if (pagoCon?.prestamo_id) {
      const { data: pres } = await supabase.from('prestamos')
        .select('fecha_proximo_pago, periodicidad_dias')
        .eq('id', pagoCon.prestamo_id).single()
      if (pres && pres.periodicidad_dias === 15) {
        // Períodos quincenales: 15 y 30
        const actual = pres.fecha_proximo_pago ? new Date(pres.fecha_proximo_pago) : new Date()
        const dia = actual.getDate()
        let nuevaFecha: string
        if (dia <= 15) {
          // Estaba en el 15 → siguiente es el 30 del mismo mes
          nuevaFecha = `${actual.getFullYear()}-${String(actual.getMonth()+1).padStart(2,'0')}-30`
        } else {
          // Estaba en el 30 → siguiente es el 15 del próximo mes
          const next = new Date(actual.getFullYear(), actual.getMonth()+1, 15)
          nuevaFecha = next.toISOString().split('T')[0]
        }
        await supabase.from('prestamos').update({ fecha_proximo_pago: nuevaFecha }).eq('id', pagoCon.prestamo_id)
      } else if (pres) {
        // Otros períodos: sumar los días
        const base = pres.fecha_proximo_pago ? new Date(pres.fecha_proximo_pago) : new Date()
        base.setDate(base.getDate() + (pres.periodicidad_dias || 30))
        // Nunca dejar en 31
        if (base.getDate() === 31) base.setDate(30)
        await supabase.from('prestamos').update({ fecha_proximo_pago: base.toISOString().split('T')[0] }).eq('id', pagoCon.prestamo_id)
      }
    }

    // Notificar al promotor asignado al cliente por WA
    if (pagoCon) {
      const clienteId = (pagoCon.prestamo as any)?.cliente_id
      const promotorId = (pagoCon.prestamo as any)?.cliente?.promotor_id
      if (promotorId) {
        const { data: prom } = await supabase.from('usuarios').select('telefono,nombre').eq('id', promotorId).single()
        if (prom?.telefono) {
          const tel = prom.telefono.replace(/\D/g,'')
          const num = tel.startsWith('507') ? tel : '507'+tel
          const clienteNombre = (pagoCon.prestamo as any)?.cliente?.nombre || ''
          const msg = `💰 *${agencia?.nombre||'APP'}* — Pago CONCILIADO\n\nCliente: *${clienteNombre}*\nMonto: *$${Number(pagoCon.monto_total).toFixed(2)}*\nFecha: ${new Date().toLocaleDateString('es-PA')}\n\nEl pago ha sido confirmado y aplicado al saldo.`
          window.open('https://wa.me/'+num+'?text='+encodeURIComponent(msg), 'wa_app')
        }
      }
    }
    loadAll(perfil)
  }

  // Filtrar por agencia si SuperAdmin seleccionó una
  const pagosVisible = perfil?.rol === 'superadmin' && filtroAgencia !== 'all'
    ? pagos.filter((pg:any) => pg.agencia_id === filtroAgencia)
    : pagos
  const pendientes = pagosVisible.filter((p:any)=>p.estado==='por_conciliar')
  const conciliados = pagosVisible.filter((p:any)=>p.estado==='conciliado')
  const totalPend = pendientes.reduce((s,p)=>s+p.monto_total,0)
  const totalConc = conciliados.reduce((s,p)=>s+p.monto_total,0)
  const canConciliar = ['gerente','admin','superadmin'].includes(perfil?.rol)

  return (
    <div style={{ padding:'32px 28px', fontFamily:'system-ui,-apple-system,sans-serif' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'24px' }}>
        <div>
          <h1 style={{ fontSize:'26px', fontWeight:'700', color:'#f5f0e8', margin:'0 0 4px', letterSpacing:'-0.5px' }}>Recaudos</h1>
          <p style={{ fontSize:'12px', color:'#a08c6e', margin:0 }}>Jerarquía de abono: Mora → Intereses → Capital</p>
        </div>
        <button onClick={() => { setForm({ prestamo_id:'', monto_total:'', metodo_pago:'efectivo', fecha_pago: new Date().toISOString().split('T')[0], foto:null }); setFotoPreview(null); setError(''); setModal('nuevo') }}
          style={{ background:'linear-gradient(135deg,#c9a84c,#e2c27d)', color:'#0c0c0c', border:'none', borderRadius:'8px', padding:'9px 18px', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>
          + Registrar Pago
        </button>
      </div>

      {/* Filtros SuperAdmin */}
      {perfil?.rol === 'superadmin' && agencias.length > 0 && (
        <div style={{ display:'flex', gap:'8px', marginBottom:'16px', flexWrap:'wrap' }}>
          <select value={filtroAgencia} onChange={e=>{ setFiltroAgencia(e.target.value); loadAll(perfil) }}
            style={{ background:'#141414', border:'1px solid #252525', borderRadius:'8px', padding:'7px 12px', color:'#f0ebe0', fontSize:'12px', outline:'none' }}>
            <option value="all">Todas las agencias</option>
            {agencias.map((a:any)=><option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'12px', marginBottom:'20px' }}>
        {[
          { l:'Por Conciliar', v:`$${totalPend.toLocaleString()}`, s:`${pendientes.length} pagos`, c:'#e2c27d', ct:'#c09a4c' },
          { l:'Conciliado', v:`$${totalConc.toLocaleString()}`, s:`${conciliados.length} pagos`, c:'#4caf82', ct:'#4caf82' },
          { l:'Impacto en Fondos', v:`$${totalPend.toLocaleString()}`, s:'Al conciliar', c:'#5a8fc0', ct:'#5a8fc0' },
        ].map(k=>(
          <div key={k.l} style={{ background:'#141414', border:'1px solid #2c2c2c', borderTop:`2px solid ${k.ct}`, borderRadius:'10px', padding:'16px' }}>
            <div style={{ fontSize:'10px', fontWeight:'600', color:'#5a4f42', textTransform:'uppercase' as const, letterSpacing:'1px', marginBottom:'6px' }}>{k.l}</div>
            <div style={{ fontSize:'22px', fontWeight:'700', color:k.c, marginBottom:'4px' }}>{k.v}</div>
            <div style={{ fontSize:'11px', color:'#a08c6e' }}>{k.s}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:'0', marginBottom:'16px', background:'#141414', border:'1px solid #2c2c2c', borderRadius:'10px', padding:'4px', width:'fit-content' }}>
        {(['pendientes','conciliados'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{ background:tab===t?'#1e1e1e':'transparent', color:tab===t?'#e2c27d':'#5a4f42', border:tab===t?'1px solid #2c2c2c':'1px solid transparent', borderRadius:'7px', padding:'7px 16px', fontSize:'12px', fontWeight:tab===t?600:400, cursor:'pointer', fontFamily:'inherit' }}>
            {t==='pendientes'?`⏳ Pendientes (${pendientes.length})`:`✓ Conciliados (${conciliados.length})`}
          </button>
        ))}
      </div>

      <div style={{ background:'#141414', border:'1px solid #2c2c2c', borderRadius:'12px', overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>{['Cliente','Promotor','Monto','Método','Fecha','Comprobante','Estado','Acción'].map(h=>(
              <th key={h} style={{ textAlign:'left', fontSize:'10px', fontWeight:'600', color:'#5a4f42', textTransform:'uppercase' as const, letterSpacing:'0.8px', padding:'11px 16px', borderBottom:'1px solid #2c2c2c' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={8} style={{ padding:'40px', textAlign:'center', color:'#5a4f42' }}>Cargando...</td></tr>
            : (tab==='pendientes'?pendientes:conciliados).length===0
              ? <tr><td colSpan={8} style={{ padding:'40px', textAlign:'center', color:'#5a4f42' }}>No hay pagos {tab==='pendientes'?'pendientes':'conciliados'}</td></tr>
              : (tab==='pendientes'?pendientes:conciliados).map(p=>(
              <tr key={p.id}
                onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,0.025)')}
                onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
                style={{ borderBottom:'1px solid #1c1c1c' }}>
                <td style={{ padding:'12px 16px', fontSize:'13px', fontWeight:500, color:'#f5f0e8' }}>{p.prestamo?.cliente?.nombre||'—'}</td>
                <td style={{ padding:'12px 16px', fontSize:'12px', color:'#a08c6e' }}>{p.promotor?.nombre||'—'}</td>
                <td style={{ padding:'12px 16px', fontFamily:'monospace', fontSize:'13px', fontWeight:600, color:'#e2c27d' }}>${fmtM(p.monto_total, agencia?.moneda_principal)}</td>
                <td style={{ padding:'12px 16px', fontSize:'12px', color:'#a08c6e', textTransform:'capitalize' as const }}>{p.metodo_pago}</td>
                <td style={{ padding:'12px 16px', fontFamily:'monospace', fontSize:'12px', color:'#a08c6e' }}>{p.fecha_pago}</td>
                <td style={{ padding:'12px 16px' }}>
                  {p.comprobante_url
                    ? <a href={p.comprobante_url} target="_blank" rel="noreferrer" style={{ color:'#5a8fc0', fontSize:'11px', textDecoration:'none' }}>📷 Ver</a>
                    : <span style={{ color:'#5a4f42', fontSize:'11px' }}>—</span>}
                </td>
                <td style={{ padding:'12px 16px' }}>
                  <span style={{ fontSize:'10px', fontWeight:600, padding:'3px 9px', borderRadius:'20px', color:p.estado==='conciliado'?'#4caf82':'#c09a4c', background:p.estado==='conciliado'?'rgba(76,175,130,0.08)':'rgba(192,154,76,0.08)', border:`1px solid ${p.estado==='conciliado'?'rgba(76,175,130,0.2)':'rgba(192,154,76,0.2)'}` }}>
                    {p.estado==='conciliado'?'✓ Conciliado':'⏳ Pendiente'}
                  </span>
                </td>
                <td style={{ padding:'12px 16px' }}>
                  {tab==='pendientes' && canConciliar && (
                    <button onClick={()=>conciliar(p.id)}
                      style={{ background:'rgba(76,175,130,0.1)', color:'#4caf82', border:'1px solid rgba(76,175,130,0.3)', borderRadius:'6px', padding:'5px 10px', fontSize:'11px', cursor:'pointer', fontWeight:600 }}>
                      ✓ Conciliar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Registrar Pago */}
      {modal === 'nuevo' && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }}
          onClick={e => { if(e.target===e.currentTarget) setModal(null) }}>
          <div style={{ background:'#111', border:'1px solid #2a2a2a', borderRadius:'18px', padding:'28px', width:'500px', maxWidth:'94vw', maxHeight:'88vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'20px', paddingBottom:'14px', borderBottom:'1px solid #1e1e1e' }}>
              <div style={{ fontSize:'18px', fontWeight:'600', color:'#e2c27d' }}>Registrar Pago</div>
              <button onClick={()=>setModal(null)} style={{ background:'none', border:'1px solid #333', color:'#a08c6e', cursor:'pointer', width:'28px', height:'28px', borderRadius:'6px' }}>✕</button>
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={sty.lbl}>Préstamo *</label>
              <select style={sty.sel} value={form.prestamo_id} onChange={e=>setForm(f=>({...f,prestamo_id:e.target.value}))}>
                <option value="">Seleccionar préstamo activo...</option>
                {prestamos.map(p=><option key={p.id} value={p.id}>{(p.cliente as any)?.nombre} — Saldo: ${fmtM(p.saldo_capital, agencia?.moneda_principal)}</option>)}
              </select>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'14px' }}>
              <div>
                <label style={sty.lbl}>Monto del pago *</label>
                <input style={sty.inp} type="number" placeholder="0.00" value={form.monto_total} onChange={e=>setForm(f=>({...f,monto_total:e.target.value}))} onFocus={e=>e.target.style.borderColor='#c9a84c'} onBlur={e=>e.target.style.borderColor='#2a2a2a'} />
              </div>
              <div>
                <label style={sty.lbl}>Método de pago</label>
                <select style={sty.sel} value={form.metodo_pago} onChange={e=>setForm(f=>({...f,metodo_pago:e.target.value}))}>
                  <option value="efectivo">💵 Efectivo</option>
                  <option value="transferencia">🏦 Transferencia</option>
                  <option value="yappy">📱 Yappy</option>
                  <option value="ach">🔄 ACH</option>
                </select>
              </div>
              <div>
                <label style={sty.lbl}>Fecha del pago</label>
                <input style={sty.inp} type="date" value={form.fecha_pago} onChange={e=>setForm(f=>({...f,fecha_pago:e.target.value}))} onFocus={e=>e.target.style.borderColor='#c9a84c'} onBlur={e=>e.target.style.borderColor='#2a2a2a'} />
              </div>
            </div>

            {/* Foto del comprobante */}
            <div style={{ marginBottom:'20px' }}>
              <label style={sty.lbl}>Foto del comprobante <span style={{ color:'#5a4f42', fontWeight:400 }}>(opcional)</span></label>
              <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{
                const f = e.target.files?.[0]||null
                setForm(fm=>({...fm,foto:f}))
                if (f) { const r=new FileReader(); r.onload=ev=>setFotoPreview(ev.target?.result as string); r.readAsDataURL(f) }
                else setFotoPreview(null)
              }} />
              <button type="button" onClick={()=>fileRef.current?.click()}
                style={{ width:'100%', background:'#191919', border:'1px dashed #3a3a3a', borderRadius:'10px', padding:'16px', color:'#a08c6e', fontSize:'13px', cursor:'pointer', textAlign:'center' as const, fontFamily:'inherit' }}>
                {form.foto ? `📷 ${form.foto.name}` : '📷 Toca aquí para agregar foto del comprobante'}
              </button>
              {fotoPreview && (
                <div style={{ marginTop:'10px', position:'relative', display:'inline-block' }}>
                  <img src={fotoPreview} style={{ width:'100%', maxHeight:'160px', objectFit:'cover', borderRadius:'8px', border:'1px solid #2c2c2c' }} />
                  <button onClick={()=>{ setFotoPreview(null); setForm(f=>({...f,foto:null})); if(fileRef.current) fileRef.current.value='' }}
                    style={{ position:'absolute', top:'6px', right:'6px', background:'rgba(0,0,0,0.7)', border:'none', color:'#fff', width:'24px', height:'24px', borderRadius:'50%', cursor:'pointer', fontSize:'12px' }}>✕</button>
                </div>
              )}
            </div>

            {error && <div style={{ background:'rgba(192,83,78,0.1)', border:'1px solid rgba(192,83,78,0.2)', borderRadius:'8px', padding:'10px 14px', color:'#c0534e', fontSize:'12px', marginBottom:'14px' }}>⚠ {error}</div>}

            <div style={{ background:'rgba(201,168,76,0.06)', border:'1px solid rgba(201,168,76,0.15)', borderRadius:'8px', padding:'10px 14px', fontSize:'12px', color:'#a08c6e', marginBottom:'16px' }}>
              ℹ El pago quedará <strong style={{ color:'#c09a4c' }}>pendiente de conciliación</strong>. Al conciliar, el saldo del préstamo bajará automáticamente.
            </div>

            <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
              <button onClick={()=>setModal(null)} style={{ background:'transparent', border:'1px solid #333', color:'#a08c6e', borderRadius:'8px', padding:'9px 16px', fontSize:'12px', cursor:'pointer' }}>Cancelar</button>
              <button onClick={registrarPago} disabled={saving} style={{ background:'linear-gradient(135deg,#c9a84c,#e2c27d)', color:'#0c0c0c', border:'none', borderRadius:'8px', padding:'9px 16px', fontSize:'12px', fontWeight:'700', cursor:'pointer', opacity:saving?.5:1 }}>
                {saving ? 'Registrando...' : '✓ Registrar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
