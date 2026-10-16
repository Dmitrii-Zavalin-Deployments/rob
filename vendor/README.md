# Vendor Dependencies & Third-Party Assets

This directory contains third-party software modules, compiled WebAssembly binaries, and pre-quantized machine learning model weights integrated into the **Rob** client-side AI system. 

These assets have been vendored directly into this repository to ensure high system stability, eliminate runtime external network dependency risks, and avoid high volume/overhead request traffic to upstream original repositories during client-side WebGPU engine initialization.

---

## Included Components & License Compliance

### 1. WebLLM Engine & Compute Binary
- **Component:** `@mlc-ai/web-llm` JavaScript runtime (`vendor/webllm/index.js`) & WebGPU shader binary (`vendor/webllm/Qwen2-0.5B-Instruct-q4f16_1_cs1k-webgpu.wasm`)
- **Source:** [MLC AI / WebLLM](https://github.com/mlc-ai/web-llm) & [MLC AI Binary Libs](https://github.com/mlc-ai/binary-mlc-llm-libs)
- **License:** [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- **Description:** Provides the client-side WebGPU and WebAssembly (WASM) execution engine and shader library for running large language models directly inside web browsers.

### 2. Qwen 2 0.5B Instruct (Pre-quantized MLC Weights)
- **Component:** Model configuration, tokenizer assets, and quantized parameter shards (`vendor/qwen2-0.5b/`)
- **Original Model Authors:** Alibaba Cloud / Qwen Team ([Qwen2-0.5B-Instruct](https://huggingface.co/Qwen/Qwen2-0.5B-Instruct))
- **Quantized Format Source:** MLC AI ([mlc-ai/Qwen2-0.5B-Instruct-q4f16_1-MLC](https://huggingface.co/mlc-ai/Qwen2-0.5B-Instruct-q4f16_1-MLC))
- **License:** [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- **Quantization Format:** `q4f16_1` (4-bit quantization with float16 scale execution)
- **Description:** Pre-quantized neural network weight shards loaded dynamically by the WebLLM runtime via direct client-side HTTP requests.

---

## Legal & Distribution Summary

All bundled vendor components are distributed under the terms of the **Apache License 2.0**. You may obtain a copy of the License at `http://www.apache.org/licenses/LICENSE-2.0`. 

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
