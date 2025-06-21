#!/usr/bin/env node

const crypto = require('crypto');
const https = require('https');

class TencentTranslator {
  constructor(secretId, secretKey, region = 'ap-singapore') {
    this.secretId = secretId;
    this.secretKey = secretKey;
    this.region = region;
    this.endpoint = 'tmt.tencentcloudapi.com';
    this.service = 'tmt';
    this.version = '2018-03-21';
  }

  // Generate authentication signature (returns Buffer for chaining)
  sign(secretKey, stringToSign, algorithm = 'sha256') {
    return crypto
      .createHmac(algorithm, secretKey)
      .update(stringToSign, 'utf8')
      .digest();
  }

  // Generate hex signature (for final signature step)
  signHex(secretKey, stringToSign, algorithm = 'sha256') {
    return crypto
      .createHmac(algorithm, secretKey)
      .update(stringToSign, 'utf8')
      .digest('hex');
  }

  // Create authorization header
  createAuthorizationHeader(payload, timestamp) {
    const date = new Date(timestamp * 1000).toISOString().substr(0, 10);
    const algorithm = 'TC3-HMAC-SHA256';
    const action = 'TextTranslateBatch';
    
    // Step 1: Create canonical request
    const httpRequestMethod = 'POST';
    const canonicalUri = '/';
    const canonicalQueryString = '';
    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${this.endpoint}\n`;
    const signedHeaders = 'content-type;host';
    const hashedRequestPayload = crypto
      .createHash('sha256')
      .update(payload)
      .digest('hex');
    
    const canonicalRequest = [
      httpRequestMethod,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      hashedRequestPayload
    ].join('\n');

    // Step 2: Create string to sign
    const credentialScope = `${date}/${this.service}/tc3_request`;
    const hashedCanonicalRequest = crypto
      .createHash('sha256')
      .update(canonicalRequest)
      .digest('hex');
    
    const stringToSign = [
      algorithm,
      timestamp,
      credentialScope,
      hashedCanonicalRequest
    ].join('\n');

    // Step 3: Calculate signature
    const secretDate = this.sign(('TC3' + this.secretKey), date);
    const secretService = this.sign(secretDate, this.service);
    const secretSigning = this.sign(secretService, 'tc3_request');
    const signature = this.signHex(secretSigning, stringToSign);

    // Step 4: Create authorization header
    return `${algorithm} Credential=${this.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  }

  // Make API request
  async makeRequest(action, payload) {
    const timestamp = Math.floor(Date.now() / 1000);
    const payloadString = JSON.stringify(payload);
    
    const headers = {
      'Authorization': this.createAuthorizationHeader(payloadString, timestamp),
      'Content-Type': 'application/json; charset=utf-8',
      'Host': this.endpoint,
      'X-TC-Action': action,
      'X-TC-Timestamp': timestamp.toString(),
      'X-TC-Version': this.version,
      'X-TC-Region': this.region
    };

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: this.endpoint,
        port: 443,
        path: '/',
        method: 'POST',
        headers: headers
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.Response.Error) {
              reject(new Error(`Tencent API Error: ${response.Response.Error.Code} - ${response.Response.Error.Message}`));
            } else {
              resolve(response.Response);
            }
          } catch (err) {
            reject(new Error(`Failed to parse response: ${err.message}`));
          }
        });
      });

      req.on('error', reject);
      req.write(payloadString);
      req.end();
    });
  }

  // Smart text splitting to preserve meaning
  splitLongText(text, maxLength = 1000) {
    if (text.length <= maxLength) {
      return [text];
    }
    
    const segments = [];
    let remaining = text;
    
    while (remaining.length > maxLength) {
      let splitPoint = maxLength;
      
      // Try to find good split points (in order of preference)
      const splitPatterns = [
        /\. /g,           // Sentence end
        /\? /g,           // Question end  
        /! /g,            // Exclamation end
        /; /g,            // Semicolon
        /, /g,            // Comma
        / - /g,           // Dash
        / /g              // Any space
      ];
      
      for (const pattern of splitPatterns) {
        const matches = [...remaining.substring(0, maxLength).matchAll(pattern)];
        if (matches.length > 0) {
          const lastMatch = matches[matches.length - 1];
          splitPoint = lastMatch.index + lastMatch[0].length;
          break;
        }
      }
      
      // If no good split point found, use hard limit
      if (splitPoint === maxLength) {
        splitPoint = remaining.substring(0, maxLength).lastIndexOf(' ') || maxLength;
      }
      
      const segment = remaining.substring(0, splitPoint).trim();
      if (segment) {
        segments.push(segment);
      }
      
      remaining = remaining.substring(splitPoint).trim();
    }
    
    // Add remaining text
    if (remaining) {
      segments.push(remaining);
    }
    
    return segments;
  }

  // Translate batch of texts
  async translateBatch(texts, sourceLang = 'auto', targetLang = 'en', projectId = 0) {
    // Reduce batch size and control content length to avoid API limits
    const maxBatchSize = 5;  // Reduced from 10 to 5
    const maxContentLength = 1000;  // Max characters per text segment
    const results = [];
    
    // Smart text processing with splitting
    const processedTexts = [];
    const textMappings = []; // Track which results belong to which original text
    
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (text.length > maxContentLength) {
        const segments = this.splitLongText(text, maxContentLength);
        console.log(`Long text split into ${segments.length} parts (original: ${text.length} chars)`);
        
        processedTexts.push(...segments);
        // Track that the next N results belong to original text i
        for (let j = 0; j < segments.length; j++) {
          textMappings.push({ originalIndex: i, partIndex: j, totalParts: segments.length });
        }
      } else {
        processedTexts.push(text);
        textMappings.push({ originalIndex: i, partIndex: 0, totalParts: 1 });
      }
    }
    
    const totalBatches = Math.ceil(processedTexts.length / maxBatchSize);
    console.log(`Processing ${processedTexts.length} texts in ${totalBatches} batches (max ${maxBatchSize} per batch)`);
    
    // Translate all processed texts
    const translatedSegments = [];
    
    for (let i = 0; i < processedTexts.length; i += maxBatchSize) {
      const batch = processedTexts.slice(i, i + maxBatchSize);
      const currentBatch = Math.floor(i/maxBatchSize) + 1;
      
      console.log(`Translating batch ${currentBatch}/${totalBatches} (${batch.length} texts)...`);
      
      const payload = {
        SourceTextList: batch,
        Source: sourceLang,
        Target: targetLang,
        ProjectId: projectId
      };

      try {
        const response = await this.makeRequest('TextTranslateBatch', payload);
        translatedSegments.push(...response.TargetTextList);
        console.log(`Batch ${currentBatch}/${totalBatches} completed successfully`);
        
        // Rate limiting: wait 200ms between batches (max 5 requests per second)
        if (i + maxBatchSize < processedTexts.length) {
          console.log('Rate limiting: waiting 200ms...');
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        console.error(`Batch ${currentBatch}/${totalBatches} translation failed:`, error.message);
        // Add empty translations for failed batch
        translatedSegments.push(...new Array(batch.length).fill('[TRANSLATION_FAILED]'));
      }
    }
    
    // Reconstruct original text structure by combining split segments
    const finalResults = [];
    const combinedTexts = new Map(); // originalIndex -> combined text
    
    for (let i = 0; i < textMappings.length; i++) {
      const mapping = textMappings[i];
      const translatedText = translatedSegments[i];
      
      if (mapping.totalParts === 1) {
        // Single part text, add directly
        finalResults[mapping.originalIndex] = translatedText;
      } else {
        // Multi-part text, combine segments
        if (!combinedTexts.has(mapping.originalIndex)) {
          combinedTexts.set(mapping.originalIndex, []);
        }
        combinedTexts.get(mapping.originalIndex)[mapping.partIndex] = translatedText;
      }
    }
    
    // Combine multi-part texts
    for (const [originalIndex, parts] of combinedTexts) {
      finalResults[originalIndex] = parts.join(' ');
    }
    
    console.log(`Translation completed: ${finalResults.length} texts processed (${translatedSegments.length} segments)`);
    return finalResults;
  }

  // Single text translation (wrapper for batch)
  async translateText(text, sourceLang = 'auto', targetLang = 'en') {
    const results = await this.translateBatch([text], sourceLang, targetLang);
    return results[0];
  }
}

module.exports = TencentTranslator;

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 4) {
    console.log('Usage: node tencent-translator.js <SecretId> <SecretKey> <text> <targetLang>');
    console.log('Example: node tencent-translator.js YOUR_SECRET_ID YOUR_SECRET_KEY "Hello world" zh');
    process.exit(1);
  }

  const [secretId, secretKey, text, targetLang] = args;
  const translator = new TencentTranslator(secretId, secretKey);
  
  translator.translateText(text, 'auto', targetLang)
    .then(result => {
      console.log('Original:', text);
      console.log('Translated:', result);
    })
    .catch(error => {
      console.error('Translation failed:', error.message);
      process.exit(1);
    });
}