import { vi } from 'vitest'

/**
 * Mock EventSource for testing SSE functionality
 * Provides control over event dispatching and connection state
 */
export class MockEventSource {
  url: string
  readyState: number
  listeners: Record<string, Array<(event: any) => void>>
  CONNECTING = 0
  OPEN = 1
  CLOSED = 2

  constructor(url: string) {
    this.url = url
    this.readyState = this.CONNECTING
    this.listeners = {}
    
    // Simulate connection opening after a tick
    setTimeout(() => {
      this.readyState = this.OPEN
      this.dispatchEvent({ type: 'open' })
    }, 0)
  }

  addEventListener(type: string, listener: (event: any) => void) {
    if (!this.listeners[type]) {
      this.listeners[type] = []
    }
    this.listeners[type].push(listener)
  }

  removeEventListener(type: string, listener: (event: any) => void) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter(l => l !== listener)
    }
  }

  close() {
    this.readyState = this.CLOSED
    this.dispatchEvent({ type: 'close' })
  }

  // Test utility to simulate server events
  dispatchEvent(event: any) {
    const listeners = this.listeners[event.type]
    if (listeners) {
      listeners.forEach(listener => {
        // For message events, wrap data in JSON if it's an object
        if (event.type !== 'open' && event.type !== 'close' && event.type !== 'error') {
          const messageEvent = {
            type: event.type,
            data: typeof event.data === 'string' ? event.data : JSON.stringify(event.data),
            lastEventId: event.lastEventId || ''
          }
          listener(messageEvent)
        } else {
          listener(event)
        }
      })
    }
  }

  // Helper to simulate SSE messages
  simulateMessage(eventType: string, data: any, eventId?: string) {
    this.dispatchEvent({
      type: eventType,
      data,
      lastEventId: eventId
    })
  }
}

// Set up global mock
vi.stubGlobal('EventSource', MockEventSource)

// Export for use in tests
export const getLastMockEventSource = () => {
  const instances = (MockEventSource as any).instances || []
  return instances[instances.length - 1]
}

// Track instances for testing
const OriginalMockEventSource = MockEventSource
const TrackedMockEventSource = class extends OriginalMockEventSource {
  static instances: MockEventSource[] = []
  
  constructor(url: string) {
    super(url)
    TrackedMockEventSource.instances.push(this)
  }
}

vi.stubGlobal('EventSource', TrackedMockEventSource)