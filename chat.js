import { logTerm } from './logger.js';
import { getEngine, bootRobEngine } from './engine.js';
import { getCorpus } from './rag.js';

console.log("[Module Loaded] chat.js | Functions: sendChatMessage, handleChatKeydown, downloadChatAsTxt");

export function handleChatKeydown(event) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        sendChatMessage();
    }
}

export async function sendChatMessage() {
    const inputField = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const history = document.getElementById('chat-history');
    const userText = inputField.value.trim();
    let engine = getEngine();

    if (!userText || !engine) return;

    inputField.disabled = true;
    sendBtn.disabled = true;

    logTerm(`💬 [chat.js -> sendChatMessage] User query submitted: "${userText}"`);
    history.innerHTML += `<div class="chat-msg chat-user"><b>You:</b> ${userText}</div>`;
    inputField.value = '';
    history.scrollTop = history.scrollHeight;

    let assembledTxt = "";
    const corpus = getCorpus();
    for (let doc of corpus) {
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

    logTerm(`📝 Messages payload assembled. Executing non-streaming completion...`);

    const replyDiv = document.createElement("div");
    replyDiv.className = "chat-msg chat-rob";
    replyDiv.innerHTML = "Rob: <i>Thinking...</i>";
    history.appendChild(replyDiv);
    history.scrollTop = history.scrollHeight;

    try {
        const completion = await engine.chat.completions.create({
            messages,
            temperature: 0.1,
            max_tokens: 128,
            stream: false
        });

        const reply = completion.choices[0]?.message?.content || "(No response generated)";
        replyDiv.innerText = "Rob: " + reply;
        history.scrollTop = history.scrollHeight;

        logTerm(`✅ Response completed successfully (${reply.length} characters).`);
    } catch (err) {
        logTerm(`🔴 WebGPU Execution Error: ${err.message}`);
        
        // Auto-recovery handler for Invalid buffer / Buffer unmapped faults
        if (err.message && (err.message.includes("Invalid buffer") || err.message.includes("Buffer unmapped"))) {
            logTerm(`⚠️ WebGPU buffer corruption detected. Purging engine state and suggesting cache wipe...`);
            replyDiv.innerText = "Rob Error: WebGPU buffer corrupted. Please click '🧹 Clear Application Cache & Restart Rob AI' to clear old cache files and reboot.";
        } else {
            replyDiv.innerText = "Rob Error: " + err.message;
        }
    } finally {
        inputField.disabled = false;
        sendBtn.disabled = false;
        inputField.focus();
    }
}

export function downloadChatAsTxt() {
    logTerm("📥 [chat.js -> downloadChatAsTxt] Exporting chat history...");
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