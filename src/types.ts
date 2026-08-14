import type { MunicipalityProfile } from './data/municipalities'
import type { GeocodeQuality } from './lib/geocodePrecision'
import type { TransitStop } from './lib/geo'
import type { ZoneAssessment } from './lib/hazardZones'
import type { InvariantIssue } from './lib/invariants'
import type { LegalGateResult } from './lib/legalGate'
import type { RainContext } from './lib/rainContext'
import type { HazardLevel } from './lib/risk'
import type { VectorHazardAssessment } from './lib/vectorHazard'

export type Candidate = {
  id: string
  name: string
  address: string
  purchaseManYen: number
  lat: number
  lon: number
  /** ジオコード精度ゲート（町域代表点なら地点評価は参考扱い） */
  geocode: GeocodeQuality
  /** 法務・地区計画ゲート（ハザードより優先表示） */
  legal: LegalGateResult
  elevationM: number | null
  /** 国土地理院標高APIの hsrc（DEM種別） */
  elevationHsrc: string | null
  /** 損害側ティア（区域該当から選定したシナリオ。物理最大損害ではない） */
  hazardLevel: HazardLevel
  /** 発生側: 公式ハザード区域の機械判定（ラスタ） */
  zones: ZoneAssessment
  /** 発生側: ベクターPiP（レイヤー登録時のみ評価） */
  vectorHazards: VectorHazardAssessment
  /** 近傍の直近雨量（参考。浸水証明ではない） */
  rain: RainContext
  municipality: MunicipalityProfile
  /** 公開前整合性エラー（あれば UI で警告） */
  invariantIssues: InvariantIssue[]
  stations: TransitStop[]
  buses: TransitStop[]
  transitFetchFailed: boolean
  stationName: string | null
  stationWalkMin: number | null
  busName: string | null
  busWalkMin: number | null
  createdAt: number
}

export type SortKey =
  | 'lossImpact'
  | 'stationWalk'
  | 'hazard'
  | 'aging'
  | 'purchase'
