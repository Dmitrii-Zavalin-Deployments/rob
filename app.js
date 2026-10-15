import { logTerm } from './logger.js';
import { wipeWebGPUCache } from './cache.js';
import { loadGeneralTrainingCorpus } from './rag.js';
import { bootRobEngine } from './engine.js';
import { sendChatMessage, downloadChatAsTxt } from './chat.js';

console.log("[Module Loaded] app.js | Initializing Global Event Bindings");

window.bootRobEngine = bootRobEngine;
window.sendChatMessage = sendChatMessage;
window.loadGeneralTrainingCorpus = loadGeneralTrainingCorpus;
window.wipeWebGPUCache = wipeWebGPUCache;
window.downloadChatAsTxt = downloadChatAsTxt;

loadGeneralTrainingCorpus();
logTerm("🟢 [app.js] Application successfully initialized and ready for boot.");
