# Security

Security fixes target the current 0.3.x development release. Earlier development releases should be upgraded or supplied with a minimal reproduction for assessment.

Report suspected vulnerabilities through the repository's GitHub **Security → Report a vulnerability** feature when available. If private reporting is unavailable, contact the maintainer through an existing private channel; do not post exploit details or client material in public issues. No private contact address is declared here.

Include the affected version/commit, operating system and Node version, a minimal fictional project, reproduction steps, and the impact you observed. Useful areas include path containment, symlink handling, lock ownership/recovery, private-file exposure, asset rights bypasses, and approval or handoff integrity.

The harness writes local manifests, Markdown, imported files, and HTML/SVG previews. Run it only against directories you are authorized to modify, inspect supplied files, and protect the project directory with normal operating-system access controls. The ignored private workspace is an organizational boundary, not encryption or an access-control system. Do not attach its contents to reports.

Approvals record asserted reviewer identities; the local CLI does not authenticate people or prove legal rights. The team must obtain the human decision and permission evidence before recording it. Context adapters render project information and do not call cloud services. HTML/SVG previews are local creative studies, not a general sanitizer for untrusted source assets.

On Windows, directory fsync cannot provide the same directory-rename durability barrier as on POSIX systems. Atomic writes and journal recovery still apply; the project does not claim immunity to storage failure or hostile changes outside its own process.
