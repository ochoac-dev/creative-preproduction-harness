export const draftTemplates = {
  "creative-brief": { title: "Creative Brief", fields: ["Audience", "Purpose and desired action", "Desired feeling", "Content priorities", "Brand and stakeholder constraints", "Technical and accessibility constraints", "Evidence of success"] },
  "existing-site-audit": { title: "Existing Site Audit", fields: ["Preserved strengths", "Hierarchy", "Composition", "Consistency", "Responsiveness", "Usability", "Accessibility", "Content flow", "Identity opportunities"] },
  "identity-thesis": { title: "Identity Thesis", fields: ["Audience", "Distinctive identity", "Supporting evidence", "Constraints"] },
  "research-board": { title: "Research Board", fields: ["Research question", "Recorded reference IDs", "Relevant lessons", "What must not be copied", "Attribution and rights notes", "Open questions"] },
  "creative-territory": { title: "Creative Territory", fields: ["Territory name", "Intended feeling", "Visual approach", "Supporting evidence", "Difference from other territories", "Constraints and open questions"] },
  "visual-language": { title: "Visual Language", fields: ["Selected territory", "Typography", "Color", "Layout and spacing", "Image treatment", "Responsive behavior", "Accessibility", "Supporting evidence"] },
  "decision-journal": { title: "Decision Journal", fields: ["Decision under discussion", "Options considered", "Evidence", "Named decision owner", "Rationale", "Unresolved questions"] },
  "implementation-handoff": { title: "Implementation Handoff", fields: ["Approved artifact IDs and versions", "Page and content requirements", "Asset IDs and permissions", "Responsive behavior", "Accessibility requirements", "Implementation constraints", "Acceptance checks", "Open conditions"] }
} as const;

export type DraftKind = keyof typeof draftTemplates;
export function renderDraft(kind: DraftKind, answers: Record<string, string>): string {
  const template = draftTemplates[kind];
  return `# ${template.title}\n\nDraft from supplied answers. Review is recorded separately.\n\n${template.fields.map(field => `## ${field}\n\n${answers[field]?.trim() || "[Unanswered]"}\n`).join("\n")}`;
}
