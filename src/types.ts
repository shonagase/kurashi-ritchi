import type { MunicipalityProfile } from './data/municipalities'
import type { TransitStop } from './lib/geo'
import type { ZoneAssessment } from './lib/hazardZones'
import type { HazardLevel } from './lib/risk'

export type Candidate = {
  id: string
  name: string
  address: string
  purchaseManYen: number
  lat: number
  lon: number
  elevationM: number | null
  /** 国土地理院標高APIの hsrc（DEM種別） */
  elevationHsrc: string | null
  /** 損害側ティア（区域該当から選定したシナリオ。物理最大損害ではない） */
  hazardLevel: HazardLevel
  /** 発生側: 公式ハザード区域の機械判定 */
  zones: ZoneAssessment
  municipality: MunicipalityProfile
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
