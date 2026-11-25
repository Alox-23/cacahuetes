import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouteMap } from './RouteMap'

// Leaflet detects SVG support when it loads; jsdom lacks createSVGRect, so declare it first.
vi.hoisted(() => {
  Object.assign(SVGSVGElement.prototype, { createSVGRect: () => ({}) })
})

const GEO = [
  { order: 1, name: 'Plaza de los Naranjos', lat: 36.51075, lon: -4.88625, rating: 4.7, reviewsCount: 1234 },
  { order: 2, name: 'Alameda', lat: 36.5085, lon: -4.8848 },
  { order: 3, name: 'Paseo Marítimo', lat: 36.506, lon: -4.888 },
]

const pin = (order: number) => document.querySelector(`.leaflet-marker-icon[data-order="${order}"]`) as HTMLElement

describe('RouteMap', () => {
  it('without a sized container (jsdom) keeps the schematic SVG and its desktop links', () => {
    const onHighlight = vi.fn()
    const { container } = render(<RouteMap stops={GEO} variant="wide" label="Mapa de la ruta" highlighted={2} onHighlight={onHighlight} />)
    expect(screen.getByRole('img', { name: 'Mapa de la ruta' })).toBeInTheDocument()
    expect(container.querySelector('g[data-order="2"]')).toHaveAttribute('data-highlighted', 'true')
    fireEvent.mouseEnter(container.querySelector('g[data-order="3"]') as Element)
    expect(onHighlight).toHaveBeenCalledWith(3)
  })

  it('stops without coordinates and thumbnails stay schematic', () => {
    const { container, rerender } = render(<RouteMap stops={[{ order: 1 }, { order: 2 }]} variant="full" label="Mapa" />)
    expect(container.querySelector('.leaflet')).toBeNull()
    expect(screen.getByRole('img', { name: 'Mapa' })).toBeInTheDocument()
    rerender(<RouteMap stops={GEO} variant="thumb" />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  describe('with a sized container (Leaflet)', () => {
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600)
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    })
    afterEach(() => vi.restoreAllMocks())

    it('desktop: pins follow `highlighted` without being rebuilt, hover highlights, click selects', () => {
      const onHighlight = vi.fn()
      const onSelect = vi.fn()
      const props = { variant: 'wide' as const, label: 'Mapa de la ruta', onHighlight, onSelect }
      const { rerender } = render(<RouteMap {...props} stops={[...GEO]} highlighted={null} />)
      expect(screen.getByRole('region', { name: 'Mapa de la ruta' })).toBeInTheDocument()
      const second = pin(2)
      expect(second).not.toHaveAttribute('data-highlighted')

      rerender(<RouteMap {...props} stops={[...GEO]} highlighted={2} />)
      expect(pin(2)).toBe(second)
      expect(second).toHaveAttribute('data-highlighted', 'true')
      expect(pin(1)).not.toHaveAttribute('data-highlighted')

      fireEvent.mouseOver(pin(3))
      expect(onHighlight).toHaveBeenLastCalledWith(3)
      fireEvent.mouseOut(pin(3))
      expect(onHighlight).toHaveBeenLastCalledWith(null)
      fireEvent.click(pin(1))
      expect(onSelect).toHaveBeenCalledWith(1)
      expect(document.querySelector('.leaflet-popup')).toBeNull()
    })

    it('mobile: click opens the popup card with the link to the stop detail', () => {
      render(<RouteMap stops={GEO} variant="full" label="Mapa" routeId="r 1" />)
      fireEvent.click(pin(1))
      const popup = document.querySelector('.leaflet-popup') as HTMLElement
      expect(popup).toHaveTextContent('1. Plaza de los Naranjos')
      expect(popup).toHaveTextContent('★ 4.7 (1234 reseñas)'.replace('1234', (1234).toLocaleString('es-ES')))
      expect(popup.querySelector('a')).toHaveAttribute('href', '/route/r%201/stop/1')
    })

    it('skips stops without coordinates', () => {
      render(<RouteMap stops={[...GEO, { order: 4, name: 'Sin coordenadas' }]} variant="full" label="Mapa" />)
      expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(3)
    })
  })
})
