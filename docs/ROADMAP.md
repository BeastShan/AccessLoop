# Development roadmap

The proof of concept covers scanning, detection, evidence capture, and task generation. The remaining workflow is planned.

| Step | Planned work | Evidence needed to mark complete |
| --- | --- | --- |
| 5. Dispatch to Devin | Verify the available Devin API and workspace permissions. Submit the approved JSON task and [agent prompt](DEVIN_AGENT_PROMPT.md) with the pinned checkout and an isolated branch. | A real job ID tied to a controlled repository, a source report, and the approved scope. |
| 6. Implement the fix | Resolve the browser evidence to source, use native semantics where practical, and enforce the approved file list in the resulting diff. Send mismatches and missing permissions to a reviewer. | A patch on the isolated branch and a path-by-path scope check. |
| 7. Rerun validation | Reproduce the violation on the base revision. Rescan the changed page with the same axe configuration and run the interaction regression and existing checks. | Before and after reports, screenshots, and actual test results tied to both revisions. |
| 8. Prepare review | Open a draft pull request through a least-privilege identity. Attach evidence, scope, and any manual review items. | A real draft PR in the authorized repository with a human review gate. |
