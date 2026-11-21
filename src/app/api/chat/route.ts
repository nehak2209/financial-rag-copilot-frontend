import { NextRequest } from 'next/server';
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';

//export const runtime = 'nodejs';
//export const dynamic = 'force-dynamic';
const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
const sessionToken = process.env.AWS_SESSION_TOKEN;

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId,
    secretAccessKey,
    //...(sessionToken ? { sessionToken } : {}),
  },
});

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), { status: 400 });
    }

    // 1. Fetch grounding context from local ChromaDB FastAPI service
    let retrievedContext = '';
    let ragSources: string[] = [];
    try {
      const ragRes = await fetch('http://localhost:8000/retrieve-financial-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: prompt, top_k: 2 }),
      });

      if (ragRes.ok) {
        const ragData = await ragRes.json();
        ragSources = ragData.results.map((r: any) => r.source);
        retrievedContext = ragData.results.map((r: any) => r.content).join('\n\n');
      }
    } catch (ragErr) {
      console.warn('Local RAG unavailable, continuing without grounding context:', ragErr);
    }

    // 2. Prepare system prompt and user message
    const systemPrompt = `You are an Enterprise Financial Copilot.
Answer the user's questions strictly using the provided internal context.
If figures or policies are not in the context, state that they are not verified in official records.
Always cite the source document.`;

    const userContent = retrievedContext
      ? `Internal Financial Records:\n${retrievedContext}\n\nUser Inquiry: ${prompt}`
      : prompt;

    // 3. Initiate Bedrock Streaming
    const command = new ConverseStreamCommand({
      modelId: 'us.anthropic.claude-3-sonnet-20240229-v1:0', // Or amazon.nova-pro-v1:0
      system: [{ text: systemPrompt }],
      messages: [{ role: 'user', content: [{ text: userContent }] }],
      inferenceConfig: {
        maxTokens: 1024,
        temperature: 0.1,
      },
    });

    const response = await bedrockClient.send(command);

    // 4. Transform response stream into SSE
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        // Emit trace metadata if RAG retrieved documents
        if (ragSources.length > 0) {
          const tracePayload = {
            type: 'rag_retrieval',
            title: `Retrieved ${ragSources.length} Grounding Chunks`,
            detail: `Sources:\n${ragSources.join('\n')}`,
          };
          controller.enqueue(encoder.encode(`event: trace\ndata: ${JSON.stringify(tracePayload)}\n\n`));
        }

        if (response.stream) {
          try {
            for await (const chunk of response.stream) {
              if (chunk.contentBlockDelta?.delta?.text) {
                const text = chunk.contentBlockDelta.delta.text;
                controller.enqueue(encoder.encode(`event: chunk\ndata: ${JSON.stringify({ text })}\n\n`));
              }
            }
          } catch (err: any) {
            controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`));
          }
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}