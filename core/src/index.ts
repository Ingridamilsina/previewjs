import express from "express";
import fs from "fs-extra";
import getPort from "get-port";
import path from "path";
import * as vite from "vite";
import {
  GetInfoEndpoint,
  GetStateEndpoint,
  UpdateStateEndpoint,
} from "../api/local";
import { PersistedStateManager } from "./persisted-state";
import { FrameworkPlugin } from "./plugins/framework";
import { Previewer } from "./previewer";
import { ApiRouter } from "./router";
import { createTypescriptAnalyzer, TypescriptAnalyzer } from "./ts-helpers";
import { Reader } from "./vfs";
export { PersistedStateManager } from "./persisted-state";
export { extractPackageDependencies } from "./plugins/dependencies";
export type { PackageDependencies } from "./plugins/dependencies";
export type {
  ComponentDetector,
  DetectedComponent,
  FrameworkPlugin,
  FrameworkPluginFactory,
} from "./plugins/framework";
export { extractArgs } from "./storybook/args";
export * as vfs from "./vfs";

export async function createWorkspace({
  versionCode,
  rootDirPath,
  reader,
  frameworkPlugin,
  logLevel,
  middlewares,
  onReady,
  onFileChanged,
  persistedStateManager = new PersistedStateManager(),
}: {
  versionCode: string;
  rootDirPath: string;
  middlewares: express.RequestHandler[];
  frameworkPlugin: FrameworkPlugin;
  logLevel: vite.LogLevel;
  reader: Reader;
  persistedStateManager?: PersistedStateManager;
  onReady?(options: {
    router: ApiRouter;
    typescriptAnalyzer: TypescriptAnalyzer;
  }): Promise<void>;
  onFileChanged?(filePath: string): void;
}): Promise<Workspace | null> {
  let cacheDirPath: string;
  try {
    const { version } = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, "..", "..", "package.json"),
        "utf8"
      )
    );
    cacheDirPath = path.resolve(
      rootDirPath,
      "node_modules",
      ".previewjs",
      `v${version}`
    );
  } catch (e) {
    throw new Error(`Unable to detect @previewjs/core version.`);
  }
  const typescriptAnalyzer = createTypescriptAnalyzer({
    reader,
    rootDirPath,
    tsCompilerOptions: frameworkPlugin.tsCompilerOptions,
  });
  const router = new ApiRouter();
  router.onRequest(GetInfoEndpoint, async () => {
    const separatorPosition = versionCode.indexOf("-");
    if (separatorPosition === -1) {
      throw new Error(`Unsupported version code format: ${versionCode}`);
    }
    const platform = versionCode.substr(0, separatorPosition);
    const version = versionCode.substr(separatorPosition + 1);
    return {
      appInfo: {
        platform,
        version,
      },
    };
  });
  router.onRequest(GetStateEndpoint, () => persistedStateManager.get());
  router.onRequest(UpdateStateEndpoint, (stateUpdate) =>
    persistedStateManager.update(stateUpdate)
  );
  const previewer = new Previewer({
    reader,
    rootDirPath,
    previewDirPath: path.join(__dirname, "..", "..", "iframe", "preview"),
    cacheDirPath,
    frameworkPlugin,
    logLevel,
    middlewares: [
      express.json(),
      express
        .Router()
        .use(
          "/monaco-editor",
          express.static(path.join(__dirname, "..", "monaco-editor"))
        ),
      async (req, res, next) => {
        if (req.path.startsWith("/api/")) {
          res.json(await router.handle(req.path.substr(5), req.body));
        } else {
          next();
        }
      },
      ...middlewares,
    ],
    onFileChanged,
  });
  const workspace: Workspace = {
    rootDirPath: () => rootDirPath,
    typescriptAnalyzer,
    detectComponents: async (
      filePath: string,
      options: {
        offset?: number;
      } = {}
    ) => {
      const program = typescriptAnalyzer.analyze([filePath]);
      return frameworkPlugin
        .componentDetector(program, [filePath])
        .map((c) => {
          return c.offsets
            .filter(([start, end]) => {
              if (options?.offset === undefined) {
                return true;
              }
              return options.offset >= start && options.offset <= end;
            })
            .map(([start]) => ({
              componentName: c.name,
              exported: c.exported,
              offset: start,
              componentId: `${path
                .relative(rootDirPath, c.filePath)
                .replace(/\\/g, "/")}:${c.name}`,
            }));
        })
        .flat();
    },
    preview: {
      start: async (allocatePort) => {
        const port = await previewer.start(async () => {
          const port = allocatePort ? await allocatePort() : 0;
          return (
            port ||
            (await getPort({
              port: getPort.makeRange(3140, 4000),
            }))
          );
        });
        return {
          url: () => `http://localhost:${port}`,
          stop: async (options) => {
            await previewer.stop(options);
          },
        };
      },
    },
    dispose: async () => {
      typescriptAnalyzer.dispose();
    },
  };
  if (onReady) {
    await onReady({
      router,
      typescriptAnalyzer,
    });
  }
  return workspace;
}

/**
 * Returns the absolute directory path of the closest ancestor containing node_modules.
 */
export function findWorkspaceRoot(filePath: string): string {
  let dirPath = path.resolve(filePath);
  while (dirPath !== path.dirname(dirPath)) {
    if (fs.existsSync(path.join(dirPath, "package.json"))) {
      return dirPath;
    }
    dirPath = path.dirname(dirPath);
  }
  throw new Error(
    `Unable to find package.json in the directory tree from ${filePath}. Does it exist?`
  );
}

export interface Workspace {
  rootDirPath(): string;
  typescriptAnalyzer: TypescriptAnalyzer;
  detectComponents(
    filePath: string,
    options?: {
      offset?: number;
    }
  ): Promise<Component[]>;
  preview: {
    start(allocatePort?: () => Promise<number>): Promise<Preview>;
  };
  dispose(): Promise<void>;
}

export interface Component {
  componentName: string;
  exported: boolean;
  offset: number;
  componentId: string;
}

export interface Preview {
  url(): string;
  stop(options?: { onceUnused?: boolean }): Promise<void>;
}
