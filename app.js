import * as webllm from "./vendor/index.js";

let engine = null;
let isBooting = false;
let generalKnowledgeCorpus = [];
const selectedModel = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

function logTerm(message) {
    const term = document.getElementById('log-terminal');
    if (term) {
        const timestamp = new Date().toLocaleTimeString();
        term.innerText += `\n[${timestamp}] ${message}`;
        term.scrollTop = term.scrollHeight;
    }
    console.log(`[Rob Terminal] ${message}`);
}

function getBasePath() {
    let path = window.location.pathname;
    if (!path.endsWith('/')) {
        path = path.substring(0, path.lastIndexOf('/') + 1);
    }
    return window.location.origin + path;
}

async function wipeWebGPUCache() {
    logTerm("🧹 Purging browser IndexedDB and WebGPU caches...");
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

async function loadGeneralTrainingCorpus() {
    const badge = document.getElementById('rag-status');
    logTerm("🤖 Initiating scan of general_training/ corpus...");

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
            badge.style.background = "#003366";
            badge.innerText = `🟢 Knowledge Base Active (${generalKnowledgeCorpus.length} Docs Indexed)`;
        }
        logTerm(`🎉 Knowledge corpus synchronization complete.`);
    } catch (err) {
        logTerm(`🔴 CRITICAL RAG Error: ${err.message}`);
        if (badge) {
            badge.style.background = "#b7791f";
            badge.innerText = `⚠️ Corpus Sync Failed`;
        }
    }
}

function downloadChatAsTxt() {
    const historyDiv = document.getElementById('chat-history');
    const msgs = historyDiv.getElementsByClassName('chat-msg');
    if (msgs.length <= 1) {
        alert("No chat conversation to export yet!");
        return;
    }

    let chatText = "--- Rob AI Engine Chat Export ---\nGenerated: " + new Date().toISOString() + "\n\n";
    for (let msg of msgs) {
        chatText += msg.innerText + "\n\n";
    }

    const blob = new Blob([chatText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rob_chat_export_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    logTerm("📥 Chat conversation successfully exported as TXT.");
}

async function bootRobEngine() {
    if (isBooting) return;
    isBooting = true;

    const history = document.getElementById('chat-history');
    const inputField = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const bootBtn = document.getElementById('boot-btn');

    bootBtn.disabled = true;
    bootBtn.innerText = "⏳ Booting...";

    logTerm("🚀 Boot sequence initiated...");
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

async function sendChatMessage() {
    const inputField = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const history = document.getElementById('chat-history');
    const userText = inputField.value.trim();

    if (!userText || !engine) return;

    inputField.disabled = true;
    sendBtn.disabled = true;

    logTerm(`💬 User query submitted: "${userText}"`);
    history.innerHTML += `<div class="chat-msg chat-user"><b>You:</b> ${userText}</div>`;
    inputField.value = '';
    history.scrollTop = history.scrollHeight;

    let assembledTxt = "";
    for (let doc of generalKnowledgeCorpus) {
        assembledTxt += `\n[File: ${doc.name}]\n${doc.content}\n`;
    }

    const messages = [
        { 
            role: "system", 
            content: `You are Rob, an autonomous sovereign AI created by Dmitrii Zavalin. Answer questions accurately using only the provided reference knowledge base.\n\n--- REFERENCE KNOWLEDGE BASE ---\n${assembledTxt}` 
        },
        { 
            role: "user", 
            content: userText 
        }
    ];

    logTerm(`📝 OpenAI-style messages payload assembled. Executing real-time streaming completion...`);

    const replyDiv = document.createElement("div");
    replyDiv.className = "chat-msg chat-rob";
    replyDiv.innerHTML = "Rob: <i>Thinking...</i>";
    history.appendChild(replyDiv);
    history.scrollTop = history.scrollHeight;

    try {
        const asyncIterator = await engine.chat.completions.create({
            messages,
            temperature: 0.1,
            max_tokens: 128,
            stream: true
        });

        let fullReply = "";
        for await (const chunk of asyncIterator) {
            const delta = chunk.choices[0]?.delta?.content || "";
            fullReply += delta;
            replyDiv.innerText = "Rob: " + fullReply;
            history.scrollTop = history.scrollHeight;
        }

        logTerm(`✅ Streaming response completed successfully (${fullReply.length} characters).`);
    } catch (err) {
        logTerm(`🔴 WebGPU Execution Error: ${err.message}`);
        replyDiv.innerText = "Rob Error: " + err.message;
    } finally {
        inputField.disabled = false;
        sendBtn.disabled = false;
        inputField.focus();
    }
}

// Expose functions globally for inline HTML event handlers
window.bootRobEngine = bootRobEngine;
window.sendChatMessage = sendChatMessage;
window.loadGeneralTrainingCorpus = loadGeneralTrainingCorpus;
window.wipeWebGPUCache = wipeWebGPUCache;
window.downloadChatAsTxt = downloadChatAsTxt;

loadGeneralTrainingCorpus();