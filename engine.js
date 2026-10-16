import * as webllm from "./vendor/webllm/index.js";
import { logTerm } from './logger.js';
import { loadGeneralTrainingCorpus } from './rag.js';
import { warmupEngineContext } from './chat.js';

console.log("[Module Loaded] engine.js | Functions: bootRobEngine, getEngine");

let engine = null;
let isBooting = false;
// Corrected identifier to match the downloaded Qwen2 weights & config
const selectedModel = "Qwen2-0.5B-Instruct-q4f16_1-MLC";

// Custom WebLLM App Config pointing 100% locally to GitHub Pages vendor paths
const appConfig = {
    model_list: [
        {
            model: "https://dmitrii-zavalin-deployments.github.io/rob/vendor/qwen2-0.5b/",
            model_id: selectedModel,
            // Pointing directly to your local vendored Qwen2 WASM binary
            model_lib: "https://dmitrii-zavalin-deployments.github.io/rob/vendor/webllm/Qwen2-0.5B-Instruct-q4f16_1_cs1k-webgpu.wasm"
        }
    ]
};

export async function bootRobEngine() {
    if (isBooting) return;
    isBooting = true;

    const history = document.getElementById('chat-history');
    const inputField = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const statusBadge = document.getElementById('engine-status-badge');

    if (statusBadge) {
        statusBadge.className = "status-badge loading";
        statusBadge.innerText = "⏳ Engine Booting...";
    }

    logTerm("🚀 [engine.js -> bootRobEngine] Boot sequence initiated...");
    await loadGeneralTrainingCorpus();

    if (engine) {
        logTerm("🧹 Unloading previous WebGPU engine instance...");
        try { await engine.unload(); } catch(e) {}
        engine = null;
    }

    logTerm(`⚡ Initializing local WebGPU engine for model: ${selectedModel}`);
    if (history) {
        history.innerHTML = `<div class="chat-msg chat-rob">Rob: Initializing local WebGPU engine... Please wait.</div>`;
        history.scrollTop = history.scrollHeight;
    }

    try {
        if (!webllm || !webllm.CreateMLCEngine) {
            throw new Error("Local WebLLM module failed to load from ./vendor/webllm/index.js.");
        }

        let loadedEngine = null;

        loadedEngine = await webllm.CreateMLCEngine(selectedModel, {
            appConfig: appConfig,
            initProgressCallback: async (progress) => {
                const pct = Math.round(progress.progress * 100);
                logTerm(`⚡ WebGPU Loading [${pct}%]: ${progress.text}`);

                if (progress.text && progress.text.includes("Finish loading on WebGPU")) {
                    logTerm("⚡ WebGPU engine finished loading reported by progress callback.");
                }
            }
        });

        // Assign to outer scope so getEngine() works immediately
        engine = loadedEngine;

        // --- SILENT PIPELINE WARM-UP VIA CHAT MODULE ---
        logTerm("🔥 Executing WebGPU pipeline warm-up sequence...");
        await warmupEngineContext();

        if (history) {
            history.innerHTML = `<div class="chat-msg chat-rob">Rob: Hello! Autonomous local intelligence & client-side knowledge base are ready. How can I assist you today?</div>`;
            history.scrollTop = history.scrollHeight;
        }

        if (inputField) {
            inputField.disabled = false;
            inputField.placeholder = "Type a message to Rob...";
        }
        if (sendBtn) sendBtn.disabled = false;

        if (statusBadge) {
            statusBadge.className = "status-badge running";
            statusBadge.innerText = "🟢 Engine Running";
        }
        logTerm("🟢 Rob is fully online with active client-side RAG!");
        isBooting = false;

    } catch (err) {
        logTerm(`🔴 CRITICAL WebGPU Error: ${err.message}`);
        if (history) {
            history.innerHTML += `<div class="chat-msg chat-rob" style="color: #a61c1c;">🔴 WebGPU Error: ${err.message}.</div>`;
            history.scrollTop = history.scrollHeight;
        }
        if (statusBadge) {
            statusBadge.className = "status-badge error";
            statusBadge.innerText = "🔴 Boot Failed";
        }
        isBooting = false;
    }
}

export function getEngine() {
    return engine;
}
