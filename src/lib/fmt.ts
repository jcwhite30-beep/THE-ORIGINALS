// Monedas que no usan decimales
const SIN_DECIMALES = ['COP','CLP','PYG','VES','IDR','HUF','JPY']

const SIMBOLOS: Record<string,string> = {
  USD:'$', PAB:'B/.', EUR:'€', COP:'$', MXN:'$', GBP:'£',
  BRL:'R$', ARS:'$', CRC:'₡', GTQ:'Q', HNL:'L', DOP:'RD$'
}

// fmtM: devuelve SOLO el número formateado SIN símbolo
// Usar como: $${fmtM(valor, moneda)} o getSimbolo(moneda)+fmtM(valor, moneda)
export function fmtM(v: number | null | undefined, moneda?: string): string {
  const n = Number(v || 0)
  const m = moneda || 'USD'
  
  if (SIN_DECIMALES.includes(m)) {
    return Math.round(n).toLocaleString('es-CO')
  }
  return n.toFixed(2)
}

export function getSimbolo(moneda?: string): string {
  return SIMBOLOS[moneda || 'USD'] || '$'
}

export function sinDecimales(moneda?: string): boolean {
  return SIN_DECIMALES.includes(moneda || 'USD')
}

// fmtFull: devuelve símbolo + número (equivalente al antiguo fmtM)
export function fmtFull(v: number | null | undefined, moneda?: string): string {
  return getSimbolo(moneda) + fmtM(v, moneda)
}
