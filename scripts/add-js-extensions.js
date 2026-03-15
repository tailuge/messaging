import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

const distDir = "./dist";

async function addJsExtensions() {
  const files = await readdir(distDir, { recursive: true });

  for (const file of files) {
    if (typeof file !== "string") continue;
    if (!file.endsWith(".js")) continue;

    const filePath = join(distDir, file);
    const content = await readFile(filePath, "utf-8");

    const updated = content.replace(
      /from\s+["'](\.\.?\/[^"']+)["']/g,
      (match, importPath) => {
        if (importPath.startsWith(".")) {
          const hasExtension = /\.\w+$/.test(importPath);
          if (!hasExtension) {
            return match.replace(importPath, importPath + ".js");
          }
        }
        return match;
      }
    );

    if (updated !== content) {
      await writeFile(filePath, updated, "utf-8");
      console.log(`Updated: ${file}`);
    }
  }
}

addJsExtensions().catch(console.error);
