/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const BRAND_NAME = "Kamidere";
export const BRAND_NAME_LOWER = "kamidere";
export const BRAND_TAGLINE = "A commanding Discord client mod with a sharp plugin stack.";
export const BRAND_TAGLINE_SHORT = "Sharp client mod. Large plugin stack.";
export const DEFAULT_CLOUD_BACKEND = "https://api.vencord.dev/";
export const BRAND_REPOSITORY_URL = "https://github.com/clrxxo/Kamidere";
export const BRAND_INSTALLER_REPOSITORY_URL = "https://github.com/clrxxo/KamidereInstaller";
export const BRAND_DONATE_URL = "https://github.com/sponsors/thororen1234";
export const UPSTREAM_DONATE_URL = "https://github.com/sponsors/Vendicated";
export const BRAND_TRANSLATE_URL = BRAND_REPOSITORY_URL;
export const BRAND_BADGES_URL = "https://badge.equicord.org/badges.json";
export const BRAND_DONOR_BADGE_PREVIEW_URL = "https://badge.equicord.org/donor.webp";
export const BRAND_SUPPORT_URL = `${BRAND_REPOSITORY_URL}/issues`;

const brandIconSvg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">',
    "<defs>",
    '<linearGradient id="bg" x1="14" y1="12" x2="112" y2="116" gradientUnits="userSpaceOnUse">',
    '<stop stop-color="#14090D"/>',
    '<stop offset="0.55" stop-color="#45111B"/>',
    '<stop offset="1" stop-color="#7B1E2E"/>',
    "</linearGradient>",
    '<linearGradient id="ring" x1="28" y1="22" x2="101" y2="104" gradientUnits="userSpaceOnUse">',
    '<stop stop-color="#F7E8C8"/>',
    '<stop offset="1" stop-color="#E9B45C"/>',
    "</linearGradient>",
    '<radialGradient id="glow" cx="0" cy="0" r="1" gradientTransform="translate(47 38) rotate(42) scale(52 44)" gradientUnits="userSpaceOnUse">',
    '<stop stop-color="#EBAA52" stop-opacity=".34"/>',
    '<stop offset="1" stop-color="#EBAA52" stop-opacity="0"/>',
    "</radialGradient>",
    "</defs>",
    '<rect width="128" height="128" rx="30" fill="url(#bg)"/>',
    '<rect width="128" height="128" rx="30" fill="url(#glow)"/>',
    '<circle cx="64" cy="64" r="43" fill="none" stroke="url(#ring)" stroke-width="7.5"/>',
    '<path d="M41 29v70h11.5V72.5l24.2 26.5H92L63.4 64.8 90.3 29H75.9L52.5 59.7V29Z" fill="#F8EFE0"/>',
    '<path d="M52.5 60.4L78 30.2" stroke="#F6C46D" stroke-width="3.1" stroke-linecap="round" opacity=".7"/>',
    '<path d="M52.5 69.2 77.6 97.8" stroke="#F6C46D" stroke-width="3.1" stroke-linecap="round" opacity=".45"/>',
    "</svg>",
].join("");

export const BRAND_ICON_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(brandIconSvg)}`;
