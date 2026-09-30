/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        /**
         * Require a Chinese-friendly bullet body:
         * type(scope): subject
         *
         * - change one
         * - change two
         */
        "body-bullet-list": (parsed) => {
          const body = (parsed.body || "").trim();
          if (!body) {
            return [
              false,
              "提交正文必填：空一行后用「- 」列出本次全部改动（中文）",
            ];
          }
          const lines = body
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
          const bullets = lines.filter((line) => /^[-*]\s+\S/.test(line));
          if (bullets.length === 0) {
            return [
              false,
              "正文须含至少一条以「- 」或「* 」开头的改动说明",
            ];
          }
          return [true];
        },
      },
    },
  ],
  rules: {
    // type(scope): subject — match existing FrameRally history
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "refactor",
        "perf",
        "style",
        "docs",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
      ],
    ],
    "scope-case": [2, "always", "kebab-case"],
    "subject-case": [0],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 100],
    "body-leading-blank": [2, "always"],
    "body-max-line-length": [2, "always", 200],
    "body-bullet-list": [2, "always"],
  },
};
