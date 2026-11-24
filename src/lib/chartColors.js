const GOLDEN_ANGLE = 137.50776405003785
const START_HUE = 222

export function getChartColor(index) {
  const position = Number.isFinite(index) ? Math.max(0, Math.trunc(index)) : 0
  const hue = (START_HUE + position * GOLDEN_ANGLE) % 360
  return `hsl(${hue.toFixed(5)} 58% 44%)`
}
