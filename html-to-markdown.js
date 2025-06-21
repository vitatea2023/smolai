#!/usr/bin/env node

// Import required modules
const fs = require('fs');
const https = require('https');
const http = require('http');
const TurndownService = require('turndown');

// Create turndown service instance with fenced code block style
const turndownService = new TurndownService({
  codeBlockStyle: 'fenced'
});

// Function to decode UTF-8 sequences
function decodeUTF8Sequence(sequence) {
  const bytes = sequence.split('<').join('').split('>').filter(Boolean).map(b => parseInt(b, 16));
  const buffer = Buffer.from(bytes);
  return buffer.toString();
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && i + 1 < args.length) {
      params.url = args[i + 1];
      i++;
    } else if (args[i] === '--output' && i + 1 < args.length) {
      params.output = args[i + 1];
      i++;
    } else if (args[i] === '--translate') {
      params.translate = true;
    }
  }
  
  return params;
}

// Download HTML content
function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    
    client.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        return;
      }
      
      let html = '';
      res.setEncoding('utf8');
      res.on('data', chunk => html += chunk);
      res.on('end', () => resolve(html));
    }).on('error', reject);
  });
}

// Clean HTML content
function cleanHTML(html) {
  // Remove script tags and their content
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove style tags and their content
  html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Remove comments
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  
  // Remove other unwanted tags
  const unwantedTags = ['noscript', 'iframe', 'embed', 'object', 'applet'];
  unwantedTags.forEach(tag => {
    const regex = new RegExp(`<${tag}\\b[^<]*(?:(?!<\\/${tag}>)<[^<]*)*<\\/${tag}>`, 'gi');
    html = html.replace(regex, '');
  });
  
  return html;
}

// Segment text into translatable chunks
function segmentText(markdown) {
  const segments = [];
  const lines = markdown.split('\n');
  let currentSegment = '';
  let inCodeBlock = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Track code blocks
    if (trimmedLine.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
    }
    
    // Define what should NOT be translated
    const isNonTranslatable = !trimmedLine || 
      inCodeBlock ||
      trimmedLine.startsWith('#') ||
      trimmedLine.startsWith('```') ||
      trimmedLine.startsWith('---') ||
      trimmedLine.startsWith('*   ') ||
      trimmedLine.startsWith('- ') ||
      trimmedLine.match(/^\[[\s\S]*?\]\([\s\S]*?\)$/) ||
      trimmedLine.match(/^\d+→/) ||
      trimmedLine.match(/^={3,}$/) ||
      trimmedLine.match(/^[^a-zA-Z]*$/) ||  // Lines with no letters (symbols, numbers only)
      trimmedLine.length < 10;  // Very short lines are likely markup
    
    if (isNonTranslatable) {
      // If we have accumulated text, save it as a segment
      if (currentSegment.trim()) {
        segments.push({
          type: 'text',
          content: currentSegment.trim(),
          needsTranslation: true
        });
        currentSegment = '';
      }
      
      // Add the non-translatable line as-is
      segments.push({
        type: 'markup',
        content: line,
        needsTranslation: false
      });
    } else {
      // This line looks like translatable content
      currentSegment += line + '\n';
      
      // Check if this is the end of a paragraph
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
      const isEndOfParagraph = !nextLine || 
        nextLine.startsWith('#') || 
        nextLine.startsWith('*') ||
        nextLine.startsWith('-') ||
        nextLine.startsWith('```') ||
        nextLine.match(/^\[[\s\S]*?\]\([\s\S]*?\)$/);
      
      if (isEndOfParagraph && currentSegment.trim()) {
        segments.push({
          type: 'text',
          content: currentSegment.trim(),
          needsTranslation: true
        });
        currentSegment = '';
      }
    }
  }
  
  // Add any remaining text
  if (currentSegment.trim()) {
    segments.push({
      type: 'text',
      content: currentSegment.trim(),
      needsTranslation: true
    });
  }
  
  return segments;
}

// Process segments with translation markers
function processSegments(segments, enableTranslation = false) {
  let result = '';
  
  for (const segment of segments) {
    if (segment.needsTranslation && enableTranslation) {
      result += segment.content + '\n';
      result += '\n<!-- [TRANSLATION_PLACEHOLDER] -->\n\n';
    } else {
      result += segment.content + '\n';
    }
  }
  
  return result;
}

// Convert HTML to Markdown
function convertToMarkdown(html, enableTranslation = false) {
  // Clean HTML first
  const cleanedHTML = cleanHTML(html);
  
  // Find all UTF-8 sequences using regex
  const utf8SequenceRegex = /<([A-Fa-f0-9]{2}>){3}/g;
  let markdown = turndownService.turndown(cleanedHTML);

  // Decode all matched sequences
  markdown = markdown.replace(utf8SequenceRegex, (match) => {
    const sequence = match.slice(1, -1);
    return decodeUTF8Sequence(sequence);
  });

  // If translation is enabled, segment and process the text
  if (enableTranslation) {
    const segments = segmentText(markdown);
    markdown = processSegments(segments, enableTranslation);
  }

  return markdown;
}

// Main function
async function main() {
  const { url, output, translate } = parseArgs();
  
  if (!url) {
    console.error('Error: Please provide --url parameter');
    console.log('Usage: node html-to-markdown.js --url <URL> --output <OUTPUT_FILE> [--translate]');
    process.exit(1);
  }
  
  if (!output) {
    console.error('Error: Please provide --output parameter');
    console.log('Usage: node html-to-markdown.js --url <URL> --output <OUTPUT_FILE> [--translate]');
    process.exit(1);
  }
  
  try {
    console.log(`Downloading: ${url}`);
    const html = await fetchHTML(url);
    
    console.log(`Converting to Markdown${translate ? ' with translation markers' : ''}...`);
    let markdown = convertToMarkdown(html, translate);
    
    console.log(`Saving to: ${output}`);
    // Ensure file ends with newline
    if (!markdown.endsWith('\n')) {
      markdown += '\n';
    }
    fs.writeFileSync(output, markdown, 'utf8');
    
    if (translate) {
      console.log('Conversion completed with translation placeholders!');
      console.log('Translation placeholders: <!-- [TRANSLATION_PLACEHOLDER] -->');
    } else {
      console.log('Conversion completed!');
    }
  } catch (error) {
    console.error('Error occurred:', error.message);
    process.exit(1);
  }
}

// Run main function
main();