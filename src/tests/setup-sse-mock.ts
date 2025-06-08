import { vi } from 'vitest';

// Create comprehensive EventSource mock
class MockEventSource {
  url: string;
  readyState: number = 0; // CONNECTING
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  
  private listeners: Map<string, Set<EventListener>> = new Map();

  constructor(url: string, eventSourceInitDict?: EventSourceInit) {
    this.url = url;
    console.log(`🔌 MockEventSource created for: ${url}`);
    
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = 1; // OPEN
      console.log(`✅ MockEventSource connected: ${url}`);
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 0);
  }

  addEventListener(type: string, listener: EventListener): void {
    console.log(`👂 Adding event listener for: ${type}`);
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    console.log(`🚫 Removing event listener for: ${type}`);
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    console.log(`🔌 MockEventSource closed: ${this.url}`);
    this.readyState = 2; // CLOSED
  }

  // Test utility to emit events
  emitEvent(type: string, data: any): void {
    console.log(`📨 Emitting ${type} event:`, data);
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    
    if (type === 'message' && this.onmessage) {
      this.onmessage(event);
    }
    
    this.listeners.get(type)?.forEach(listener => {
      listener(event);
    });
  }

  // Utility to simulate message events
  simulateMessage(data: any): void {
    this.emitEvent('message', data);
  }

  // Utility to simulate error
  simulateError(): void {
    console.log(`❌ Simulating error for: ${this.url}`);
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

// Create a spy on the MockEventSource constructor
const EventSourceSpy = vi.fn().mockImplementation((url: string, eventSourceInitDict?: EventSourceInit) => {
  return new MockEventSource(url, eventSourceInitDict);
});

// Mock EventSource globally
global.EventSource = EventSourceSpy as any;

// Export for test utilities
export { MockEventSource, EventSourceSpy };