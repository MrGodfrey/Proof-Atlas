import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeYamlFile } from "../src/core/yaml";

export interface TestObject {
  dir?: string;
  object: Record<string, unknown>;
  bodies?: Record<string, string>;
}

export async function tempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function writeTestProject(root: string, objects: TestObject[], options?: {
  aliases?: Record<string, string>;
  views?: Record<string, string>;
  atlas?: Record<string, unknown>;
}): Promise<string> {
  const projectRoot = path.join(root, "ProofAtlas");
  await fs.mkdir(path.join(projectRoot, "objects"), { recursive: true });
  await fs.mkdir(path.join(projectRoot, "views"), { recursive: true });
  await fs.mkdir(path.join(projectRoot, ".atlas"), { recursive: true });
  await writeYamlFile(path.join(projectRoot, "atlas.yml"), {
    schema_version: "0.2",
    project: "test-project",
    title: "Test Project",
    default_view: "views/paper.md",
    math_renderer: "katex",
    ...(options?.atlas ?? {})
  });
  await writeYamlFile(path.join(projectRoot, ".atlas", "aliases.yml"), options?.aliases ?? {});
  const views = options?.views ?? { "paper.md": "# Paper\n\n![[main.claim.a]]\n" };
  for (const [file, source] of Object.entries(views)) {
    await fs.writeFile(path.join(projectRoot, "views", file), source, "utf8");
  }
  for (const item of objects) {
    const name = String(item.object.name);
    const dir = path.join(projectRoot, "objects", item.dir ?? name);
    await fs.mkdir(dir, { recursive: true });
    await writeYamlFile(path.join(dir, "object.yml"), item.object);
    for (const [file, source] of Object.entries(item.bodies ?? { "statement.md": "Body.\n" })) {
      await fs.writeFile(path.join(dir, file), source, "utf8");
    }
  }
  return projectRoot;
}

export function baseClaim(name = "main.claim.a", uid = "obj_20260611_aaaa"): TestObject {
  return {
    object: {
      uid,
      name,
      kind: "math",
      role: "claim",
      title: name,
      body: ["statement.md"]
    },
    bodies: {
      "statement.md": "Claim body.\n"
    }
  };
}
