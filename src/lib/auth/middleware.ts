import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'


export interface User {
  id: string
  isAnonymous: boolean
}

// Get or create anonymous user cookie
export async function getOrCreateAnonUser(): Promise<string> {
  // In test environment, return a test user ID
  if (process.env.NODE_ENV === 'test') {
    return 'test_user_' + (process.env.TEST_USER_ID || 'default')
  }
  
  const cookieStore = await cookies()
  let userId = cookieStore.get('anon-user-id')?.value
  
  if (!userId) {
    // Create new anonymous user ID
    userId = `anon-${crypto.randomUUID()}`
    
    // Set cookie with long expiration
    cookieStore.set('anon-user-id', userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/'
    })
  }
  
  return userId
}

// Get authenticated user from session/auth provider
export async function getAuthenticatedUser(request: NextRequest): Promise<string | null> {
  // In test environment, check for test auth header
  if (process.env.NODE_ENV === 'test') {
    const testAuth = request.headers.get('x-test-auth')
    if (testAuth) {
      return testAuth
    }
  }
  
  // TODO: Implement real authentication check here
  // For now, check if there's an auth-token cookie (would come from real auth)
  try {
    const cookieStore = await cookies()
    const authToken = cookieStore.get('auth-token')?.value
    
    if (authToken) {
      // In real implementation, validate token and return user ID
      // For now, just return the token as user ID
      return authToken
    }
  } catch (error) {
    // In test environment, cookies might not be available
    if (process.env.NODE_ENV === 'test') {
      return null
    }
    throw error
  }
  
  return null
}

// Get current user - either authenticated or anonymous
export async function getCurrentUser(request: NextRequest): Promise<User> {
  // First check for authenticated user
  const authUserId = await getAuthenticatedUser(request)
  
  if (authUserId) {
    return {
      id: authUserId,
      isAnonymous: false
    }
  }
  
  // Fall back to anonymous user (create if needed)
  const anonUserId = await getOrCreateAnonUser()
  
  return {
    id: anonUserId,
    isAnonymous: true
  }
}

// Simplified interface for getting user context in API routes
export interface UserContext {
  userId: string
  isAnonymous: boolean
}

export async function getUserContext(request: NextRequest): Promise<UserContext> {
  const user = await getCurrentUser(request)
  return {
    userId: user.id,
    isAnonymous: user.isAnonymous
  }
}