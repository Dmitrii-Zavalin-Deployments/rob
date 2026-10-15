import { logTerm } from './logger.js';
import { purgeStorageOnly, wipeWebGPUCache } from './cache.js';
import { bootRobEngine } from './engine.js';
import { sendChatMessage, handleChatKeydown, downloadChatAsTxt } from './chat.js';

console.log("[Module Loaded] app.js | Initializing Automatic Boot Sequence");

window.sendChatMessage = sendChatMessage;
window.handleChatKeydown = handleChatKeydown;
window.wipeWebGPUCache = wipeWebGPUCache;
window.downloadChatAsTxt = downloadChatAsTxt;

// Automatic sequential boot sequence on page load
async function autoBootSequence() {
    logTerm("🏁 [app.js -> autoBootSequence] Starting automated startup flow...");
    
    // Step 1: Purge browser storage & caches
    await purgeStorageOnly();
    
    // Step 2: Boot WebGPU Engine (which loads RAG corpus and initializes WebLLM)
    await bootRobEngine();
}

// Trigger automatically when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoBootSequence);
} else {
    autoBootSequence();
}