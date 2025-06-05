# Firecrawl Competitive Analysis

## Architecture Highlights

### 1. Multi-Engine System
- **11 different engines** with quality scoring (1000 = cache, 50 = browser, 5 = fetch)
- **Feature flag system** determines which engines support which features
- **Automatic fallback** with priority-based selection

### 2. Performance Optimizations
- **Rust shared library** for link extraction (`libhtml_transformer.so`)
- **Go shared library** for HTML→Markdown conversion (`html-to-markdown.so`)
- **10x faster** than pure JavaScript for critical operations

### 3. Advanced URL Discovery
- **Recursive sitemap parsing** (handles sitemap indexes)
- **Smart subdomain discovery** (tries main domain sitemaps)
- **Redis-based deduplication** with 1-hour expiration
- **20+ sitemap limit** with circuit breakers

### 4. Content Quality Assessment
```typescript
const qualityFactors = {
  isLongEnough: markdown.length > 0,
  isGoodStatusCode: (status >= 200 && status < 300) || status === 304,
  hasNoPageError: error === undefined,
  isLikelyProxyError: [403, 429].includes(status)
}
```

### 5. Sophisticated Error Handling
- **12+ custom error types** (TimeoutError, EngineError, SiteError, etc.)
- **Retry logic** with different strategies per error type
- **Sentry integration** for unexpected errors

## Implementation Roadmap for Docspasta

### Phase 1: Quick Wins (This Week)
1. **Enhanced sitemap discovery** - try multiple locations
2. **Robots.txt compliance** - respect crawl delays and disallow rules
3. **URL deduplication** - use Redis SADD pattern instead of in-memory Set
4. **Content quality scoring** - assess if scraped content is "good enough"

### Phase 2: Architecture Improvements (Next Month)
1. **Engine fallback system** - try cache → playwright → fetch in order
2. **Feature flag system** - engines declare what they support
3. **Smart caching** - cache by content fingerprint, not just URL
4. **Advanced error handling** - custom error types and retry strategies

### Phase 3: Performance Layer (Future)
1. **Rust shared library** for HTML parsing and link extraction
2. **Go HTML→Markdown converter** for 10x faster processing
3. **Distributed Redis cluster** for enterprise-scale deduplication

## Key Patterns to Emulate

### URL Processing
```typescript
// Firecrawl normalizes URLs at Redis level
const normalizedUrl = url.replace(/^https?:\/\//, "").replace(/^www\./, "");
await redis.sadd(`sitemap:${jobId}:links`, normalizedUrl);
await redis.expire(`sitemap:${jobId}:links`, 3600, "NX");
```

### Engine Selection
```typescript
// Priority-based engine selection with feature support
const prioritySum = featureFlags.reduce((a, x) => a + featureFlagOptions[x].priority, 0);
const priorityThreshold = Math.floor(prioritySum / 2);
const selectedEngines = engines.filter(engine => 
  engine.supportScore >= priorityThreshold
).sort((a, b) => 
  b.supportScore - a.supportScore || 
  engineOptions[b.engine].quality - engineOptions[a.engine].quality
);
```

### Content Processing Pipeline
```typescript
// Structured transformer pipeline
document = await executeTransformers(meta, document);
// Includes: LLM extraction, format conversion, validation, etc.
```

## Competitive Advantages We Can Build

1. **Specialized Documentation Intelligence** - Focus on docs-specific optimizations
2. **LLM-Native Output Format** - Optimize markdown specifically for LLM consumption  
3. **Real-time Streaming** - Progressive results vs batch processing
4. **Pasta-themed UX** - Fun, approachable interface vs enterprise complexity
5. **Integrated Token Counting** - Built-in LLM context optimization

## Performance Benchmarks to Target

- **Sitemap discovery**: Sub-5 second for most sites
- **Content extraction**: <2 seconds per page
- **Cache hit rate**: >80% for popular documentation sites
- **Deduplication accuracy**: >99% with content fingerprinting

This analysis shows Firecrawl is incredibly sophisticated - our opportunity is to build a **docs-specialized**, **LLM-native** alternative that's simpler to use but equally powerful under the hood.