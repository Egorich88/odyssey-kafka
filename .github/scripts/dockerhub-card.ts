import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_REPO = "egorich27/kafka-control-frontend";
const BACKEND_REPO = "egorich27/kafka-control-backend";

const GITHUB_OWNER = "Egorich88";
const GITHUB_REPO = "odyssey-kafka";
const GITHUB_WORKFLOW_FILE = "ci-cd.yml";
const GITHUB_BRANCH = "main";

const LICENSE_SPDX = "Apache-2.0";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const ASSETS_DIR = path.join(REPO_ROOT, ".github", "assets");
const PACKAGE_JSON_PATH = path.join(REPO_ROOT, "frontend", "package.json");

interface IconPaths {
    dockerhub: string;
    frontend: string;
    backend: string;
    odyssey: string;
    comfortaa: string;
    odysseyDisplay: string;
}

interface RepositoryResponse {
    namespace: string;
    name: string;
    pull_count: number;
    last_updated: string;
}

interface RepoInfo {
    title: string;
    repository: string;
    pulls: string;
    updated: string;
    accent: string;
    hubUrl: string;
}

interface GitHubWorkflowRuns {
    workflow_runs: Array<{
        conclusion: "success" | "failure" | "cancelled" | "skipped" | "neutral" | null;
        status: string;
        html_url: string;
    }>;
}

const COLOR_MUTED = "#8B949E";
const COLOR_MUTED_SOFT = "#9CA3AF";
const COLOR_MINT = "#2DD4BF";

/* ---------- ГЕОМЕТРИЯ ---------- */

const SVG_WIDTH = 1088;
const SVG_HEIGHT = 400;

const PADDING = 40;
const CARD_WIDTH = 484;
const CARD_HEIGHT = 135;
const CARD_GAP = 40;

const CARD_LEFT_X = PADDING;
const CARD_RIGHT_X = CARD_LEFT_X + CARD_WIDTH + CARD_GAP;

/* ---------- ВЕРХНИЕ ЛОГОТИПЫ ---------- */

const LOGO_SCALE = 1.15;
const LOGO_BASE_SIZE = 96;
const LOGO_SIZE = LOGO_BASE_SIZE * LOGO_SCALE;
const LOGO_TOP_Y = 30;
const LOGO_TEXT_GAP = 20;

/* ---------- BADGES ---------- */

const BADGE_HEIGHT = 24;
const BADGE_GAP = 14;
const BADGE_FONT_SIZE = 11;
const BADGE_RADIUS = 4;
const BADGE_BORDER = "#30363D";

const BADGE_BOTTOM_OFFSET = 32;
const BADGE_Y = SVG_HEIGHT - BADGE_BOTTOM_OFFSET - BADGE_HEIGHT;

const BADGE_LABEL_BG = "#21262D";
const BADGE_LABEL_FG = "#C9D1D9";

const BADGE_COLORS = {
    success: "#238636",
    failure: "#DA3633",
    neutral: "#6E7681"
} as const;

/* ---------- ASSETS ---------- */

const ICONS: IconPaths = {
    dockerhub: path.join(ASSETS_DIR, "dockerhub-logo.png"),
    frontend: path.join(ASSETS_DIR, "frontend-icon.png"),
    backend: path.join(ASSETS_DIR, "backend-icon.png"),
    odyssey: path.join(ASSETS_DIR, "logo.png"),
    comfortaa: path.join(ASSETS_DIR, "Comfortaa.woff2"),
    odysseyDisplay: path.join(ASSETS_DIR, "OdysseyDisplay.woff2")
};

/* ---------- DOCKER HUB API ---------- */

async function fetchRepository(repository: string): Promise<RepositoryResponse> {
    const response = await fetch(
        `https://hub.docker.com/v2/repositories/${repository}/`
    );

    if (!response.ok) {
        throw new Error(`Docker Hub API error: ${repository}`);
    }

    return await response.json() as RepositoryResponse;
}

/* ---------- GITHUB API ---------- */

function githubHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        "User-Agent": "odyssey-card-generator",
        "Accept": "application/vnd.github+json"
    };

    if (process.env.GITHUB_TOKEN) {
        headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    return headers;
}

