/**
 * AgentLoop — bounded Claude tool-use loop with prompt caching, cost tracking,
 * and EventEmitter-based broadcasting.
 *
 * Constructor accepts a mock client via options.client for unit testing.
 * abort() cancels in-flight client.messages.stream() via AbortController.
 * Never writes to stdout — all output via this.emit() events.
 *
 * Pricing: Haiku 4.5 — INPUT $1.00/MTok, OUTPUT $5.00/MTok (verified 2026-04-29).
 * RESEARCH.md flagged that CONTEXT.md had Haiku 3.5 prices ($0.80/$4.00); the
 * correct values below are used.
 */
import { EventEmitter } from 'node:events';
import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  ContentBlock,
  ToolUseBlock,
  TextBlockParam,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages/messages.js';
import type Database from 'better-sqlite3';
import type { RiderProfile } from '../types/profile.js';
import type { NormalizedProduct } from '../data/normalizer.js';
import { CACHED_TOOLS } from './tools.js';
import type { FilterSpec } from './filter-spec.js';
import { applyFilterSpec } from './filter-spec.js';
import { summarizeProduct } from './summarize.js';
import {
  RETAILERS,
  RequestPipeline,
  fetchAllProducts,
  normalizeProduct,
  makeProductRepo,
} from '../data/index.js';

// ---- Exported constants ----
export const MAX_AGENT_TURNS = 15;
export const INPUT_PRICE_PER_MTOK = 1.00;   // Haiku 4.5 — RESEARCH.md correction (CONTEXT.md had 0.80 — that is Haiku 3.5)
export const OUTPUT_PRICE_PER_MTOK = 5.00;  // Haiku 4.5 — RESEARCH.md correction (CONTEXT.md had 4.00 — that is Haiku 3.5)
export const DEFAULT_COST_CEILING_USD = 0.10;
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS_PER_TURN = 1024;

// ---- Event map (typed EventEmitter generic) ----
export type AgentLoopEvents = {
  token: [delta: string];
  tool_use: [toolName: string, input: unknown];
  result: [products: NormalizedProduct[]];
  error: [error: { code: string; [key: string]: unknown }];
  done: [];
};

export interface AgentLoopOptions {
  /** Falls back to process.env['ANTHROPIC_API_KEY'] */
  apiKey?: string;
  /** Default DEFAULT_COST_CEILING_USD; overridable via SHRED_SCOUT_COST_LIMIT env */
  costCeilingUsd?: number;
  /** Default MAX_AGENT_TURNS */
  maxTurns?: number;
  /** Test injection point — mocked SDK in unit tests */
  client?: Anthropic;
}

function buildSystemPrompt(profile: RiderProfile): TextBlockParam[] {
  const text = [
    'You are Shred Scout, a snowboard gear shopping assistant.',
    `Rider profile: boot size US ${profile.bootSize}, height ${profile.heightCm}cm, weight ${profile.weightKg}kg, riding style "${profile.ridingStyle}".`,
    'On the first user turn, call search_products with a query inferred from the user intent.',
    'On subsequent turns, call refine_results with a structured FilterSpec — never re-search.',
    'Tool results are pre-summarized to {id, title, price, summary} — never request raw product data.',
    'Be concise. Surface findings to the user as short text between tool calls.',
  ].join('\n');
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
}

