/**
 * Persistent Procedural Memory
 * ===============================
 *
 * Lightweight JSON-based memory store that persists scan patterns across
 * invocations. No database dependency — just a JSON file.
 *
 * What it remembers:
 *   - Industry score distributions (e.g., "SaaS sites average 72 security")
 *   - Common issue patterns (e.g., "90% of sites missing CSP header")
 *   - Score drift detection (e.g., "this site improved 45→72 since last scan")
 *   - Persona calibration (e.g., "Dr. Vasquez tends to score 5pts lower")
 */

const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.resolve(__dirname, '../../storage/memory');
const MEMORY_FILE = path.join(MEMORY_DIR, 'procedural-memory.json');
const MAX_SCAN_HISTORY = 200; // Keep last N scans for pattern analysis
const MAX_SITE_HISTORY = 20; // Keep last N scans per site for drift detection

/**
 * Default empty memory structure.
 */
function createEmptyMemory() {
  return {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),

    // Aggregate statistics by industry
    industryPatterns: {},
    // Per-site scan history for drift detection
    siteHistory: {},
    // Persona calibration data
    personaCalibration: {},
    // Common issue frequency tracking
    commonIssues: {},
    // Total scan count
    totalScans: 0,
  };
}

/**
 * Load procedural memory from disk, or create empty if not exists.
 */
function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const raw = fs.readFileSync(MEMORY_FILE, 'utf8');
      const memory = JSON.parse(raw);
      return memory;
    }
  } catch (error) {
    console.warn(`[ProceduralMemory] ⚠️ Failed to load memory: ${error.message}. Creating fresh.`);
  }
  return createEmptyMemory();
}

/**
 * Save procedural memory to disk.
 */
function saveMemory(memory) {
  try {
    // Ensure directory exists
    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }
    memory.lastUpdatedAt = new Date().toISOString();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2), 'utf8');
  } catch (error) {
    console.error(`[ProceduralMemory] ❌ Failed to save memory: ${error.message}`);
  }
}

/**
 * Record scan results into procedural memory.
 *
 * @param {Object} scanData
 * @param {string} scanData.url - Scanned URL
 * @param {string} scanData.industry - Detected industry
 * @param {Object} scanData.moduleScores - { moduleName: score }
 * @param {Object} scanData.agentMeta - { moduleName: { agentName, agentTitle } }
 * @param {Object} scanData.debateAdjustments - { moduleName: delta }
 * @param {string[]} scanData.topIssues - Aggregated top issues
 * @param {number} scanData.overallScore
 * @param {boolean} verbose
 */