async function fetchWorkflowStatus(): Promise<GitHubWorkflowRuns["workflow_runs"][number] | null> {
    const url =
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}` +
        `/actions/workflows/${GITHUB_WORKFLOW_FILE}/runs` +
        `?branch=${GITHUB_BRANCH}&per_page=1`;

    const response = await fetch(url, { headers: githubHeaders() });

    if (!response.ok) {
        console.warn(`⚠️  GitHub workflow runs not found (${response.status})`);
        return null;
    }

    const data = await response.json() as GitHubWorkflowRuns;
    return data.workflow_runs[0] ?? null;
}

/* ---------- HELPERS ---------- */

function formatPulls(value: number): string {
    if (value >= 1_000_000)
        return (value / 1_000_000).toFixed(1).replace(".0", "") + "M";

    if (value >= 1_000)
        return (value / 1_000).toFixed(1).replace(".0", "") + "K";

    return value.toString();
}

function relativeTime(dateString: string): string {
    const now = new Date();
    const updated = new Date(dateString);

    const diff = Math.floor((now.getTime() - updated.getTime()) / 1000);

    const minute = 60;
    const hour = 3600;
    const day = 86400;

    if (diff < minute) return "Updated just now";
    if (diff < hour)   return `Updated ${Math.floor(diff / minute)} min ago`;
    if (diff < day)    return `Updated ${Math.floor(diff / hour)} hours ago`;

    return `Updated ${Math.floor(diff / day)} days ago`;
}

function assertIconExists(filePath: string, label: string): void {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Asset not found: ${label} → ${filePath}`);
    }
}

function estimateTextWidth(text: string, fontSize: number): number {
    return Math.ceil(text.length * fontSize * 0.62);
}

/* ---------- VERSION RESOLUTION (гибрид) ---------- */

function readPackageVersion(): string | null {
    if (!fs.existsSync(PACKAGE_JSON_PATH)) {
        console.warn(`⚠️  package.json not found at: ${PACKAGE_JSON_PATH}`);
        return null;
    }

    try {
        const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
            version?: string;
        };
        return pkg.version ?? null;
    } catch (e) {
        console.warn(`⚠️  Failed to parse ${PACKAGE_JSON_PATH}:`, e);
        return null;
    }
}

function normalizeTag(tag: string): string {
    return tag.startsWith("v") ? tag : `v${tag}`;
}

function resolveVersion(): { value: string; source: "release" | "package.json" } | null {
    const releaseTag = process.env.RELEASE_TAG?.trim();
    if (releaseTag) {
        return { value: normalizeTag(releaseTag), source: "release" };
    }

    const pkgVersion = readPackageVersion();
    if (pkgVersion) {
        return { value: normalizeTag(pkgVersion), source: "package.json" };
    }

    return null;
}

/* ---------- BADGE BUILDER ---------- */

interface BadgeSpec {
    label: string;
    value: string;
    valueColor: string;
    href: string;
}

function buildBadge(spec: BadgeSpec, x: number, y: number): {
    svg: string;
    width: number;
} {
    const LABEL_PAD = 9;
    const VALUE_PAD = 9;

    const labelW =
        estimateTextWidth(spec.label, BADGE_FONT_SIZE) + LABEL_PAD * 2;

    const valueW =
        estimateTextWidth(spec.value, BADGE_FONT_SIZE) + VALUE_PAD * 2;

    const totalW = labelW + valueW;

    const textBaselineY = y + BADGE_HEIGHT / 2 + BADGE_FONT_SIZE * 0.35;

    const labelTextX = x + LABEL_PAD;
    const valueTextX = x + labelW + VALUE_PAD;

    const svg = `
<a xlink:href="${spec.href}" target="_blank">
    <rect
        x="${x}"
        y="${y}"
        width="${labelW}"
        height="${BADGE_HEIGHT}"
        rx="${BADGE_RADIUS}"
        ry="${BADGE_RADIUS}"
        fill="${BADGE_LABEL_BG}"
        stroke="${BADGE_BORDER}"
        stroke-width="1"/>

    <rect
        x="${x + labelW}"
        y="${y}"
        width="${valueW}"
        height="${BADGE_HEIGHT}"
        rx="${BADGE_RADIUS}"
        ry="${BADGE_RADIUS}"
        fill="${spec.valueColor}"
        stroke="${BADGE_BORDER}"
        stroke-width="1"/>

    <rect
        x="${x + labelW - BADGE_RADIUS}"
        y="${y + 1}"
        width="${BADGE_RADIUS * 2}"
        height="${BADGE_HEIGHT - 2}"
        fill="${spec.valueColor}"/>
    <rect
        x="${x + labelW - BADGE_RADIUS}"
        y="${y + 1}"
        width="${BADGE_RADIUS}"
        height="${BADGE_HEIGHT - 2}"
        fill="${BADGE_LABEL_BG}"/>

    <text
        x="${labelTextX}"
        y="${textBaselineY}"
        font-size="${BADGE_FONT_SIZE}"
        font-family="Segoe UI, sans-serif"
        font-weight="600"
        fill="${BADGE_LABEL_FG}">
${spec.label}
</text>

    <text
        x="${valueTextX}"
        y="${textBaselineY}"
        font-size="${BADGE_FONT_SIZE}"
        font-family="Segoe UI, sans-serif"
        font-weight="700"
        fill="#FFFFFF">
${spec.value}
</text>
</a>`;

    return { svg, width: totalW };
}

