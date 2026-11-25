/* Ruta content (Ruta.html / DeskAsistenteRuta.html). The mobile branch is dev's RoutePage markup unchanged. */
import { useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button, ChevronDownIcon, ChevronUpIcon, GripIcon, IconButton, Mascot, RouteMap, ShareIcon, Sheet, StopRow } from '../../components'
import type { Place, Preferences, Route } from '../../contract/types'
import { t, tDynamic } from '../../i18n'
import { cx } from '../../lib/cx'
import { enrichStops } from '../../lib/enrichStops'
import { QUICK_REFINES, type QuickRefine } from '../../lib/refineKeywords'
import { mapLabel, routeSubtitle, stopDetail } from '../../lib/routeText'
import { activityFor } from '../../pages/routeHooks'
import styles from './RouteView.module.css'
import desk from './RouteViewDesktop.module.css'

export type RouteViewProps = {
  route: Route
  places: Record<string, Place>
  preferences: Preferences | null
  busy: boolean
  onQuick: (value: QuickRefine) => void
  onUndo: () => void
  onSave: () => void
  onShare: () => void
  /** Mobile: the floating back control over the map. */
  mapOverlay?: ReactNode
}

type DesktopProps = RouteViewProps & {
  highlighted: number | null
  onHighlight: (order: number | null) => void
  onSelectStop: (order: number) => void
  /** Reorder (buttons + drag and drop); omitted when the data module cannot move stops. */
  onMove?: (order: number, to: number) => void
  /** Content laid over the stop list (stop detail slide-over). */
  overlay?: ReactNode
}

/** Map stops filled from their places (coordinates, photo, rating…); the stop lists keep using route.stops. */
function useMapStops(route: Route, places: Record<string, Place>) {
  return useMemo(() => enrichStops(route.stops, places), [route.stops, places])
}

function QuickButtons({ route, busy, onQuick, onUndo, className }: RouteViewProps & { className?: string }) {
  return (
    <div className={className} role="group" aria-label={t('route.quickTitle')}>
      {QUICK_REFINES.map((value) => (
        <button key={value} type="button" className={styles.quickButton} disabled={busy} onClick={() => onQuick(value)}>
          {tDynamic(`route.quick.${value}`)}
        </button>
      ))}
      {route.version > 1 && (
        <button type="button" className={styles.undo} disabled={busy} onClick={onUndo}>
          {t('common.undo')}
        </button>
      )}
    </div>
  )
}

/** Mobile (Ruta.html): map on top, sheet with quick changes, stops and the pinned actions. */
export function RouteViewMobile(props: RouteViewProps) {
  const { route, places, preferences, busy, onSave, onShare, mapOverlay } = props
  const mapStops = useMapStops(route, places)
  return (
    <>
      <div className={styles.mapArea}>
        <RouteMap stops={mapStops} variant="full" routeId={route.id} label={mapLabel(route.stops.length)} />
        {mapOverlay}
      </div>
      <Sheet className={styles.sheet}>
        <div className={styles.top}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{route.name}</h1>
            <p className={styles.subtitle}>{routeSubtitle(route, preferences)}</p>
          </div>
          <QuickButtons {...props} className={styles.quick} />
        </div>

        <ol className={styles.stops} aria-label={t('route.stopsLabel')}>
          {route.stops.map((stop, i) => (
            <li key={`${stop.order}-${stop.placeId}`}>
              <StopRow
                order={stop.order}
                name={stop.name}
                detail={stopDetail(stop, activityFor(places, stop.placeId))}
                time={stop.arrive}
                to={`/route/${route.id}/stop/${stop.order}`}
                linkState={{ depth: 1 }}
                last={i === route.stops.length - 1}
              />
            </li>
          ))}
        </ol>

        <div className={styles.bottom}>
          <Link to={`/route/${route.id}/change`} className={styles.ask}>
            <Mascot size={24} />
            {t('route.askChange')}
          </Link>
          <div className={styles.actions}>
            <Button className={styles.save} disabled={busy} onClick={onSave}>
              {route.saved ? t('routeScreen.saved') : t('routeScreen.save')}
            </Button>
            <IconButton label={t('routeScreen.share')} onClick={onShare}>
              <ShareIcon />
            </IconButton>
          </div>
        </div>
      </Sheet>
    </>
  )
}

