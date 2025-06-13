/**
 * Setup for integration tests that need real EventSource
 */
import { EventSource } from 'eventsource'

// Polyfill EventSource for Node.js in integration tests
global.EventSource = EventSource as any