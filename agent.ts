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
const RITUAL_RPC_URL = process.env.RITUAL_RPC_URL ?? 'https://rpc.ritualfoundation.org';
const LLM_PRECOMPILE = '0x0000000000000000000000000000000000000802';
const PRECOMPILE_CALLED_TOPIC = ethers.id('PrecompileCalled(address,bytes,bytes)');

const AGENT_DEPLOYER_ADDRESS =
    process.env.AGENT_DEPLOYER_ADDRESS ?? '0x0000000000000000000000000000000000000000';
const PAYOUT_WALLET =
    process.env.PAYOUT_WALLET ?? '0xYOUR_WALLET_HERE';
const SERVICE_FEE_RIT = process.env.SERVICE_FEE_RIT ?? '0.002';

const provider = new ethers.JsonRpcProvider(RITUAL_RPC_URL, RITUAL_CHAIN_ID);

export const SYSTEM_PROMPTS: Record<string, string> = {
    check: `You are an objective Linguistic Analyst.
Analyze if the text is AI-generated or Human-written.
Provide: 1. AI PROBABILITY (%) 2. VERDICT 3. BRIEF ANALYSIS.
Be fair. If it sounds like a normal person, mark it as Human.`,
    humanize: `You are a regular person writing a quick message or a blog post.
CRITICAL INSTRUCTIONS:
1. Use very simple, everyday language.
2. Break all long sentences into 2 or 3 short ones.
3. Use contractions (don't, it's, won't, can't) constantly.
4. Start sentences with 'And', 'But', or 'So'.
5. Avoid smart adjectives. Use 'good', 'big', 'fast', 'easy'.
6. No 'Furthermore', 'Moreover', 'In summary'.`,
    'train-diagnostic': `You are a Ritual Security Mentor.
Provide a READY-TO-USE BASH SCRIPT for Ritual node diagnostics.
Focus on: EVM error extraction from logs and port checking.
Format: Direct code block first, then brief explanation.`,
    'train-prompting': `You are a Ritual RPC Expert.
INSTRUCTION FOR USER:
1. Look at the code block below.
2. COPY the entire cURL command.
3. PASTE it into your terminal.
4. Replace "localhost" with your "Node IP" if you are remote.

Now, provide the cURL template for Ritual state_meta and model_meta.
Highlight code blocks using markdown. Language: English.`,
    'train-action': `You are a Ritual Protocol Automator.
Provide a PYTHON SNIPPET using web3.py for autonomous transaction signing in the Ritual network.
Include gas estimation logic.
Format: 100% working Python code block.`,
    doctor: `You are the Ritual Node Doctor. Analyze node logs, identify root causes, and suggest concrete fixes.
Use a technical cyberpunk tone. Be concise and actionable.`,
};

const ACTION_TO_ENUM: Record<string, number> = {
    check: 0,
    humanize: 1,
    'train-diagnostic': 2,
    'train-prompting': 3,
    'train-action': 4,
    doctor: 5,
};

function temperatureForAction(action: string): number {
    if (action === 'check') return 200;
    if (action === 'humanize') return 900;
    return 700;
}

export function buildMessagesJson(action: string, userText: string): string {
    const system = SYSTEM_PROMPTS[action] ?? SYSTEM_PROMPTS.doctor;
    return JSON.stringify([
        { role: 'system', content: system },
        { role: 'user', content: userText },
    ]);
}

function decodeCompletionText(completionData: string): string {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const [, , , , , , choicesCount, choicesData] = coder.decode(
        ['string', 'string', 'uint256', 'string', 'string', 'string', 'uint256', 'bytes[]', 'bytes'],
        completionData,
    ) as [string, string, bigint, string, string, string, bigint, string[], string];

    if (choicesCount === 0n || choicesData.length === 0) {
        return 'LLM returned no choices.';
    }

    const [, , messageData] = coder.decode(['uint256', 'string', 'bytes'], choicesData[0]) as [
        bigint,
        string,
        string,
    ];
    const [, content] = coder.decode(
        ['string', 'string', 'string', 'uint256', 'bytes[]'],
        messageData,
    ) as [string, string, string, bigint, string[]];

    return stripRedactedThinking(content || 'Empty response from Ritual LLM.');
}

function stripRedactedThinking(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '').trim();
}

export function extractLLMTextFromReceipt(receipt: ethers.TransactionReceipt): string | null {
    const coder = ethers.AbiCoder.defaultAbiCoder();

    for (const log of receipt.logs) {
        if (log.topics[0] !== PRECOMPILE_CALLED_TOPIC) continue;

        const decoded = coder.decode(['address', 'bytes', 'bytes'], log.data) as [string, string, string];
        const addr = decoded[0];
        const output = decoded[2];

        if (addr.toLowerCase() !== LLM_PRECOMPILE.toLowerCase()) continue;

        let actualOutput = output;
        try {
            const unwrapped = coder.decode(['bytes', 'bytes'], output) as [string, string];
            actualOutput = unwrapped[1];
        } catch {
            // already unwrapped
        }

        const [hasError, completionData, , errorMessage] = coder.decode(
            ['bool', 'bytes', 'bytes', 'string', 'tuple(string,string,string)'],
            actualOutput,
        ) as [boolean, string, string, string, [string, string, string]];

        if (hasError) {
            return `Ritual LLM error: ${errorMessage || 'unknown error'}`;
        }

        return decodeCompletionText(completionData);
    }

    return null;
}