function buildBadgeRow(
    badges: BadgeSpec[],
    centerX: number,
    y: number
): string {
    if (badges.length === 0) return "";

    const LABEL_PAD = 9;
    const VALUE_PAD = 9;

    const widths = badges.map(b => {
        const labelW =
            estimateTextWidth(b.label, BADGE_FONT_SIZE) + LABEL_PAD * 2;
        const valueW =
            estimateTextWidth(b.value, BADGE_FONT_SIZE) + VALUE_PAD * 2;

        return labelW + valueW;
    });

    const totalRowWidth =
        widths.reduce((acc, w) => acc + w, 0) +
        BADGE_GAP * (badges.length - 1);

    let cursorX = centerX - totalRowWidth / 2;

    const parts: string[] = [];

    for (let i = 0; i < badges.length; i++) {
        const { svg } = buildBadge(badges[i], cursorX, y);
        parts.push(svg);
        cursorX += widths[i] + BADGE_GAP;
    }

    return `
<!-- BADGES -->

<g>
${parts.join("\n")}
</g>`;
}

/* ---------- MAIN ---------- */

const frontend = await fetchRepository(FRONTEND_REPO);
const backend  = await fetchRepository(BACKEND_REPO);

assertIconExists(ICONS.dockerhub, "dockerhub");
assertIconExists(ICONS.frontend, "frontend");
assertIconExists(ICONS.backend, "backend");
assertIconExists(ICONS.odyssey, "odyssey");
assertIconExists(ICONS.comfortaa, "comfortaa");
assertIconExists(ICONS.odysseyDisplay, "odysseyDisplay");

const dockerhubIconBase64 = fs.readFileSync(ICONS.dockerhub).toString("base64");
const frontendIconBase64  = fs.readFileSync(ICONS.frontend).toString("base64");
const backendIconBase64   = fs.readFileSync(ICONS.backend).toString("base64");
const odysseyIconBase64   = fs.readFileSync(ICONS.odyssey).toString("base64");
const comfortaaBase64     = fs.readFileSync(ICONS.comfortaa).toString("base64");
const odysseyDisplayBase64 = fs.readFileSync(ICONS.odysseyDisplay).toString("base64");

const frontendInfo: RepoInfo = {
    title: "kafka-control-frontend",
    repository: `${frontend.namespace}/${frontend.name}`,
    pulls: formatPulls(frontend.pull_count),
    updated: relativeTime(frontend.last_updated),
    accent: "#1D63ED",
    hubUrl: "https://hub.docker.com/r/egorich27/kafka-control-frontend"
};

const backendInfo: RepoInfo = {
    title: "kafka-control-backend",
    repository: `${backend.namespace}/${backend.name}`,
    pulls: formatPulls(backend.pull_count),
    updated: relativeTime(backend.last_updated),
    accent: "#8B5CF6",
    hubUrl: "https://hub.docker.com/r/egorich27/kafka-control-backend"
};

/* ---------- СОБИРАЕМ СПИСОК BADGES ---------- */

const badges: BadgeSpec[] = [];

/* --- LICENSE --- */
badges.push({
    label: "LICENSE",
    value: LICENSE_SPDX,
    valueColor: "#1F6FEB",
    href: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/main/LICENSE`
});

/* --- RELEASE --- */
const version = resolveVersion();
if (version) {
    console.log(`ℹ️  Version source: ${version.source} → ${version.value}`);
    badges.push({
        label: "RELEASE",
        value: version.value,
        valueColor: "#238636",
        href: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`
    });
} else {
    console.warn("⚠️  Version not resolved — RELEASE badge skipped");
}

