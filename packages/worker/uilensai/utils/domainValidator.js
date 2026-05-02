const dns = require('dns').promises;
const { URL } = require('url');

/**
 * Validates if a domain exists by performing DNS lookup
 * @param {string} url - The URL to validate
 * @param {boolean} verbose - Whether to output verbose logs
 * @returns {Promise<{valid: boolean, error?: string}>} Validation result
 */
async function validateDomain(url, verbose = false) {
  try {
    // Parse the URL to extract hostname
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;

    if (verbose) {
      console.log(`🔍 Validating domain: ${hostname}`);
    }

    // Perform DNS lookup to check if domain exists
    try {
      const addresses = await dns.lookup(hostname);

      if (verbose) {
        console.log(`✅ Domain ${hostname} resolved to: ${addresses.address}`);
      }

      return { valid: true };

    } catch (dnsError) {
      // Check specific DNS error codes
      if (dnsError.code === 'ENOTFOUND') {
        return {
          valid: false,
          error: `Domain not found: ${url}. Please check that the domain exists and is spelled correctly.`
        };
      } else if (dnsError.code === 'ENODATA') {
        return {
          valid: false,
          error: `No DNS records found for domain: ${hostname}. The domain may not exist or may be misconfigured.`
        };
      } else if (dnsError.code === 'ETIMEDOUT') {
        return {
          valid: false,
          error: `DNS lookup timeout for domain: ${hostname}. The domain may be unreachable or DNS servers may be slow.`
        };
      } else {
        return {
          valid: false,
          error: `DNS lookup failed for domain: ${hostname}. Error: ${dnsError.message}`
        };
      }
    }

  } catch (urlError) {
    return {
      valid: false,
      error: `Invalid URL format: ${url}. Please provide a valid URL (e.g., https://example.com)`
    };
  }
}

/**
 * Validates domain with additional HTTP connectivity check
 * @param {string} url - The URL to validate
 * @param {boolean} verbose - Whether to output verbose logs
 * @param {number} timeout - Timeout for HTTP check in milliseconds
 * @returns {Promise<{valid: boolean, error?: string, warning?: string}>} Validation result
 */
async function validateDomainWithConnectivity(url, verbose = false, timeout = 10000) {
  // First check DNS
  const dnsResult = await validateDomain(url, verbose);
  if (!dnsResult.valid) {
    return dnsResult;
  }

  // If DNS is valid, try a quick HTTP connectivity check using fetch
  try {
    if (verbose) {
      console.log(`🌐 Testing HTTP connectivity to: ${url}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      const status = response.status;

      if (status < 400) {
        if (verbose) {
          console.log(`✅ HTTP connectivity confirmed (status: ${status})`);
        }
        return { valid: true };
      } else if (status === 403 || status === 405) {
        // 403 is common with bot protection, 405 means HEAD not allowed
        if (verbose) {
          console.log(`⚠️  HTTP ${status} — site is reachable, may have bot protection.`);
        }
        return {
          valid: true,
          warning: `Website returned HTTP ${status}. The site is reachable; the scan will proceed normally.`
        };
      } else {
        return {
          valid: false,
          error: `Website returned HTTP error ${status}. The domain exists but the website may be down or inaccessible.`
        };
      }

    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError.name === 'AbortError') {
        return {
          valid: false,
          error: `Connection timeout to ${url}. The domain exists but the website is not responding within ${timeout}ms.`
        };
      } else if (fetchError.cause && fetchError.cause.code === 'ECONNREFUSED') {
        return {
          valid: false,
          error: `Connection refused by ${url}. The domain exists but the web server is not responding.`
        };
      } else {
        return {
          valid: false,
          error: `HTTP connectivity test failed for ${url}: ${fetchError.message}`
        };
      }
    }

  } catch (error) {
    if (verbose) {
      console.warn(`⚠️  HTTP connectivity test failed, but DNS validation passed: ${error.message}`);
    }
    return {
      valid: true,
      warning: `Domain exists but HTTP connectivity could not be verified: ${error.message}`
    };
  }
}

module.exports = {
  validateDomain,
  validateDomainWithConnectivity
}; 