function recordScan(scanData, verbose = false) {
  const memory = loadMemory();
  const {
    url, industry, moduleScores = {}, agentMeta = {},
    debateAdjustments = {}, topIssues = [], overallScore = 0,
  } = scanData;

  const timestamp = new Date().toISOString();
  const normalizedUrl = normalizeUrl(url);
  const normalizedIndustry = (industry || 'Unknown').toLowerCase();

  // 1. Update industry patterns
  if (!memory.industryPatterns[normalizedIndustry]) {
    memory.industryPatterns[normalizedIndustry] = {
      scanCount: 0,
      moduleAverages: {},
      overallAverage: 0,
      overallSum: 0,
    };
  }
  const ip = memory.industryPatterns[normalizedIndustry];
  ip.scanCount++;
  ip.overallSum += overallScore;
  ip.overallAverage = Math.round(ip.overallSum / ip.scanCount);

  for (const [mod, score] of Object.entries(moduleScores)) {
    if (typeof score !== 'number') continue;
    if (!ip.moduleAverages[mod]) {
      ip.moduleAverages[mod] = { sum: 0, count: 0, avg: 0 };
    }
    ip.moduleAverages[mod].sum += score;
    ip.moduleAverages[mod].count++;
    ip.moduleAverages[mod].avg = Math.round(ip.moduleAverages[mod].sum / ip.moduleAverages[mod].count);
  }

  // 2. Update site history (drift detection)
  if (!memory.siteHistory[normalizedUrl]) {
    memory.siteHistory[normalizedUrl] = [];
  }
  memory.siteHistory[normalizedUrl].push({
    timestamp,
    overallScore,
    moduleScores: { ...moduleScores },
    industry: normalizedIndustry,
  });
  // Trim to max history per site
  if (memory.siteHistory[normalizedUrl].length > MAX_SITE_HISTORY) {
    memory.siteHistory[normalizedUrl] = memory.siteHistory[normalizedUrl].slice(-MAX_SITE_HISTORY);
  }

  // 3. Update persona calibration (track how each persona's scores compare to overall)
  for (const [mod, meta] of Object.entries(agentMeta)) {
    if (!meta?.agentId) continue;
    if (!memory.personaCalibration[meta.agentId]) {
      memory.personaCalibration[meta.agentId] = {
        agentName: meta.agentName,
        scoreSum: 0,
        count: 0,
        avgScore: 0,
        debateAdjustmentSum: 0,
        debateCount: 0,
      };
    }
    const pc = memory.personaCalibration[meta.agentId];
    const score = moduleScores[mod];
    if (typeof score === 'number') {
      pc.scoreSum += score;
      pc.count++;
      pc.avgScore = Math.round(pc.scoreSum / pc.count);
    }
    if (debateAdjustments[mod]) {
      pc.debateAdjustmentSum += debateAdjustments[mod];
      pc.debateCount++;
    }
  }

  // 4. Track common issues
  for (const issue of topIssues.slice(0, 10)) {
    const issueKey = normalizeIssueKey(issue);
    if (!memory.commonIssues[issueKey]) {
      memory.commonIssues[issueKey] = { text: issue.substring(0, 150), count: 0, industries: {} };
    }
    memory.commonIssues[issueKey].count++;
    memory.commonIssues[issueKey].industries[normalizedIndustry] =
      (memory.commonIssues[issueKey].industries[normalizedIndustry] || 0) + 1;
  }

  // 5. Prune old data
  pruneMemory(memory);

  memory.totalScans++;
  saveMemory(memory);

  if (verbose) {
    console.log(`[ProceduralMemory] 💾 Recorded scan #${memory.totalScans} for ${normalizedUrl} (${normalizedIndustry})`);
    console.log(`[ProceduralMemory]   Industry ${normalizedIndustry}: ${ip.scanCount} scans, avg overall: ${ip.overallAverage}`);
  }
}

/**
 * Generate memory context string for injection into persona instructions.
 *
 * @param {string} url - URL being scanned
 * @param {string} industry - Detected industry
 * @param {string} moduleName - Module requesting memory
 * @returns {string|null} Memory context string, or null if no relevant memory
 */