/* --- CI/CD --- */
const workflowRun = await fetchWorkflowStatus();
if (workflowRun) {
    const concl = workflowRun.conclusion ?? workflowRun.status;
    const isOk = concl === "success";
    const isBad = concl === "failure" || concl === "cancelled";

    const color = isOk
        ? BADGE_COLORS.success
        : isBad
            ? BADGE_COLORS.failure
            : BADGE_COLORS.neutral;

    const label =
        concl === "success" ? "PASSING"
        : concl === "failure" ? "FAILING"
        : concl === "cancelled" ? "CANCELLED"
        : String(concl).toUpperCase();

    badges.push({
        label: "CI/CD",
        value: label,
        valueColor: color,
        href: workflowRun.html_url
    });
} else {
    console.warn("⚠️  Workflow run not found — CI/CD badge skipped");
}

const badgeRowSvg = buildBadgeRow(badges, SVG_WIDTH / 2, BADGE_Y);

/* ---------- КНОПКА-ССЫЛКА В КАРТОЧКЕ ---------- */

const LINK_BTN_SIZE = 42;
const LINK_BTN_PADDING = 16;
const LINK_BTN_LEFT_X  = CARD_LEFT_X  + CARD_WIDTH  - LINK_BTN_PADDING - LINK_BTN_SIZE;
const LINK_BTN_RIGHT_X = CARD_RIGHT_X + CARD_WIDTH  - LINK_BTN_PADDING - LINK_BTN_SIZE;

/* ---------- SVG ---------- */