/** Desktop panel (DeskAsistenteRuta.html): map on top, header row with share and save, linked stop list. */
export function RouteViewDesktop(props: DesktopProps) {
  const { route, places, preferences, busy, onSave, onShare, highlighted, onHighlight, onSelectStop, onMove, overlay } = props
  const [dragging, setDragging] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const count = route.stops.length
  const mapStops = useMapStops(route, places)

  function move(order: number, to: number) {
    if (!onMove || to < 1 || to > count || to === order) return
    const stop = route.stops.find((s) => s.order === order)
    onMove(order, to)
    if (stop) setAnnouncement(t('desktop.moved', { name: stop.name, position: to }))
  }

  function onDrop(event: DragEvent, to: number) {
    event.preventDefault()
    const from = Number(event.dataTransfer.getData('text/plain')) || dragging
    setDragging(null)
    if (from) move(from, to)
  }

  return (
    <div className={desk.view}>
      <RouteMap
        stops={mapStops}
        variant="wide"
        routeId={route.id}
        label={mapLabel(route.stops.length)}
        highlighted={highlighted}
        onHighlight={onHighlight}
        onSelect={onSelectStop}
      />
      <div className={desk.body}>
        <div className={desk.scroll}>
          <div className={desk.headRow}>
            <div className={desk.titles}>
              <h1 className={desk.title}>{route.name}</h1>
              <p className={desk.subtitle}>{routeSubtitle(route, preferences)}</p>
            </div>
            <div className={desk.headActions}>
              <Button variant="secondary" className={desk.medium} onClick={onShare}>
                {t('routeScreen.share')}
              </Button>
              <Button className={desk.medium} disabled={busy} onClick={onSave}>
                {route.saved ? t('routeScreen.saved') : t('routeScreen.save')}
              </Button>
            </div>
          </div>
          <QuickButtons {...props} className={desk.quick} />
          {onMove && (
            <p id={`reorder-${route.id}`} className="sr-only">
              {t('desktop.reorderHint')}
            </p>
          )}
          <ol className={desk.stops} aria-label={t('route.stopsLabel')} aria-describedby={onMove ? `reorder-${route.id}` : undefined}>
            {route.stops.map((stop, i) => (
              <li
                key={`${stop.order}-${stop.placeId}`}
                data-order={stop.order}
                className={cx(desk.row, highlighted === stop.order && desk.highlighted, dragging === stop.order && desk.dragging)}
                onMouseEnter={() => onHighlight(stop.order)}
                onMouseLeave={() => onHighlight(null)}
                onFocus={() => onHighlight(stop.order)}
                onBlur={() => onHighlight(null)}
                draggable={Boolean(onMove)}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', String(stop.order))
                  e.dataTransfer.effectAllowed = 'move'
                  setDragging(stop.order)
                }}
                onDragEnd={() => setDragging(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, stop.order)}
              >
                {onMove && <GripIcon className={desk.grip} />}
                <StopRow
                  className={desk.stopRow}
                  size="md"
                  order={stop.order}
                  name={stop.name}
                  detail={stopDetail(stop, activityFor(places, stop.placeId))}
                  time={stop.arrive}
                  to={`/route/${route.id}/stop/${stop.order}`}
                  last={i === route.stops.length - 1}
                />
                {onMove && (
                  <span className={desk.moveButtons}>
                    <button
                      type="button"
                      className={desk.move}
                      aria-label={t('desktop.moveUp', { name: stop.name })}
                      disabled={busy || stop.order === 1}
                      onClick={() => move(stop.order, stop.order - 1)}
                    >
                      <ChevronUpIcon />
                    </button>
                    <button
                      type="button"
                      className={desk.move}
                      aria-label={t('desktop.moveDown', { name: stop.name })}
                      disabled={busy || stop.order === count}
                      onClick={() => move(stop.order, stop.order + 1)}
                    >
                      <ChevronDownIcon />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>
        </div>
        {overlay}
      </div>
    </div>
  )
}
