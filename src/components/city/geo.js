import { geoArea } from 'd3-geo'

/**
 * Census / TIGERweb GeoJSON follows RFC 7946 (counter-clockwise exterior rings); d3-geo expects the
 * opposite and would treat each tract as "the whole globe minus the tract". Rewind such features.
 */
export function rewindFeature(f) {
  if (!f?.geometry || geoArea(f) <= 2 * Math.PI) return f
  const rev = (rings) => rings.map((r) => [...r].reverse())
  const g = f.geometry
  if (g.type === 'Polygon') return { ...f, geometry: { ...g, coordinates: rev(g.coordinates) } }
  if (g.type === 'MultiPolygon') return { ...f, geometry: { ...g, coordinates: g.coordinates.map(rev) } }
  return f
}

export function rewindCollection(fc) {
  if (!fc?.features) return { type: 'FeatureCollection', features: [] }
  return { ...fc, features: fc.features.map(rewindFeature).filter((f) => f?.geometry) }
}
