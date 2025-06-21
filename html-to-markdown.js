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

// Convert HTML to Markdown
function convertToMarkdown(html) {
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

  return markdown;
}

// Main function
async function main() {
  const { url, output } = parseArgs();
  
  if (!url) {
    console.error('Error: Please provide --url parameter');
    console.log('Usage: node html-to-markdown.js --url <URL> --output <OUTPUT_FILE>');
    process.exit(1);
  }
  
  if (!output) {
    console.error('Error: Please provide --output parameter');
    console.log('Usage: node html-to-markdown.js --url <URL> --output <OUTPUT_FILE>');
    process.exit(1);
  }
  
  try {
    console.log(`Downloading: ${url}`);
    const html = await fetchHTML(url);
    
    console.log('Converting to Markdown...');
    let markdown = convertToMarkdown(html);
    
    console.log(`Saving to: ${output}`);
    // Ensure file ends with newline
    if (!markdown.endsWith('\n')) {
      markdown += '\n';
    }
    fs.writeFileSync(output, markdown, 'utf8');
    
    console.log('Conversion completed!');
  } catch (error) {
    console.error('Error occurred:', error.message);
    process.exit(1);
  }
}

// Run main function
main();