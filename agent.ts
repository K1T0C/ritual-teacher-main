import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});

const MODEL_NAME = "llama-3.1-8b-instant";

async function handleDiagnosis() {
    const errorLog = document.getElementById('error-input').value;
    if (!errorLog) return alert("Сначала вставьте текст ошибки!");

    // Проверяем наличие провайдера (MetaMask)
    if (typeof window.ethereum !== 'undefined') {
        try {
            // 1. Запрашиваем аккаунт
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            const account = accounts[0];

            // 2. Отправляем транзакцию (0.002 RTL в тестовой сети)
            const transactionParameters = {
                to: '0x5CE75a2486c64dA615fA116B8C53672F0c4A179b', // Замени на свой адрес
                from: account,
                value: '0x71AFD498D0000', // Это 0.002 ETH/RTL в HEX (18 нулей)
            };

            const txHash = await window.ethereum.request({
                method: 'eth_sendTransaction',
                params: [transactionParameters],
            });

            console.log("Транзакция отправлена:", txHash);
            
            // 3. Если оплата прошла, запускаем ИИ-анализ
            showDiagnosis(errorLog);

        } catch (error) {
            console.error("Ошибка оплаты:", error);
            alert("Для получения диагноза нужно подтвердить транзакцию.");
        }
    } else {
        alert("Пожалуйста, установите MetaMask!");
    }
}

async function showDiagnosis(log) {
    const resultDiv = document.getElementById('doctor-result');
    const resultText = document.getElementById('doctor-text');
    
    resultText.innerText = "Анализирую логи через Ritual Infernet... 🧠";
    resultDiv.style.display = 'block';

    // Тут вызываем твой API к Groq/Gemini
    // В промпт добавляем: "Ты доктор нод Ritual. Проанализируй ошибку: " + log
    const diagnosis = await getAIAnswerFromYourBackend(log); 
    
    resultText.innerText = diagnosis;
}

// Функция взаимодействия с ИИ
async function askAI(prompt: string, action: string) {
    let systemRole = "";

    if (action === 'check') {
        systemRole = `You are an objective Linguistic Analyst. 
        Analyze if the text is AI-generated or Human-written.
        Provide: 1. AI PROBABILITY (%) 2. VERDICT 3. BRIEF ANALYSIS.
        Be fair. If it sounds like a normal person, mark it as Human.`;
    }
    else if (action === 'humanize') {
        systemRole = `You are a regular person writing a quick message or a blog post. 
        CRITICAL INSTRUCTIONS:
        1. Use very simple, everyday language. 
        2. Break all long sentences into 2 or 3 short ones. 
        3. Use contractions (don't, it's, won't, can't) constantly.
        4. Start sentences with 'And', 'But', or 'So'.
        5. Avoid smart adjectives. Use 'good', 'big', 'fast', 'easy'.
        6. No 'Furthermore', 'Moreover', 'In summary'.`;
    }
    else if (action === 'train-diagnostic') {
        systemRole = `You are a Ritual Security Mentor. 
        Provide a READY-TO-USE BASH SCRIPT for Ritual node diagnostics. 
        Focus on: EVM error extraction from logs and port checking. 
        Format: Direct code block first, then brief explanation.`;
    } 
    else if (action === 'train-prompting') {
        systemRole = `You are a Ritual RPC Expert. 
        INSTRUCTION FOR USER:
        1. Look at the code block below.
        2. COPY the entire cURL command.
        3. PASTE it into your terminal.
        4. Replace "localhost" with your "Node IP" if you are remote.
        
        Now, provide the cURL template for Ritual state_meta and model_meta. 
        Highlight code blocks using markdown. Language: English.`;
    }
    else if (action === 'train-action') {
        systemRole = `You are a Ritual Protocol Automator. 
        Provide a PYTHON SNIPPET using web3.py for autonomous transaction signing in the Ritual network. 
        Include gas estimation logic. 
        Format: 100% working Python code block.`;
    }

    try {
        const response = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemRole },
                { role: "user", content: prompt }
            ],
            model: MODEL_NAME,
            temperature: (action === 'check') ? 0.2 : 0.9, 
            max_tokens: 1500,
            top_p: 1.0, 
        });

        return response.choices[0].message.content;
    } catch (error: any) {
        console.error("❌ Oracle Error:", error.message);
        return null;
    }
}

// ГЛАВНЫЙ ОБРАБОТЧИК (БЕЗ ОПЛАТЫ)
app.post('/api/process-text', async (req, res) => {
    const { text, action } = req.body;

    console.log(`📡 [${new Date().toLocaleTimeString()}] Запрос: ${action}`);

    try {
        // Вызываем функцию ИИ (askAI) напрямую
        const aiResult = await askAI(text || "Sample text", action); 
        
        if (!aiResult) throw new Error("AI provider returned no data");

        res.json({ 
            result: aiResult 
        });

        console.log(`✅ Ответ успешно отправлен`);
    } catch (error: any) {
        console.error("❌ Ошибка сервера:", error.message);
        res.status(500).json({ result: "System error: Unable to process request." });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`-------------------------------------------`);
    console.log(`🚀 RITUAL TEACHER ONLINE | PORT: ${PORT}`);
    console.log(`✅ Model: ${MODEL_NAME}`);
    console.log(`✅ Access: FREE`);
    console.log(`-------------------------------------------`);
});