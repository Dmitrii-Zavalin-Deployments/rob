# Rob — Autonomous Sovereign AI Engine 🤖⚡

**Rob** is a fully autonomous, client-side AI engine powered by local WebGPU execution and zero-cost Retrieval-Augmented Generation (RAG). It delivers private, sovereign LLM inference directly inside the browser with zero cloud server dependencies, complete privacy, and grounded domain knowledge extraction.

🚀 **Live Deployment:** [https://dmitrii-zavalin-deployments.github.io/rob/](https://dmitrii-zavalin-deployments.github.io/rob/)

---

## 🌟 Key Features

- **100% Client-Side Execution (WebGPU):** Runs locally on your hardware using `Qwen2-0.5B-Instruct-q4f16_1-MLC`. No API keys, external servers, or subscription costs required.

- **Complete Incognito & Sovereign Privacy:** Absolute privacy by design. All prompts, context extraction, and conversation logs remain strictly within your browser's local memory—zero data sharing or remote analytics.

- **Instant Automatic Initialization:** Works out of the box when opening the deployment link. The model parameters (~300 MB) and execution shaders automatically fetch and initialize in browser memory.

- **Local RAG Engine (`general_training/`):** Features a sentence-by-sentence matrix lookup engine (`rag.js`) that synchronizes with local document manifests for strict fact-grounded responses.

- **🎛️ Engine Tuners Control Panel:** Real-time runtime parameter adjustments for:

  - **Creativity Temperature (`0.0` to `1.0`, unlockable to `5.00`):** Controls model sampling entropy for creative brainstorming with an extreme mode toggle for stochastic testing.
  - **Max Response Tokens (`1` to `2,048`, unlockable to `32,768`):** Dynamically scales response length from single lines up to native Qwen2 architectural max.
  - **RAG Match Threshold (`0%` to `100%`, Default `100%`):** Fine-tunes keyword overlap filtering for corpus matching, defaulting to exact 100% keyword overlap.

- **Tri-Mode Interaction Architecture:**

  - 🔴 **Strict Knowledge Mode (RAG Grounded):** Detects grounded sentence matches in `general_training/` and prints verbatim text buffers without LLM hallucination risk.
  - 🟢 **Creative Mode (Stateless Single-Turn):** Executes single-turn conversational generation with zero hidden history carry-over, ensuring clean pivoting across topics while offering manual **🧠 Remember** buttons for curated memory tracking.
  - 🔒 **Strict Verbatim RAG Bypass Mode:** Bypasses LLM generation entirely and streams matched corpus sentences directly from buffer based on the active RAG match threshold.

- **Hardware Resilience & Disaster Recovery:** Built-in WebGPU context monitoring that captures GPU driver resets, providing an emergency transcript export (`.txt`) and clear user recovery guidance.

---

## 💻 System & Performance Recommendations

For optimal execution speed and WebGPU pipeline stability:

- **Recommended Operating System:** Microsoft Windows 10/11 (Desktop PC or Laptop).

- **Hardware:** Dedicated GPU (NVIDIA, AMD, or Intel Arc) supporting WebGPU / DirectX 12.

- **Recommended Browser:** Modern Chromium-based browser (Google Chrome, Microsoft Edge, or Brave) with WebGPU enabled.

- **Network Overhead:** Approximately **300 MB** of compressed model parameter weight caching on the initial session load. Subsequent sessions utilize local browser CacheStorage for accelerated boot times.

---

## 📂 Repository Architecture

The project is structured as a modular ES Module Web Application:

```text
rob/
├── general_training/      # Local knowledge corpus documents & manifest.json
│   ├── manifest.json      # Knowledge base index file
│   └── project_aurora_specs.txt
├── vendor/                # Local dependencies (WebLLM runtime, WASM & Qwen2-0.5B model weights)
│   └── README.md          # Vendor components & Apache 2.0 license breakdown
├── app.js                 # Automated pre-boot, storage cleanup & engine launch
├── engine.js              # WebGPU engine initializer & WebLLM lifecycle manager
├── rag.js                 # Sentence-by-sentence matrix scan & combinatorics RAG matcher
├── chat.js                # Stateless execution, buffer streaming, action cards, & tuner bindings
├── logger.js              # Real-time System Terminal log formatter
├── style.css              # Custom layout CSS, responsive grids, fixed-height chat history, & code highlights
├── index.html             # Dashboard UI layout & Control Panel markup
├── LICENSE                # GNU AGPL-3.0 License
└── README.md              # Project documentation

```

---

## ⚙️ How It Works

1. **Boot Sequence (`app.js` & `engine.js`):** Performs automatic pre-boot storage maintenance, scans the `general_training/manifest.json` corpus, downloads knowledge files, and compiles WebGPU execution shaders.
2. **Context Resolution & RAG Matrix (`rag.js` & `chat.js`):** When a user query is submitted, the engine decomposes the input into sentence arrays, scans document lines using word-set overlap combinatorics against the active RAG match threshold (default `100%`), and extracts grounded context.
3. **Stateless Single-Turn Generation (`chat.js`):** Processes queries using strictly isolated payloads (`system` instruction + current `user` prompt), preventing hidden context leakage and allowing instant topic pivots, while offering explicit manual memory curation via interactive Action Cards.

---

## 📜 Licenses & Attribution

* **Codebase:** This project's source code is open-source and licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See the [LICENSE](https://github.com/Dmitrii-Zavalin-Deployments/rob/blob/main/LICENSE) file for full details.
* **Vendor Dependencies (`vendor/`):** Third-party software modules, WebAssembly binaries, and pre-quantized model weights (`@mlc-ai/web-llm` and `Qwen2-0.5B-Instruct`) bundled within the `vendor/` directory are distributed under the **Apache License 2.0**. For complete vendor component details, see the [vendor/README.md](https://github.com/Dmitrii-Zavalin-Deployments/rob/blob/main/vendor/README.md).
* **Knowledge Corpus (`general_training/`):** Portions of the reference text included within the corpus may utilize content adapted from Wikipedia, licensed under the **Creative Commons Attribution-ShareAlike 4.0 International License (CC BY-SA 4.0)**.