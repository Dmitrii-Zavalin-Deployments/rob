import { logTerm, getBasePath } from './logger.js';

console.log("[Module Loaded] rag.js | Functions: loadGeneralTrainingCorpus, getCorpus");

let generalKnowledgeCorpus = [];

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
        for (let filename of filenames) {
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
