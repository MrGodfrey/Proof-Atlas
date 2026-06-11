import fs from "node:fs/promises";
import yaml from "js-yaml";

export async function readYamlFile<T = unknown>(filePath: string): Promise<T> {
  const text = await fs.readFile(filePath, "utf8");
  return yaml.load(text) as T;
}

export async function writeYamlFile(filePath: string, value: unknown): Promise<void> {
  const text = yaml.dump(value, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false
  });
  await fs.writeFile(filePath, text, "utf8");
}

