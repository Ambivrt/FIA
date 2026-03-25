import { writeFileSync, mkdirSync } from "fs";
import { openApiSpec } from "../src/api/openapi";

const outDir = "docs/docs/assets";
mkdirSync(outDir, { recursive: true });

const outPath = `${outDir}/openapi.json`;
writeFileSync(outPath, JSON.stringify(openApiSpec, null, 2));
console.log(`✓ OpenAPI spec skriven till ${outPath}`);
