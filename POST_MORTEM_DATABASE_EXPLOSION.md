# Post-Mortem: Database Explosion Incident

**Date**: December 6, 2025  
**Incident**: Catastrophic database size explosion (1.5GB, 4.5M duplicate URLs)  
**Severity**: P0 - Critical system failure  
**Status**: Under Investigation & Remediation  

## Executive Summary

A critical bug in the URL deduplication system caused exponential database growth, resulting in a 1.5GB database with 4.5 million duplicate URL entries from just 3 crawl jobs. The root cause was missing deduplication logic in the serverless crawler architecture, leading to N² URL insertion without any uniqueness constraints.

## Timeline

- **June 3, 2025**: V3 serverless architecture implemented
- **December 6, 2025**: Database explosion discovered
- **Impact Duration**: ~6 months of uncontrolled growth
- **Detection**: Manual database size check revealed 1,529MB usage

## Impact Assessment

### Quantified Damage
- **Database Size**: 1,529MB (expected: ~10MB)
- **Table `job_urls_v3`**: 4,498,508 rows
- **Duplication Factor**: 13,000+ identical URLs per entry
- **Example**: `https://docs.lovable.dev/` stored 13,992 times
- **Storage Cost**: ~150x normal expected usage

### Root Cause Analysis

**Primary Cause**: Missing URL deduplication in `src/lib/serverless/processor.ts:61`

```typescript
// BROKEN CODE - No deduplication check
if (result.links && result.links.length > 0) {
  await this.queueManager.addUrlsToQueue(jobId, result.links, url)
}
```

**Contributing Factors**:
1. No uniqueness constraints in database schema
2. No maxPages enforcement 
3. No depth limit checking
4. No run caps or cleanup policies
5. Dual-purpose table design (`job_urls_v3` as both queue and history)

### Failure Cascade
1. User starts crawl of `docs.lovable.dev`
2. Page A discovers links to Pages B, C, D → All inserted
3. Page B discovers links to Pages A, C, D → All re-inserted (duplicates)
4. Page C discovers links to Pages A, B, D → All re-inserted (more duplicates)
5. Exponential growth continues indefinitely without limits

## Technical Analysis

### Schema Design Flaw
The `job_urls_v3` table served dual purposes:
- **Work Queue**: URLs to be processed
- **Historical Log**: Record of all discovered URLs

This conflation prevented efficient deduplication and caused massive bloat.

### Missing Architecture Components
1. **URL Deduplication Cache**: No mechanism to prevent re-insertion
2. **Atomic Queue Operations**: No `SKIP LOCKED` for concurrent processing
3. **Job-Level Limits**: No enforcement of `maxPages` or `maxDepth`
4. **Circuit Breakers**: No automatic stops for runaway crawls
5. **Observability**: No metrics to detect the explosion early

## Lessons Learned

### What Went Wrong
1. **No Deduplication**: Failed to implement basic URL uniqueness
2. **Lack of Limits**: No bounds on crawl scope
3. **Poor Observability**: Database explosion went undetected for months
4. **Schema Design**: Dual-purpose table created architectural complexity

### What Went Right
1. **Quick Detection**: Once checked, issue was immediately obvious
2. **Clear Root Cause**: Bug location and fix path are well-defined
3. **No Production Impact**: Development environment only
4. **Architecture Foundation**: Core streaming/SSE system remains sound

## Remediation Plan

### Phase 1: Nuclear Cleanup (Immediate)
- ✅ **Stop the Bleeding**: Disable cron processing
- 🎯 **Database Reset**: DROP and recreate tables (no backward compatibility needed)
- 🎯 **Schema Redesign**: Implement proper dual-table architecture

### Phase 2: Architecture Fix (1-2 days)
- 🎯 **Separation of Concerns**: Split into `job_queue` and `visited_urls` tables
- 🎯 **Atomic Deduplication**: Use `INSERT ON CONFLICT` patterns
- 🎯 **Proper Limits**: Enforce `maxPages`, `maxDepth`, run caps
- 🎯 **URL Hashing**: SHA-256 for efficient uniqueness checking

### Phase 3: Resilience (3-5 days)
- 🎯 **Circuit Breakers**: Automatic runaway detection
- 🎯 **Observability**: Metrics, alarms, structured logging
- 🎯 **Testing**: Comprehensive deduplication test suite

## Prevention Measures

### Immediate Safeguards
1. **Unique Constraints**: Database-level uniqueness enforcement
2. **Job-Level Limits**: Hard caps on URL count per job
3. **Processing Timeouts**: Maximum crawl duration limits
4. **Size Monitoring**: Automated database size alerts

### Long-term Improvements
1. **Comprehensive Testing**: URL deduplication test scenarios
2. **Load Testing**: Validate behavior under heavy crawling
3. **Monitoring Dashboard**: Real-time crawl metrics visibility
4. **Regular Audits**: Periodic database size and health checks

## Action Items

### Responsible Party: Engineering Team
- [ ] Implement dual-table schema design
- [ ] Add comprehensive deduplication logic
- [ ] Create URL normalization and hashing system
- [ ] Implement job-level limit enforcement
- [ ] Add circuit breaker patterns
- [ ] Create monitoring and alerting
- [ ] Write deduplication test suite

### Success Metrics
- Database size remains under 50MB for typical crawls
- Zero duplicate URLs in queue after deduplication
- Crawls respect maxPages limits 100% of the time
- Real-time metrics visibility for all crawl jobs

## Conclusion

This incident represents a classic architectural oversight - missing fundamental uniqueness constraints in a distributed system. While the impact was severe (150x database bloat), the isolated development environment and clear fix path minimize long-term damage. 

The remediation plan focuses on simplicity and robustness: nuclear cleanup followed by proper architectural foundations. The core streaming/SSE system remains intact, requiring only the URL processing logic to be rebuilt with proper deduplication.

**Key Takeaway**: In distributed systems, always implement uniqueness constraints at the database level, not just application level. Race conditions and logic errors will eventually bypass application-level checks.