const svg = `
<svg
    xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink"
    width="${SVG_WIDTH}"
    height="${SVG_HEIGHT}"
    viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">

<defs>

<linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#0D1117"/>
    <stop offset="100%" stop-color="#161B22"/>
</linearGradient>

<filter id="shadow">
    <feDropShadow dx="0" dy="3" stdDeviation="6" flood-opacity="0.35"/>
</filter>

<style>
    @font-face {
        font-family: 'Comfortaa';
        font-style: normal;
        font-weight: 400 700;
        src: url('data:font/woff2;base64,${comfortaaBase64}') format('woff2');
    }
    @font-face {
        font-family: 'Odyssey Display';
        font-style: normal;
        font-weight: 400;
        src: url('data:font/woff2;base64,${odysseyDisplayBase64}') format('woff2');
    }
    .docker-wordmark {
        font-family: 'Comfortaa', 'Segoe UI', sans-serif;
    }
    .odyssey-wordmark {
        font-family: 'Odyssey Display', 'Segoe UI', sans-serif;
    }
</style>

</defs>

<rect x="0" y="0" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" rx="18" fill="url(#background)"/>

<!-- ЛЕВЫЙ БЛОК: docker hub -->

<image
    x="${PADDING}"
    y="${LOGO_TOP_Y}"
    width="${LOGO_SIZE}"
    height="${LOGO_SIZE}"
    xlink:href="data:image/png;base64,${dockerhubIconBase64}"
    preserveAspectRatio="xMidYMid meet"/>

<text
    x="${PADDING + LOGO_SIZE + LOGO_TEXT_GAP}"
    y="70"
    font-size="38"
    font-weight="700"
    fill="#FFFFFF"
    class="docker-wordmark">
docker <tspan fill="#1D63ED">hub</tspan>
</text>

<text
    x="${PADDING + LOGO_SIZE + LOGO_TEXT_GAP + 2}"
    y="105"
    font-size="18"
    font-family="Segoe UI"
    fill="${COLOR_MUTED}">
Official Docker Images for ODYSSEY
</text>

<!-- ПРАВЫЙ БЛОК: Odyssey -->

<image
    x="584"
    y="${LOGO_TOP_Y}"
    width="${LOGO_SIZE}"
    height="${LOGO_SIZE}"
    xlink:href="data:image/png;base64,${odysseyIconBase64}"
    preserveAspectRatio="xMidYMid meet"/>

<text
    x="${584 + LOGO_SIZE + LOGO_TEXT_GAP}"
    y="70"
    font-size="38"
    font-weight="400"
    fill="#FFFFFF"
    class="odyssey-wordmark">
O D Y S S E Y
</text>

<text
    x="${590 + LOGO_SIZE + LOGO_TEXT_GAP + 2}"
    y="105"
    font-size="18"
    font-family="Segoe UI"
    fill="${COLOR_MINT}">
Kafka Monitoring &amp; Management
</text>

<!-- ГОРИЗОНТАЛЬНЫЙ РАЗДЕЛИТЕЛЬ -->

<line x1="${PADDING}" y1="165" x2="${SVG_WIDTH - PADDING}" y2="165" stroke="#30363D"/>

<!-- КАРТОЧКА FRONTEND -->

<rect
    x="${CARD_LEFT_X}"
    y="185"
    width="${CARD_WIDTH}"
    height="${CARD_HEIGHT}"
    rx="14"
    fill="#111827"
    stroke="${frontendInfo.accent}"
    stroke-width="2"
    filter="url(#shadow)"/>

<image
    x="${CARD_LEFT_X + 20}"
    y="200"
    width="96"
    height="96"
    xlink:href="data:image/png;base64,${frontendIconBase64}"
    preserveAspectRatio="xMidYMid meet"/>

<text
    x="${CARD_LEFT_X + 132}"
    y="222"
    font-size="24"
    font-family="Segoe UI"
    font-weight="700"
    fill="#FFFFFF">
${frontendInfo.title}
</text>

<g transform="translate(${CARD_LEFT_X + 132}, 231)"
   fill="none"
   stroke="${COLOR_MUTED_SOFT}"
   stroke-width="1.6"
   stroke-linecap="round"
   stroke-linejoin="round">
    <path d="M 4 7 L 1 7 A 3 3 0 0 0 1 13 L 4 13"/>
    <path d="M 8 7 L 11 7 A 3 3 0 0 1 11 13 L 8 13"/>
    <line x1="4.5" y1="10" x2="7.5" y2="10"/>
</g>

<text
    x="${CARD_LEFT_X + 151}"
    y="244"
    font-size="14"
    font-family="Consolas"
    fill="${COLOR_MUTED_SOFT}">
${frontendInfo.repository}
</text>

<g transform="translate(${CARD_LEFT_X + 132}, 260)">
    <line
        x1="8" y1="0" x2="8" y2="12"
        stroke="${frontendInfo.accent}"
        stroke-width="3.5" stroke-linecap="round"/>
    <polyline
        points="3,8 8,13 13,8"
        fill="none"
        stroke="${frontendInfo.accent}"
        stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
    <line
        x1="0" y1="18" x2="16" y2="18"
        stroke="${frontendInfo.accent}"
        stroke-width="3.5" stroke-linecap="round"/>
</g>

<text
    x="${CARD_LEFT_X + 162}"
    y="278"
    font-size="28"
    font-family="Segoe UI"
    font-weight="700"
    fill="#FFFFFF">
${frontendInfo.pulls}
</text>

<text
    x="${CARD_LEFT_X + 252}"
    y="275"
    font-size="14"
    font-family="Segoe UI"
    fill="${COLOR_MUTED}">
Downloads
</text>

<g transform="translate(${CARD_LEFT_X + 132}, 291)">
    <circle cx="8" cy="8" r="8" fill="none" stroke="${COLOR_MUTED}" stroke-width="1.6"/>
    <line x1="8" y1="8" x2="8" y2="3" stroke="${COLOR_MUTED}" stroke-width="1.6" stroke-linecap="round"/>
    <line x1="8" y1="8" x2="12" y2="8" stroke="${COLOR_MUTED}" stroke-width="1.6" stroke-linecap="round"/>
</g>

<text
    x="${CARD_LEFT_X + 154}"
    y="305"
    font-size="13"
    font-family="Segoe UI"
    fill="${COLOR_MUTED}">
${frontendInfo.updated}
</text>

<a xlink:href="${frontendInfo.hubUrl}" target="_blank">
    <rect
        x="${LINK_BTN_LEFT_X}" y="196"
        width="${LINK_BTN_SIZE}" height="${LINK_BTN_SIZE}"
        rx="10" fill="none" stroke="#30363D" stroke-width="1.5"/>
    <g transform="translate(${LINK_BTN_LEFT_X + 21}, 217) scale(1.25) translate(-12, -12)"
       fill="none" stroke="${frontendInfo.accent}" stroke-width="2.4"
       stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6" />
        <path d="M11 13l9 -9" />
        <path d="M15 4h5v5" />
    </g>
</a>

<!-- КАРТОЧКА BACKEND -->

<rect
    x="${CARD_RIGHT_X}"
    y="185"
    width="${CARD_WIDTH}"
    height="${CARD_HEIGHT}"
    rx="14"
    fill="#111827"
    stroke="${backendInfo.accent}"
    stroke-width="2"
    filter="url(#shadow)"/>

<image
    x="${CARD_RIGHT_X + 20}"
    y="200"
    width="96"
    height="96"
    xlink:href="data:image/png;base64,${backendIconBase64}"
    preserveAspectRatio="xMidYMid meet"/>

<text
    x="${CARD_RIGHT_X + 132}"
    y="222"
    font-size="24"
    font-family="Segoe UI"
    font-weight="700"
    fill="#FFFFFF">
${backendInfo.title}
</text>

<g transform="translate(${CARD_RIGHT_X + 132}, 231)"
   fill="none"
   stroke="${COLOR_MUTED_SOFT}"
   stroke-width="1.6"
   stroke-linecap="round"
   stroke-linejoin="round">
    <path d="M 4 7 L 1 7 A 3 3 0 0 0 1 13 L 4 13"/>
    <path d="M 8 7 L 11 7 A 3 3 0 0 1 11 13 L 8 13"/>
    <line x1="4.5" y1="10" x2="7.5" y2="10"/>
</g>

<text
    x="${CARD_RIGHT_X + 151}"
    y="244"
    font-size="14"
    font-family="Consolas"
    fill="${COLOR_MUTED_SOFT}">
${backendInfo.repository}
</text>

<g transform="translate(${CARD_RIGHT_X + 132}, 260)">
    <line
        x1="8" y1="0" x2="8" y2="12"
        stroke="${backendInfo.accent}"
        stroke-width="3.5" stroke-linecap="round"/>
    <polyline
        points="3,8 8,13 13,8"
        fill="none"
        stroke="${backendInfo.accent}"
        stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
    <line
        x1="0" y1="18" x2="16" y2="18"
        stroke="${backendInfo.accent}"
        stroke-width="3.5" stroke-linecap="round"/>
</g>

<text
    x="${CARD_RIGHT_X + 162}"
    y="278"
    font-size="28"
    font-family="Segoe UI"
    font-weight="700"
    fill="#FFFFFF">
${backendInfo.pulls}
</text>

<text
    x="${CARD_RIGHT_X + 252}"
    y="275"
    font-size="14"
    font-family="Segoe UI"
    fill="${COLOR_MUTED}">
Downloads
</text>

<g transform="translate(${CARD_RIGHT_X + 132}, 291)">
    <circle cx="8" cy="8" r="8" fill="none" stroke="${COLOR_MUTED}" stroke-width="1.6"/>
    <line x1="8" y1="8" x2="8" y2="3" stroke="${COLOR_MUTED}" stroke-width="1.6" stroke-linecap="round"/>
    <line x1="8" y1="8" x2="12" y2="8" stroke="${COLOR_MUTED}" stroke-width="1.6" stroke-linecap="round"/>
</g>

<text
    x="${CARD_RIGHT_X + 154}"
    y="305"
    font-size="13"
    font-family="Segoe UI"
    fill="${COLOR_MUTED}">
${backendInfo.updated}
</text>

<a xlink:href="${backendInfo.hubUrl}" target="_blank">
    <rect
        x="${LINK_BTN_RIGHT_X}" y="196"
        width="${LINK_BTN_SIZE}" height="${LINK_BTN_SIZE}"
        rx="10" fill="none" stroke="#30363D" stroke-width="1.5"/>
    <g transform="translate(${LINK_BTN_RIGHT_X + 21}, 217) scale(1.25) translate(-12, -12)"
       fill="none" stroke="${backendInfo.accent}" stroke-width="2.4"
       stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6" />
        <path d="M11 13l9 -9" />
        <path d="M15 4h5v5" />
    </g>
</a>

${badgeRowSvg}
</svg>
`;

fs.mkdirSync(ASSETS_DIR, { recursive: true });

fs.writeFileSync(
    path.join(ASSETS_DIR, "dockerhub-card.svg"),
    svg,
    "utf8"
);

console.log(`✅ Docker Hub card generated. Width: ${SVG_WIDTH}px`);
console.log(`   Badges: ${badges.length}`);
for (const b of badges) {
    console.log(`     - ${b.label}: ${b.value}`);
}