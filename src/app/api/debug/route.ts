import { NextResponse } from 'next/server';
import { memoryStore } from '@/lib/storage/memory-store';

export async function GET(): Promise<NextResponse> {
  try {
    // Test memory store
    const testId = 'test_123';
    const testData = {
      id: testId,
      url: 'https://test.com',
      status: 'completed' as const,
      createdAt: new Date().toISOString(),
      markdown: 'Test markdown content'
    };
    
    // Store test data
    memoryStore.setCrawl(testId, testData);
    
    // Retrieve it
    const retrieved = memoryStore.getCrawl(testId);
    
    // Get all crawls
    const allCrawls = memoryStore.getAllCrawls();
    
    return NextResponse.json({
      success: true,
      data: {
        testStored: !!retrieved,
        testData: retrieved,
        allCrawlsCount: allCrawls.length,
        allCrawls: allCrawls.slice(0, 5) // Show first 5
      }
    });
    
  } catch (error) {
    console.error('Debug API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}