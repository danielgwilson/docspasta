# Docspasta V2

A modern web crawler designed specifically for documentation sites. Built with Next.js 15, PostgreSQL, and QStash for efficient serverless operation.

## Features

- 🚀 **V5 API** - Clean, RESTful API with resumable SSE streaming
- 📊 **Database-driven state** - PostgreSQL for reliable state management
- 🔄 **Resumable streams** - SSE with automatic reconnection support
- 🎯 **Quality-focused crawling** - Intelligent content extraction and scoring
- ⚡ **Serverless-ready** - Optimized for Vercel deployment

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (Neon recommended)
- QStash account for job queuing
- pnpm package manager

### Development Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/docspasta-next.git
cd docspasta-next
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Configure your database and QStash credentials in `.env.local`

5. Run database migrations:
```bash
pnpm db:migrate
```

6. Start the development server:
```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Architecture

### V5 API Endpoints

- `POST /api/v5/crawl` - Start a new crawl job
- `GET /api/v5/jobs/[id]/stream` - Real-time SSE progress stream
- `GET /api/v5/jobs/[id]` - Get job details and results
- `POST /api/v5/process` - QStash webhook endpoint (internal)

### Technology Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS, Framer Motion
- **Backend**: PostgreSQL (Neon), QStash, Drizzle ORM
- **Real-time**: Server-Sent Events with resumable-stream
- **Deployment**: Optimized for Vercel

## Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run specific test file
pnpm test src/tests/v5-api.test.ts
```

## Documentation

- [Development Setup](./DEVELOPMENT_SETUP.md) - Detailed setup instructions
- [QStash Setup](./QSTASH_SETUP.md) - Queue configuration guide
- [V5 API Implementation](./V5_API_IMPLEMENTATION_SUMMARY.md) - Technical details

## License

MIT