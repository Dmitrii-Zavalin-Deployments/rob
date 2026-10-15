import { logTerm } from './logger.js';

console.log("[Module Loaded] cache.js | Functions: purgeStorageOnly, wipeWebGPUCache");

export async function purgeStorageOnly() {
    logTerm("🧹 [cache.js -> purgeStorageOnly] Executing automatic pre-boot storage cleanup...");
    
    // 1. Clear LocalStorage and SessionStorage
    try {
        localStorage.clear();
        sessionStorage.clear();
        logTerm("🗑️ Cleared LocalStorage & SessionStorage.");
    } catch (e) {
        logTerm(`⚠️ Error clearing Web Storage: ${e.message}`);
    }

    // 2. Clear Cache Storage
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
            indexedDB.deleteDatabase("webllm/");
            indexedDB.deleteDatabase("mlc-chat");
            indexedDB.deleteDatabase("webllm/model");
            indexedDB.deleteDatabase("webllm/wasm");
        }
    } catch (e) {
        logTerm(`⚠️ Error wiping IndexedDB: ${e.message}`);
    }

    logTerm("✅ Storage cleanup complete.");
}

export async function wipeWebGPUCache() {
    // Lock down input field and send button immediately
    const inputField = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const statusBadge = document.getElementById('engine-status-badge');

    if (inputField) {
        inputField.disabled = true;
        inputField.placeholder = "Clearing storage & restarting system...";
    }
    if (sendBtn) {
        sendBtn.disabled = true;
    }
    if (statusBadge) {
        statusBadge.style.background = "#a61c1c";
        statusBadge.innerText = "🧹 Purging Storage...";
    }

    logTerm("🧹 [cache.js -> wipeWebGPUCache] User initiated storage purge. Locking UI...");

    await purgeStorageOnly();
    logTerm("🔄 Storage purged. Reloading page...");
    setTimeout(() => window.location.reload(), 1000);
}