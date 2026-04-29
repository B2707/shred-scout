/**
 * LLM-assisted flex pairing advisory for the Shred Scout compatibility engine.
 *
 * flexPairing() fires a single Claude Haiku call using tool-use to get a structured
 * soft recommendation about board+binding flex compatibility for the rider's style.
 *
 * IMPORTANT: This function is completely separate from runRules() — it is never called
 * inside the synchronous hard-rules path. Callers invoke it independently after runRules().
 *
 * Error contract: this function NEVER throws. Any failure (API error, malformed response,
 * missing tool_use block) returns { verdict: 'unknown', reason: 'Flex pairing advisory unavailable', advisory: true }.
 * The apiKey is never logged or included in error messages.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { GearSetup, RuleResult } from './types.js';
import type { RiderProfile } from '../../types/profile.js';

const FLEX_SYSTEM_PROMPT = `You are a snowboard gear expert. Assess board and binding flex compatibility for a given rider.
Flex is rated 1–10: 1–3 soft (beginner/park), 4–6 medium (freestyle/all-mountain), 7–10 stiff (freeride/expert).
Board and binding flex should match within 1–2 points for optimal energy transfer.
If boardFlexRating is "unknown", respond that you are unable to assess flex pairing without the rating.
Always use the report_flex_pairing tool.`;

const FLEX_PAIRING_TOOL: Anthropic.Tool = {
  name: 'report_flex_pairing',
  description: 'Report the flex pairing assessment for a board+binding combination',
  input_schema: {
    type: 'object' as const,
    properties: {
      recommendation: {
        type: 'string',
        description: 'One-sentence verdict on whether the flex pairing suits this rider',
      },
      reason: {
        type: 'string',
        description: 'Two-sentence explanation of the pairing quality and any concern',
      },
    },
    required: ['recommendation', 'reason'],
  },
};

const UNKNOWN_RESULT: RuleResult = {
  ruleId: 'flex-pairing',
  verdict: 'unknown',
  reason: 'Flex pairing advisory unavailable',
  advisory: true,
};

/**
 * Calls Claude Haiku to assess whether the board+binding flex pairing suits the rider's style.
 *
 * @param setup - The gear setup being evaluated. Uses board.flexRating (optional).
 * @param rider - Rider profile. Uses ridingStyle for context.
 * @param hardResults - Results from runRules() — passed to Claude as context.
 * @param apiKey - Anthropic API key. Never logged or thrown in error messages.
 * @returns A RuleResult with advisory:true. Verdict is 'pass' on success, 'unknown' on any failure.
 */
export async function flexPairing(
  setup: GearSetup,
  rider: RiderProfile,
  hardResults: RuleResult[],
  apiKey: string,
): Promise<RuleResult> {
  try {
    const client = new Anthropic({ apiKey });

    const userMessage = JSON.stringify({
      boardFlexRating: setup.board.flexRating ?? 'unknown',
      ridingStyle: rider.ridingStyle,
      hardRuleResults: hardResults.map((r) => ({ ruleId: r.ruleId, verdict: r.verdict })),
    });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: [
        { type: 'text', text: FLEX_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      tools: [FLEX_PAIRING_TOOL],
      tool_choice: { type: 'tool', name: 'report_flex_pairing' } as const,
      messages: [{ role: 'user', content: userMessage }],
    });

    const toolBlock = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    if (!toolBlock) return UNKNOWN_RESULT;

    const input = toolBlock.input as Record<string, unknown>;
    const recommendation = typeof input['recommendation'] === 'string' ? input['recommendation'] : null;
    const reason = typeof input['reason'] === 'string' ? input['reason'] : null;

    if (!recommendation || !reason) return UNKNOWN_RESULT;

    return {
      ruleId: 'flex-pairing',
      verdict: 'pass',
      reason: `${recommendation} ${reason}`,
      advisory: true,
    };
  } catch {
    return UNKNOWN_RESULT;
  }
}
