# SmolAI Project

## Project Overview
SmolAI converts HTML content to Markdown with intelligent translation using Tencent Cloud API.

## Features ✅
- HTML to Markdown conversion with Turndown
- Smart text segmentation and translation
- Tencent Cloud API integration with rate limiting
- Semantic text splitting for long content
- Support for titles, paragraphs, and list items
- Progress tracking and error handling

## Usage

```bash
node html-to-markdown.js \
  --url https://example.com \
  --output output.md \
  --translate \
  --secret-id YOUR_SECRET_ID \
  --secret-key YOUR_SECRET_KEY \
  --target-lang zh \
  --source-lang en \
  --region ap-singapore
```

Ready for production! 🚀