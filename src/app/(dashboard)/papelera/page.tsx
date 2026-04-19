'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function PapeleraPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'clientes'|'prestamos'>('clientes')
  const [clientes, setClientes] = useState<any[]>([])
  const [prestamos, setPrestamos] = useState<any[]>([])
  const [perfil, setPerfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      supabase.from('usuarios').select('id,rol,agencia_id').eq('id', session.user.id).single()
        .then(({ data: p }) => { setPerfil(p); load(p) })
    })
  }, [])

  async function load(p: any) {
    setLoading(true)
    const { data: c } = await supabase.from('clientes').select('id,nombre,telefono,created_at,deleted_at').not('deleted_at','is',null).eq('agencia_id', p.agencia_id).order('deleted_at', { ascending:false })
    setClientes(c||[])
    const { data: pr } = await supabase.from('prestamos').select('id,estado,monto_original,cliente_id,created_at').eq('estado','cancelado').eq('agencia_id', p.agencia_id).order('created_at', { ascending:false })
    setPrestamos(pr||[])
    setLoading(false)
  }

  async function restaurarCliente(id: string) {
    await supabase.from('clientes').update({ deleted_at:null }).eq('id', id)
    load(perfil)
  }

  async function eliminarClienteDefinitivo(id: string) {
    if (!confirm('¿Eliminar PERMANENTEMENTE? No se puede deshacer.')) return
    await supabase.from('clientes').delete().eq('id', id)
    load(perfil)
  }

  async function vaciarPapelera() {
    if (!confirm('¿Vaciar la papelera? Esto eliminará PERMANENTEMENTE todos los registros.')) return
    const ids = clientes.map(c=>c.id)
    if (ids.length > 0) await supabase.from('clientes').delete().in('id', ids)
    load(perfil)
  }

  const total = clientes.length + prestamos.length

  return (
    <div className="page">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px', flexWrap:'wrap', gap:'10px' }}>
        <div>
          <h1 style={{ fontSize:'20px', fontWeight:'700', color:'#f0ebe0', margin:'0 0 2px' }}>🗑️ Papelera</h1>
          <p style={{ fontSize:'11px', color:'#9a8668', margin:0 }}>{total} elementos eliminados</p>
        </div>
        {clientes.length > 0 && (
          <button className="btn-danger" onClick={vaciarPapelera} style={{ fontSize:'12px', padding:'8px 14px' }}>
            🗑️ Vaciar papelera
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:'6px', marginBottom:'14px' }}>
        {[{k:'clientes',l:`👥 Clientes (${clientes.length})`},{k:'prestamos',l:`💳 Cancelados (${prestamos.length})`}].map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k as any)}
            style={{ background:tab===t.k?'rgba(201,168,76,.1)':'#141414', border:`1px solid ${tab===t.k?'rgba(201,168,76,.3)':'#252525'}`, color:tab===t.k?'#e2c27d':'#9a8668', borderRadius:'8px', padding:'7px 14px', fontSize:'12px', cursor:'pointer', fontFamily:'inherit' }}>
            {t.l}
          </button>
        ))}
      </div>

      {loading ? <div style={{ padding:'20px', textAlign:'center', color:'#524438' }}>Cargando...</div> : (
        <>
          {tab==='clientes' && (
            <div className="card" style={{ overflow:'hidden' }}>
              {clientes.length===0 ? <div style={{ padding:'30px', textAlign:'center', color:'#524438' }}>Sin clientes eliminados</div> : (
                <table className="data-table">
                  <thead><tr>{['Nombre','Teléfono','Eliminado el','Acciones'].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {clientes.map(c=>(
                      <tr key={c.id}>
                        <td style={{ color:'#f0ebe0', fontWeight:500 }}>{c.nombre}</td>
                        <td style={{ color:'#9a8668', fontFamily:'monospace' }}>{c.telefono||'—'}</td>
                        <td style={{ color:'#524438', fontFamily:'monospace' }}>{new Date(c.deleted_at).toLocaleDateString('es-PA')}</td>
                        <td>
                          <div style={{ display:'flex', gap:'5px' }}>
                            <button className="btn-ghost" style={{ fontSize:'11px', padding:'4px 9px', color:'#4caf82', borderColor:'rgba(76,175,130,.3)' }} onClick={()=>restaurarCliente(c.id)}>↩ Restaurar</button>
                            <button className="btn-danger" style={{ fontSize:'11px', padding:'4px 9px' }} onClick={()=>eliminarClienteDefinitivo(c.id)}>✗ Eliminar</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab==='prestamos' && (
            <div className="card" style={{ overflow:'hidden' }}>
              {prestamos.length===0 ? <div style={{ padding:'30px', textAlign:'center', color:'#524438' }}>Sin préstamos cancelados</div> : (
                <table className="data-table">
                  <thead><tr>{['Monto','Estado','Fecha',''].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {prestamos.map(p=>(
                      <tr key={p.id}>
                        <td style={{ fontFamily:'monospace', color:'#e2c27d' }}>${p.monto_original?.toLocaleString()}</td>
                        <td><span className="badge badge-red">Cancelado</span></td>
                        <td style={{ color:'#524438', fontFamily:'monospace' }}>{new Date(p.created_at).toLocaleDateString('es-PA')}</td>
                        <td style={{ color:'#524438', fontSize:'11px' }}>Los préstamos cancelados no se pueden restaurar</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