function extractFromAgentDeployerEvent(receipt: ethers.TransactionReceipt): string | null {
    const iface = new ethers.Interface([
        'event TextProcessed(address indexed requester, uint8 indexed action, bool hasError, bytes completionData, string errorMessage)',
    ]);

    for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== AGENT_DEPLOYER_ADDRESS.toLowerCase()) continue;
        try {
            const parsed = iface.parseLog(log);
            if (!parsed || parsed.name !== 'TextProcessed') continue;
            if (parsed.args.hasError) {
                return `Ritual LLM error: ${parsed.args.errorMessage}`;
            }
            return decodeCompletionText(parsed.args.completionData);
        } catch {
            continue;
        }
    }

    return null;
}

app.get('/api/ritual/config', (_req, res) => {
    res.json({
        chainId: RITUAL_CHAIN_ID,
        chainName: 'Ritual',
        rpcUrl: RITUAL_RPC_URL,
        agentDeployer: AGENT_DEPLOYER_ADDRESS,
        payoutWallet: PAYOUT_WALLET,
        serviceFeeRit: SERVICE_FEE_RIT,
        serviceFeeWei: ethers.parseEther(SERVICE_FEE_RIT).toString(),
        llmPrecompile: LLM_PRECOMPILE,
        model: 'zai-org/GLM-4.7-FP8',
        actionEnum: ACTION_TO_ENUM,
        systemPrompts: SYSTEM_PROMPTS,
    });
});

app.post('/api/ritual/build-messages', (req, res) => {
    const { text, action } = req.body as { text?: string; action?: string };
    if (!text || !action) {
        return res.status(400).json({ error: 'text and action are required' });
    }

    res.json({
        messagesJson: buildMessagesJson(action, text),
        temperature: temperatureForAction(action),
        actionEnum: ACTION_TO_ENUM[action] ?? ACTION_TO_ENUM.doctor,
    });
});

app.post('/api/ritual/decode', async (req, res) => {
    const { txHash } = req.body as { txHash?: string };
    if (!txHash) {
        return res.status(400).json({ error: 'txHash is required' });
    }

    try {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt) {
            return res.status(404).json({ error: 'Receipt not found yet. Wait for settlement.' });
        }

        const fromEvent = extractFromAgentDeployerEvent(receipt);
        const fromPrecompile = extractLLMTextFromReceipt(receipt);
        const result = fromEvent ?? fromPrecompile;

        if (!result) {
            return res.status(404).json({
                error: 'No Ritual LLM output found in receipt yet. Async settlement may still be pending.',
            });
        }

        res.json({ result, txHash, status: receipt.status });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Decode failed';
        res.status(500).json({ error: message });
    }
});

// Backward-compatible alias for older frontends
app.post('/api/process-text', async (req, res) => {
    const { txHash } = req.body as { txHash?: string };

    if (txHash) {
        try {
            const receipt = await provider.getTransactionReceipt(txHash);
            if (!receipt) {
                return res.status(404).json({ result: 'Receipt not found yet.' });
            }
            const fromEvent = extractFromAgentDeployerEvent(receipt);
            const fromPrecompile = extractLLMTextFromReceipt(receipt);
            const result = fromEvent ?? fromPrecompile;
            if (!result) {
                return res.status(404).json({ result: 'Ritual LLM output not ready yet.' });
            }
            return res.json({ result });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Decode failed';
            return res.status(500).json({ result: message });
        }
    }

    res.status(400).json({
        result:
            'Direct off-chain LLM is disabled. Pay via AgentDeployer on Ritual Chain (1979), then POST { txHash } to /api/ritual/decode.',
        hint: { chainId: RITUAL_CHAIN_ID, agentDeployer: AGENT_DEPLOYER_ADDRESS },
    });
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
    console.log('-------------------------------------------');
    console.log(`RITUAL TEACHER | PORT ${PORT}`);
    console.log(`Chain ID: ${RITUAL_CHAIN_ID}`);
    console.log(`AgentDeployer: ${AGENT_DEPLOYER_ADDRESS}`);
    console.log(`Payout wallet: ${PAYOUT_WALLET}`);
    console.log(`Service fee: ${SERVICE_FEE_RIT} RIT`);
    console.log('LLM: Ritual precompile 0x0802 (on-chain)');
    console.log('-------------------------------------------');
});
