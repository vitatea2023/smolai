#!/usr/bin/env node

// Import required modules
const fs = require('fs');
const https = require('https');
const http = require('http');
const TurndownService = require('turndown');
const TencentTranslator = require('./tencent-translator');

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
    } else if (args[i] === '--secret-id' && i + 1 < args.length) {
      params.secretId = args[i + 1];
      i++;
    } else if (args[i] === '--secret-key' && i + 1 < args.length) {
      params.secretKey = args[i + 1];
      i++;
    } else if (args[i] === '--target-lang' && i + 1 < args.length) {
      params.targetLang = args[i + 1];
      i++;
    } else if (args[i] === '--source-lang' && i + 1 < args.length) {
      params.sourceLang = args[i + 1];
      i++;
    } else if (args[i] === '--region' && i + 1 < args.length) {
      params.region = args[i + 1];
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
      trimmedLine.startsWith('```') ||
      trimmedLine.startsWith('---') ||
      trimmedLine.match(/^\[[\s\S]*?\]\([\s\S]*?\)$/) ||  // Pure links
      trimmedLine.match(/^\d+→/) ||  // Line numbers
      trimmedLine.match(/^={3,}$/) ||  // Separators
      trimmedLine.match(/^[^a-zA-Z\u4e00-\u9fff]*$/) ||  // Lines with no letters (symbols, numbers only)
      trimmedLine.length < 3;  // Only skip very short lines (< 3 chars)
    
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
      const isListItem = trimmedLine.match(/^[*-]\s/);
      
      if (isListItem) {
        // If we have accumulated text, save it first
        if (currentSegment.trim()) {
          segments.push({
            type: 'text',
            content: currentSegment.trim(),
            needsTranslation: true
          });
          currentSegment = '';
        }
        
        // Treat each list item as a separate translatable segment
        segments.push({
          type: 'text',
          content: line,
          needsTranslation: true
        });
      } else {
        // Regular text content
        currentSegment += line + '\n';
        
        // Check if this is the end of a paragraph
        const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
        const isEndOfParagraph = !nextLine || 
          nextLine.startsWith('#') || 
          nextLine.startsWith('```') ||
          nextLine.match(/^\[[\s\S]*?\]\([\s\S]*?\)$/) ||
          nextLine.match(/^[*-]\s/);  // Next line is a list item
        
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

// Process segments with translation markers or actual translation
async function processSegments(segments, enableTranslation = false, translator = null, sourceLang = 'auto', targetLang = 'en') {
  let result = '';
  
  if (enableTranslation && translator) {
    // Separate translatable texts and handle titles differently
    const translatableSegments = segments.filter(segment => segment.needsTranslation);
    const titleSegments = segments.filter(segment => 
      !segment.needsTranslation && 
      segment.content.trim().startsWith('#') &&
      segment.content.trim().match(/[a-zA-Z\u4e00-\u9fff]/)  // Contains letters
    );
    
    // Collect all texts that need translation (including titles)
    const allTextsToTranslate = [
      ...translatableSegments.map(segment => segment.content),
      ...titleSegments.map(segment => segment.content.replace(/^#+\s*/, '').trim())  // Remove # markers for translation
    ];
    
    if (allTextsToTranslate.length > 0) {
      console.log(`Translating ${translatableSegments.length} text segments and ${titleSegments.length} titles...`);
      try {
        const translations = await translator.translateBatch(allTextsToTranslate, sourceLang, targetLang);
        
        let translationIndex = 0;
        let titleTranslationIndex = translatableSegments.length;
        
        for (const segment of segments) {
          if (segment.needsTranslation) {
            // Regular translatable content
            result += segment.content + '\n\n';
            result += translations[translationIndex] + '\n\n';
            translationIndex++;
          } else if (segment.content.trim().startsWith('#') && 
                     segment.content.trim().match(/[a-zA-Z\u4e00-\u9fff]/)) {
            // Title that needs translation
            const titleLevel = segment.content.match(/^#+/)[0];
            result += segment.content + '\n\n';
            result += titleLevel + ' ' + translations[titleTranslationIndex] + '\n\n';
            titleTranslationIndex++;
          } else {
            // Non-translatable content (code, links, etc.)
            result += segment.content + '\n';
          }
        }
      } catch (error) {
        console.error('Translation failed:', error.message);
        console.log('Falling back to translation placeholders...');
        // Fallback to placeholder mode
        for (const segment of segments) {
          if (segment.needsTranslation) {
            result += segment.content + '\n';
            result += '\n<!-- [TRANSLATION_PLACEHOLDER] -->\n\n';
          } else if (segment.content.trim().startsWith('#') && 
                     segment.content.trim().match(/[a-zA-Z\u4e00-\u9fff]/)) {
            result += segment.content + '\n';
            result += '\n<!-- [TITLE_TRANSLATION_PLACEHOLDER] -->\n\n';
          } else {
            result += segment.content + '\n';
          }
        }
      }
    } else {
      // No translatable content found
      console.log('No translatable content found');
      for (const segment of segments) {
        result += segment.content + '\n';
      }
    }
  } else {
    // Original placeholder mode
    for (const segment of segments) {
      if (segment.needsTranslation && enableTranslation) {
        result += segment.content + '\n';
        result += '\n<!-- [TRANSLATION_PLACEHOLDER] -->\n\n';
      } else if (enableTranslation && segment.content.trim().startsWith('#') && 
                 segment.content.trim().match(/[a-zA-Z\u4e00-\u9fff]/)) {
        result += segment.content + '\n';
        result += '\n<!-- [TITLE_TRANSLATION_PLACEHOLDER] -->\n\n';
      } else {
        result += segment.content + '\n';
      }
    }
  }
  
  return result;
}

// Convert HTML to Markdown
async function convertToMarkdown(html, enableTranslation = false, translator = null, sourceLang = 'auto', targetLang = 'en') {
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
    markdown = await processSegments(segments, enableTranslation, translator, sourceLang, targetLang);
  }

  return markdown;
}

// Main function
async function main() {
  const { url, output, translate, secretId, secretKey, targetLang, sourceLang, region } = parseArgs();
  
  if (!url) {
    console.error('Error: Please provide --url parameter');
    console.log('Usage: node html-to-markdown.js --url <URL> --output <OUTPUT_FILE> [--translate] [--secret-id <ID>] [--secret-key <KEY>] [--target-lang <LANG>] [--source-lang <LANG>] [--region <REGION>]');
    process.exit(1);
  }
  
  if (!output) {
    console.error('Error: Please provide --output parameter');
    console.log('Usage: node html-to-markdown.js --url <URL> --output <OUTPUT_FILE> [--translate] [--secret-id <ID>] [--secret-key <KEY>] [--target-lang <LANG>] [--source-lang <LANG>] [--region <REGION>]');
    process.exit(1);
  }
  
  // Initialize translator if credentials are provided
  let translator = null;
  if (translate && secretId && secretKey) {
    translator = new TencentTranslator(secretId, secretKey, region || 'ap-singapore');
    console.log(`Tencent Cloud translator initialized (region: ${region || 'ap-singapore'})`);
  } else if (translate) {
    console.log('Translation mode: placeholder only (no API credentials provided)');
  }
  
  try {
    console.log(`Downloading: ${url}`);
    const html = await fetchHTML(url);
    
    const translationMode = translator ? 'with Tencent Cloud translation' : 
                          translate ? 'with translation placeholders' : '';
    console.log(`Converting to Markdown ${translationMode}...`);
    
    let markdown = await convertToMarkdown(
      html, 
      translate, 
      translator, 
      sourceLang || 'auto', 
      targetLang || 'zh'
    );
    
    console.log(`Saving to: ${output}`);
    // Ensure file ends with newline
    if (!markdown.endsWith('\n')) {
      markdown += '\n';
    }
    fs.writeFileSync(output, markdown, 'utf8');
    
    if (translate) {
      if (translator) {
        console.log('Conversion completed with Tencent Cloud translation!');
      } else {
        console.log('Conversion completed with translation placeholders!');
        console.log('Translation placeholders: <!-- [TRANSLATION_PLACEHOLDER] -->');
        console.log('To enable actual translation, provide --secret-id and --secret-key parameters');
      }
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