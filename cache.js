import { logTerm } from './logger.js';

console.log("[Module Loaded] cache.js | Functions: wipeWebGPUCache");

export async function wipeWebGPUCache() {
    logTerm("🧹 [cache.js -> wipeWebGPUCache] Initiating total browser storage purge...");
    
    // 1. Clear LocalStorage and SessionStorage
    try {
        localStorage.clear();
        sessionStorage.clear();
        logTerm("🗑️ Cleared LocalStorage & SessionStorage.");
    } catch (e) {
        logTerm(`⚠️ Error clearing Web Storage: ${e.message}`);
    }

    // 2. Clear Cache Storage (webllm/config, webllm/model, webllm/wasm)
    try {
        if ('caches' in window) {
            const cacheKeys = await caches.keys();
            for (let key of cacheKeys) {
                await caches.delete(key);
                logTerm(`🗑️ Deleted CacheStorage entry: ${key}`);
            }
        }
    } catch (e) {
        logTerm(`⚠️ Error clearing CacheStorage: ${e.message}`);
    }

    // 3. Purge all IndexedDB Databases
    try {
        if (window.indexedDB && indexedDB.databases) {
            const dbs = await indexedDB.databases();
            for (let db of dbs) {
                if (db.name) {
                    indexedDB.deleteDatabase(db.name);
                    logTerm(`🗑️ Deleted IndexedDB database: ${db.name}`);
                }
            }
        } else {
            // Fallback for browsers that don't support indexedDB.databases()
            indexedDB.deleteDatabase("webllm/");
            indexedDB.deleteDatabase("mlc-chat");
            indexedDB.deleteDatabase("webllm/model");
            indexedDB.deleteDatabase("webllm/wasm");
        }
    } catch (e) {
        logTerm(`⚠️ Error wiping IndexedDB: ${e.message}`);
    }

    logTerm("✅ All site storage successfully purged! Reloading page...");
    setTimeout(() => window.location.reload(), 1200);
}
