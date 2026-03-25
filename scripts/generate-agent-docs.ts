import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { parse } from "yaml";
import { join } from "path";

const agentsDir = "./knowledge/agents";
const outDir = "docs/docs/architecture";
mkdirSync(outDir, { recursive: true });

interface AgentManifest {
  name: string;
  slug: string;
  version: string;
  autonomy: string;
  sample_review_rate?: number;
  escalation_threshold?: number;
  skills?: string[];
  tools?: string[];
  routing?: Record<string, unknown>;
  triggers?: Array<{
    name: string;
    on: string;
    enabled?: boolean;
    requires_approval?: boolean;
    action: {
      type: string;
      target_agent?: string;
      channel?: string;
    };
  }>;
  self_eval?: {
    enabled: boolean;
    model: string;
    threshold: number;
    criteria?: string[];
  };
  has_veto?: boolean;
  max_iterations?: number;
}

const slugs = readdirSync(agentsDir).filter((d) => existsSync(join(agentsDir, d, "agent.yaml")));

let md = "# Agentreferens\n\n";
md += '!!! info "Auto-genererad"\n';
md += "    Denna sida genereras automatiskt från `agent.yaml`-filer. Senast uppdaterad: " + new Date().toISOString().split("T")[0] + "\n\n";

for (const slug of slugs.sort()) {
  const yamlContent = readFileSync(join(agentsDir, slug, "agent.yaml"), "utf-8");
  const agent = parse(yamlContent) as AgentManifest;

  md += `## ${agent.name} (\`${agent.slug}\`)\n\n`;
  md += `| Egenskap | Värde |\n|----------|-------|\n`;
  md += `| Version | ${agent.version} |\n`;
  md += `| Autonomi | ${agent.autonomy} |\n`;
  md += `| Review rate | ${agent.sample_review_rate ?? "—"} |\n`;
  md += `| Eskalerningströskel | ${agent.escalation_threshold ?? "—"} |\n`;
  md += `| Default-modell | ${agent.routing?.default ?? "—"} |\n`;
  md += `| Skills | ${agent.skills?.join(", ") ?? "—"} |\n`;
  md += `| Tools | ${agent.tools?.join(", ") || "Inga"} |\n`;
  md += `| Triggers | ${agent.triggers?.length ?? 0} st |\n`;

  if (agent.has_veto) {
    md += `| Vetorätt | Ja |\n`;
  }
  if (agent.self_eval?.enabled) {
    md += `| Self-eval | ${agent.self_eval.model}, tröskel ${agent.self_eval.threshold} |\n`;
  }
  md += "\n";

  if (agent.routing) {
    md += `### Routing\n\n`;
    md += `| Uppgiftstyp | Modell |\n|-------------|--------|\n`;
    for (const [type, model] of Object.entries(agent.routing)) {
      if (typeof model === "string") {
        md += `| ${type} | \`${model}\` |\n`;
      } else if (model && typeof model === "object") {
        const m = model as { primary?: string; fallback?: string };
        md += `| ${type} | \`${m.primary}\` (fallback: \`${m.fallback}\`) |\n`;
      }
    }
    md += "\n";
  }

  if (agent.triggers?.length) {
    md += `### Triggers\n\n`;
    md += `| Namn | Event | Mål | Godkännande? |\n|------|-------|-----|--------------|\n`;
    for (const t of agent.triggers) {
      const target = t.action.target_agent || t.action.channel || "—";
      md += `| ${t.name} | ${t.on} | ${target} | ${t.requires_approval ? "Ja" : "Nej"} |\n`;
    }
    md += "\n";
  }

  md += "---\n\n";
}

const outPath = join(outDir, "agents-reference.md");
writeFileSync(outPath, md);
console.log(`✓ Agentreferens skriven till ${outPath} (${slugs.length} agenter)`);
