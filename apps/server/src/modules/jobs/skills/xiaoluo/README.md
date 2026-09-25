/**
 * XiaoLuo AI Drama skill pack — reference prompts for FrameRally builtin skills.
 * Source: local XiaoLuo-AI-Drama-Skill (adapted as product skills; runtime via SkillsService).
 *
 * How they map in FrameRally:
 * - Text / director skills (film-script-analysis, film-screenwriting, …)
 *   → LLM `purpose` = skill slug with `_`; used when job requests that purpose.
 * - Storyboard / shooting scripts (script-to-video, 90s-script-to-video, …)
 *   → LLM output as shot/prompt text for manju or canvas.
 * - Visual asset skills (character-turnaround, scene views, 9-grid, …)
 *   → Prompt briefs for image jobs / asset tooling (systemPrompt = generation brief).
 */
export {};
