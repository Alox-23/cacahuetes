import { describe, expect, it } from 'vitest'
import type { Place, Stop } from '../contract/types'
import { enrichStops } from './enrichStops'

function stop(partial: Partial<Stop> & { order: number; placeId: string }): Stop {
  return { name: `Parada ${partial.order}`, arrive: '10:00', visitMinutes: 30, locked: false, ...partial }
}

const place: Place = {
  id: 'p1',
  name: 'Mirador',
  categories: ['view'],
  lat: 36.51,
  lon: -4.88,
  photo: '/places/p1.jpg',
  hours: '9:00-18:00',
  price: 'Gratis',
  rating: 4.6,
  reviewsCount: 120,
  address: 'Calle Mayor 1',
  googleMapsUrl: 'https://maps.google.com/?q=p1',
  partner: true,
  partnerPerk: '10% dto.',
}

describe('enrichStops', () => {
  it('fills missing stop fields from the place', () => {
    const [s] = enrichStops([stop({ order: 1, placeId: 'p1' })], { p1: place })
    expect(s).toMatchObject({
      order: 1,
      placeId: 'p1',
      name: 'Parada 1',
      lat: 36.51,
      lon: -4.88,
      photo: '/places/p1.jpg',
      hours: '9:00-18:00',
      price: 'Gratis',
      rating: 4.6,
      reviewsCount: 120,
      address: 'Calle Mayor 1',
      googleMapsUrl: 'https://maps.google.com/?q=p1',
    })
  })

  it('keeps the stop value when both have one, including zero', () => {
    const [s] = enrichStops([stop({ order: 1, placeId: 'p1', lat: 1, lon: 0, rating: 0, price: '5 €', photo: '/x.jpg' })], { p1: place })
    expect(s.lat).toBe(1)
    expect(s.lon).toBe(0)
    expect(s.rating).toBe(0)
    expect(s.price).toBe('5 €')
    expect(s.photo).toBe('/x.jpg')
    expect(s.hours).toBe('9:00-18:00')
  })

  it('only copies the listed fields (partner data stays on the place)', () => {
    const [s] = enrichStops([stop({ order: 1, placeId: 'p1' })], { p1: place })
    expect(s.partner).toBeUndefined()
    expect(s.partnerPerk).toBeUndefined()
  })

  it('leaves stops whose place is not loaded unchanged and keeps order', () => {
    const stops = [stop({ order: 1, placeId: 'missing', lat: 2 }), stop({ order: 2, placeId: 'p1' })]
    const out = enrichStops(stops, { p1: place })
    expect(out.map((s) => s.order)).toEqual([1, 2])
    expect(out[0]).toMatchObject({ lat: 2, lon: undefined, photo: undefined })
    expect(out[1].lat).toBe(36.51)
  })

  it('does not mutate the input', () => {
    const stops = [stop({ order: 1, placeId: 'p1' })]
    enrichStops(stops, { p1: place })
    expect(stops[0].lat).toBeUndefined()
  })
})
