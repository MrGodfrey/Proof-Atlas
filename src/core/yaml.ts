import fs from "node:fs/promises";
import yaml from "js-yaml";

export async function readYamlFile<T = unknown>(filePath: string): Promise<T> {
  const text = await fs.readFile(filePath, "utf8");
  return yaml.load(text) as T;
}

export function stringifyYaml(value: unknown): string {
  return yaml.dump(value, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false
  });
}

export async function writeYamlFile(filePath: string, value: unknown): Promise<void> {
  const text = stringifyYaml(value);
  await fs.writeFile(filePath, text, "utf8");
}
