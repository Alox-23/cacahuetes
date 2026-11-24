import { t } from '../i18n'
import type { PeanutRunStrings } from './peanut-run/index.js'

/** Spanish UI texts for the engine, from es.json. */
export function gameStrings(): PeanutRunStrings {
  return {
    title: t('game.title'),
    startHint: t('game.startHint'),
    paused: t('game.paused'),
    pausedHint: t('game.pausedHint'),
    caught: t('game.caught'),
    score: t('game.score'),
    best: t('game.best'),
    newHigh: t('game.newHigh'),
    playAgain: t('game.playAgain'),
    yes: t('game.yes'),
    no: t('game.no'),
    thanks: t('game.thanks'),
    finalScore: (n) => t('game.finalScore', { n }),
    play: t('game.play'),
    ariaLabel: t('game.ariaLabel'),
    mute: t('game.mute'),
    unmute: t('game.unmute'),
    soundOn: t('game.soundOn'),
    soundOff: t('game.soundOff'),
  }
}
