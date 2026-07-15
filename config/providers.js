// config/providers.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const PROVIDERS = {
    '1': {
        // Primary cloud provider - set OLLAMA_MODEL in .env
        // Free models available at https://ollama.com (e.g. nemotron-3-super, gemma4:31b)
        name: 'Ollama Cloud',
        api_url: process.env.OLLAMA_API_URL || 'https://ollama.com/api/chat',
        api_key: process.env.OLLAMA_API_KEY || '',
        model: process.env.OLLAMA_MODEL || 'nemotron-3-super',
        format: 'ollama',
        stream: true
    },
    '2': {
        // Local model via llama.cpp server (optional)
        // Start with: llama-server -m your_model.gguf --port 8080
        name: 'Local Model (llama.cpp)',
        api_url: 'http://localhost:8080/v1/chat/completions',
        api_key: 'local',
        model: 'local-model.gguf',
        format: 'openai',
        stream: true
    },
    '3': {
        // Google Gemini (free tier available)
        // Get API key: https://aistudio.google.com
        name: 'Google Gemini 2.0 Flash Lite',
        api_url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        api_key: process.env.GEMINI_API_KEY || '',
        model: 'gemini-2.0-flash-lite',
        format: 'openai',
        stream: false
    },
    '4': {
        // DeepSeek (paid) - https://platform.deepseek.com
        name: 'DeepSeek',
        api_url: 'https://api.deepseek.com/v1/chat/completions',
        api_key: process.env.DEEPSEEK_API_KEY || '',
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        format: 'openai',
        stream: false
    }
};

// Fallback order: primary → gemini → deepseek
const FALLBACK_ORDER = ['1', '3', '4'];

module.exports = { PROVIDERS, FALLBACK_ORDER };
