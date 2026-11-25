/* Fills each stop's map and detail fields from its place (local-llm's enrichedStops): the stop value wins, the place fills gaps. */
import type { Place, Stop } from '../contract/types'

export function enrichStops(stops: readonly Stop[], places: Readonly<Record<string, Place | undefined>>): Stop[] {
  return stops.map((stop) => {
    const p = places[stop.placeId]
    return {
      ...stop,
      lat: stop.lat ?? p?.lat,
      lon: stop.lon ?? p?.lon,
      photo: stop.photo ?? p?.photo,
      hours: stop.hours ?? p?.hours,
      price: stop.price ?? p?.price,
      rating: stop.rating ?? p?.rating,
      reviewsCount: stop.reviewsCount ?? p?.reviewsCount,
      address: stop.address ?? p?.address,
      googleMapsUrl: stop.googleMapsUrl ?? p?.googleMapsUrl,
    }
  })
}
