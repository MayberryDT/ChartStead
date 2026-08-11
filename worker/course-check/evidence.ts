import type {
  CourseCheckDelta,
  CourseCheckEvidenceKind,
  CourseCheckEvidenceSection,
  CourseCheckFinding,
} from "../../shared/course-check";
import {
  EVIDENCE_SECTION_ORDER,
  EVIDENCE_SECTION_TITLES,
} from "../../shared/course-check";

function sectionHasRisk(
  findings: CourseCheckFinding[],
  findingIds: string[],
): boolean {
  return findingIds.some((id) => {
    const finding = findings.find((row) => row.id === id);
    return finding?.severity === "blocker" || finding?.severity === "warning";
  });
}

function classifyFinding(finding: CourseCheckFinding): CourseCheckEvidenceKind {
  if (
    finding.code === "identity_ambiguity" ||
    finding.code === "missing_authority" ||
    finding.code === "durable_integrity" ||
    finding.code === "relevant_input_changed"
  ) {
    return "irreversible";
  }
  if (
    finding.code.startsWith("recipient_") ||
    finding.code === "prior_related_communication" ||
    finding.code === "no_deliverable_recipients" ||
    finding.code === "empty_communication_scope"
  ) {
    return "people";
  }
  if (
    finding.code.startsWith("identity") ||
    finding.message.toLowerCase().includes("speaker")
  ) {
    return "people";
  }
  if (
    finding.code.includes("public") ||
    finding.code.includes("publish") ||
    finding.code.includes("program")
  ) {
    return "public";
  }
  if (
    finding.code.includes("airtable") ||
    finding.code.includes("integration") ||
    finding.code.includes("sync")
  ) {
    return "integration";
  }
  if (finding.severity === "warning" || finding.severity === "blocker") {
    return "operational";
  }
  return "internal";
}

function classifyDelta(delta: CourseCheckDelta): CourseCheckEvidenceKind {
  if (
    delta.entityType === "public_revision" ||
    delta.entityType === "message_draft" ||
    (delta.entityType === "proposal" && delta.action === "update")
  ) {
    return "irreversible";
  }
  if (
    delta.entityType === "speaker" ||
    delta.entityType === "participation" ||
    delta.entityType === "recipient"
  ) {
    return "people";
  }
  if (
    delta.entityType === "session" ||
    delta.entityType === "portal_access" ||
    delta.entityType === "public_session"
  ) {
    return "public";
  }
  if (delta.entityType === "communication_plan") {
    return "operational";
  }
  if (delta.entityType === "task") {
    return "operational";
  }
  return "internal";
}

export function buildEvidenceSections(input: {
  findings: CourseCheckFinding[];
  deltas: CourseCheckDelta[];
}): CourseCheckEvidenceSection[] {
  const buckets = new Map<
    CourseCheckEvidenceKind,
    { findingIds: string[]; deltaIndexes: number[] }
  >();
  for (const kind of EVIDENCE_SECTION_ORDER) {
    buckets.set(kind, { findingIds: [], deltaIndexes: [] });
  }

  for (const finding of input.findings) {
    const kind = classifyFinding(finding);
    buckets.get(kind)!.findingIds.push(finding.id);
  }
  input.deltas.forEach((delta, index) => {
    const kind = classifyDelta(delta);
    buckets.get(kind)!.deltaIndexes.push(index);
  });

  // Always surface empty public + integration sections so the locked order is visible.
  return EVIDENCE_SECTION_ORDER.map((kind) => {
    const bucket = buckets.get(kind)!;
    const count = bucket.findingIds.length + bucket.deltaIndexes.length;
    const risky = sectionHasRisk(input.findings, bucket.findingIds);
    const emptyClean = count === 0;
    let summary = "No items in this section.";
    if (count > 0) {
      summary = `${bucket.deltaIndexes.length} record change${bucket.deltaIndexes.length === 1 ? "" : "s"}, ${bucket.findingIds.length} finding${bucket.findingIds.length === 1 ? "" : "s"}.`;
    }
    if (emptyClean && (kind === "public" || kind === "integration")) {
      summary =
        kind === "public"
          ? "No public-program changes in this decision apply."
          : "No integration writes in this decision apply.";
    }
    return {
      kind,
      title: EVIDENCE_SECTION_TITLES[kind],
      defaultExpanded: risky || (!emptyClean && kind === "irreversible"),
      summary,
      findingIds: bucket.findingIds,
      deltaIndexes: bucket.deltaIndexes,
    };
  });
}

export function computeAgeWarning(input: {
  createdAt: string;
  ageWarningHours: number;
  stages: Array<{ external?: boolean }>;
  now?: string;
}): { active: boolean; ageHours: number; message: string } | null {
  const hasExternal = input.stages.some((stage) => stage.external);
  if (!hasExternal) return null;
  const nowMs = Date.parse(input.now ?? new Date().toISOString());
  const createdMs = Date.parse(input.createdAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(createdMs)) return null;
  const ageHours = (nowMs - createdMs) / (1000 * 60 * 60);
  if (ageHours < input.ageWarningHours) {
    return {
      active: false,
      ageHours,
      message: "",
    };
  }
  return {
    active: true,
    ageHours,
    message: `This external stage is ${Math.floor(ageHours)} hours old (threshold ${input.ageWarningHours}h). Re-check revisions and authority before executing; age alone does not block.`,
  };
}
