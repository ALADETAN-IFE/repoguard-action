import * as core from "@actions/core";
import * as github from "@actions/github";
import * as fs from "fs";
import * as path from "path";
import {
  parseRepoConfig,
  scanFileContentWithConfig,
  scanWorkflowContentWithConfig,
  shouldSkipPath,
  isBinaryPath,
  looksLikeJavaScript,
  Finding,
  Severity,
} from "@repoguard/scanner";

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

async function run(): Promise<void> {
  try {
    const minimumSeverityInput = core.getInput("minimum-severity") || "medium";
    const failOnInput = core.getInput("fail-on") || "high";
    const configPathInput = core.getInput("config-path") || ".repoguard.yml";

    const workspacePath = process.env.GITHUB_WORKSPACE || process.cwd();
    core.info(`🔍 RepoGuard Action scanning workspace: ${workspacePath}`);

    // 1. Load .repoguard.yml config if present
    const fullConfigPath = path.join(workspacePath, configPathInput);
    let repoConfig = {};
    if (fs.existsSync(fullConfigPath)) {
      core.info(`📋 Loading configuration from ${configPathInput}`);
      const yamlContent = fs.readFileSync(fullConfigPath, "utf8");
      repoConfig = parseRepoConfig(yamlContent);
    } else {
      core.info(
        `ℹ️ No ${configPathInput} found in repository root — using default settings`,
      );
    }

    // 2. Recursively scan workspace files
    const findings: Finding[] = [];
    scanDirectory(workspacePath, workspacePath, repoConfig, findings);

    // 3. Filter findings by minimum severity input
    const minLevel = SEVERITY_ORDER[minimumSeverityInput as Severity] ?? 2;
    const filteredFindings = findings.filter(
      (f) => (SEVERITY_ORDER[f.severity] ?? 1) >= minLevel,
    );

    const criticalCount = filteredFindings.filter(
      (f) => f.severity === "critical",
    ).length;
    const highCount = filteredFindings.filter(
      (f) => f.severity === "high",
    ).length;
    const mediumCount = filteredFindings.filter(
      (f) => f.severity === "medium",
    ).length;
    const lowCount = filteredFindings.filter(
      (f) => f.severity === "low",
    ).length;
    const totalCount = filteredFindings.length;

    // 4. Output results & GitHub Action annotations
    core.info(
      `\n📊 RepoGuard Scan Results: ${totalCount} finding(s) detected (${criticalCount} critical, ${highCount} high, ${mediumCount} medium, ${lowCount} low)`,
    );

    for (const finding of filteredFindings) {
      const lineStr = finding.line ? `:${finding.line}` : "";
      const fileStr = finding.file ? `${finding.file}${lineStr}` : "unknown file";
      const consoleMsg = `  ↳ [${finding.severity.toUpperCase()}] ${fileStr} - ${finding.message} (Rule: ${finding.rule})`;
      core.info(consoleMsg);

      const annotationOptions: core.AnnotationProperties = {
        title: `RepoGuard [${finding.rule}] (${finding.severity.toUpperCase()})`,
        file: finding.file ?? undefined,
        startLine: finding.line ?? undefined,
      };

      const message = `${finding.message} (Rule: ${finding.rule})`;

      if (finding.severity === "critical" || finding.severity === "high") {
        core.error(message, annotationOptions);
      } else if (finding.severity === "medium") {
        core.warning(message, annotationOptions);
      } else {
        core.notice(message, annotationOptions);
      }
    }

    // 5. Set action outputs
    core.setOutput("findings-count", totalCount);
    core.setOutput("critical-count", criticalCount);
    core.setOutput("high-count", highCount);

    // 6. Fail workflow if findings exceed fail-on threshold
    const failLevel = SEVERITY_ORDER[failOnInput as Severity] ?? 3;
    const failingFindings = filteredFindings.filter(
      (f) => (SEVERITY_ORDER[f.severity] ?? 1) >= failLevel,
    );

    if (failingFindings.length > 0) {
      core.setFailed(
        `🚨 RepoGuard scan failed: ${failingFindings.length} finding(s) equal or exceed fail-on threshold '${failOnInput}'.`,
      );
    } else {
      core.info(
        "✅ RepoGuard scan completed successfully with no blocking issues.",
      );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    core.setFailed(`Unhandled error in RepoGuard Action: ${msg}`);
  }
}

function scanDirectory(
  dirPath: string,
  rootPath: string,
  config: object,
  findings: Finding[],
): void {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (
        entry.name === ".git" ||
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        shouldSkipPath(relativePath)
      ) {
        continue;
      }
      scanDirectory(fullPath, rootPath, config, findings);
    } else if (entry.isFile()) {
      if (shouldSkipPath(relativePath)) continue;

      try {
        const content = fs.readFileSync(fullPath, "utf8");
        const binary = isBinaryPath(relativePath);
        if (binary && !looksLikeJavaScript(content)) continue;

        const lower = relativePath.toLowerCase();
        const isWorkflow =
          lower.startsWith(".github/workflows/") &&
          (lower.endsWith(".yml") || lower.endsWith(".yaml"));

        if (isWorkflow) {
          findings.push(
            ...scanWorkflowContentWithConfig(content, relativePath, config),
          );
          findings.push(
            ...scanFileContentWithConfig(content, relativePath, config),
          );
        } else {
          findings.push(
            ...scanFileContentWithConfig(content, relativePath, config),
          );
        }
      } catch {
        /* skip unreadable files */
      }
    }
  }
}

void run();
