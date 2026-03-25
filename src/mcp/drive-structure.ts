/**
 * Drive folder structure — deklarativ definition av FIA:s mappträd på Google Drive.
 *
 * Används av drive-setup.ts för att skapa mappar och generera agent-kontext.
 */

export interface DriveFolderNode {
  name: string;
  children?: DriveFolderNode[];
}

/** Hela mappträdet som skapas på Drive. */
export const DRIVE_FOLDER_TREE: DriveFolderNode = {
  name: "FIA",
  children: [
    {
      name: "Content",
      children: [{ name: "Blogg" }, { name: "Sociala medier" }, { name: "Utkast" }],
    },
    { name: "Kampanjer" },
    { name: "Strategi" },
    { name: "SEO" },
    {
      name: "Analytics",
      children: [{ name: "Veckorapporter" }, { name: "Månadsrapporter" }],
    },
    { name: "Intelligence" },
    { name: "Mallar" },
  ],
};

/**
 * Mapping: agent-slug → vilka Drive-sökvägar agenten behöver i sin kontext.
 * Sökvägarna matchar trädstrukturen ovan (t.ex. "FIA/Content/Blogg").
 */
export const AGENT_DRIVE_FOLDERS: Record<string, string[]> = {
  content: ["FIA/Content/Blogg", "FIA/Content/Sociala medier", "FIA/Content/Utkast", "FIA/Mallar"],
  intelligence: ["FIA/Intelligence", "FIA/Content/Utkast"],
  analytics: ["FIA/Analytics/Veckorapporter", "FIA/Analytics/Månadsrapporter"],
  strategy: ["FIA/Strategi", "FIA/Kampanjer"],
  seo: ["FIA/SEO"],
};

/**
 * Flatten the folder tree into a list of full paths.
 * E.g. ["FIA", "FIA/Content", "FIA/Content/Blogg", ...]
 */
export function flattenTree(node: DriveFolderNode, parentPath = ""): string[] {
  const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  const paths = [currentPath];
  if (node.children) {
    for (const child of node.children) {
      paths.push(...flattenTree(child, currentPath));
    }
  }
  return paths;
}
