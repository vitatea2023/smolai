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

  // Translate batch of texts
  async translateBatch(texts, sourceLang = 'auto', targetLang = 'en', projectId = 0) {
    // Split large batches to avoid API limits
    const maxBatchSize = 10;
    const results = [];
    
    for (let i = 0; i < texts.length; i += maxBatchSize) {
      const batch = texts.slice(i, i + maxBatchSize);
      
      const payload = {
        SourceTextList: batch,
        Source: sourceLang,
        Target: targetLang,
        ProjectId: projectId
      };

      try {
        const response = await this.makeRequest('TextTranslateBatch', payload);
        results.push(...response.TargetTextList);
        
        // Add delay between batches to avoid rate limiting
        if (i + maxBatchSize < texts.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`Batch translation failed for batch ${Math.floor(i/maxBatchSize) + 1}:`, error.message);
        // Add empty translations for failed batch
        results.push(...new Array(batch.length).fill('[TRANSLATION_FAILED]'));
      }
    }
    
    return results;
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