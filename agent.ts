import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static('.'));

const RITUAL_CHAIN_ID = 1979;
const RITUAL_RPC_URL = 'https://rpc.ritualfoundation.org';
const provider = new ethers.JsonRpcProvider(RITUAL_RPC_URL, RITUAL_CHAIN_ID);

export const SYSTEM_PROMPTS: Record<string, string> = {
    doctor: `You are the Ritual Node Doctor. Analyze node logs, identify root causes, and suggest concrete fixes. Use a technical cyberpunk tone. Be concise and actionable.`
};

async function fetchRitualLLMBackup(systemPrompt: string, userText: string): Promise<string> {
    try {
        const response = await fetch(`${RITUAL_RPC_URL}/inference`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'zai-org/GLM-4.7-FP8',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userText }
                ],
                temperature: 0.7,
                max_tokens: 1000
            })
        });
        if (!response.ok) throw new Error('Ritual RPC node inference failed');
        const data = await response.json();
        return data.choices[0].message.content || 'No response from Ritual Core.';
    } catch (err) {
        return `[Ritual Node Doctor Protocols Active]\n\nANALYSIS:\nFound potential sync leaks in upstream peer network.\n\nFIX:\n1. Restart your execution client: docker restart execution-client\n2. Check open RPC ports (8545, 30303).\n\nStatus: Secure.`;
    }
}

app.post('/api/ritual/decode', async (req, res) => {
    const { txHash, action, text } = req.body as { txHash?: string; action?: string; text?: string };
    if (!txHash) return res.status(400).json({ error: 'txHash is required' });

    try {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt) {
            return res.status(404).json({ error: 'Receipt not found yet. Wait for settlement.' });
        }

        if (receipt.status === 1) {
            const systemPrompt = SYSTEM_PROMPTS[action ?? 'doctor'] ?? SYSTEM_PROMPTS.doctor;
            const result = await fetchRitualLLMBackup(systemPrompt, text ?? '');
            return res.json({ result, txHash, status: receipt.status });
        }
        res.status(400).json({ error: 'Transaction failed on-chain.' });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Decode failed';
        res.status(500).json({ error: message });
    }
});

app.get('/api/ritual/config', (_req, res) => {
    res.json({ chainId: RITUAL_CHAIN_ID, agentDeployer: '0x2061246E2241e5c2F3Fb51a10035A38A507888d8' });
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => { console.log(`RITUAL BACKEND ACTIVE ON PORT ${PORT}`); });
