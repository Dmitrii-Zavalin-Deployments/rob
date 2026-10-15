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
    const bootBtn = document.getElementById('boot-btn');

    bootBtn.disabled = true;
    bootBtn.innerText = "⏳ Booting...";

    logTerm("🚀 [engine.js -> bootRobEngine] Boot sequence initiated...");
    await loadGeneralTrainingCorpus();

    if (engine) {
        logTerm("🧹 Unloading previous WebGPU engine instance...");
        try { await engine.unload(); } catch(e) {}
        engine = null;
    }

    logTerm(`⚡ Initializing local WebGPU engine for model: ${selectedModel}`);
    history.innerHTML = `<div class="chat-msg chat-rob">Rob: Initializing local WebGPU engine... Please wait.</div>`;
    history.scrollTop = history.scrollHeight;
    
    try {
        if (!webllm || !webllm.CreateMLCEngine) {
            throw new Error("Local WebLLM module failed to load from ./vendor/index.js.");
        }

        engine = await webllm.CreateMLCEngine(selectedModel, {
            initProgressCallback: (progress) => {
                const pct = Math.round(progress.progress * 100);
                logTerm(`⚡ WebGPU Loading [${pct}%]: ${progress.text}`);
                if (progress.progress === 1) {
                    history.innerHTML = `<div class="chat-msg chat-rob">Rob: WebGPU Kernel loaded successfully! Autonomous local intelligence & client-side RAG active.</div>`;
                    history.scrollTop = history.scrollHeight;
                    
                    inputField.disabled = false;
                    sendBtn.disabled = false;
                    inputField.placeholder = "Type a message to Rob...";
                    bootBtn.innerText = "🟢 Engine Running";
                    logTerm("🟢 Rob is fully online with active client-side RAG!");
                    isBooting = false;
                }
            }
        });
    } catch (err) {
        logTerm(`🔴 CRITICAL WebGPU Error: ${err.message}`);
        history.innerHTML += `<div class="chat-msg chat-rob" style="color: #a61c1c;">🔴 WebGPU Error: ${err.message}.</div>`;
        history.scrollTop = history.scrollHeight;
        bootBtn.disabled = false;
        bootBtn.innerText = "⚡ Boot Rob Engine";
        isBooting = false;
    }
}

export function getEngine() {
    return engine;
}
