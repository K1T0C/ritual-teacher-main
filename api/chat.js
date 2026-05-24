export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, ngrok-skip-browser-warning');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(200).json({ reply: 'Method not allowed' });
    }
    
    try {
        const { message, action, moduleName } = req.body;
        
        if (action === 'proxy_oracle') {
            try {
                const oracleResponse = await fetch('https://recipient-riverside-duckling.ngrok-free.dev/api/process-text', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'ngrok-skip-browser-warning': 'true'
                    },
                    body: JSON.stringify({ message, action: moduleName, moduleName }) 
                });

                const responseText = await oracleResponse.text();
                
                try {
                    const oracleData = JSON.parse(responseText);
                    return res.status(200).json(oracleData); 
                } catch (jsonErr) {
                    return res.status(200).json({ 
                        reply: "🚨 Сервер в Oracle Cloud вернул не JSON. Текст ответа: " + responseText.substring(0, 100)
                    });
                }
            } catch (networkErr) {
                return res.status(200).json({ 
                    reply: "🚨 Не удалось связаться с ngrok: " + networkErr.message
                });
            }
        }

        const apiKey = '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'; 
        let systemContent = '';
        
        if (action === 'doctor') systemContent = 'You are the Ritual Node Doctor. Technical cyberpunk style.';
        else if (action === 'teacher') systemContent = 'You are the Ritual Teacher. Module: ' + (moduleName || 'General');
        else if (action === 'ai_detect') systemContent = 'You are an AI Text Detector. Output percentage.';
        else if (action === 'humanize') systemContent = 'You are a Text Humanizer. Make it look 100% human.';
        else systemContent = 'You are a helpful AI Assistant.';

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [{ role: 'system', content: systemContent }, { role: 'user', content: message || '' }],
                temperature: action === 'humanize' ? 0.8 : 0.5
            })
        });
        
        const data = await response.json();
        if (data.error) return res.status(200).json({ reply: '🚨 Groq Error: ' + data.error.message });
        return res.status(200).json({ reply: data.choices[0].message.content });

    } catch (globalError) {
        return res.status(200).json({ 
            reply: "🛠️ Критическая ошибка Vercel: " + globalError.message 
        });
    }
}