function readCostCeilingEnv(): number | null {
  const raw = process.env['SHRED_SCOUT_COST_LIMIT'];
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class AgentLoop extends EventEmitter<AgentLoopEvents> {
  readonly #client: Anthropic;
  readonly #profile: RiderProfile;
  readonly #db: Database.Database;
  readonly #costCeilingUsd: number;
  readonly #maxTurns: number;
  readonly #system: TextBlockParam[];
  #controller: AbortController;
  #workingSet: NormalizedProduct[] = [];
  #totalCostUsd = 0;
  #messages: MessageParam[] = [];

  constructor(
    profile: RiderProfile,
    db: Database.Database,
    options?: AgentLoopOptions,
  ) {
    super();
    this.#profile = profile;
    this.#db = db;
    this.#system = buildSystemPrompt(profile);
    this.#maxTurns = options?.maxTurns ?? MAX_AGENT_TURNS;
    this.#costCeilingUsd =
      readCostCeilingEnv() ?? options?.costCeilingUsd ?? DEFAULT_COST_CEILING_USD;
    this.#controller = new AbortController();
    if (options?.client) {
      this.#client = options.client;
    } else {
      const apiKey = options?.apiKey ?? process.env['ANTHROPIC_API_KEY'];
      if (!apiKey) {
        // Never interpolate apiKey itself; just signal its absence.
        throw new Error('ANTHROPIC_API_KEY is required (set env var or options.apiKey)');
      }
      this.#client = new Anthropic({ apiKey, maxRetries: 1 });
    }
  }

  abort(): void {
    this.#controller.abort();
  }

  async run(userMessage: string): Promise<void> {
    // Reset per-run state. Allow re-running the same instance.
    this.#controller = new AbortController();
    this.#messages = [{ role: 'user', content: userMessage }];

    try {
      for (let turn = 0; turn < this.#maxTurns; turn++) {
        // Pre-turn cost check — checked BEFORE dispatching the turn
        if (this.#totalCostUsd >= this.#costCeilingUsd) {
          this.emit('error', {
            code: 'cost_ceiling',
            spent: this.#totalCostUsd,
            limit: this.#costCeilingUsd,
          });
          return;
        }

        let finalMsg: Awaited<ReturnType<Anthropic['messages']['stream']>['finalMessage']>;
        try {
          const stream = this.#client.messages.stream(
            {
              model: MODEL,
              max_tokens: MAX_TOKENS_PER_TURN,
              system: this.#system,
              tools: CACHED_TOOLS,
              messages: this.#messages,
            },
            { signal: this.#controller.signal },
          );
          stream.on('text', (delta: string) => this.emit('token', delta));
          finalMsg = await stream.finalMessage();
        } catch (err) {
          // AbortError is expected (user cancelled) — do not surface as error.
          if (err instanceof Error && err.name === 'AbortError') {
            this.emit('done');
            return;
          }
          this.emit('error', { code: 'stream_error' });
          return;
        }

        // Cost accounting — accumulate from usage field
        const { input_tokens = 0, output_tokens = 0 } = finalMsg.usage ?? {};
        this.#totalCostUsd +=
          (input_tokens * INPUT_PRICE_PER_MTOK + output_tokens * OUTPUT_PRICE_PER_MTOK) / 1_000_000;

        // Push assistant turn into message history
        this.#messages.push({ role: 'assistant', content: finalMsg.content });

        switch (finalMsg.stop_reason) {
          case 'end_turn':
            this.emit('done');
            return;

          case 'tool_use': {
            const toolUseBlocks = (finalMsg.content as ContentBlock[]).filter(
              (b): b is ToolUseBlock => b.type === 'tool_use',
            );
            // Dispatch all tool_use blocks in parallel (RESEARCH Pitfall 7)
            const toolResults = await Promise.all(
              toolUseBlocks.map((b) => this.#dispatchTool(b)),
            );
            // tool_result blocks MUST be FIRST in user message content (RESEARCH Pitfall 3)
            this.#messages.push({ role: 'user', content: toolResults });
            break; // continue loop
          }

          case 'max_tokens':
            this.emit('error', {
              code: 'max_tokens',
              message: 'Response truncated — max_tokens reached',
            });
            return;

          case 'stop_sequence':
          case 'pause_turn':
          case 'refusal':
            this.emit('error', {
              code: 'unexpected_stop',
              stopReason: finalMsg.stop_reason,
            });
            return;

          default:
            // Defensive: handle any future StopReason values added to the SDK
            this.emit('error', {
              code: 'unexpected_stop',
              stopReason: finalMsg.stop_reason,
            });
            return;
        }
      }

      // Loop fell through all maxTurns without end_turn — hard cap reached
      this.emit('error', { code: 'max_turns', limit: this.#maxTurns });
    } catch {
      this.emit('error', { code: 'stream_error' });
    }
  }

  async #dispatchTool(block: ToolUseBlock): Promise<ToolResultBlockParam> {
    this.emit('tool_use', block.name, block.input);
    try {
      if (block.name === 'search_products') {
        const products = await this.#dispatchSearchProducts(block.input);
        this.#workingSet = products;
        this.emit('result', products);
        return {
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: JSON.stringify(products.map(summarizeProduct)),
        };
      }

      if (block.name === 'refine_results') {
        const raw = (block.input ?? {}) as Record<string, unknown>;
        const spec: FilterSpec = {
          ...(typeof raw['priceMax'] === 'number' ? { priceMax: raw['priceMax'] } : {}),
          ...(raw['flex'] === 'soft' || raw['flex'] === 'medium' || raw['flex'] === 'stiff'
            ? { flex: raw['flex'] as FilterSpec['flex'] }
            : {}),
          ...(typeof raw['color'] === 'string' ? { color: raw['color'] } : {}),
          ...(raw['gearType'] === 'board' || raw['gearType'] === 'binding' || raw['gearType'] === 'boot'
            ? { gearType: raw['gearType'] as FilterSpec['gearType'] }
            : {}),
          ...(typeof raw['retailer'] === 'string' ? { retailer: raw['retailer'] } : {}),
        };
        const filtered = applyFilterSpec(this.#workingSet, spec);
        this.#workingSet = filtered;
        this.emit('result', filtered);
        return {
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: JSON.stringify(filtered.map(summarizeProduct)),
        };
      }

      return {
        type: 'tool_result' as const,
        tool_use_id: block.id,
        content: `Unknown tool: ${block.name}`,
        is_error: true,
      };
    } catch {
      return {
        type: 'tool_result' as const,
        tool_use_id: block.id,
        content: 'Tool execution failed',
        is_error: true,
      };
    }
  }

  async #dispatchSearchProducts(input: unknown): Promise<NormalizedProduct[]> {
    const args = (input ?? {}) as { query?: string; filters?: FilterSpec };
    const pipeline = new RequestPipeline();
    const productRepo = makeProductRepo(this.#db);
    const all: NormalizedProduct[] = [];

    for (const retailer of RETAILERS) {
      // fetchAllProducts takes storeUrl: string, NOT a Retailer object
      const raws = await fetchAllProducts(retailer.baseUrl, pipeline);
      for (const raw of raws) {
        // normalizeProduct takes (raw: ShopifyProductInput, retailer: string)
        const normalized = normalizeProduct(raw, retailer.name);
        productRepo.upsert(normalized);
        all.push(normalized);
      }
    }

    if (args.filters) {
      return applyFilterSpec(all, args.filters);
    }
    return all;
  }
}