function getMemoryContext(url, industry, moduleName) {
  const memory = loadMemory();
  if (memory.totalScans < 3) return null; // Not enough data yet

  const parts = [];
  const normalizedIndustry = (industry || 'Unknown').toLowerCase();
  const normalizedUrl = normalizeUrl(url);

  // 1. Industry benchmarks for this module
  const ip = memory.industryPatterns[normalizedIndustry];
  if (ip && ip.scanCount >= 2 && ip.moduleAverages[moduleName]) {
    const avg = ip.moduleAverages[moduleName].avg;
    const count = ip.moduleAverages[moduleName].count;
    parts.push(`INDUSTRY BENCHMARK: ${normalizedIndustry} sites average ${avg}/100 for ${moduleName} (based on ${count} scans). Overall industry average: ${ip.overallAverage}/100.`);
  }

  // 2. Site history (drift detection)
  const siteHistory = memory.siteHistory[normalizedUrl];
  if (siteHistory && siteHistory.length >= 1) {
    const lastScan = siteHistory[siteHistory.length - 1];
    const lastModuleScore = lastScan.moduleScores[moduleName];
    if (typeof lastModuleScore === 'number') {
      const scanDate = new Date(lastScan.timestamp).toLocaleDateString();
      parts.push(`PREVIOUS SCAN: This site scored ${lastModuleScore}/100 for ${moduleName} on ${scanDate} (overall: ${lastScan.overallScore}/100). Note any significant changes.`);
    }
    if (siteHistory.length >= 2) {
      const firstScan = siteHistory[0];
      const firstScore = firstScan.moduleScores[moduleName];
      if (typeof firstScore === 'number' && typeof lastModuleScore === 'number') {
        const drift = lastModuleScore - firstScore;
        if (Math.abs(drift) >= 10) {
          parts.push(`SCORE TREND: ${moduleName} has ${drift > 0 ? 'improved' : 'declined'} by ${Math.abs(drift)} points over ${siteHistory.length} scans.`);
        }
      }
    }
  }

  // 3. Common issues in this industry
  const industryIssues = Object.values(memory.commonIssues)
    .filter(i => i.industries[normalizedIndustry] >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  if (industryIssues.length > 0) {
    parts.push(`COMMON ISSUES in ${normalizedIndustry}: ${industryIssues.map(i => `"${i.text}" (found in ${i.count} scans)`).join('; ')}`);
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Generate compact memory context for the CEO orchestrator.
 */
function getCEOMemoryContext(url, industry) {
  const memory = loadMemory();
  if (memory.totalScans < 3) return null;

  const parts = [];
  const normalizedIndustry = (industry || 'Unknown').toLowerCase();
  const normalizedUrl = normalizeUrl(url);

  // Industry overview
  const ip = memory.industryPatterns[normalizedIndustry];
  if (ip && ip.scanCount >= 2) {
    const moduleAvgs = Object.entries(ip.moduleAverages)
      .map(([mod, data]) => `${mod}: ${data.avg}`)
      .join(', ');
    parts.push(`INDUSTRY (${normalizedIndustry}, ${ip.scanCount} scans): Avg overall: ${ip.overallAverage}. Module avgs: ${moduleAvgs}`);
  }

  // Site history
  const siteHistory = memory.siteHistory[normalizedUrl];
  if (siteHistory && siteHistory.length >= 2) {
    const first = siteHistory[0];
    const last = siteHistory[siteHistory.length - 1];
    const drift = last.overallScore - first.overallScore;
    parts.push(`SITE HISTORY: ${siteHistory.length} previous scans. Score trajectory: ${first.overallScore} → ${last.overallScore} (${drift >= 0 ? '+' : ''}${drift}).`);
  }

  // Persona calibration summary
  const calibrations = Object.entries(memory.personaCalibration)
    .filter(([_, data]) => data.count >= 3)
    .map(([_, data]) => {
      const avgAdj = data.debateCount > 0 ? Math.round(data.debateAdjustmentSum / data.debateCount) : 0;
      return `${data.agentName}: avg ${data.avgScore}/100${avgAdj !== 0 ? ` (debate adj avg: ${avgAdj >= 0 ? '+' : ''}${avgAdj})` : ''}`;
    });

  if (calibrations.length > 0) {
    parts.push(`PERSONA CALIBRATION: ${calibrations.join('; ')}`);
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

// --- Helpers ---

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return String(url).toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
  }
}

function normalizeIssueKey(issue) {
  return String(issue)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 80);
}

function pruneMemory(memory) {
  // Prune common issues list to top 500
  const sortedIssues = Object.entries(memory.commonIssues)
    .sort(([, a], [, b]) => b.count - a.count);
  if (sortedIssues.length > 500) {
    memory.commonIssues = Object.fromEntries(sortedIssues.slice(0, 500));
  }

  // Prune site history — drop sites not scanned in 90 days
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  for (const [site, history] of Object.entries(memory.siteHistory)) {
    if (history.length === 0) {
      delete memory.siteHistory[site];
      continue;
    }
    const lastScan = history[history.length - 1];
    if (lastScan.timestamp < ninetyDaysAgo) {
      delete memory.siteHistory[site];
    }
  }
}

module.exports = {
  loadMemory,
  saveMemory,
  recordScan,
  getMemoryContext,
  getCEOMemoryContext,
  createEmptyMemory,
  MEMORY_FILE,
};
