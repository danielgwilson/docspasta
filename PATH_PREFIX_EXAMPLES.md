# Path Prefix Filtering Examples

## How Path Prefix Filtering Works

When you start a crawl, the system will ONLY crawl URLs that start with the same path as your initial URL.

### Example 1: React Docs
**Initial URL**: `https://react.dev/learn/`

✅ **Will Crawl**:
- `https://react.dev/learn/thinking-in-react`
- `https://react.dev/learn/tutorial-tic-tac-toe`
- `https://react.dev/learn/state-and-lifecycle`

❌ **Will NOT Crawl**:
- `https://react.dev/reference/` (different path prefix)
- `https://react.dev/blog/` (different path prefix)
- `https://react.dev/` (parent path)

### Example 2: Tailwind Docs
**Initial URL**: `https://tailwindcss.com/docs/installation/`

✅ **Will Crawl**:
- `https://tailwindcss.com/docs/installation/using-postcss`
- `https://tailwindcss.com/docs/installation/framework-guides`
- `https://tailwindcss.com/docs/installation/play-cdn`

❌ **Will NOT Crawl**:
- `https://tailwindcss.com/docs/utility-first` (sibling path)
- `https://tailwindcss.com/blog/` (different section)
- `https://tailwindcss.com/` (home page)

### Example 3: Specific API Reference
**Initial URL**: `https://docs.stripe.com/api/customers/`

✅ **Will Crawl**:
- `https://docs.stripe.com/api/customers/create`
- `https://docs.stripe.com/api/customers/retrieve`
- `https://docs.stripe.com/api/customers/list`

❌ **Will NOT Crawl**:
- `https://docs.stripe.com/api/charges/` (different API section)
- `https://docs.stripe.com/webhooks/` (different docs section)
- `https://stripe.com/` (different subdomain)

## Benefits

1. **Focused Crawling**: Only get the specific documentation section you need
2. **Faster Results**: Don't waste time crawling unrelated pages
3. **Lower Costs**: Fewer pages = less processing time
4. **Better Quality**: More relevant content for your use case

## How to Use

Simply paste the URL of the specific docs section you want:

- Want ALL React docs? Use: `https://react.dev/`
- Want ONLY the Learn section? Use: `https://react.dev/learn/`
- Want ONLY the Hooks reference? Use: `https://react.dev/reference/react/hooks/`

The crawler will automatically stay within that path!