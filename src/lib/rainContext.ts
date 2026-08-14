/**
 * 近傍の直近雨量コンテキスト（浸水証明ではない）。
 * Open-Meteo（無キー）の地点グリッド推定を使う。気象庁アメダス公式点そのものではない。
 */

export type RainContext = {
  precipMm72h: number | null
  maxHourlyMm: number | null
  source: string
  fetchedAt: string
  failed: boolean
  note: string
  valueType: 'estimate'
}

export async function fetchRainContext(lat: number, lon: number): Promise<RainContext> {
  const fetchedAt = new Date().toISOString()
  const note =
    '近傍グリッドの直近約72時間累積雨量（参考）。この地点の浸水有無・過去浸水実績は示さない。'
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&hourly=precipitation&past_days=3&forecast_days=1&timezone=Asia%2FTokyo`
    const res = await fetch(url)
    if (!res.ok) {
      return {
        precipMm72h: null,
        maxHourlyMm: null,
        source: 'Open-Meteo',
        fetchedAt,
        failed: true,
        note,
        valueType: 'estimate',
      }
    }
    const data = (await res.json()) as {
      hourly?: { time?: string[]; precipitation?: Array<number | null> }
    }
    const times = data.hourly?.time ?? []
    const precip = data.hourly?.precipitation ?? []
    const now = Date.now()
    const windowMs = 72 * 60 * 60 * 1000
    let sum = 0
    let maxH = 0
    let count = 0
    for (let i = 0; i < times.length; i++) {
      const t = Date.parse(times[i])
      if (!Number.isFinite(t)) continue
      if (t > now || now - t > windowMs) continue
      const v = Number(precip[i] ?? 0)
      if (!Number.isFinite(v)) continue
      sum += v
      maxH = Math.max(maxH, v)
      count++
    }
    if (count === 0) {
      return {
        precipMm72h: null,
        maxHourlyMm: null,
        source: 'Open-Meteo',
        fetchedAt,
        failed: true,
        note,
        valueType: 'estimate',
      }
    }
    return {
      precipMm72h: Math.round(sum * 10) / 10,
      maxHourlyMm: Math.round(maxH * 10) / 10,
      source: 'Open-Meteo forecast/archive grid（無キー）',
      fetchedAt,
      failed: false,
      note,
      valueType: 'estimate',
    }
  } catch {
    return {
      precipMm72h: null,
      maxHourlyMm: null,
      source: 'Open-Meteo',
      fetchedAt,
      failed: true,
      note,
      valueType: 'estimate',
    }
  }
}
