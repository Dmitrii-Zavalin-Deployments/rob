import * as webllm from "./vendor/index.js";
import { logTerm } from './logger.js';
import { loadGeneralTrainingCorpus } from './rag.js';

console.log("[Module Loaded] engine.js | Functions: bootRobEngine, getEngine");

let engine = null;
let isBooting = false;
const selectedModel = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

export async function bootRobEngine() {
    if (isBooting) return;
    isBooting = true;

    const history = document.getElementById('chat-history');
    const inputField = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const statusBadge = document.getElementById('engine-status-badge');

    if (statusBadge) {
        statusBadge.className = "status-badge";
        statusBadge.style.background = "#003366";
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
            throw new Error("Local WebLLM module failed to load from ./vendor/index.js.");
        }

        engine = await webllm.CreateMLCEngine(selectedModel, {
            initProgressCallback: (progress) => {
                const pct = Math.round(progress.progress * 100);
                logTerm(`⚡ WebGPU Loading [${pct}%]: ${progress.text}`);
                
                // Only unlock UI when WebGPU shader compilation & memory mapping are 100% complete
                if (progress.text && progress.text.includes("Finish loading on WebGPU")) {
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
                        statusBadge.style.background = "#1b7c3d";
                        statusBadge.innerText = "🟢 Engine Running";
                    }
                    logTerm("🟢 Rob is fully online with active client-side RAG!");
                    isBooting = false;
                }
            }
        });
    } catch (err) {
        logTerm(`🔴 CRITICAL WebGPU Error: ${err.message}`);
        if (history) {
            history.innerHTML += `<div class="chat-msg chat-rob" style="color: #a61c1c;">🔴 WebGPU Error: ${err.message}.</div>`;
            history.scrollTop = history.scrollHeight;
        }
        if (statusBadge) {
            statusBadge.style.background = "#a61c1c";
            statusBadge.innerText = "🔴 Boot Failed";
        }
        isBooting = false;
    }
}

export function getEngine() {
    return engine;
}
