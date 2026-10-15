import { logTerm } from './logger.js';

console.log("[Module Loaded] cache.js | Functions: wipeWebGPUCache");

export async function wipeWebGPUCache() {
    logTerm("🧹 [cache.js -> wipeWebGPUCache] Purging browser IndexedDB and WebGPU caches...");
    localStorage.clear();
    try {
        if (window.indexedDB && indexedDB.databases) {
            const dbs = await indexedDB.databases();
            for (let db of dbs) {
                if (db.name) {
                    indexedDB.deleteDatabase(db.name);
                    logTerm(`🗑️ Deleted IndexedDB: ${db.name}`);
                }
            }
        } else {
            indexedDB.deleteDatabase("webllm/");
            indexedDB.deleteDatabase("mlc-chat");
        }
        logTerm("✅ GPU cache successfully wiped! Reloading page...");
        setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
        logTerm(`⚠️ Error wiping cache: ${err.message}`);
        window.location.reload();
    }
}
