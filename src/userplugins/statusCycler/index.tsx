/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { getUserSettingLazy } from "@api/UserSettings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Flex } from "@components/Flex";
import { getLyricsLrclib } from "@equicordplugins/musicControls/spotify/lyrics/providers/lrclibAPI";
import type { SyncedLyric } from "@equicordplugins/musicControls/spotify/lyrics/providers/types";
import { EquicordDevs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { chooseFile } from "@utils/web";
import type { SpotifyTrack } from "@vencord/discord-types";
import { showToast, SpotifyStore, Toasts } from "@webpack/common";

interface CustomStatusSetting {
    createdAtMs?: string;
    emojiId: string;
    emojiName: string;
    expiresAtMs: string;
    text: string;
}

interface SpotifyPlayerState {
    isPlaying?: boolean;
    position?: number;
    track: SpotifyTrack | null;
}

const IMPORT_SETTING_KEYS = ["phrases", "sourceFileName"] as const;
const logger = new Logger("StatusCycler");
const CustomStatusSettings = getUserSettingLazy<CustomStatusSetting | null>("status", "customStatus");

let active = false;
let intervalId: number | undefined;
let lyricsTimeoutId: number | undefined;
let loadingSpotifyTrackId: string | undefined;
let spotifyLyrics: SyncedLyric[] = [];
let spotifyLyricsTrackId: string | undefined;
let spotifyOverrideActive = false;
let spotifyPlaybackActive = false;
let spotifyPosition = 0;
let spotifyPositionUpdatedAt = 0;
let lastLyricText: string | undefined;

function getPhrases(value = settings.store.phrases) {
    return value.split(/\r?\n|\r/).map(line => line.trim()).filter(Boolean);
}

function applyNextStatus() {
    const phrases = getPhrases();
    if (!phrases.length || !CustomStatusSettings) return;

    const current = CustomStatusSettings.getSetting();
    const nextIndex = (settings.store.nextIndex ?? 0) % phrases.length;
    const text = phrases[nextIndex];
    settings.store.nextIndex = (nextIndex + 1) % phrases.length;

    void CustomStatusSettings.updateSetting({
        text,
        expiresAtMs: "0",
        emojiId: current?.emojiId ?? "0",
        emojiName: current?.emojiName ?? "",
        createdAtMs: String(Date.now())
    }).catch(error => logger.error("Could not update the custom status.", error));
}

function scheduleSpotifyLyric() {
    if (lyricsTimeoutId !== undefined) clearTimeout(lyricsTimeoutId);
    lyricsTimeoutId = undefined;

    if (!active || !settings.plain.useSpotifyLyrics || !spotifyPlaybackActive || !spotifyLyrics.length) return;

    const position = (spotifyPosition + Date.now() - spotifyPositionUpdatedAt) / 1_000;
    let currentIndex = -1;

    for (let index = 0; index < spotifyLyrics.length; index++) {
        if (spotifyLyrics[index].time > position) break;
        currentIndex = index;
    }

    const text = spotifyLyrics[currentIndex]?.text?.trim();
    if (text && text !== lastLyricText && CustomStatusSettings) {
        const current = CustomStatusSettings.getSetting();
        lastLyricText = text;

        void CustomStatusSettings.updateSetting({
            text: text.slice(0, 128),
            expiresAtMs: "0",
            emojiId: current?.emojiId ?? "0",
            emojiName: current?.emojiName ?? "",
            createdAtMs: String(Date.now())
        }).catch(error => logger.error("Could not update the custom status with Spotify lyrics.", error));
    }

    const nextLyric = spotifyLyrics.slice(currentIndex + 1).find(lyric => lyric.time > position);
    if (nextLyric) {
        lyricsTimeoutId = setTimeout(scheduleSpotifyLyric, Math.max(100, (nextLyric.time - position) * 1_000));
    }
}

function resumePhraseRotation() {
    if (lyricsTimeoutId !== undefined) clearTimeout(lyricsTimeoutId);
    lyricsTimeoutId = undefined;
    lastLyricText = undefined;

    if (!spotifyOverrideActive) return;
    spotifyOverrideActive = false;
    restartRotation();
}

async function startSpotifyLyrics(track: SpotifyTrack, position: number) {
    spotifyPlaybackActive = true;
    spotifyPosition = position;
    spotifyPositionUpdatedAt = Date.now();

    if (spotifyLyricsTrackId === track.id) {
        if (spotifyLyrics.length) {
            if (intervalId !== undefined) clearInterval(intervalId);
            intervalId = undefined;
            spotifyOverrideActive = true;
            scheduleSpotifyLyric();
        }
        return;
    }

    if (loadingSpotifyTrackId === track.id) return;
    loadingSpotifyTrackId = track.id;
    lastLyricText = undefined;
    if (lyricsTimeoutId !== undefined) clearTimeout(lyricsTimeoutId);
    lyricsTimeoutId = undefined;

    const lyricsTrack = {
        ...track,
        album: {
            ...track.album,
            image: track.album.image ?? { height: 0, width: 0, url: "" }
        },
        artists: track.artists.map(artist => ({
            ...artist,
            href: "",
            type: "artist",
            uri: `spotify:artist:${artist.id}`
        }))
    };
    const lyricsInfo = await getLyricsLrclib(lyricsTrack).catch(error => {
        logger.error("Could not load Spotify lyrics.", error);
        return null;
    });
    if (loadingSpotifyTrackId === track.id) loadingSpotifyTrackId = undefined;

    if (!active || !settings.plain.useSpotifyLyrics || !spotifyPlaybackActive || SpotifyStore.getTrack()?.id !== track.id) return;

    spotifyLyricsTrackId = track.id;
    spotifyLyrics = lyricsInfo?.lyricsVersions[lyricsInfo.useLyric]?.filter(lyric => lyric.text) ?? [];

    if (!spotifyLyrics.length) {
        resumePhraseRotation();
        return;
    }

    if (intervalId !== undefined) clearInterval(intervalId);
    intervalId = undefined;
    spotifyOverrideActive = true;
    scheduleSpotifyLyric();
}

function stopSpotifyLyrics() {
    spotifyPlaybackActive = false;
    loadingSpotifyTrackId = undefined;
    resumePhraseRotation();
}

function syncSpotifyLyrics(enabled: boolean) {
    if (!active) return;

    if (!enabled) {
        stopSpotifyLyrics();
        return;
    }

    const track = SpotifyStore.getTrack();
    const activity = SpotifyStore.getActivity();
    if (!track || !activity) return;

    void startSpotifyLyrics(track, Math.max(0, Date.now() - activity.timestamps.start))
        .catch(error => logger.error("Could not load Spotify lyrics.", error));
}

function restartRotation() {
    if (!active || spotifyOverrideActive) return;

    if (intervalId !== undefined) clearInterval(intervalId);
    intervalId = undefined;

    if (!getPhrases().length) return;

    applyNextStatus();
    intervalId = setInterval(applyNextStatus, settings.store.rotationInterval * 1_000);
}

function restartWithFirstPhrase() {
    settings.store.nextIndex = 0;
    settings.store.sourceFileName = undefined;
    restartRotation();
}

async function importPhrases() {
    const file = await chooseFile(".txt,text/plain");
    if (!file) return;

    try {
        const phrases = getPhrases(await file.text());
        if (!phrases.length) {
            showToast("The file does not contain any valid phrases.", Toasts.Type.FAILURE);
            return;
        }

        settings.store.phrases = phrases.join("\n");
        settings.store.sourceFileName = file.name;
        showToast(`Imported ${phrases.length} ${phrases.length === 1 ? "phrase" : "phrases"} from ${file.name}.`, Toasts.Type.SUCCESS);
    } catch (error) {
        logger.error("Could not read the selected text file.", error);
        showToast("Could not read the selected file.", Toasts.Type.FAILURE);
    }
}

function ImportSetting() {
    const { phrases, sourceFileName } = settings.use(IMPORT_SETTING_KEYS);
    const count = getPhrases(phrases).length;

    return (
        <Flex flexDirection="column" gap="8px">
            <Button onClick={() => void importPhrases()}>Select TXT file</Button>
            <span>
                {sourceFileName
                    ? `${sourceFileName}: ${count} ${count === 1 ? "phrase" : "phrases"}.`
                    : "No file selected."}
            </span>
        </Flex>
    );
}

const SafeImportSetting = ErrorBoundary.wrap(ImportSetting, { noop: true });

const settings = definePluginSettings({
    phrases: {
        type: OptionType.STRING,
        description: "Custom status phrases, one per line.",
        default: "",
        multiline: true,
        componentProps: {
            placeholder: "First phrase\nSecond phrase\nThird phrase"
        },
        onChange: restartWithFirstPhrase
    },
    rotationInterval: {
        type: OptionType.NUMBER,
        description: "Seconds between each custom status change.",
        default: 10,
        isValid: (value: number) => value >= 1 || "Rotation interval must be at least 1 second.",
        onChange: restartRotation
    },
    useSpotifyLyrics: {
        type: OptionType.BOOLEAN,
        description: "Use synchronized Spotify lyrics as your custom status while Spotify is playing.",
        default: false,
        onChange: syncSpotifyLyrics
    },
    importFile: {
        type: OptionType.COMPONENT,
        description: "Import phrases from a TXT file, one per line.",
        component: SafeImportSetting
    }
}).withPrivateSettings<{
    nextIndex?: number;
    sourceFileName?: string;
}>();

export default definePlugin({
    name: "StatusCycler",
    description: "Automatically rotates through custom status phrases at a configurable interval.",
    authors: [EquicordDevs.irritably],
    tags: ["Activity", "Utility"],
    dependencies: ["UserSettingsAPI"],
    settings,

    start() {
        active = true;
        restartRotation();
        syncSpotifyLyrics(settings.store.useSpotifyLyrics);
    },

    stop() {
        active = false;
        spotifyPlaybackActive = false;
        spotifyOverrideActive = false;
        loadingSpotifyTrackId = undefined;
        lastLyricText = undefined;
        if (intervalId !== undefined) {
            clearInterval(intervalId);
            intervalId = undefined;
        }
        if (lyricsTimeoutId !== undefined) {
            clearTimeout(lyricsTimeoutId);
            lyricsTimeoutId = undefined;
        }
    },

    flux: {
        async SPOTIFY_PLAYER_STATE({ track, position, isPlaying }: SpotifyPlayerState) {
            if (!settings.plain.useSpotifyLyrics) return;

            if (!track || !isPlaying) {
                stopSpotifyLyrics();
                return;
            }

            await startSpotifyLyrics(track, position ?? 0);
        }
    }
});
