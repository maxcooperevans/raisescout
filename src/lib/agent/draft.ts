import type Anthropic from "@anthropic-ai/sdk";
import { extractUsage, getAnthropic, SCORE_MODEL } from "../anthropic";
import type { CallUsage, Enrichment, RaiseProfile, ScoreObject } from "../types";

export interface DraftIntro {
  subject: string;
  body: string;
  usage: CallUsage;
}

const SYSTEM = `You draft a founder's personalised FIRST-TOUCH email to an investor.
This is a DRAFT for the founder to review and send themselves — it is never sent
automatically. Keep a human on the send button.

Requirements:
- Short and direct: 100-130 words in the body. No filler, no flattery padding.
- Ground it in ONE concrete, specific hook from the research — a named portfolio
  company, a thesis/essay they published, or a recent investment. Generic praise
  ("I love what you do") is a failure; specificity is the whole point.
- Founder-to-investor voice: confident, plain, respectful of their time.
- State what the company does in one line, the raise (stage + amount), and a clear
  light-touch ask (a short call). Do not over-explain.
- Only use facts from the provided research/raise. Do not invent traction, metrics,
  mutual connections, or portfolio details.
- Output a subject line and the body. No placeholders like [Name] unless the real
  name is genuinely unknown.

Return the draft via the submit_draft tool.`;

const DRAFT_TOOL: Anthropic.Tool = {
  name: "submit_draft",
  description: "Submit the drafted first-touch email.",
  input_schema: {
    type: "object",
    properties: {
      subject: { type: "string", description: "Email subject line." },
      body: {
        type: "string",
        description: "Email body, 100-130 words, grounded in one concrete hook.",
      },
    },
    required: ["subject", "body"],
  },
};

function buildPrompt(
  raise: RaiseProfile,
  investorName: string,
  enrichment: Enrichment,
  score: ScoreObject,
): string {
  // The strongest, best-sourced dimensions make the best hooks.
  const hooks = score.dimensions
    .filter((d) => d.score >= 3 && d.evidence)
    .map((d) => `- ${d.evidence}`)
    .join("\n");

  return `FOUNDER'S RAISE
- Company: ${raise.company_name}
- What it does: ${raise.thesis}
- Stage / raising: ${raise.stage}, ${raise.round_size}
- Geography: ${raise.geography}

INVESTOR: ${investorName}${enrichment.firm_name ? ` (${enrichment.firm_name})` : ""}
- About: ${enrichment.description ?? "(see findings)"}
- Relevant portfolio: ${enrichment.notable_portfolio.join(", ") || "(none found)"}

CONCRETE HOOKS AVAILABLE (pick the single best one):
${hooks || "(no strong hooks — keep it brief and lead with the raise)"}

Write the first-touch draft.`;
}

/**
 * Spec §3 step 4 — Draft. A grounded, personalised first-touch the founder
 * reviews before sending. Never auto-sent.
 */
export async function draftIntro(
  raise: RaiseProfile,
  investorName: string,
  enrichment: Enrichment,
  score: ScoreObject,
  client: Anthropic = getAnthropic(),
): Promise<DraftIntro> {
  const res = await client.messages.create({
    model: SCORE_MODEL,
    max_tokens: 1000,
    system: SYSTEM,
    tools: [DRAFT_TOOL],
    tool_choice: { type: "tool", name: "submit_draft" },
    messages: [
      {
        role: "user",
        content: buildPrompt(raise, investorName, enrichment, score),
      },
    ],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Draft model did not return the submit_draft tool call.");
  }
  const input = toolUse.input as { subject?: string; body?: string };
  return {
    subject: input.subject?.trim() ?? "",
    body: input.body?.trim() ?? "",
    usage: extractUsage(res),
  };
}
