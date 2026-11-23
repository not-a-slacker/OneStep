/**
 * A once-a-second tick that keeps time in a background tab.
 *
 * Chrome throttles timers on the main thread of a hidden tab, and after about
 * five minutes hidden it runs them at most once a minute. A 25-minute focus
 * period left in a background tab could therefore finish, sound and notify up
 * to a minute late. Timers inside a dedicated Web Worker are not throttled that
 * way, so the interval runs there and only posts a message to the page.
 *
 * The timer still computes the remaining time from the wall clock on each tick,
 * so a late tick can never make it run long — this only makes it finish on time.
 */

const WORKER_SOURCE = `
let handle = null
onmessage = (event) => {
  clearInterval(handle)
  handle = event.data === 'start' ? setInterval(() => postMessage('tick'), 1000) : null
}
`

/** Starts ticking and returns a function that stops it. */
export function startTicker(onTick: () => void): () => void {
  try {
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }))
    const worker = new Worker(url)
    worker.onmessage = () => onTick()
    worker.postMessage('start')
    return () => {
      worker.terminate()
      URL.revokeObjectURL(url)
    }
  } catch {
    // No Worker support, or blocked by policy: fall back to a page timer.
    const handle = window.setInterval(onTick, 1000)
    return () => window.clearInterval(handle)
  }
}
