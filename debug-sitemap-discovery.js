#!/usr/bin/env node

/**
 * Debug script to investigate sitemap discovery and URL filtering issues
 * for lovable.dev and tailwindcss.com
 */

import fetch from 'node-fetch';
import { parseStringPromise } from 'xml2js';

// Mock implementations of the utility functions
function isValidDocumentationUrl(url) {
  try {
    const urlObj = new URL(url);

    const skipPaths = [
      '/assets/',
      '/images/',
      '/img/',
      '/css/',
      '/js/',
      '/fonts/',
      '/static/',
      '/media/',
    ];
    if (skipPaths.some((path) => urlObj.pathname.toLowerCase().includes(path))) {
      return false;
    }

    const skipExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico',
      '.css', '.js', '.map', '.mp4', '.webm', '.mp3',
      '.wav', '.ttf', '.woff', '.woff2', '.eot',
      '.pdf', '.zip', '.tar',
    ];
    if (skipExtensions.some((ext) => urlObj.pathname.toLowerCase().endsWith(ext))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function normalizeUrl(href, baseUrl, followExternalLinks = false) {
  try {
    const url = new URL(href, baseUrl);
    const baseUrlObj = new URL(baseUrl);

    // Remove trailing slash
    let normalized = url.href.replace(/\/$/, '');
    
    // Strip fragments
    normalized = normalized.split('#')[0];

    // Handle external links
    if (!followExternalLinks && url.origin !== baseUrlObj.origin) {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}

/**
 * Fetch and parse a single sitemap
 */
async function fetchSitemap(sitemapUrl) {
  try {
    console.log(`\n🔍 Fetching sitemap: ${sitemapUrl}`);
    
    const response = await fetch(sitemapUrl, {
      headers: {
        'User-Agent': 'DocspastaCrawler/1.0 (+https://docspasta.ai/crawler)'
      },
    });
    
    if (!response.ok) {
      console.log(`❌ HTTP ${response.status}: ${response.statusText}`);
      return { urls: [], childSitemaps: [] };
    }
    
    const xmlContent = await response.text();
    console.log(`📄 XML content length: ${xmlContent.length} chars`);
    
    // Log first 500 chars of XML for debugging
    console.log(`📝 XML preview:\n${xmlContent.substring(0, 500)}${xmlContent.length > 500 ? '...' : ''}`);
    
    const parsed = await parseStringPromise(xmlContent);
    
    const urls = [];
    const childSitemaps = [];
    
    // Handle sitemap index files
    if (parsed.sitemapindex?.sitemap) {
      console.log(`📋 Found sitemap index with ${parsed.sitemapindex.sitemap.length} sitemaps`);
      for (const sitemap of parsed.sitemapindex.sitemap) {
        if (sitemap.loc?.[0]) {
          const childUrl = sitemap.loc[0].trim();
          console.log(`  🔗 Child sitemap: ${childUrl}`);
          childSitemaps.push(childUrl);
        }
      }
    }
    
    // Handle regular sitemaps
    if (parsed.urlset?.url) {
      console.log(`📊 Found urlset with ${parsed.urlset.url.length} URLs`);
      let validCount = 0;
      let filteredCount = 0;
      
      for (const urlEntry of parsed.urlset.url) {
        if (urlEntry.loc?.[0]) {
          const url = urlEntry.loc[0].trim();
          
          console.log(`\n  🌐 Checking URL: ${url}`);
          
          if (isValidDocumentationUrl(url)) {
            urls.push(url);
            validCount++;
            console.log(`    ✅ Valid documentation URL`);
          } else {
            filteredCount++;
            console.log(`    ❌ Filtered out (not valid documentation URL)`);
          }
        }
      }
      
      console.log(`\n📈 Summary: ${validCount} valid, ${filteredCount} filtered`);
    }
    
    return { urls, childSitemaps };
    
  } catch (error) {
    console.log(`❌ Failed to fetch sitemap ${sitemapUrl}:`, error.message);
    return { urls: [], childSitemaps: [] };
  }
}

/**
 * Discover sitemap URLs for a domain
 */
async function discoverSitemapUrls(baseUrl) {
  const urlObj = new URL(baseUrl);
  const origin = urlObj.origin;
  const hostname = urlObj.hostname;
  
  console.log(`\n🔍 Discovering sitemaps for: ${origin}`);
  
  const potentialSitemaps = new Set();
  
  // Common sitemap locations
  const commonLocations = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemaps.xml`,
    `${origin}/sitemap/sitemap.xml`,
    `${origin}/sitemaps/sitemap.xml`,
    `${origin}/xml/sitemap.xml`,
    `${origin}/wp-sitemap.xml`,
    `${origin}/sitemap-index.xml`,
  ];
  
  commonLocations.forEach(url => potentialSitemaps.add(url));
  
  console.log(`📋 Potential sitemap locations: ${Array.from(potentialSitemaps).length}`);
  for (const sitemap of potentialSitemaps) {
    console.log(`  📄 ${sitemap}`);
  }
  
  return Array.from(potentialSitemaps);
}

/**
 * Recursively crawl sitemaps
 */
async function crawlSitemaps(baseUrl, maxDepth = 3, maxUrls = 1000) {
  console.log(`\n🚀 Starting sitemap crawl for: ${baseUrl}`);
  console.log(`📊 Limits: maxDepth=${maxDepth}, maxUrls=${maxUrls}`);
  
  const allUrls = new Set();
  const visitedSitemaps = new Set();
  const discoveredSitemaps = [];
  
  // Discover initial sitemap URLs
  const initialSitemaps = await discoverSitemapUrls(baseUrl);
  
  async function processSitemaps(sitemapUrls, depth) {
    console.log(`\n🔄 Processing ${sitemapUrls.length} sitemaps at depth ${depth}`);
    
    if (depth > maxDepth || allUrls.size >= maxUrls) {
      console.log(`⏹️  Stopping: depth=${depth}/${maxDepth}, urls=${allUrls.size}/${maxUrls}`);
      return;
    }
    
    for (const sitemapUrl of sitemapUrls) {
      if (visitedSitemaps.has(sitemapUrl) || allUrls.size >= maxUrls) {
        console.log(`⏭️  Skipping ${sitemapUrl} (already visited or limit reached)`);
        continue;
      }
      
      visitedSitemaps.add(sitemapUrl);
      discoveredSitemaps.push(sitemapUrl);
      
      const { urls, childSitemaps } = await fetchSitemap(sitemapUrl);
      
      // Add URLs (up to limit)
      console.log(`\n➕ Adding ${urls.length} URLs from ${sitemapUrl}`);
      for (const url of urls) {
        if (allUrls.size >= maxUrls) {
          console.log(`⏹️  URL limit reached: ${maxUrls}`);
          break;
        }
        allUrls.add(url);
        console.log(`  ✅ Added: ${url}`);
      }
      
      console.log(`📊 Total URLs collected so far: ${allUrls.size}`);
      
      // Process child sitemaps recursively
      if (childSitemaps.length > 0 && depth < maxDepth) {
        console.log(`🔗 Found ${childSitemaps.length} child sitemaps, processing recursively...`);
        await processSitemaps(childSitemaps, depth + 1);
      }
    }
  }
  
  // Start processing
  await processSitemaps(initialSitemaps, 1);
  
  const finalUrls = Array.from(allUrls).slice(0, maxUrls);
  
  console.log(`\n🎉 Sitemap crawl completed!`);
  console.log(`📊 Final results:`);
  console.log(`  - Sitemaps visited: ${visitedSitemaps.size}`);
  console.log(`  - Total URLs found: ${finalUrls.length}`);
  
  return {
    urls: finalUrls,
    source: finalUrls.length > 0 ? 'sitemap' : 'discovery',
    discoveredSitemaps
  };
}

/**
 * Test URL filtering against real URLs
 */
function testUrlFiltering(urls, baseUrl) {
  console.log(`\n🧪 Testing URL filtering for ${urls.length} URLs:`);
  
  const validUrls = [];
  const filteredUrls = [];
  
  for (const url of urls) {
    console.log(`\n🔍 Testing: ${url}`);
    
    // Test isValidDocumentationUrl
    const isValid = isValidDocumentationUrl(url);
    console.log(`  📝 isValidDocumentationUrl: ${isValid}`);
    
    // Test external link filtering
    const urlObj = new URL(url);
    const baseUrlObj = new URL(baseUrl);
    const isSameOrigin = urlObj.origin === baseUrlObj.origin;
    console.log(`  🌐 Same origin: ${isSameOrigin} (${urlObj.origin} vs ${baseUrlObj.origin})`);
    
    if (isValid && isSameOrigin) {
      validUrls.push(url);
      console.log(`  ✅ PASSED all filters`);
    } else {
      filteredUrls.push(url);
      console.log(`  ❌ FILTERED OUT`);
    }
  }
  
  console.log(`\n📊 Filtering results:`);
  console.log(`  ✅ Valid URLs: ${validUrls.length}`);
  console.log(`  ❌ Filtered URLs: ${filteredUrls.length}`);
  
  return { validUrls, filteredUrls };
}

/**
 * Main debug function
 */
async function main() {
  const testDomains = [
    'https://docs.lovable.dev',
    'https://tailwindcss.com'
  ];
  
  for (const domain of testDomains) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🎯 DEBUGGING: ${domain}`);
    console.log(`${'='.repeat(80)}`);
    
    try {
      // Test sitemap discovery
      const result = await crawlSitemaps(domain, 3, 50);
      
      console.log(`\n📋 FINAL SUMMARY for ${domain}:`);
      console.log(`  🗺️  Source: ${result.source}`);
      console.log(`  📊 URLs found: ${result.urls.length}`);
      console.log(`  🔗 Sitemaps discovered: ${result.discoveredSitemaps.length}`);
      
      if (result.urls.length > 0) {
        console.log(`\n📄 Sample URLs found:`);
        result.urls.slice(0, 10).forEach((url, i) => {
          console.log(`  ${i + 1}. ${url}`);
        });
        
        if (result.urls.length > 10) {
          console.log(`  ... and ${result.urls.length - 10} more`);
        }
      }
      
      // Test URL filtering on the discovered URLs
      if (result.urls.length > 0) {
        const filterResults = testUrlFiltering(result.urls.slice(0, 5), domain);
        console.log(`\n🔬 URL Filtering Test Results:`);
        console.log(`  - ${filterResults.validUrls.length} URLs passed filtering`);
        console.log(`  - ${filterResults.filteredUrls.length} URLs were filtered out`);
      }
      
    } catch (error) {
      console.error(`❌ Error debugging ${domain}:`, error);
    }
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🏁 DEBUG COMPLETE`);
  console.log(`${'='.repeat(80)}`);
}

// Run the debug script
main().catch(console.error);