// Manual test for job persistence
// Run with: node manual-test-persistence.js

console.log(`
Manual Test Instructions for Job Persistence
===========================================

1. Start the development server:
   pnpm dev

2. Open browser to http://localhost:3000

3. Test persistence by:
   a. Start a crawl for any URL (e.g., https://docs.lovable.dev/)
   b. Wait for the crawl to show progress
   c. REFRESH THE PAGE (F5 or Cmd+R)
   d. Verify the job card reappears with the same progress/state

4. Test multiple jobs:
   a. Start 2-3 crawls for different URLs
   b. Refresh the page
   c. All jobs should reappear in the same order

5. Test completed jobs:
   a. Let a crawl complete
   b. Refresh the page
   c. The completed job should show with its results

6. Test 24-hour cleanup:
   a. Check localStorage in DevTools: localStorage.getItem('docspasta-active-jobs')
   b. Jobs older than 24 hours should be filtered out

Expected Results:
- Jobs persist across page refreshes
- Active jobs show current progress
- Completed jobs show results
- Jobs are stored in both localStorage and database
- UI shows loading state briefly then displays all jobs

Technical Details:
- Jobs are stored in localStorage with key 'docspasta-active-jobs'
- On mount, component loads from both localStorage and database
- Database jobs override localStorage jobs if duplicates exist
- Jobs older than 24 hours are automatically cleaned up
`)