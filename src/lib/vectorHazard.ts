/**
 * 公式区域ポリゴン × Point-in-Polygon によるハザード判定枠。
 *
 * 現状:
 * - エンジン（PiP）は実装済み
 * - 国土数値情報 A31（洪水浸水想定）等の全国GeoJSONは容量が大きく未バンドル
 * - レイヤーを登録すればラスタ判定と併記できる
 *
 * ラスタを置き換えるのではなく、Data Confidence 向上のための第二手法として使う。
 */

import { pointInGeoJsonGeometry, type GeoJsonPolygonGeometry } from './pip'

export type VectorHazardLayerId = 'flood' | 'sediment'

export type VectorHazardFeature = {
  id: string
  layer: VectorHazardLayerId
  label: string
  geometry: GeoJsonPolygonGeometry
  properties?: Record<string, string | number | null>
  source: string
  referenceDate?: string
}

export type VectorPipHit = {
  layer: VectorHazardLayerId
  inZone: boolean
  featureId: string | null
  featureLabel: string | null
  detail: string
  method: 'vector-pip'
  methodConfidence: 'high' | 'medium' | 'low'
  source: string
}

export type VectorHazardAssessment = {
  status: 'evaluated' | 'no_layers' | 'partial'
  flood: VectorPipHit | null
  sediment: VectorPipHit | null
  note: string
}

/** 実行時に差し込む公式/加工済みポリゴン。初期は空（未ロード）。 */
const registry: VectorHazardFeature[] = []

export function registerVectorHazardFeatures(features: VectorHazardFeature[]) {
  registry.push(...features)
}

export function clearVectorHazardRegistry() {
  registry.length = 0
}

export function listVectorHazardFeatures(): readonly VectorHazardFeature[] {
  return registry
}

function assessLayer(layer: VectorHazardLayerId, lon: number, lat: number): VectorPipHit | null {
  const feats = registry.filter((f) => f.layer === layer)
  if (!feats.length) return null
  for (const f of feats) {
    if (pointInGeoJsonGeometry(lon, lat, f.geometry)) {
      return {
        layer,
        inZone: true,
        featureId: f.id,
        featureLabel: f.label,
        detail: `ベクターPiP: 区域内（${f.label}）`,
        method: 'vector-pip',
        methodConfidence: 'high',
        source: f.source,
      }
    }
  }
  return {
    layer,
    inZone: false,
    featureId: null,
    featureLabel: null,
    detail: `ベクターPiP: 登録ポリゴン ${feats.length}件の範囲外`,
    method: 'vector-pip',
    methodConfidence: 'high',
    source: feats[0].source,
  }
}

export function assessVectorHazards(lat: number, lon: number): VectorHazardAssessment {
  const flood = assessLayer('flood', lon, lat)
  const sediment = assessLayer('sediment', lon, lat)
  if (!flood && !sediment) {
    return {
      status: 'no_layers',
      flood: null,
      sediment: null,
      note:
        '公式ベクター未ロード。洪水は国土数値情報A31等のGeoJSONを登録するとPiP判定できます。現在はラスタ判定が主です。',
    }
  }
  return {
    status: flood && sediment ? 'evaluated' : 'partial',
    flood,
    sediment,
    note: '登録済みポリゴンに対するPoint-in-Polygon結果です（ラスタ推定より境界が明確）。',
  }
}
