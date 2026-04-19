'use client'
import { fmtM, getSimbolo } from '@/lib/fmt'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// FLUJO: pendiente → aprobado → activo (desembolsado) → pagado
//        cualquier estado → cancelado

const ESTADO_CFG: Record<string,{color:string,bg:string,label:string,paso:number}> = {
  pendiente: { color:'#c09a4c', bg:'rgba(192,154,76,.12)', label:'Por aprobar',    paso:1 },
  aprobado:  { color:'#5a8fc0', bg:'rgba(90,143,192,.12)', label:'Por desembolsar', paso:2 },
  activo:    { color:'#4caf82', bg:'rgba(76,175,130,.12)', label:'Activo',          paso:3 },
  mora:      { color:'#c0534e', bg:'rgba(192,83,78,.12)',  label:'En mora',         paso:3 },
  pagado:    { color:'#524438', bg:'#1c1c1c',              label:'Pagado',          paso:4 },
  cancelado: { color:'#3a3a3a', bg:'#1a1a1a',              label:'Cancelado',       paso:0 },
}

const PER_LABEL: Record<string,string> = { '1':'Diario','7':'Semanal','15':'Quincenal','30':'Mensual' }

export default function PrestamosPage() {
  const supabase = createClient()
  const [prestamos, setPrestamos] = useState<any[]>([])
  const [clientes, setClientes] = useState<any[]>([])
  const [agencia, setAgencia] = useState<any>(null)
  const [comisionEditando, setComisionEditando] = useState<string|null>(null)
  const [comisionGuardada, setComisionGuardada] = useState<string|null>(null)
  const [nuevaComision, setNuevaComision] = useState('')
  const [tasaEditando, setTasaEditando] = useState<string|null>(null)
  const [nuevaTasa, setNuevaTasa] = useState('')
  const [imagenDesembolso, setImagenDesembolso] = useState<string|null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'nuevo'|'ver'|'desembolso'|null>(null)
  const [selected, setSelected] = useState<any>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [buscar, setBuscar] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('vigentes')
  const [filtroUsuario, setFiltroUsuario] = useState('all')
  const [filtroAgencia, setFiltroAgencia] = useState('all')
  const [agencias, setAgencias] = useState<any[]>([])
  const [usuariosFiltro, setUsuariosFiltro] = useState<any[]>([])
  const [desembolsoTasa, setDesembolsoTasa] = useState('10')
  const [desembolsoTipo, setDesembolsoTipo] = useState('Efectivo')
  const [desembolsoMixto, setDesembolsoMixto] = useState<{tipo:string,monto:string}[]>([{tipo:'Efectivo',monto:''}])
  const [montoAprobado, setMontoAprobado] = useState('')
  const [editComision, setEditComision] = useState('')
  const [form, setForm] = useState({ cliente_id:'', monto_original:'', tasa_interes:'10', comision_porc:'2', periodicidad_dias:'15', notas:'', tipo_desembolso:'Efectivo' })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      supabase.from('usuarios').select('*, agencia:agencias(tipos_desembolso,periodo_gracia_dias,moneda_principal)').eq('id', session.user.id).single()
        .then(({ data: p }) => {
          setPerfil(p); const ag = (p as any).agencia
          setAgencia(ag)
          setForm(f=>({...f,tasa_interes:String(ag?.tasa_interes_default||10)}))
          // SuperAdmin: cargar agencias y setear Panamá Central por defecto
          if (p.rol === 'superadmin') {
            supabase.from('agencias').select('id,nombre,moneda_principal').order('nombre')
              .then(({ data: ags }) => setAgencias(ags || []))
            setFiltroAgencia(p.agencia_id || 'all')
          }
          loadAll(p)
          supabase.channel('pres-rt')
            .on('postgres_changes', { event:'*', schema:'public', table:'prestamos' }, () => loadAll(p))
            .subscribe()
        })
    })
  }, [])

  // ── Helper: enviar WA al destinatario correcto según evento ──
  async function notificarWA(evento: 'solicitud'|'aprobado'|'desembolsado', prestamo: any, mensajeExtra?: string) {
    let destinatario: any = null
    const agNombre = agencia?.nombre || 'APP'

    if (evento === 'solicitud') {
      // Nueva solicitud → Gerente → Admin → SuperAdmin
      const { data: gerente } = await supabase.from('usuarios')
        .select('telefono,nombre,rol').eq('agencia_id', perfil.agencia_id)
        .eq('rol','gerente').eq('activo',true).limit(1).single()
      if (gerente?.telefono) { destinatario = gerente }
      else {
        const { data: admin } = await supabase.from('usuarios')
          .select('telefono,nombre,rol').eq('agencia_id', perfil.agencia_id)
          .eq('rol','admin').eq('activo',true).limit(1).single()
        if (admin?.telefono) { destinatario = admin }
        else {
          const { data: sa } = await supabase.from('usuarios')
            .select('telefono,nombre,rol').eq('rol','superadmin').eq('activo',true).limit(1).single()
          if (sa?.telefono) destinatario = sa
        }
      }
    } else if (evento === 'aprobado') {
      // Aprobado → al CREADOR del préstamo (promotor_id del préstamo)
      if (prestamo.promotor_id) {
        const { data: prom } = await supabase.from('usuarios')
          .select('telefono,nombre').eq('id', prestamo.promotor_id).single()
        if (prom?.telefono) destinatario = prom
      }
    } else if (evento === 'desembolsado') {
      // Desembolsado → al SOLICITANTE del préstamo (promotor_id del préstamo)
      if (prestamo.promotor_id) {
        const { data: prom } = await supabase.from('usuarios')
          .select('telefono,nombre').eq('id', prestamo.promotor_id).single()
        if (prom?.telefono) destinatario = prom
      }
      // Fallback: promotor asignado al cliente
      if (!destinatario) {
        const clienteId = prestamo.cliente_id || prestamo.cliente?.id
        if (clienteId) {
          const { data: cli } = await supabase.from('clientes')
            .select('promotor_id').eq('id', clienteId).single()
          if (cli?.promotor_id) {
            const { data: prom } = await supabase.from('usuarios')
              .select('telefono,nombre').eq('id', cli.promotor_id).single()
            if (prom?.telefono) destinatario = prom
          }
        }
      }
    }

    if (!destinatario?.telefono) return
    const tel = destinatario.telefono.replace(/\D/g,'')
    const num = tel.startsWith('507') ? tel : '507'+tel
    const clienteNombre = prestamo.cliente?.nombre || ''
    const monto = prestamo.monto_aprobado || prestamo.monto_original || 0

    let msg = ''
    if (evento === 'solicitud') {
      msg = `📋 *${agNombre}* — Nueva Solicitud de Préstamo\n\nCliente: *${clienteNombre}*\nMonto: *$${Number(monto).toFixed(2)}*\nSolicitado por: ${perfil?.nombre || ''}\n\nRequiere su aprobación.`
    } else if (evento === 'aprobado') {
      msg = `✅ *${agNombre}* — Préstamo APROBADO\n\nCliente: *${clienteNombre}*\nMonto: *$${Number(monto).toFixed(2)}*\n\nCoordine el desembolso con el administrador.`
    } else if (evento === 'desembolsado') {
      msg = mensajeExtra || `💸 *${agNombre}* — Préstamo DESEMBOLSADO\n\nCliente: *${clienteNombre}*\nMonto: *$${Number(monto).toFixed(2)}*`
    }

    window.open('https://wa.me/'+num+'?text='+encodeURIComponent(msg), 'wa_app')
  }

  async function loadAll(p: any, filtroAg?: string) {
    setLoading(true)
    setError('')

    // ── JERARQUÍA DE VISIBILIDAD ──────────────────────────────
    // SuperAdmin → todo (todas las agencias)
    // Admin      → su agencia: sus préstamos + gerentes + promotores de su agencia
    // Gerente    → sus préstamos + promotores que le están asignados
    // Promotor   → solo sus propios préstamos
    // ─────────────────────────────────────────────────────────

    let visibleIds: string[] = []  // IDs de promotores cuyos préstamos puede ver

    if (p.rol === 'superadmin') {
      // SuperAdmin: traer TODOS sin filtro
      visibleIds = []  // flag especial — ver abajo
    } else if (p.rol === 'admin') {
      // Admin: todos los usuarios de su agencia
      const { data: usu } = await supabase.from('usuarios')
        .select('id').eq('agencia_id', p.agencia_id)
      visibleIds = [p.id, ...(usu||[]).map((u:any)=>u.id)]
    } else if (p.rol === 'gerente') {
      // Gerente: él mismo + promotores asignados a él
      const { data: proms } = await supabase.from('usuarios')
        .select('id').eq('agencia_id', p.agencia_id).eq('rol','promotor')
      // TODO: cuando haya tabla gerente→promotor, filtrar por asignación
      // Por ahora: gerente ve todos los promotores de su agencia
      visibleIds = [p.id, ...(proms||[]).map((u:any)=>u.id)]
    } else {
      // Promotor: solo él mismo
      visibleIds = [p.id]
    }

    // Determinar agencia a filtrar
    const agFiltro = filtroAg !== undefined ? filtroAg : filtroAgencia
    const agIdFiltro = agFiltro !== 'all' ? agFiltro : p.agencia_id

    // Query base — siempre filtrar por agencia en BD
    let q = supabase.from('prestamos')
      .select('id,estado,monto_original,saldo_capital,tasa_interes,comision_porcentaje,comision_promotor,comision_mora,periodicidad_dias,tipo_desembolso,notas,fecha_desembolso,fecha_primer_pago,fecha_proximo_pago,created_at,cliente_id,promotor_id,agencia_id,interes_acumulado,interes_mora,agencia:agencias(periodo_gracia_dias)')
      .eq('agencia_id', agIdFiltro)
      .order('created_at', { ascending:false })

    const { data: todos, error: err } = await q
    if (err) { setError('Error: ' + err.message); setLoading(false); return }

    // Filtro en JS según jerarquía de usuarios
    const filtered = (todos||[]).filter((pr:any) => {
      if (['superadmin','admin'].includes(p.rol)) return true
      return visibleIds.includes(pr.promotor_id)
    })

    // Enriquecer con cliente y promotor
    const cIds = [...new Set(filtered.map((pr:any)=>pr.cliente_id).filter(Boolean))] as string[]
    const pIds = [...new Set(filtered.map((pr:any)=>pr.promotor_id).filter(Boolean))] as string[]

    const [cRes, pRes] = await Promise.all([
      cIds.length ? supabase.from('clientes').select('id,nombre,telefono,promotor_id').in('id',cIds) : {data:[]},
      pIds.length ? supabase.from('usuarios').select('id,nombre,rol').in('id',pIds) : {data:[]}
    ])

    const cMap: Record<string,any> = {}
    ;(cRes.data||[]).forEach((c:any) => cMap[c.id]=c)
    const pMap: Record<string,any> = {}
    ;(pRes.data||[]).forEach((u:any) => pMap[u.id]=u)

    setPrestamos(filtered.map((pr:any) => ({
      ...pr,
      cliente: cMap[pr.cliente_id]||{nombre:'—'},
      promotor: pMap[pr.promotor_id]||{nombre:'—'}
    })))

    // Cargar usuarios para filtro
    if (['gerente','admin','superadmin'].includes(p.rol)) {
      const { data: usu } = await supabase.from('usuarios').select('id,nombre,rol').eq('agencia_id', p.agencia_id).in('rol',['promotor','gerente']).order('nombre')
      setUsuariosFiltro(usu||[])
    }
    await loadClientes(p)
    setLoading(false)
  }

  async function loadClientes(p: any) {
    let q = supabase.from('clientes').select('id,nombre').is('deleted_at', null)
    if (p.rol==='promotor') q = q.eq('promotor_id', p.id)
    else if (p.rol==='gerente') {
      const { data: mp } = await supabase.from('usuarios').select('id').eq('agencia_id', p.agencia_id).eq('rol','promotor')
      q = q.in('promotor_id', [p.id,...(mp||[]).map((u:any)=>u.id)])
    } else q = q.eq('agencia_id', p.agencia_id)
    const { data } = await q.order('nombre')
    setClientes(data||[])
  }

  async function guardar() {
    if (!form.cliente_id) { setError('Selecciona un cliente'); return }
    if (!form.monto_original || parseFloat(form.monto_original)<=0) { setError('El monto debe ser mayor a 0'); return }
    setSaving(true); setError('')
    const monto = parseFloat(form.monto_original)
    // Comisión editable por todos los roles
    const comisionPorc = parseFloat(form.comision_porc||'0')
    const comision = monto * (comisionPorc / 100)  // monto = saldo * %
    const { error: e } = await supabase.from('prestamos').insert({
      cliente_id: form.cliente_id,
      promotor_id: perfil.id,
      agencia_id: perfil.agencia_id,
      monto_original: monto,
      saldo_capital: monto,
      tasa_interes: parseFloat(form.tasa_interes||'10'),
      comision_porcentaje: comisionPorc,  // % guardado
      comision_promotor: comision,            // monto = saldo_capital * %
      periodicidad_dias: parseInt(form.periodicidad_dias||'30'),
      tipo_desembolso: form.tipo_desembolso||'Efectivo',
      estado: 'pendiente',
      notas: form.notas||null,
    })
    if (e) { setError(e.message); setSaving(false); return }
    // Notificar nueva solicitud → gerente → admin → superadmin
    const clienteData = clientes.find((c: any) => c.id === form.cliente_id)
    await notificarWA('solicitud', {
      cliente_id: form.cliente_id,
      cliente: clienteData,
      monto_original: monto,
      promotor_id: perfil.id
    })
    setModal(null)
    setForm({ cliente_id:'', monto_original:'', tasa_interes:String(agencia?.tasa_interes_default||10), comision_porc:'2', periodicidad_dias:'15', notas:'', tipo_desembolso:(agencia?.tipos_desembolso?.[0])||'Efectivo' })
    setSaving(false)
  }

  async function aprobar(pr: any) {
    // Verificar fondos disponibles antes de aprobar
    const { data: fonds } = await supabase.from('fondeadores')
      .select('saldo_actual').eq('agencia_id', pr.agencia_id).eq('activo', true)
    const { data: cartData } = await supabase.from('prestamos')
      .select('saldo_capital').eq('agencia_id', pr.agencia_id).in('estado',['activo','mora'])
    const totalFondos = (fonds||[]).reduce((s:number,f:any)=>s+(f.saldo_actual||0),0)
    const totalCartera = (cartData||[]).reduce((s:number,p:any)=>s+(p.saldo_capital||0),0)
    const disponible = totalFondos - totalCartera
    const montoSolicitado = pr.monto_original || 0
    if (disponible < montoSolicitado) {
      alert(`⚠️ Fondos insuficientes\n\nDisponible: $${disponible.toFixed(2)}\nSolicitado: $${montoSolicitado.toFixed(2)}\n\nSe requiere fondear el flujo antes de aprobar este crédito.`)
      return
    }
    const upd: any = { estado:'aprobado' }
    if (montoAprobado && parseFloat(montoAprobado) > 0) {
      upd.monto_aprobado = parseFloat(montoAprobado)
      upd.monto_original = parseFloat(montoAprobado)
      upd.saldo_capital = parseFloat(montoAprobado)
    }
    await supabase.from('prestamos').update(upd).eq('id', pr.id)
    setSelected((prev: any) => ({...prev, estado:'aprobado', ...upd}))
    setMontoAprobado('')
    // WA aprobación → al creador del préstamo (quien lo solicitó)
    const { data: creador } = await supabase.from('usuarios')
      .select('telefono,nombre').eq('id', pr.promotor_id).single()
    if (creador?.telefono) {
      const tel = creador.telefono.replace(/\D/g,'')
      const num = tel.startsWith('507') ? tel : '507'+tel
      const montoApr = upd.monto_original || pr.monto_original
      const msg = `✅ *${agencia?.nombre||'APP'}* — Préstamo APROBADO\n\nCliente: *${pr.cliente?.nombre||''}*\nMonto: *$${Number(montoApr).toFixed(2)}*\n\nCoordine el desembolso con el administrador.`
      window.open('https://wa.me/'+num+'?text='+encodeURIComponent(msg), 'wa_app')
    }
  }

  async function desembolsar() {
    if (!selected) return
    setSaving(true)
    const detalleValido = desembolsoMixto.filter(d=>d.monto&&parseFloat(d.monto)>0)
    const totalMixto = detalleValido.reduce((s,d)=>s+parseFloat(d.monto||'0'),0)
    const montoFinal = selected.monto_aprobado||selected.monto_original
    if (detalleValido.length > 1 && Math.abs(totalMixto - montoFinal) > 0.01) {
      alert(`La suma ($${totalMixto.toFixed(2)}) debe ser igual al monto ($${montoFinal})`); setSaving(false); return
    }
    // Calcular fechas basadas en período de gracia de la agencia
    const hoyDes = new Date()
    const fechaDesembolso = hoyDes.toISOString().split('T')[0]
    const graciaAgencia = agencia?.periodo_gracia_dias || 0
    const inicioIntereses = new Date(hoyDes)
    inicioIntereses.setDate(inicioIntereses.getDate() + graciaAgencia)
    
    // Calcular primer pago respetando períodos 15 y 30
    let fechaPrimerPago: string
    if ((selected.periodicidad_dias || 15) === 15) {
      const d = inicioIntereses.getDate()
      const m = inicioIntereses.getMonth()
      const y = inicioIntereses.getFullYear()
      if (d < 15) {
        fechaPrimerPago = `${y}-${String(m+1).padStart(2,'0')}-15`
      } else if (d < 30) {
        fechaPrimerPago = `${y}-${String(m+1).padStart(2,'0')}-30`
      } else {
        // Siguiente mes día 15
        const next = new Date(y, m+1, 15)
        fechaPrimerPago = next.toISOString().split('T')[0]
      }
    } else {
      const primerPago = new Date(inicioIntereses)
      primerPago.setDate(primerPago.getDate() + (selected.periodicidad_dias || 30))
      if (primerPago.getDate() === 31) primerPago.setDate(30)
      fechaPrimerPago = primerPago.toISOString().split('T')[0]
    }

    const upd: any = {
      estado: 'activo',
      tasa_interes: parseFloat(desembolsoTasa),
      tipo_desembolso: detalleValido.length===1 ? detalleValido[0].tipo : 'Mixto',
      detalle_desembolso: detalleValido,
      fecha_desembolso: fechaDesembolso,
      fecha_primer_pago: fechaPrimerPago,
      fecha_proximo_pago: fechaPrimerPago,
      admin_id: perfil.id
    }
    if (imagenDesembolso) upd.comprobante_url = imagenDesembolso
    const { error: e } = await supabase.from('prestamos').update(upd).eq('id', selected.id)
    if (e) { alert(e.message); setSaving(false); return }
    const detalleStr2 = detalleValido.length > 1 ? detalleValido.map((d:any)=>d.tipo+": $"+d.monto).join(", ") : (detalleValido[0]?.tipo||"Efectivo")
    const intPer2 = montoFinal * ((parseFloat(desembolsoTasa)||10) / 100)
    const msgDes = "💸 *"+(agencia?.nombre||"APP")+" — Préstamo DESEMBOLSADO\n\nCliente: *"+selected.cliente?.nombre+"*\nMonto: *$"+Number(montoFinal).toLocaleString("es-PA")+"*\nVía: "+detalleStr2+"\nTasa: "+desembolsoTasa+"% por período\nInterés estimado: $"+intPer2.toFixed(2)+"\nFecha: "+new Date().toLocaleDateString("es-PA")
    await notificarWA("desembolsado", selected, msgDes)
    setImagenDesembolso(null)
    setSaving(false); setModal(null)
  }

  async function editarComision(prestamo: any, nuevaPorc: string) {
    const porc = parseFloat(nuevaPorc)
    if (isNaN(porc) || porc < 0) return
    const montoComision = (prestamo.saldo_capital||0) * (porc/100)
    await supabase.from('prestamos').update({
      comision_porcentaje: porc,
      comision_promotor: parseFloat(montoComision.toFixed(2)),
    }).eq('id', prestamo.id)
    setComisionEditando(null)
    setNuevaComision('')
    // Mostrar toast de confirmación (no abrir modal del cliente)
    setComisionGuardada(prestamo.id)
    setTimeout(() => setComisionGuardada(null), 2500)
    loadAll(perfil)
  }

  async function editarTasa(prestamo: any, nuevaTasaVal: string) {
    const tasa = parseFloat(nuevaTasaVal)
    if (isNaN(tasa) || tasa < 0) return
    await supabase.from('prestamos').update({
      tasa_interes: tasa
    }).eq('id', prestamo.id)
    setTasaEditando(null)
    setNuevaTasa('')
    setComisionGuardada(prestamo.id) // reutilizar toast
    setTimeout(() => setComisionGuardada(null), 2500)
    loadAll(perfil)
  }

  async function rechazar(id: string) {
    if (!confirm('¿Rechazar esta solicitud?')) return
    await supabase.from('prestamos').update({ estado:'cancelado' }).eq('id', id)
    setModal(null)
  }

  // Permisos según rol
  const puedeAprobar = (p: any) => {
    const rol = perfil?.rol
    // Gerentes, admins y superadmin pueden aprobar pendientes
    return ['gerente','admin','superadmin'].includes(rol) && p.estado==='pendiente'
  }
  const puedeDesembolsar = (p: any) => {
    const rol = perfil?.rol
    return ['admin','superadmin'].includes(rol) && p.estado==='aprobado'
  }
  const puedeRechazar = (p: any) => {
    const rol = perfil?.rol
    return ['gerente','admin','superadmin'].includes(rol) && ['pendiente','aprobado'].includes(p.estado)
  }

  const filtrados = prestamos.filter(p => {
    const nombre = (p.cliente?.nombre||'').toLowerCase()
    const matchBuscar = nombre.includes(buscar.toLowerCase())
    const matchEstado = filtroEstado==='all' ? true
      : filtroEstado==='vigentes' ? !['cancelado','pagado'].includes(p.estado)
      : p.estado===filtroEstado
    const matchUsuario = filtroUsuario==='all' || p.promotor_id===filtroUsuario || (p.cliente as any)?.promotor_id===filtroUsuario
    return matchBuscar && matchEstado && matchUsuario
  })

  const tipos = agencia?.tipos_desembolso || ['Efectivo','Yappy','Nequi','Transferencia','ACH']

  const enGracia = (p: any) => {
    if (!p?.fecha_desembolso) return false
    const gracia = (p.agencia as any)?.periodo_gracia_dias || agencia?.periodo_gracia_dias || 0
    if (!gracia) return false
    const fin = new Date(p.fecha_desembolso)
    fin.setDate(fin.getDate() + gracia)
    return new Date() < fin
  }

  const calcInteres = () => {
    if (!form.monto_original) return 0
    return parseFloat(form.monto_original) * (parseFloat(form.tasa_interes||'10') / 100)
  }
  const calcComision = () => {
    if (!form.monto_original) return 0
    return parseFloat(form.monto_original) * (parseFloat(form.comision_porc||'0') / 100)
  }

  const inp = { width:'100%', background:'#191919', border:'1px solid #2a2a2a', borderRadius:'9px', padding:'10px 12px', color:'#f0ebe0', fontSize:'14px', outline:'none', boxSizing:'border-box' as const, fontFamily:'inherit' }
  const lbl = { display:'block' as const, fontSize:'9px', fontWeight:'600' as const, color:'#6a5a48', textTransform:'uppercase' as const, letterSpacing:'1.2px', marginBottom:'5px' }
  const sel_s = { ...inp }
  const lbl_inp = { ...inp, padding:'8px 10px', fontSize:'13px' as const }

  // Contadores por estado
  const cnt = (est: string) => prestamos.filter(p=>p.estado===est).length

  return (
    <div className="page">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px', flexWrap:'wrap', gap:'10px' }}>
        <div>
          <h1 style={{ fontSize:'20px', fontWeight:'700', color:'#f0ebe0', margin:'0 0 2px' }}>Préstamos</h1>
          <p style={{ fontSize:'11px', color:'#9a8668', margin:0 }}>{prestamos.length} registros en total</p>
        </div>
        <button className="btn-gold" onClick={()=>{ setForm({cliente_id:'',monto_original:'',tasa_interes:String(agencia?.tasa_interes_default||10),comision_porc:'2',periodicidad_dias:'15',notas:'',tipo_desembolso:tipos[0]||'Efectivo'}); setError(''); setModal('nuevo') }}>
          + Nueva Solicitud
        </button>
      </div>

      {/* Pipeline visual */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px', marginBottom:'16px' }}>
        {[
          { est:'pendiente', label:'Por Aprobar', emoji:'⏳', c:'#c09a4c' },
          { est:'aprobado',  label:'Por Desembolsar', emoji:'✅', c:'#5a8fc0' },
          { est:'activo',    label:'Activos', emoji:'💳', c:'#4caf82' },
          { est:'mora',      label:'En Mora', emoji:'⚠️', c:'#c0534e' },
        ].map(s=>(
          <button key={s.est} onClick={()=>setFiltroEstado(filtroEstado===s.est?'all':s.est)}
            style={{ background:filtroEstado===s.est?`${s.c}15`:'#141414', border:`1px solid ${filtroEstado===s.est?s.c:'#252525'}`, borderRadius:'10px', padding:'10px 8px', cursor:'pointer', textAlign:'left' as const, transition:'all .15s' }}>
            <div style={{ fontSize:'16px', marginBottom:'3px' }}>{s.emoji}</div>
            <div style={{ fontSize:'16px', fontWeight:'700', color:s.c }}>{cnt(s.est)}</div>
            <div style={{ fontSize:'9px', color:'#524438', textTransform:'uppercase', letterSpacing:'0.8px', marginTop:'2px' }}>{s.label}</div>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:'6px', marginBottom:'12px', flexWrap:'wrap' }}>
        <input style={{ ...inp, flex:1, minWidth:'140px', padding:'8px 11px', fontSize:'13px' }} placeholder="🔍 Buscar cliente..." value={buscar} onChange={e=>setBuscar(e.target.value)} />
        {perfil?.rol === 'superadmin' && agencias.length > 0 && (
          <select value={filtroAgencia} onChange={async e=>{ 
            const v=e.target.value; setFiltroAgencia(v); 
            if (v !== 'all') {
              const ag = agencias.find((a:any)=>a.id===v)
              if (ag) setAgencia(ag)
            }
            loadAll(perfil, v) }}
            style={{ background:'#141414', border:'1px solid #252525', borderRadius:'8px', padding:'7px 10px', color:'#f0ebe0', fontSize:'12px', outline:'none', minWidth:'140px' }}>
            <option value="all">Todas las agencias</option>
            {agencias.map((a:any)=><option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        )}
        {['gerente','admin','superadmin'].includes(perfil?.rol||'') && (
          <select value={filtroUsuario} onChange={e=>setFiltroUsuario(e.target.value)}
            style={{ background:'#141414', border:'1px solid #252525', borderRadius:'8px', padding:'7px 10px', color:'#f0ebe0', fontSize:'12px', outline:'none', minWidth:'130px' }}>
            <option value="all">Todos los promotores</option>
            {usuariosFiltro.map(u=><option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        )}
        <select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)} style={{ background:'#141414', border:'1px solid #252525', borderRadius:'8px', padding:'7px 10px', color:'#f0ebe0', fontSize:'12px', outline:'none' }}>
          <option value="vigentes">Vigentes (sin cancelados)</option>
          <option value="all">Todos los estados</option>
          <option value="pendiente">Por aprobar</option>
          <option value="aprobado">Por desembolsar</option>
          <option value="activo">Activos</option>
          <option value="mora">En mora</option>
          <option value="pagado">Pagados</option>
          <option value="cancelado">Cancelados</option>
        </select>
        {(buscar||filtroEstado!=='all') && <button className="btn-ghost" style={{ padding:'7px 10px', fontSize:'11px' }} onClick={()=>{setBuscar('');setFiltroEstado('all')}}>✕</button>}
      </div>

      {/* Cards móvil */}
      <div className="mob-only">
        {loading ? <div style={{ padding:'20px', textAlign:'center', color:'#524438' }}>Cargando...</div>
        : error && prestamos.length===0 ? <div style={{ padding:'20px', textAlign:'center', color:'#c0534e' }}>⚠ {error}</div>
        : filtrados.length===0 ? <div style={{ padding:'20px', textAlign:'center', color:'#524438' }}>{buscar||filtroEstado!=='all'?'Sin resultados':'No hay préstamos'}</div>
        : filtrados.map(p=>{
          const cfg = ESTADO_CFG[p.estado]||ESTADO_CFG.pendiente
          return (
            <div key={p.id} className="card card-sm" style={{ marginBottom:'10px' }}>
              {/* Header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'10px' }}
                onClick={()=>{ setSelected(p); setDesembolsoTasa(String(p.tasa_interes||10)); setDesembolsoTipo(p.tipo_desembolso||tipos[0]||'Efectivo'); setModal('ver') }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'14px', fontWeight:600, color:'#f0ebe0' }}>{p.cliente?.nombre||'—'}</div>
                  <div style={{ fontSize:'11px', color:'#9a8668', marginTop:'2px' }}>{p.promotor?.nombre||'—'} · {PER_LABEL[String(p.periodicidad_dias)]||p.periodicidad_dias+'d'}</div>
                </div>
                <span style={{ fontSize:'10px', fontWeight:600, padding:'3px 9px', borderRadius:'20px', color:cfg.color, background:cfg.bg, whiteSpace:'nowrap', marginLeft:'8px' }}>{cfg.label}</span>
              </div>

              {/* Montos */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'6px', marginBottom:'10px' }}>
                <div style={{ background:'#1a1a1a', borderRadius:'7px', padding:'8px' }}>
                  <div style={{ fontSize:'8px', color:'#524438', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:'2px' }}>Monto</div>
                  <div style={{ fontSize:'13px', fontWeight:700, color:'#9a8668', fontFamily:'monospace' }}>${fmtM(p.monto_original, agencia?.moneda_principal)}</div>
                </div>
                <div style={{ background:'#1a1a1a', borderRadius:'7px', padding:'8px' }}>
                  <div style={{ fontSize:'8px', color:'#524438', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:'2px' }}>Saldo</div>
                  <div style={{ fontSize:'13px', fontWeight:700, color:'#e2c27d', fontFamily:'monospace' }}>${fmtM(p.saldo_capital, agencia?.moneda_principal)}</div>
                </div>
                <div style={{ background:'#1a1a1a', borderRadius:'7px', padding:'8px' }}>
                  <div style={{ fontSize:'8px', color:'#524438', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:'2px' }}>Vence</div>
                  <div style={{ fontSize:'11px', fontWeight:600 }}>
                    {(() => {
                      if (!p.fecha_desembolso) return <span style={{ color:'#524438' }}>—</span>
                      const hoy = new Date(); hoy.setHours(0,0,0,0)
                      const gracia = (p.agencia as any)?.periodo_gracia_dias || 0
                      const finGracia = new Date(p.fecha_desembolso); finGracia.setDate(finGracia.getDate() + gracia)
                      if (hoy < finGracia) return <span style={{ color:'#5a8fc0' }}>⏳ Gracia</span>
                      if (!p.fecha_proximo_pago) return <span style={{ color:'#524438' }}>—</span>
                      const vence = new Date(p.fecha_proximo_pago); vence.setHours(0,0,0,0)
                      const diff = Math.ceil((vence.getTime()-hoy.getTime())/86400000)
                      if (diff < 0) return <span style={{ color:'#c0534e' }}>🔴 {Math.abs(diff)}d</span>
                      if (diff === 0) return <span style={{ color:'#c0534e' }}>🔴 Hoy</span>
                      if (diff <= 3) return <span style={{ color:'#c09a4c' }}>⚠️ {diff}d</span>
                      return <span style={{ color:'#4caf82' }}>✅ {new Date(p.fecha_proximo_pago).toLocaleDateString('es-PA',{day:'2-digit',month:'2-digit'})}</span>
                    })()}
                  </div>
                </div>
              </div>

              {/* Tasa y Comisión editables */}
              {p.estado === 'activo' && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px', marginBottom:'10px' }}>
                  {/* Tasa — solo SuperAdmin */}
                  <div style={{ background:'#1a1a1a', borderRadius:'7px', padding:'8px' }} onClick={e=>e.stopPropagation()}>
                    <div style={{ fontSize:'8px', color:'#524438', textTransform:'uppercase', marginBottom:'4px' }}>Tasa</div>
                    {tasaEditando===p.id ? (
                      <div style={{ display:'flex', gap:'4px' }}>
                        <input type="text" inputMode="decimal" value={nuevaTasa} onChange={e=>setNuevaTasa(e.target.value.replace(/[^0-9.]/g,''))}
                          style={{ width:'50px', background:'#252525', border:'1px solid #c9a84c', borderRadius:'5px', padding:'4px 6px', color:'#f0ebe0', fontSize:'13px', outline:'none' }} />
                        <button onClick={()=>editarTasa(p,nuevaTasa)} style={{ background:'#4caf82', border:'none', borderRadius:'4px', padding:'4px 8px', color:'#0c0c0c', fontSize:'11px', cursor:'pointer' }}>✓</button>
                        <button onClick={()=>setTasaEditando(null)} style={{ background:'none', border:'1px solid #333', borderRadius:'4px', padding:'4px 6px', color:'#9a8668', fontSize:'11px', cursor:'pointer' }}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                        <span style={{ fontSize:'14px', fontWeight:700, color:'#9a8668' }}>{p.tasa_interes}%</span>
                        {perfil?.rol==='superadmin' && (
                          <button onClick={()=>{setTasaEditando(p.id);setNuevaTasa(String(p.tasa_interes||10))}}
                            style={{ background:'none', border:'none', color:'#524438', cursor:'pointer', fontSize:'14px', padding:'0' }}>✏️</button>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Comisión — todos los roles */}
                  <div style={{ background:'#1a1a1a', borderRadius:'7px', padding:'8px' }} onClick={e=>e.stopPropagation()}>
                    <div style={{ fontSize:'8px', color:'#524438', textTransform:'uppercase', marginBottom:'4px' }}>Comisión</div>
                    {comisionEditando===p.id ? (
                      <div style={{ display:'flex', gap:'4px' }}>
                        <input type="text" inputMode="decimal" value={nuevaComision} onChange={e=>setNuevaComision(e.target.value.replace(/[^0-9.]/g,''))}
                          style={{ width:'50px', background:'#252525', border:'1px solid #c9a84c', borderRadius:'5px', padding:'4px 6px', color:'#f0ebe0', fontSize:'13px', outline:'none' }} />
                        <button onClick={()=>editarComision(p,nuevaComision)} style={{ background:'#4caf82', border:'none', borderRadius:'4px', padding:'4px 8px', color:'#0c0c0c', fontSize:'11px', cursor:'pointer' }}>✓</button>
                        <button onClick={()=>setComisionEditando(null)} style={{ background:'none', border:'1px solid #333', borderRadius:'4px', padding:'4px 6px', color:'#9a8668', fontSize:'11px', cursor:'pointer' }}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                        <span style={{ fontSize:'14px', fontWeight:700, color:'#4caf82' }}>{(p.comision_porcentaje||0).toFixed(1)}%</span>
                        <button onClick={()=>{setComisionEditando(p.id);setNuevaComision(String(p.comision_porcentaje||0))}}
                          style={{ background:'none', border:'none', color:'#524438', cursor:'pointer', fontSize:'14px', padding:'0' }}>✏️</button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Acciones */}
              <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                <button onClick={()=>{ setSelected(p); setDesembolsoTasa(String(p.tasa_interes||10)); setModal('ver') }}
                  style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:'6px', padding:'7px 12px', fontSize:'11px', color:'#9a8668', cursor:'pointer', flex:1 }}>
                  Ver detalle
                </button>
                {puedeAprobar(p) && <button className="btn-ghost" style={{ fontSize:'11px', padding:'7px 12px', color:'#4caf82', borderColor:'rgba(76,175,130,.3)', flex:1 }} onClick={e=>{e.stopPropagation();aprobar(p)}}>✓ Aprobar</button>}
                {puedeDesembolsar(p) && <button className="btn-gold" style={{ fontSize:'11px', padding:'7px 12px', flex:1 }} onClick={e=>{e.stopPropagation();setSelected(p);setDesembolsoTasa(String(p.tasa_interes||10));setDesembolsoTipo(p.tipo_desembolso||tipos[0]);setModal('desembolso')}}>💸 Desembolsar</button>}
                {puedeRechazar(p) && <button className="btn-danger" style={{ fontSize:'11px', padding:'7px 10px' }} onClick={e=>{e.stopPropagation();rechazar(p.id)}}>✗</button>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Tabla desktop */}
      <div className="desk-only card" style={{ overflow:'hidden' }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>{['Cliente','Monto','Saldo','Tasa','Comisión','Período','Vencimiento','Promotor','Estado','Acciones'].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={9} style={{ padding:'30px', textAlign:'center', color:'#524438' }}>Cargando...</td></tr>
              : filtrados.length===0 ? <tr><td colSpan={9} style={{ padding:'30px', textAlign:'center', color:'#524438' }}>{buscar||filtroEstado!=='all'?'Sin resultados':'No hay préstamos'}</td></tr>
              : filtrados.map(p=>{
                const cfg = ESTADO_CFG[p.estado]||ESTADO_CFG.pendiente
                return (
                  <tr key={p.id} style={{ cursor:'pointer' }}
                    onClick={()=>{ setSelected(p); setDesembolsoTasa(String(p.tasa_interes||10)); setDesembolsoTipo(p.tipo_desembolso||tipos[0]||'Efectivo'); setModal('ver') }}
                    onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,.02)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='')}>
                    <td style={{ fontWeight:500, color:'#f0ebe0' }}>{p.cliente?.nombre||'—'}</td>
                    <td style={{ fontFamily:'monospace', color:'#9a8668', whiteSpace:'nowrap' }}>${fmtM(p.monto_original, agencia?.moneda_principal)}</td>
                    <td style={{ fontFamily:'monospace', fontWeight:600, color:'#e2c27d', whiteSpace:'nowrap' }}>${fmtM(p.saldo_capital, agencia?.moneda_principal)}</td>
                    <td style={{ fontFamily:'monospace', color:'#9a8668', whiteSpace:'nowrap' }} onClick={e=>e.stopPropagation()}>
                      {tasaEditando===p.id ? (
                        <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
                          <input type="text" inputMode="decimal" value={nuevaTasa} onChange={e=>setNuevaTasa(e.target.value.replace(/[^0-9.]/g,''))}
                            style={{ width:'55px', background:'#191919', border:'1px solid #c9a84c', borderRadius:'5px', padding:'3px 6px', color:'#f0ebe0', fontSize:'12px', outline:'none' } as any} placeholder="%"
                            onKeyDown={e=>{ if(e.key==='Enter') editarTasa(p,nuevaTasa); if(e.key==='Escape') setTasaEditando(null) }} />
                          <button onClick={()=>editarTasa(p,nuevaTasa)} style={{ background:'#4caf82', border:'none', borderRadius:'4px', padding:'3px 6px', color:'#0c0c0c', fontSize:'10px', cursor:'pointer' }}>✓</button>
                          <button onClick={()=>setTasaEditando(null)} style={{ background:'none', border:'1px solid #333', borderRadius:'4px', padding:'3px 5px', color:'#9a8668', fontSize:'10px', cursor:'pointer' }}>✕</button>
                        </div>
                      ) : (
                        <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                          <span>{p.tasa_interes}%</span>
                          {p.estado==='activo' && ['admin','superadmin'].includes(perfil?.rol||'') && (
                            <button onClick={e=>{e.stopPropagation();setTasaEditando(p.id);setNuevaTasa(String(p.tasa_interes||10))}}
                              style={{ background:'none', border:'none', color:'#524438', cursor:'pointer', fontSize:'11px', padding:'0 2px' }}>✏️</button>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ whiteSpace:'nowrap' }} onClick={e=>e.stopPropagation()}>
                      {comisionEditando===p.id ? (
                        <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
                          <input type="text" inputMode="decimal" value={nuevaComision} onChange={e=>setNuevaComision(e.target.value.replace(/[^0-9.]/g,''))}
                            style={{ width:'65px', background:'#191919', border:'1px solid #c9a84c', borderRadius:'5px', padding:'3px 6px', color:'#f0ebe0', fontSize:'12px', outline:'none', MozAppearance:'textfield' } as any} placeholder="%"
                            onKeyDown={e=>{ if(e.key==='Enter') editarComision(p,nuevaComision); if(e.key==='Escape') setComisionEditando(null) }} />
                          <button onClick={()=>editarComision(p,nuevaComision)} style={{ background:'#4caf82', border:'none', borderRadius:'4px', padding:'3px 6px', color:'#0c0c0c', fontSize:'10px', cursor:'pointer' }}>✓</button>
                          <button onClick={()=>setComisionEditando(null)} style={{ background:'none', border:'1px solid #333', borderRadius:'4px', padding:'3px 5px', color:'#9a8668', fontSize:'10px', cursor:'pointer' }}>✕</button>
                        </div>
                      ) : (
                        <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                          <span style={{ fontFamily:'monospace', color:'#4caf82' }}>
                            <span style={{ fontWeight:700 }}>{(p.comision_porcentaje||0).toFixed(1)}%</span>
                            <span style={{ fontSize:'9px', color:'#524438', marginLeft:'4px' }}>${(p.comision_promotor||0).toFixed(2)}</span>
                          </span>
                          {p.estado==='activo' && <button onClick={e=>{e.stopPropagation();setComisionEditando(p.id);setNuevaComision(String(p.comision_porcentaje||0))}}  // editar el %, no el monto
                            style={{ background:'none', border:'none', color:'#524438', cursor:'pointer', fontSize:'11px', padding:'0 2px' }}>✏️</button>}
                        </div>
                      )}
                    </td>
                    <td style={{ color:'#9a8668', whiteSpace:'nowrap' }}>{PER_LABEL[String(p.periodicidad_dias)]||p.periodicidad_dias+'d'}</td>
                    <td style={{ whiteSpace:'nowrap', fontSize:'11px' }}>
                      {(() => {
                        if (!p.fecha_desembolso) return <span style={{ color:'#524438' }}>—</span>
                        const hoy = new Date(); hoy.setHours(0,0,0,0)
                        const gracia = (p.agencia as any)?.periodo_gracia_dias || 0
                        const finGracia = new Date(p.fecha_desembolso); finGracia.setDate(finGracia.getDate() + gracia)
                        if (hoy < finGracia) {
                          const dias = Math.ceil((finGracia.getTime() - hoy.getTime()) / 86400000)
                          return <span style={{ color:'#5a8fc0', fontWeight:600 }}>⏳ Gracia {dias}d</span>
                        }
                        if (!p.fecha_proximo_pago) return <span style={{ color:'#524438' }}>—</span>
                        const vence = new Date(p.fecha_proximo_pago); vence.setHours(0,0,0,0)
                        const diff = Math.ceil((vence.getTime() - hoy.getTime()) / 86400000)
                        if (diff < 0) return <span style={{ color:'#c0534e', fontWeight:700 }}>🔴 {Math.abs(diff)}d atraso</span>
                        if (diff === 0) return <span style={{ color:'#c0534e', fontWeight:700 }}>🔴 Vence hoy</span>
                        if (diff <= 3) return <span style={{ color:'#c09a4c', fontWeight:600 }}>⚠️ {diff}d</span>
                        return <span style={{ color:'#4caf82' }}>✅ {new Date(p.fecha_proximo_pago).toLocaleDateString('es-PA')}</span>
                      })()}
                    </td>
                    <td style={{ color:'#9a8668' }}>{p.promotor?.nombre||'—'}</td>
                    <td onClick={e=>e.stopPropagation()}>
                      <span style={{ fontSize:'9px', fontWeight:600, padding:'3px 8px', borderRadius:'20px', color:cfg.color, background:cfg.bg, whiteSpace:'nowrap' }}>
                        {cfg.paso>0 && <span style={{ marginRight:'3px' }}>{'●'.repeat(cfg.paso)}{'○'.repeat(Math.max(0,3-cfg.paso))}</span>}
                        {cfg.label}
                      </span>
                    </td>
                    <td onClick={e=>e.stopPropagation()}>
                      <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                        {puedeAprobar(p) && <button onClick={()=>aprobar(p)} style={{ background:'rgba(76,175,130,.1)', color:'#4caf82', border:'1px solid rgba(76,175,130,.25)', borderRadius:'6px', padding:'3px 8px', fontSize:'10px', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>✓ Aprobar</button>}
                        {puedeDesembolsar(p) && <button onClick={()=>{setSelected(p);setDesembolsoTasa(String(p.tasa_interes||10));setDesembolsoTipo(p.tipo_desembolso||tipos[0]);setModal('desembolso')}} style={{ background:'linear-gradient(135deg,#c9a84c,#e2c27d)', color:'#0c0c0c', border:'none', borderRadius:'6px', padding:'3px 8px', fontSize:'10px', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>💸 Desembolsar</button>}
                        {puedeRechazar(p) && <button onClick={()=>rechazar(p.id)} style={{ background:'rgba(192,83,78,.08)', color:'#c0534e', border:'1px solid rgba(192,83,78,.2)', borderRadius:'6px', padding:'3px 7px', fontSize:'10px', cursor:'pointer' }}>✗</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL VER DETALLE */}
      {modal==='ver' && selected && (
        <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setModal(null)}}>
          <div className="modal-box">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }} className="modal-title">
              <div>
                <div>{selected.cliente?.nombre}</div>
                <div style={{ fontSize:'11px', color:'#9a8668', fontWeight:400, marginTop:'2px' }}>
                  {(() => { const cfg=ESTADO_CFG[selected.estado]||ESTADO_CFG.pendiente; return <span style={{ color:cfg.color }}>{cfg.label}</span> })()}
                </div>
              </div>
              <button onClick={()=>setModal(null)} style={{ background:'none', border:'1px solid #333', color:'#9a8668', cursor:'pointer', width:'26px', height:'26px', borderRadius:'6px', flexShrink:0 }}>✕</button>
            </div>

            {/* Flujo visual */}
            <div style={{ display:'flex', alignItems:'center', gap:'4px', marginBottom:'16px', overflowX:'auto', paddingBottom:'4px' }}>
              {[
                { est:'pendiente', label:'Solicitud', paso:1 },
                { est:'aprobado', label:'Aprobado', paso:2 },
                { est:'activo', label:'Desembolsado', paso:3 },
              ].map((s,i)=>{
                const cfg = ESTADO_CFG[s.est]
                const actual = ESTADO_CFG[selected.estado]?.paso||0
                const activo = actual >= s.paso
                const esCancelado = selected.estado==='cancelado'
                return (
                  <div key={s.est} style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                    {i>0 && <div style={{ width:'20px', height:'2px', background:activo&&!esCancelado?cfg.color:'#252525', flexShrink:0 }}/>}
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'3px', flexShrink:0 }}>
                      <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:activo&&!esCancelado?cfg.color:'#1a1a1a', border:`2px solid ${activo&&!esCancelado?cfg.color:'#252525'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', color:activo&&!esCancelado?'#0c0c0c':'#524438' }}>{s.paso}</div>
                      <div style={{ fontSize:'9px', color:activo&&!esCancelado?cfg.color:'#524438', textAlign:'center', whiteSpace:'nowrap' }}>{s.label}</div>
                    </div>
                  </div>
                )
              })}
              {selected.estado==='cancelado' && <div style={{ marginLeft:'8px', fontSize:'11px', color:'#c0534e' }}>✗ Cancelado</div>}
            </div>

            <div className="grid-2" style={{ marginBottom:'12px' }}>
              {[
                { l:'Monto original', v:`${fmtM(selected.monto_original, agencia?.moneda_principal)}`, c:'#e2c27d' },
                { l:'Saldo capital', v:`${fmtM(selected.saldo_capital, agencia?.moneda_principal)}`, c:'#4caf82' },
                { l:'Tasa interés', v:`${selected.tasa_interes}%`, c:'#9a8668' },
                { l:'Comisión', v:`${(selected.comision_porcentaje||0).toFixed(1)}% → $${(selected.comision_promotor||0).toFixed(2)}`, c:'#c09a4c' },
                { l:'Periodicidad', v:PER_LABEL[String(selected.periodicidad_dias)]||`${selected.periodicidad_dias}d`, c:'#9a8668' },
                { l:'Tipo desembolso', v:selected.tipo_desembolso||'—', c:'#5a8fc0' },
              ].map(m=>(
                <div key={m.l} style={{ background:'#1a1a1a', borderRadius:'8px', padding:'10px' }}>
                  <div style={{ fontSize:'9px', color:'#524438', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:'3px' }}>{m.l}</div>
                  <div style={{ fontSize:'14px', fontWeight:'700', color:m.c }}>{m.v}</div>
                </div>
              ))}
            </div>

            {selected.fecha_primer_pago && (
              <div style={{ background:'rgba(90,143,192,.07)', border:'1px solid rgba(90,143,192,.2)', borderRadius:'8px', padding:'10px', fontSize:'12px', color:'#5a8fc0', marginBottom:'12px' }}>
                📅 Primer pago: <strong>{selected.fecha_primer_pago}</strong> · Próximo: <strong>{selected.fecha_proximo_pago||'—'}</strong>
              </div>
            )}

            {selected.notas && <div style={{ background:'#1a1a1a', borderRadius:'8px', padding:'10px', fontSize:'12px', color:'#9a8668', marginBottom:'12px' }}>📝 {selected.notas}</div>}

            {/* Campo monto editable al aprobar */}
            {puedeAprobar(selected) && (
              <div style={{ background:'rgba(201,168,76,.06)', border:'1px solid rgba(201,168,76,.15)', borderRadius:'8px', padding:'12px', marginBottom:'10px' }}>
                <div style={{ fontSize:'10px', color:'#9a8668', marginBottom:'6px' }}>💡 Puedes ajustar el monto antes de aprobar (opcional)</div>
                <input style={{ width:'100%', background:'#191919', border:'1px solid #2a2a2a', borderRadius:'8px', padding:'8px 12px', color:'#f0ebe0', fontSize:'14px', outline:'none', fontFamily:'inherit' }}
                  type="number" step="0.01" placeholder={`Monto original: $${Number(selected.monto_original||0).toFixed(2)}`}
                  value={montoAprobado} onChange={e=>setMontoAprobado(e.target.value)} />
              </div>
            )}

            {/* Acciones */}
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              {puedeAprobar(selected) && (
                <button onClick={()=>aprobar(selected)} style={{ background:'rgba(76,175,130,.1)', color:'#4caf82', border:'1px solid rgba(76,175,130,.3)', borderRadius:'8px', padding:'9px 14px', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>✓ Aprobar solicitud</button>
              )}
              {puedeDesembolsar(selected) && (
                <button onClick={()=>setModal('desembolso')} className="btn-gold">💸 Desembolsar</button>
              )}
              {puedeRechazar(selected) && (
                <button onClick={()=>rechazar(selected.id)} className="btn-danger">✗ Rechazar</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL NUEVA SOLICITUD */}
      {modal==='nuevo' && (
        <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setModal(null)}}>
          <div className="modal-box" style={{ maxWidth:'520px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }} className="modal-title">
              <span>+ Nueva Solicitud de Préstamo</span>
              <button onClick={()=>setModal(null)} style={{ background:'none', border:'1px solid #333', color:'#9a8668', cursor:'pointer', width:'26px', height:'26px', borderRadius:'6px' }}>✕</button>
            </div>

            <div style={{ display:'grid', gap:'10px', marginBottom:'12px' }}>
              <div>
                <label style={lbl}>Cliente * ({clientes.length} disponibles)</label>
                <select style={sel_s} value={form.cliente_id} onChange={async e=>{
                  const cid = e.target.value; setForm(f=>({...f,cliente_id:cid}))
                  if (!cid) return
                  const { data: mora } = await supabase.from('prestamos').select('id').eq('cliente_id', cid).eq('estado','mora').limit(1)
                  if (mora && mora.length>0) setError('⚠️ ALERTA: Este cliente tiene préstamos en MORA. No se puede reacreditar.')
                  else setError('')
                }}>
                  <option value="">Seleccionar cliente...</option>
                  {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                {clientes.length===0 && <div style={{ fontSize:'11px', color:'#c0534e', marginTop:'4px' }}>⚠ No tienes clientes asignados. Crea un cliente primero.</div>}
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                <div>
                  <label style={lbl}>Monto solicitado *</label>
                  <input style={inp} type="number" step="0.01" min="0.01" placeholder="0.00" value={form.monto_original} onChange={e=>setForm(f=>({...f,monto_original:e.target.value}))} />
                </div>
                <div>
                  <label style={lbl}>Tasa interés % <span style={{ color:'#c09a4c', fontSize:'9px' }}>— Solo el Admin puede modificarla al desembolsar</span></label>
                  <input style={{ ...inp, background:'#161616', color:'#524438', cursor:'not-allowed' }} type="number" value={form.tasa_interes} readOnly />
                </div>
                <div>
                  <label style={lbl}>Comisión % <span style={{ color:'#524438', fontSize:'9px' }}>— igual que la tasa de interés, pero es ganancia del usuario</span></label>
                  <input style={inp} type="text" inputMode="decimal" value={form.comision_porc} onChange={e=>setForm(f=>({...f,comision_porc:e.target.value.replace(/[^0-9.]/g,'')}))} placeholder="Ej: 5" />
                </div>
                <div>
                  <label style={lbl}>Periodicidad de pago</label>
                  <select style={sel_s} value={form.periodicidad_dias} onChange={e=>setForm(f=>({...f,periodicidad_dias:e.target.value}))}>
                    <option value="1">Diaria</option>
                    <option value="7">Semanal</option>
                    <option value="15">Quincenal</option>
                    <option value="30">Mensual</option>
                  </select>
                </div>
                <div style={{ gridColumn:'span 2' }}>
                  <label style={lbl}>Tipo de dispersión</label>
                  <select style={sel_s} value={form.tipo_desembolso} onChange={e=>setForm(f=>({...f,tipo_desembolso:e.target.value}))}>
                    {tipos.map((t:string)=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Preview cálculo */}
              {form.monto_original && parseFloat(form.monto_original)>0 && (
                <div style={{ background:'#1a1a1a', border:'1px solid #252525', borderRadius:'8px', padding:'12px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
                  {[
                    { l:'Monto solicitado', v:`$${parseFloat(form.monto_original).toFixed(2)}`, c:'#e2c27d' },
                    { l:`Interés (${form.tasa_interes}% x período)`, v:`$${calcInteres().toFixed(2)}`, c:'#4caf82' },
                    { l:`Comisión ${form.comision_porc}%`, v:`$${calcComision().toFixed(2)}`, c:'#c09a4c' },
                  ].map(m=>(
                    <div key={m.l} style={{ textAlign:'center' }}>
                      <div style={{ fontSize:'9px', color:'#524438', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:'3px' }}>{m.l}</div>
                      <div style={{ fontSize:'15px', fontWeight:'700', color:m.c, fontFamily:'monospace' }}>{m.v}</div>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label style={lbl}>Observaciones</label>
                <textarea style={{ ...inp, height:'55px', resize:'none' as const }} value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} placeholder="Notas adicionales..." />
              </div>
            </div>

            {error && <div className="alert-error" style={{ marginBottom:'12px' }}>{error}</div>}
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button className="btn-ghost" onClick={()=>setModal(null)}>Cancelar</button>
              <button className="btn-gold" onClick={guardar} disabled={saving||error.includes('MORA')||!form.cliente_id}>
                {saving?'Enviando...':'Enviar Solicitud'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DESEMBOLSO */}
      {modal==='desembolso' && selected && (
        <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setModal('ver')}} style={{ zIndex:210 }}>
          <div className="modal-box">
            <div className="modal-title">💸 Confirmar Desembolso</div>
            <div style={{ background:'#1a1a1a', borderRadius:'10px', padding:'14px', marginBottom:'14px', textAlign:'center' }}>
              <div style={{ fontSize:'12px', color:'#524438', marginBottom:'4px' }}>{selected.cliente?.nombre}</div>
              <div style={{ fontSize:'26px', fontWeight:'700', color:'#e2c27d', fontFamily:'monospace' }}>${fmtM(selected.monto_original, agencia?.moneda_principal)}</div>
            </div>
            <div style={{ display:'grid', gap:'10px', marginBottom:'14px' }}>
              <div>
                <label style={lbl}>Tasa interés final % (Admin puede modificar)</label>
                <input style={inp} type="number" step="0.5" value={desembolsoTasa} onChange={e=>setDesembolsoTasa(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Tipo de desembolso</label>
                <select style={sel_s} value={desembolsoTipo} onChange={e=>{setDesembolsoTipo(e.target.value); if(e.target.value!=='Mixto') setDesembolsoMixto([{tipo:e.target.value,monto:String(selected.monto_aprobado||selected.monto_original)}])}}>
                  {tipos.map((t:string)=><option key={t} value={t}>{t}</option>)}
                  <option value="Mixto">🔀 Mixto (varios tipos)</option>
                </select>
              </div>
              {desembolsoTipo==='Mixto' && (
                <div>
                  <label style={lbl}>Detalle del desembolso mixto</label>
                  {desembolsoMixto.map((d,i)=>(
                    <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:'6px', marginBottom:'6px' }}>
                      <select style={sel_s} value={d.tipo} onChange={e=>setDesembolsoMixto(prev=>prev.map((x,j)=>j===i?{...x,tipo:e.target.value}:x))}>
                        {tipos.map((t:string)=><option key={t} value={t}>{t}</option>)}
                      </select>
                      <input style={lbl_inp} type="number" step="0.01" placeholder="0.00" value={d.monto} onChange={e=>setDesembolsoMixto(prev=>prev.map((x,j)=>j===i?{...x,monto:e.target.value}:x))} />
                      {i>0 && <button onClick={()=>setDesembolsoMixto(prev=>prev.filter((_,j)=>j!==i))} style={{ background:'rgba(192,83,78,.1)', border:'1px solid rgba(192,83,78,.2)', color:'#c0534e', borderRadius:'6px', padding:'0 8px', cursor:'pointer' }}>✕</button>}
                    </div>
                  ))}
                  <button onClick={()=>setDesembolsoMixto(prev=>[...prev,{tipo:tipos[0]||'Efectivo',monto:''}])} style={{ background:'none', border:'1px solid #333', color:'#c9a84c', borderRadius:'6px', padding:'5px 10px', fontSize:'11px', cursor:'pointer', fontFamily:'inherit' }}>+ Agregar tipo</button>
                  <div style={{ fontSize:'11px', color:'#9a8668', marginTop:'6px' }}>Total: ${desembolsoMixto.reduce((s,d)=>s+parseFloat(d.monto||'0'),0).toFixed(2)} / Monto: ${(selected.monto_aprobado||selected.monto_original)?.toFixed(2)}</div>
                </div>
              )}
            </div>
            <div>
              <label style={lbl}>Imagen de comprobante (opcional)</label>
              <input type="file" accept="image/*" onChange={e=>{
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = ev => setImagenDesembolso(ev.target?.result as string)
                reader.readAsDataURL(file)
              }} style={{ width:'100%', background:'#191919', border:'1px solid #2a2a2a', borderRadius:'8px', padding:'8px 10px', color:'#9a8668', fontSize:'12px' }} />
              {imagenDesembolso && <div style={{ marginTop:'6px', fontSize:'11px', color:'#4caf82' }}>✓ Imagen cargada</div>}
            </div>
            <div className="alert-warn" style={{ marginBottom:'14px' }}>⚠ Al confirmar, el cliente quedará como <strong>Activo</strong> y se calculará el primer pago.</div>
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button className="btn-ghost" onClick={()=>setModal('ver')}>Cancelar</button>
              <button className="btn-gold" onClick={desembolsar} disabled={saving}>{saving?'Procesando...':'✓ Confirmar Desembolso'}</button>
            </div>
          </div>
        </div>
      )}
      {/* Toast comisión guardada */}
      {comisionGuardada && (
        <div style={{ position:'fixed', bottom:'80px', left:'50%', transform:'translateX(-50%)', background:'#1a2e1a', border:'1px solid rgba(76,175,130,.4)', borderRadius:'10px', padding:'10px 18px', fontSize:'12px', color:'#4caf82', zIndex:300, display:'flex', alignItems:'center', gap:'8px', boxShadow:'0 4px 20px rgba(0,0,0,.5)', whiteSpace:'nowrap' }}>
          ✅ Comisión actualizada correctamente
        </div>
      )}
    </div>
  )
}