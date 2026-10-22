import { logTerm, getBasePath } from './logger.js';

console.log("[Module Loaded] rag.js | Functions: loadGeneralTrainingCorpus, getCorpus, rankAndExtractRelevantSentences, setMatchThreshold, getMatchThreshold");

let generalKnowledgeCorpus = [];
let currentMatchThreshold = 0.20; // Default 20%

export function setMatchThreshold(thresholdVal) {
    currentMatchThreshold = thresholdVal;
    logTerm(`🎛️ [rag.js -> setMatchThreshold] RAG match threshold updated to ${Math.round(thresholdVal * 100)}%.`);
}

export function getMatchThreshold() {
    return currentMatchThreshold;
}

export async function loadGeneralTrainingCorpus() {
    const badge = document.getElementById('rag-status');
    logTerm("🤖 [rag.js -> loadGeneralTrainingCorpus] Initiating scan of general_training/ corpus...");

    if (badge) {
        badge.className = "status-badge loading";
        badge.innerText = "⏳ Scanning Knowledge Base...";
    }

    try {
        const basePath = getBasePath();
        const manifestUrl = `${basePath}general_training/manifest.json?v=${Date.now()}`;
        logTerm(`🔍 Fetching manifest from: ${manifestUrl}`);

        const manifestRes = await fetch(manifestUrl);
        if (!manifestRes.ok) throw new Error(`manifest.json HTTP status ${manifestRes.status}`);
        
        const filenames = await manifestRes.json();
        logTerm(`📄 Manifest parsed. Found ${filenames.length} file entries.`);
        
        generalKnowledgeCorpus = [];
        for (let i = 0; i < filenames.length; i++) {
            const filename = filenames[i];
            const fileUrl = `${basePath}general_training/${filename}?v=${Date.now()}`;
            logTerm(`📥 Downloading knowledge file: ${filename}`);
            
            const fileRes = await fetch(fileUrl);
            if (fileRes.ok) {
                const content = await fileRes.text();
                generalKnowledgeCorpus.push({ name: filename, content: content });
                logTerm(`✅ Loaded "${filename}" successfully (${content.length} characters).`);
            } else {
                logTerm(`❌ Failed to load file "${filename}" (HTTP ${fileRes.status})`);
            }

            // Yield control periodically during file loading to keep UI responsive
            if (i % 50 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        if (badge) {
            badge.className = "status-badge active";
            badge.innerText = `🟢 Knowledge Base Active (${generalKnowledgeCorpus.length} Docs Indexed)`;
        }
        logTerm(`🎉 Knowledge corpus synchronization complete.`);
    } catch (err) {
        logTerm(`🔴 CRITICAL RAG Error: ${err.message}`);
        if (badge) {
            badge.className = "status-badge error";
            badge.innerText = `⚠️ Corpus Sync Failed`;
        }
    }
}

export function getCorpus() {
    return generalKnowledgeCorpus;
}

/**
 * Sentence-by-Sentence Combinatorics Matcher
 * Compares user query sentences against document sentences and logs matches in the terminal.
 */
export async function rankAndExtractRelevantSentences(userQuery, onProgressCallback) {
    if (!generalKnowledgeCorpus || generalKnowledgeCorpus.length === 0) {
        logTerm("⚠️ RAG Combinatorics: No corpus files loaded.");
        return [];
    }

    logTerm(`📡 [rag.js -> RAG Combinatorics] Starting sentence matrix scan (Threshold: ${Math.round(currentMatchThreshold * 100)}%)...`);

    const querySentences = splitIntoSentences(userQuery);
    logTerm(`🔍 Query decomposed into ${querySentences.length} sentence(s).`);

    const matchedSentences = new Set();
    let totalMatchesFound = 0;

    for (let docIdx = 0; docIdx < generalKnowledgeCorpus.length; docIdx++) {
        const doc = generalKnowledgeCorpus[docIdx];
        const docSentences = splitIntoSentences(doc.content);
        let fileMatchCount = 0;
        let fileMatchedArray = [];
        
        for (let qIdx = 0; qIdx < querySentences.length; qIdx++) {
            const qSent = querySentences[qIdx];
            const qTokens = extractKeywords(qSent);
            if (qTokens.length === 0) continue;

            for (let dIdx = 0; dIdx < docSentences.length; dIdx++) {
                const dSent = docSentences[dIdx];
                const dTokens = extractKeywords(dSent);

                const score = calculateOverlapScore(qTokens, dTokens);

                if (score >= currentMatchThreshold) {
                    logTerm(`🎯 MATCH FOUND [Score: ${Math.round(score * 100)}%] | Query S#${qIdx + 1} ↔ Doc S#${dIdx + 1} (${doc.name}): "${dSent.trim()}"`);
                    const trimmed = dSent.trim();
                    if (!matchedSentences.has(trimmed)) {
                        matchedSentences.add(trimmed);
                        fileMatchedArray.push(trimmed);
                        fileMatchCount++;
                    }
                }
            }
        }

        // Log file scan progress & stream live matches if any found
        if (fileMatchCount > 0) {
            totalMatchesFound += fileMatchCount;
            logTerm(`📄 [${docIdx + 1}/${generalKnowledgeCorpus.length}] ${doc.name}: Found ${fileMatchCount} matching sentence(s).`);
            if (typeof onProgressCallback === 'function') {
                onProgressCallback(doc.name, fileMatchedArray);
            }
        } else {
            logTerm(`📄 Scanning [${docIdx + 1}/${generalKnowledgeCorpus.length}]: ${doc.name}...`);
        }

        // YIELD TO MAIN THREAD: Prevents browser freeze by yielding after every single page scan
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    const matchedArray = Array.from(matchedSentences);
    logTerm(`📊 Combinatorics Scan Complete: ${matchedArray.length} relevant sentence(s) matched.`);

    return matchedArray;
}

function splitIntoSentences(text) {
    return text
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 5);
}

function extractKeywords(sentence) {
    const stopwords = new Set(["the", "is", "at", "which", "on", "a", "an", "and", "or", "to", "in", "you", "do", "know", "about", "what", "this", "it", "its", "are", "of", "for", "with"]);
    return sentence
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopwords.has(w));
}

function calculateOverlapScore(qTokens, dTokens) {
    let matches = 0;
    const dSet = new Set(dTokens);

    for (const token of qTokens) {
        if (dSet.has(token)) matches++;
    }

    if (qTokens.length === 0) return 0;
    return matches / qTokens.length;
}
