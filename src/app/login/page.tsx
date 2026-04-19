'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [recordar, setRecordar] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('app_remember')
      if (saved) {
        const { u, p } = JSON.parse(saved)
        setUsername(u || '')
        setPassword(p || '')
        setRecordar(true)
      } else {
        // Sin recordarme guardado → limpiar campos explícitamente
        setUsername('')
        setPassword('')
        setRecordar(false)
      }
    } catch {
      setUsername('')
      setPassword('')
    }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const clean = username.replace('@', '').trim().toLowerCase()
    // Usuarios nuevos usan @app.local, usuarios legacy usan @gmail.com
    const emailLocal = clean.includes('@') ? clean : `${clean}@app.local`
    const emailLegacy = clean.includes('@') ? clean : `${clean}@gmail.com`

    if (recordar) {
      localStorage.setItem('app_remember', JSON.stringify({ u: username, p: password }))
    } else {
      localStorage.removeItem('app_remember')
    }

    try {
      // Intentar @app.local primero, luego @gmail.com como fallback
      let res = await supabase.auth.signInWithPassword({ email: emailLocal, password })
      if (res.error) {
        res = await supabase.auth.signInWithPassword({ email: emailLegacy, password })
      }
      const { data, error: authError } = res

      if (authError || !data?.user) {
        setError('Usuario o contraseña incorrectos')
        return
      }

      router.push('/dashboard')
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  function toggleRecordar() {
    const nuevo = !recordar
    setRecordar(nuevo)
    if (!nuevo) {
      localStorage.removeItem('app_remember')
      setUsername('')
      setPassword('')
    }
  }

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        .app-title {
          font-size: clamp(52px, 12vw, 80px);
          font-weight: 900;
          letter-spacing: 16px;
          background: linear-gradient(90deg,
            #7a5010, #c9a84c, #fff3c4, #e2c27d,
            #c9a84c, #fff3c4, #8a6010);
          background-size: 250% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 3.5s linear infinite;
          margin: 0; line-height: 1;
        }
        .login-wrap {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(ellipse 110% 55% at 50% 0%,
              rgba(201,168,76,0.12), transparent 65%),
            #090909;
          padding: 20px;
          box-sizing: border-box;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .login-card {
          width: 100%;
          max-width: 400px;
          background: #111111;
          border: 1px solid #282828;
          border-radius: 22px;
          padding: 46px 42px;
          box-shadow: 0 32px 80px rgba(0,0,0,0.7),
            0 0 0 1px rgba(201,168,76,0.07);
        }
        .lbl {
          display: block;
          font-size: 10px;
          font-weight: 600;
          color: #7a6a5a;
          text-transform: uppercase;
          letter-spacing: 1.3px;
          margin-bottom: 7px;
        }
        .inp {
          width: 100%;
          background: #191919;
          border: 1px solid #2a2a2a;
          border-radius: 10px;
          padding: 12px 14px;
          color: #f5f0e8;
          font-size: 14px;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.2s;
          font-family: inherit;
        }
        .inp:focus { border-color: #c9a84c; }
        .btn-login {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #b8922a, #e8cc7a, #c9a84c);
          color: #0c0c0c;
          border: none;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          letter-spacing: 0.5px;
          transition: opacity 0.15s, transform 0.15s;
          font-family: inherit;
        }
        .btn-login:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        .btn-login:disabled { opacity: 0.45; cursor: not-allowed; }
        .chk {
          width: 18px; height: 18px;
          border-radius: 5px;
          border: 1.5px solid #3a3a3a;
          background: #191919;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
          flex-shrink: 0;
        }
        .chk.on {
          background: linear-gradient(135deg, #c9a84c, #e2c27d);
          border-color: #c9a84c;
        }
        @media (max-width: 480px) {
          .login-card { padding: 34px 24px !important; }
        }
      `}</style>

      <div className="login-wrap">
        <div className="login-card">

          <div style={{ textAlign: 'center', marginBottom: '38px' }}>
            <h1 className="app-title">APP</h1>
            <p style={{ fontSize: '12px', color: '#5a5048', marginTop: '10px', letterSpacing: '0.4px' }}>
              Administrador de Préstamos Personales
            </p>
          </div>

          <form onSubmit={handleLogin}>

            <div style={{ marginBottom: '16px' }}>
              <label className="lbl">Usuario</label>
              <input
                className="inp"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="jcwhite"
                required
                autoComplete="off" name="usr" spellCheck={false}
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label className="lbl">Contraseña</label>
              <div style={{ position:'relative' }}>
                <input
                  className="inp"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="off" name="pwd"
                  style={{ paddingRight:'42px', width:'100%' }}
                />
                <button type="button" onClick={()=>setShowPass(!showPass)}
                  style={{ position:'absolute', right:'12px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9a8668', fontSize:'18px', padding:'0', lineHeight:'1' }}>
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer', userSelect: 'none' }}
                onClick={toggleRecordar}>
                <div className={`chk${recordar ? ' on' : ''}`}>
                  {recordar && (
                    <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                      <path d="M1 4L4 7.5L10 1" stroke="#0c0c0c" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span style={{ fontSize: '13px', color: '#8a7a6a' }}>Recordarme</span>
              </label>

              <button type="button"
                style={{ background: 'none', border: 'none', color: '#c9a84c', fontSize: '12px', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                ¿Olvidó su contraseña?
              </button>
            </div>

            {error && (
              <div style={{ background: 'rgba(192,83,78,0.10)', border: '1px solid rgba(192,83,78,0.22)', borderRadius: '8px', padding: '10px 14px', color: '#d06460', fontSize: '13px', marginBottom: '16px' }}>
                ⚠ {error}
              </div>
            )}

            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? 'Verificando...' : 'Iniciar Sesión →'}
            </button>

          </form>
        </div>
      </div>
    </>
  )
}
