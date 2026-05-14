import { CspAlerter } from './csp.js'
import { StyleLoadingMonitor } from './loading.js'

declare global {
  interface Window {
    cspAlerter: CspAlerter
    styleLoadingMonitor: StyleLoadingMonitor
  }
}

window.cspAlerter = new CspAlerter()
window.styleLoadingMonitor = new StyleLoadingMonitor()
